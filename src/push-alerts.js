// Time-to-leave and wake-up alerts: the page's side (docs/stories/time-to-leave-alerts.md).
// Settings → Experimental → "Time-to-leave alerts" (off by default). On: this phone subscribes to push through the
// proxy (My proxy URL), with its wake-up check (weekdays at the chosen time, the morning trains to London). While
// you follow a journey, the page hands the proxy its plan (core leaveAlertPlan); the proxy watches the train and
// sends the alerts even when the app is closed. The page plans nothing here: the engine decides what to say.
// It never runs during a simulation, so simulated journeys can't reach the real phone.
const pushAlerts = (() => {
  const b64ToBytes = (s) => {
    const p = String(s).replace(/-/g, "+").replace(/_/g, "/"), bin = atob(p + "===".slice((p.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  };
  const DEFAULT_WAKE = "06:30";

  /**
   * deps: S() settings, saved() → state.saved, save(), core (C), names (station names), morning(settings) → the
   * wake-up config, followed() → the followed route or null, simulating() → true in a simulation, win (window),
   * status(text) for Settings.
   */
  function create(deps) {
    const { S, saved, save, core, names, morning, followed, simulating, win, status } = deps;
    const base = (s = S()) => String(s.proxyBase || "").trim().replace(/\/+$/, "");
    const supported = () => !!(win.navigator && win.navigator.serviceWorker && win.PushManager && win.Notification);
    let retryAt = 0;

    async function call(path, body, s) {
      const ctl = new win.AbortController(), timer = win.setTimeout(() => ctl.abort(), 10000);
      try {
        const r = await win.fetch(base(s) + path, body === undefined ? { signal: ctl.signal }
          : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
        let j = null; try { j = await r.json(); } catch (e) { /* no body */ }
        if (!r.ok) throw new Error((j && j.error) || `HTTP ${r.status}`);
        return j;
      } finally { win.clearTimeout(timer); }
    }
    const ids = () => { const p = saved().pushAlerts; return p && p.id && p.token ? { id: p.id, token: p.token } : null; };

    /** Turn alerts on for this phone. Call from the Save tap itself: iPhone only asks for permission from a tap. */
    function enable(next) {
      if (!base(next)) { status("Alerts need your proxy: Settings → National Rail → Source → My proxy, and its URL."); return Promise.resolve(false); }
      if (!supported()) { status("This browser can't receive notifications. On iPhone, open Commute from the Home Screen (iOS 16.4 or later)."); return Promise.resolve(false); }
      const asked = win.Notification.permission === "granted" ? Promise.resolve("granted") : win.Notification.requestPermission();
      return (async () => {
        try {
          if (await asked !== "granted") { status("Notifications are off for Commute. Allow them in iPhone Settings → Notifications → Commute."); return false; }
          status("Turning alerts on…");
          const reg = await win.navigator.serviceWorker.register("sw.js");
          await win.navigator.serviceWorker.ready;
          const { key } = await call("/push/key", undefined, next);
          const sub = (await reg.pushManager.getSubscription()) ||
            (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
          const r = await call("/push/subscribe", { subscription: sub.toJSON(), morning: morning(next), ...(ids() || {}) }, next);
          saved().pushAlerts = { id: r.id, token: r.token, planKey: null }; save();
          await call("/push/test", ids(), next).catch(() => null);
          status(`On. A test alert is on its way; the wake-up check runs weekdays at ${next.wakeAt || DEFAULT_WAKE}.`);
          sync(next);
          return true;
        } catch (e) { status(`Couldn't turn alerts on: ${e.message}`); return false; }
      })();
    }
    /** Turn alerts off: the proxy forgets this phone, and the phone's push subscription is dropped. */
    async function disable(prev) {
      const who = ids();
      delete saved().pushAlerts; save();
      try { if (who) await call("/push/unsubscribe", who, prev); } catch (e) { /* the proxy drops it when the push service says it's gone */ }
      try { const reg = supported() && (await win.navigator.serviceWorker.getRegistration()); const sub = reg && (await reg.pushManager.getSubscription()); if (sub) await sub.unsubscribe(); } catch (e) { /* nothing to drop */ }
      status("Off.");
    }
    /** Settings saved: start, stop or update (a new wake-up time). Must run inside the Save tap. */
    function onSave(prev, next) {
      const was = !!prev.leaveAlerts, on = !!next.leaveAlerts;
      if (on && (!was || !ids() || base(prev) !== base(next))) return enable(next);
      if (!on && was) return disable(prev);
      if (on && (prev.wakeAt || DEFAULT_WAKE) !== (next.wakeAt || DEFAULT_WAKE)) return enable(next);
      return Promise.resolve(null);
    }
    /**
     * Hand the proxy the followed journey's plan when it changes (a new Follow, Leave by moved a minute, the train
     * caught, Follow stopped). Cheap to call on every render: it only posts on a change.
     */
    function sync(s = S()) {
      const who = ids();
      if (!s.leaveAlerts || !who || simulating() || Date.now() < retryAt) return null;
      const plan = core.leaveAlertPlan(followed(), names);
      const key = plan ? JSON.stringify([plan.followId, plan.serviceId || "", plan.std, Math.round(plan.leaveBy / 60e3)]) : "none";
      if (key === saved().pushAlerts.planKey) return null;
      saved().pushAlerts.planKey = key; save();
      return call("/push/plan", { ...who, plan }, s).catch(() => {
        if (saved().pushAlerts) { saved().pushAlerts.planKey = null; save(); }
        retryAt = Date.now() + 60e3;
      });
    }
    const test = () => (ids() ? call("/push/test", ids()).then(() => status("Test alert sent."), (e) => status(`Couldn't send a test alert: ${e.message}`)) : Promise.resolve(status("Alerts are off.")));
    return { enable, disable, onSave, sync, test, DEFAULT_WAKE };
  }
  return { create, DEFAULT_WAKE };
})();
if (typeof module !== "undefined") module.exports = pushAlerts;
