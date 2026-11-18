// The page's side of the iPhone app (docs/ios-app.md §6.2, docs/stories/ios-app.md). In a browser there is no
// shell and every call here does nothing; in the bundled iPhone app the Capacitor plugin `CommuteNative` is present
// and this is the only code that talks to it. The page decides nothing here: the snapshot comes from the engine
// (core journeySnapshot), the shell only shows it, and the proxy (proxy/native.js) keeps it current while closed.
//
// The v1 contract is docs/ios-app.md §6.7. Page → shell (one object each): capabilities(), ready(),
// publish({snapshot}), configure({v, proxy, device, alarm, wifi, regions}), cache({entries}), cached(),
// request({permission}). Shell → page (events, replayed on ready()): apns {token, env}, liveActivity {followId, token},
// wifi {place, at}, region {place, event, at}, resume {at}, open {url}.
const nativeBridge = (() => {
  const RETRY_MS = 60e3;
  /** The offline store's limit (§6.7 rule 7). */
  const CACHE_MAX_BYTES = 512 * 1024;
  /**
   * The entries that fit, in the order given (most important first): an entry that would take the total over the limit
   * is left out (and said so), the rest still go. Sizes are UTF-8 bytes of each entry's JSON.
   */
  function packCache(entries, max = CACHE_MAX_BYTES) {
    const out = [], dropped = []; let total = 2;
    for (const e of entries) {
      let bytes; try { const j = JSON.stringify(e); bytes = (typeof TextEncoder !== "undefined" ? new TextEncoder().encode(j).length : unescape(encodeURIComponent(j)).length) + 1; } catch (x) { dropped.push(e && e.key); continue; }
      if (total + bytes > max) { dropped.push(e.key); continue; }
      out.push(e); total += bytes;
    }
    return { entries: out, dropped, bytes: total };
  }
  const ok = (x) => x && typeof x === "object";
  /**
   * deps: win, core (C), S() settings, saved() → state.saved, save(), proxyBase() → the proxy's address, snapshot() →
   * the engine's snapshot of what the journey card shows (or null), followPlan() → {plan, extra, setOff} for the
   * proxy (or null), simulating() → true in a simulation, onEvidence(ev) → the page takes a fix or a set-off,
   * onResume(), onCached(entries), status(text) for Settings.
   */
  function create(deps) {
    const { win, core, S, saved, save, simulating } = deps;
    const plugin = () => {
      const cap = win.Capacitor;
      if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return null;
      return (cap.Plugins && cap.Plugins.CommuteNative) || null;
    };
    let caps = null, lastShown = null, lastFollowKey = null, retryAt = 0, apns = null, listening = false;
    // Live Activity push tokens by journey (§6.7 rules 1 and 5): only the current journey's is sent.
    const laTokens = {};
    const has = (k) => !!(caps && caps[k]);
    const base = () => String(deps.proxyBase() || "").trim().replace(/\/+$/, "");
    const ids = () => { const n = saved().native; return n && n.id && n.token ? { id: n.id, token: n.token } : null; };

    async function call(path, body) {
      const ctl = new win.AbortController(), timer = win.setTimeout(() => ctl.abort(), 10000);
      try {
        const r = await win.fetch(base() + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
        let j = null; try { j = await r.json(); } catch (e) { /* no body */ }
        if (!r.ok) { const e = new Error((j && j.error) || `HTTP ${r.status}`); e.status = r.status; throw e; }
        return j;
      } finally { win.clearTimeout(timer); }
    }
    const prefs = (s = S()) => ({ alarm: s.leaveAlarm !== false, alarmLeadMin: Number.isInteger(s.leaveAlarmMin) ? s.leaveAlarmMin : core.LEAVE_ALARM_DEFAULT_MIN });
    const prefixes = (v, dflt) => String(v == null ? dflt : v).split(",").map((x) => x.trim()).filter(Boolean).slice(0, 5);
    /**
     * What the shell is told (§6.7 rule 2): the proxy and this iPhone's registration (kept in Keychain), the alarm, the
     * Wi-Fi names to classify (never sent anywhere else), and the geofences (home and office, 150 m, only while the
     * alarm is on).
     */
    const config = (s = S()) => {
      const alarm = prefs(s);
      return { v: 1, proxy: { origin: base() }, device: ids(), alarm, wifi: { home: prefixes(s.wifiHome, "Panda"), office: prefixes(s.wifiOffice, "Ciklum") },
        regions: alarm.alarm && deps.regions ? deps.regions() : [] };
    };
    const configure = () => { const p = plugin(); if (!p || !caps) return null; try { return Promise.resolve(p.configure(config())).catch(() => null); } catch (e) { return null; } };

    async function register() {
      if (!apns || !base() || simulating()) return null;
      try {
        const r = await call("/native/register", { apnsToken: apns.token, env: apns.env, prefs: prefs(), ...(ids() || {}) });
        saved().native = { id: r.id, token: r.token }; save();
        lastFollowKey = null; configure();
        return r;
      } catch (e) { deps.status(`The iPhone app couldn't reach your proxy: ${e.message}`); return null; }
    }
    /** Start: ask the shell what it can do, listen to it, and tell it the Settings. Safe to call in a browser. */
    async function init() {
      const p = plugin();
      if (!p) return null;
      try { caps = await p.capabilities(); } catch (e) { caps = null; return null; }
      if (!ok(caps)) { caps = null; return null; }
      if (!listening && typeof p.addListener === "function") {
        listening = true;
        p.addListener("apns", (e) => { if (ok(e) && typeof e.token === "string" && (e.env === "sandbox" || e.env === "production")) { apns = { token: e.token, env: e.env }; register().then(() => sync()); } });
        p.addListener("liveActivity", (e) => { if (ok(e) && typeof e.token === "string" && typeof e.followId === "string") { laTokens[e.followId] = e.token; lastFollowKey = null; sync(); } });
        for (const kind of ["wifi", "region"]) p.addListener(kind, (e) => { if (ok(e) && !simulating()) deps.onEvidence({ kind, place: String(e.place || ""), event: e.event, at: Number(e.at) }); });
        p.addListener("resume", () => deps.onResume && deps.onResume());
        // A deep link the shell was opened with (Siri, the Live Activity): commute://next?direction=home&follow=1.
        p.addListener("open", (e) => { if (ok(e) && typeof e.url === "string" && !simulating()) deps.onOpen && deps.onOpen(e.url); });
      }
      try { await p.configure(config()); } catch (e) { /* an older shell: it keeps its own defaults */ }
      // Listening: the shell now replays what it held (the APNs token, Live Activity tokens, recent Wi-Fi/region).
      try { if (typeof p.ready === "function") await p.ready({ v: 1 }); } catch (e) { /* ignore */ }
      return caps;
    }
    /** After each render: the snapshot to the shell when what it shows changed (cheap when nothing did). */
    function publish() {
      const p = plugin();
      if (!p || !caps || simulating()) return null;
      const snap = deps.snapshot();
      const shown = core.snapshotShown(snap);
      if (shown === lastShown) return null;
      lastShown = shown;
      try { return Promise.resolve(p.publish({ snapshot: snap })).catch(() => { lastShown = null; }); } catch (e) { lastShown = null; return null; }
    }
    /** The followed journey to the proxy (so it keeps the Live Activity and alarm current while the app is closed). */
    function sync() {
      const who = ids();
      if (!who || !caps || simulating() || Date.now() < retryAt) return null;
      const f = deps.followPlan();
      const plan = f && f.plan, laToken = plan ? laTokens[plan.followId] || null : null;
      const key = plan ? JSON.stringify([plan.followId, plan.serviceId || "", plan.std, Math.round(plan.leaveBy / 60e3), !!f.setOff, laToken || ""]) : "none";
      if (key === lastFollowKey) return null;
      lastFollowKey = key;
      return call("/native/follow", { ...who, plan: plan || null, ...(plan ? { extra: f.extra, setOff: !!f.setOff, ...(laToken ? { laToken } : {}) } : {}) }).catch((e) => {
        // The proxy no longer knows this iPhone: register again; the journey goes on the next try (no loop).
        if (e.status === 403) { delete saved().native; save(); lastFollowKey = null; retryAt = Date.now() + RETRY_MS; return register(); }
        if (e.status === 400) return;
        lastFollowKey = null; retryAt = Date.now() + RETRY_MS;
      });
    }
    /** What to keep for a launch with no signal (the last boards, status and snapshot, each with its time). */
    function cache(entries) {
      const p = plugin();
      if (!p || !has("offline") || simulating()) return null;
      const packed = packCache(entries);
      try { return Promise.resolve(p.cache({ entries: packed.entries })).then(() => packed).catch(() => null); } catch (e) { return null; }
    }
    /** What the shell kept for a launch with no signal (§6.7 rule 7); [] in a browser or on any error. */
    async function cached() {
      const p = plugin();
      if (!p || !has("offline") || simulating()) return [];
      try { const r = await p.cached({}); return r && Array.isArray(r.entries) ? r.entries : []; } catch (e) { return []; }
    }
    /** Ask for a permission from Settings (in order: "notifications", "alarm" (AlarmKit's own), "location" for Always); the new capabilities. */
    async function request(permission) {
      const p = plugin();
      if (!p || !caps || !["notifications", "alarm", "location"].includes(permission)) return null;
      try { await p.request({ permission }); caps = await p.capabilities(); } catch (e) { /* refused or unsupported: caps says */ }
      return caps;
    }
    /** Settings or home changed: the shell gets the new settings and geofences; the proxy the new alarm. */
    function onSave() {
      const p = plugin();
      if (!p || !caps) return null;
      configure();
      return ids() ? register() : null;
    }
    return { init, publish, sync, cache, cached, request, onSave, configure, capabilities: () => caps, has, config, prefs };
  }
  return { create, RETRY_MS, CACHE_MAX_BYTES, packCache };
})();
if (typeof module !== "undefined") module.exports = nativeBridge;
