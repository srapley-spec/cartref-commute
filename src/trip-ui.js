// Trip mode screen (docs/leisure-architecture.md §10). Draws what the engine returns, in the engine's block order;
// fetches only through the ports it is given. Mounted by page.html into #tripRoot; uses no page globals beyond the
// deps passed in, and never touches the commute's DOM.
/* exported createTripUi, validTripState */
/* global tripAdapters */
const TRIP_RECENT_MAX = 5;
/** Saved Trip state: checked on restore; anything malformed is dropped, never partly used. */
function validTripState(x, C) {
  const out = { active: false, from: null, to: null, modes: { from: "walk", to: "walk" }, question: { kind: "now", t: 0 }, recent: [], follow: null };
  if (!x || typeof x !== "object") return out;
  const place = p => p && typeof p === "object" && typeof p.id === "string" && typeof p.name === "string" && Array.isArray(p.geo) && p.geo.length === 2 && p.geo.every(Number.isFinite)
    && ["address", "station", "current"].includes(p.kind) ? { id: p.id, name: p.name, address: String(p.address || ""), geo: [p.geo[0], p.geo[1]], kind: p.kind } : null;
  out.active = x.active === true;
  out.from = x.from && x.from.kind === "current" ? { id: "current", name: "Current location", address: "", geo: [0, 0], kind: "current" } : place(x.from);
  out.to = place(x.to);
  const m = ["walk", "cycle", "drive"];
  if (x.modes && m.includes(x.modes.from)) out.modes.from = x.modes.from;
  if (x.modes && m.includes(x.modes.to)) out.modes.to = x.modes.to;
  if (x.question && ["now", "by", "at"].includes(x.question.kind) && Number.isFinite(x.question.t)) out.question = { kind: x.question.kind, t: x.question.t };
  if (Array.isArray(x.recent)) out.recent = x.recent.filter(r => r && typeof r.id === "string" && typeof r.name === "string" && Number.isFinite(r.savedAt)).slice(0, TRIP_RECENT_MAX)
    .map(r => ({ id: r.id, name: r.name, address: String(r.address || ""), savedAt: r.savedAt }));
  out.follow = C && x.follow ? C.restoreFollowTrip(x.follow) : null;
  return out;
}

function createTripUi(deps) {
  const { root, C, S, store, net, here, now, fetchBoard, loadScript, openSettings, esc } = deps;
  const cfg = () => C.tripConfig({ allow: { parkMin: S().tripParkMin, lockMin: S().tripLockMin, stationMin: S().tripStationMin, exitMin: S().tripExitMin, carBackMin: S().tripCarBackMin } });
  const hhmm = C.hhmm, dur = C.dur;
  let mounted = false, idx = null, idxLoading = null, result = null, stageText = "", error = "", liveBoards = {}, lastBest = null, better = false;
  let planToken = 0, lastPlanAt = 0, lastLiveAt = 0, driveNote = "", googleAd = null, googleVia = null;
  const plannerCache = new Map();
  const st = () => validTripState(store.get(), C);
  const save = (patch) => { store.set({ ...st(), ...patch }); };

  // ---------- Ports ----------
  async function stations() {
    if (idx) return idx;
    if (!idxLoading) idxLoading = (async () => {
      const r = await net.fetchT(deps.stationsUrl || "data/stations.json");
      if (!r.ok) throw new Error(`Couldn't load the station list (HTTP ${r.status}).`);
      const j = await r.json(); idx = C.stationIndex(j.stations); return idx;
    })().catch(e => { idxLoading = null; throw e; });
    return idxLoading;
  }
  function google() {
    const via = S().googleVia === "proxy" ? "proxy" : "browser";
    if (!googleAd || googleVia !== via) {
      googleVia = via;
      googleAd = via === "proxy" ? tripAdapters.googleProxy({ getBase: () => S().proxyBase, net })
        : tripAdapters.googleMapsJs({ getKey: () => S().googleKey, net, loadScript });
    }
    return googleAd;
  }
  const hasGoogle = () => (S().googleVia === "proxy" ? !!String(S().proxyBase || "").trim() : !!String(S().googleKey || "").trim());
  // Shell wrappers: caching and cadence live here, never in the engine.
  const accessCache = new Map();
  const access = {
    async matrix(place, list, mode, at, dir) {
      const slot = mode === "drive" ? Math.floor(at / (5 * 60e3)) : 0;
      const keys = list.map(g => `${mode}|${dir}|${place.join(",")}|${g.join(",")}|${slot}`);
      const missing = list.filter((_, i) => !accessCache.has(keys[i]));
      if (missing.length) { const got = await google().matrix(place, missing, mode, at, dir); missing.forEach((g, i) => accessCache.set(`${mode}|${dir}|${place.join(",")}|${g.join(",")}|${slot}`, got[i])); }
      return keys.map(k => accessCache.get(k) ?? null);
    },
  };
  function planner(index) {
    const tfl = tripAdapters.tflPlanner({ net, getKey: () => S().tflKey, idx: index, endMatchM: cfg().endMatchM, core: C });
    return { name: tfl.name, async plan(a, b, t, timeIs) {
      const k = `${a.crs}-${b.crs}|${timeIs}|${Math.floor(t / (15 * 60e3))}`, hit = plannerCache.get(k);
      if (hit && now() - hit.at < 5 * 60e3) return hit.reply;
      const reply = await tfl.plan(a, b, t, timeIs); plannerCache.set(k, { at: now(), reply }); return reply; } };
  }

  // ---------- Places ----------
  function currentPlace() {
    const h = here(); if (!h) return { err: "Location isn't available yet." };
    if (now() - h.at > 2 * 60e3) return { err: "Your location is more than 2 minutes old." };
    if (h.acc > 200) return { err: `Your location is only known to ${Math.round(h.acc)} m.` };
    if (!C.inRegion(h.geo, cfg().region)) return { err: C.OUTSIDE_REGION };
    return { place: { id: "current", name: "Current location", address: "", geo: h.geo, kind: "current" } };
  }
  const resolvedFrom = () => { const f = st().from; if (!f) return { err: "Choose where from." }; return f.kind === "current" ? currentPlace() : { place: f }; };

  // ---------- Skeleton (built once; inputs keep focus across redraws) ----------
  function mount() {
    if (mounted) return; mounted = true;
    root.innerHTML = `
      <div class="trip-setup" id="tripSetup" hidden></div>
      <form class="trip-form" id="tripForm" autocomplete="off">
        ${field("from", "From")}
        <button type="button" class="ghost trip-swap" id="tripSwap" aria-label="Swap From and To">Swap</button>
        ${field("to", "To")}
        <div class="trip-modes">
          <div class="seg" role="group" aria-label="Getting to the station">${modeBtns("from")}</div>
          <div class="seg" role="group" aria-label="Getting from the station">${modeBtns("to")}</div>
        </div>
        <div class="seg" role="group" aria-label="Trip question">
          <button type="button" data-trip-q="now">Leave now</button><button type="button" data-trip-q="by">Arrive by</button><button type="button" data-trip-q="at">Leave around</button>
        </div>
        <label class="trip-when" id="tripWhenRow" hidden><span id="tripWhenLabel">Time</span><input type="datetime-local" id="tripWhen" step="60"></label>
      </form>
      <p class="trip-stage" id="tripStage" role="status" aria-live="polite"></p>
      <div class="trip-results" id="tripResults"></div>`;
    root.querySelector("#tripSwap").addEventListener("click", () => { const s = st(); save({ from: s.to, to: s.from && s.from.kind === "current" ? null : s.from }); fill(); plan(); });
    root.querySelectorAll("[data-trip-mode]").forEach(b => b.addEventListener("click", () => {
      const [end, m] = b.dataset.tripMode.split(":"); const s = st(); save({ modes: { ...s.modes, [end]: m } }); fill(); plan(); }));
    root.querySelectorAll("[data-trip-q]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.tripQ; const s = st(); save({ question: { kind: k, t: k === "now" ? 0 : (s.question.t || now() + 3600e3) } }); fill(); plan(); }));
    root.querySelector("#tripWhen").addEventListener("change", e => { const t = new Date(e.target.value).getTime(); if (Number.isFinite(t)) { save({ question: { ...st().question, t } }); plan(); } });
    root.addEventListener("click", onResultClick);
    combobox("from"); combobox("to");
  }
  const field = (end, label) => `<div class="trip-field" data-end="${end}">
      <label for="tripInput-${end}">${label}</label>
      <div class="trip-combo"><input id="tripInput-${end}" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="tripList-${end}" spellcheck="false" placeholder="${end === "from" ? "Current location or an address" : "An address, place or station"}">
      <ul class="trip-suggest" id="tripList-${end}" role="listbox" aria-label="${label} suggestions" hidden></ul></div></div>`;
  const modeBtns = end => ["walk", "cycle", "drive"].map(m => `<button type="button" data-trip-mode="${end}:${m}">${{ walk: "Walk", cycle: "Cycle", drive: "Drive" }[m]}</button>`).join("");

  // ---------- Address combobox (L1, L2, L11) ----------
  function combobox(end) {
    const input = root.querySelector(`#tripInput-${end}`), list = root.querySelector(`#tripList-${end}`);
    let session = null, seq = 0, timer = null, items = [], active = -1;
    const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1; };
    const show = (rows, note) => {
      items = rows; active = -1;
      list.innerHTML = rows.map((r, i) => `<li role="option" id="tripOpt-${end}-${i}" data-i="${i}" aria-selected="false"><b>${esc(r.primary)}</b>${r.secondary ? `<span>${esc(r.secondary)}</span>` : ""}</li>`).join("")
        + (note ? `<li class="trip-suggest-note" role="presentation">${esc(note)}</li>` : "")
        + (rows.some(r => r.google) ? `<li class="trip-attrib" role="presentation">${esc(google().attribution)}</li>` : "");
      list.hidden = !rows.length && !note; input.setAttribute("aria-expanded", String(!list.hidden));
    };
    const highlight = i => { active = i; [...list.querySelectorAll("[role=option]")].forEach((li, k) => li.setAttribute("aria-selected", String(k === i)));
      if (i >= 0) input.setAttribute("aria-activedescendant", `tripOpt-${end}-${i}`); else input.removeAttribute("aria-activedescendant"); };
    const recentRows = () => [...(end === "from" ? [{ primary: "Current location", secondary: "Your phone's location", current: true }] : []),
      ...st().recent.map(r => ({ id: r.id, primary: r.name, secondary: r.address || "Recent", google: true }))];
    async function choose(i) {
      const r = items[i]; if (!r) return; close();
      if (r.current) { input.value = "Current location"; save({ [end]: { id: "current", name: "Current location", address: "", geo: [0, 0], kind: "current" } }); session = null; plan(); return; }
      try {
        const p = await google().resolve(r.id, session || google().newSession()); session = null;
        if (!C.inRegion(p.geo, cfg().region)) { error = C.OUTSIDE_REGION; renderResults(); return; }
        input.value = p.name;
        const s = st(); const recent = [{ id: p.id, name: p.name, address: p.address, savedAt: now() }, ...s.recent.filter(x => x.id !== p.id)].slice(0, TRIP_RECENT_MAX);
        save({ [end]: p, recent }); error = "";
        if (end === "from") prefetch(); else plan();
      } catch (e) { error = e.message; renderResults(); }
    }
    input.addEventListener("focus", () => { if (input.value.trim().length < 3) show(recentRows(), ""); });
    input.addEventListener("input", () => {
      clearTimeout(timer); const text = input.value.trim(), mine = ++seq;
      if (text.length < 3) { show(recentRows(), ""); return; }
      if (!hasGoogle()) { show([], "Add a Google Maps key in Settings to search addresses."); return; }
      timer = setTimeout(async () => {
        try { if (!session) session = google().newSession();
          const rows = await google().suggest(text, session, cfg().region);
          if (mine !== seq) return;                       // a late reply for older text never replaces a newer one
          show(rows.map(r => ({ ...r, google: true })), rows.length ? "" : "No matches in the area this plans.");
        } catch (e) { if (mine === seq) show([], e.message); }
      }, 250);
    });
    input.addEventListener("keydown", e => {
      if (list.hidden) return;
      const n = items.length;
      if (e.key === "ArrowDown") { e.preventDefault(); highlight(n ? (active + 1) % n : -1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); highlight(n ? (active - 1 + n) % n : -1); }
      else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(active); }
      else if (e.key === "Escape") { e.preventDefault(); close(); input.focus(); }
    });
    list.addEventListener("mousedown", e => e.preventDefault());
    list.addEventListener("click", e => { const li = e.target.closest("[data-i]"); if (li) choose(+li.dataset.i); });
    input.addEventListener("blur", () => setTimeout(close, 150));
  }
  function fill() {
    const s = st();
    ["from", "to"].forEach(end => { const el = root.querySelector(`#tripInput-${end}`); if (document.activeElement !== el) el.value = s[end] ? s[end].name : ""; });
    root.querySelectorAll("[data-trip-mode]").forEach(b => { const [end, m] = b.dataset.tripMode.split(":"); b.setAttribute("aria-pressed", String(s.modes[end] === m)); });
    root.querySelectorAll("[data-trip-q]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tripQ === s.question.kind)));
    const row = root.querySelector("#tripWhenRow"); row.hidden = s.question.kind === "now";
    root.querySelector("#tripWhenLabel").textContent = s.question.kind === "by" ? "Be there by" : "Leave around";
    const t = s.question.t || now() + 3600e3, d = new Date(t), p = n => String(n).padStart(2, "0");
    const v = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    if (document.activeElement !== root.querySelector("#tripWhen")) root.querySelector("#tripWhen").value = v;
  }

  // ---------- Planning ----------
  async function prefetch() {
    const f = resolvedFrom(); if (!f.place || !hasGoogle()) return;
    try { const index = await stations(); const c = C.candidates(f.place.geo, st().modes.from, index, cfg());
      await access.matrix(f.place.geo, c.list.map(x => x.station.geo), st().modes.from, now(), "to"); } catch (e) { /* the plan reports it */ }
    if (st().to) plan();
  }
  async function plan() {
    const s = st(); error = ""; better = false;
    if (!hasGoogle()) { renderResults(); return; }
    const f = resolvedFrom();
    if (!s.to || !f.place) { result = null; error = s.to ? f.err : ""; renderResults(); return; }
    const mine = ++planToken; stageText = "Finding trains…"; renderResults();
    try {
      const index = await stations();
      const q = s.question.kind === "now" ? { kind: "now", t: now() } : s.question;
      const leisureKmh = deps.leisureKmh();
      const r = await C.planTrip({ from: f.place, to: s.to, modes: s.modes, question: q, now: now(), leisureKmh, cfg: cfg() },
        { stations: index, access, planner: planner(index) },
        part => { if (mine !== planToken) return; result = part; stageText = part.stage === "complete" ? "Checking live times…" : "Finding more trains…"; renderResults(); });
      if (mine !== planToken) return;
      result = r; lastPlanAt = now(); await live(true);
    } catch (e) { if (mine !== planToken || (e && (e.staleSource || e.sourceChanged))) return; error = e.message; result = null; }
    if (mine === planToken) { stageText = ""; renderResults(); }
  }
  async function live(force) {
    if (!result || !fetchBoard) return;
    if (!force && now() - lastLiveAt < cfg().live.refreshMs) return;
    lastLiveAt = now();
    const followed = st().follow ? st().follow.journey : null;
    const want = C.liveBudget(result.journeys, followed, now(), cfg());
    await Promise.all(want.map(async b => { try { liveBoards[b.key] = await fetchBoard(b.from, b.to); } catch (e) { liveBoards[b.key] = undefined; } }));
    const q = st().question.kind === "now" ? { kind: "now", t: now() } : st().question;
    const js = C.rankTrips(result.journeys.map(j => C.applyLive(j, liveBoards, cfg())), q, now(), cfg());
    const picks = js.filter(j => j.recommended).sort((a, b) => a.recommended - b.recommended);
    better = C.betterOption(lastBest || undefined, picks[0], cfg().betterMin);
    if (!lastBest || better) lastBest = picks[0] || null;
    result = { ...result, journeys: js, picks, others: C.otherStations(js, picks[0], cfg().otherStationsMax) };
    if (st().follow) {
      const u = C.updateFollowTrip(st().follow, { now: now(), current: js.find(j => j.id === st().follow.id) || null, options: js, accessReason: driveNote || null });
      save({ follow: u.route }); result.followUpdate = u;
    }
  }
  /** Refresh: live every 30 s, re-plan every 5 min (drive re-timed with it), when Trip is on screen. */
  async function refresh() {
    if (!st().active) return;
    if (result && now() - lastPlanAt >= 5 * 60e3) { const before = lastBest; await plan();
      if (before && lastBest && st().modes.from === "drive" && Math.abs(lastBest.leave - before.leave) >= cfg().drive.moveMin * 60e3) {
        const d = Math.round((before.leave - lastBest.leave) / 60e3); driveNote = `Traffic: leave ${Math.abs(d)} min ${d > 0 ? "earlier" : "later"}`; } return; }
    await live(false); renderResults();
  }

  // ---------- Drawing (engine block order: present.ts) ----------
  const flagHtml = f => `<span class="flag ${f.lvl === "bad" ? "bad" : f.lvl === "warn" ? "warn" : f.lvl === "ok" ? "ok" : "info"}">${esc(f.txt)}</span>`;
  const mains = j => C.mainRides(j.rides);
  const summary = j => { const m = mains(j), ch = m.length - 1; return `${ch ? `${ch} change${ch > 1 ? "s" : ""}` : "Direct"} · ${dur(j.arrive - j.leave)} · ${[...new Set(m.map(r => r.operator || r.label))].join(", ")}`; };
  function journeyRow(j, opts = {}) {
    const first = mains(j)[0], late = first.dep !== first.schedDep;
    const steps = C.journeySteps(j).map(s => `<li${s.tube ? ' class="tube"' : ""}><time>${s.t != null ? hhmm(s.t) : ""}</time> ${esc(s.d)}${s.note ? ` <span class="note">${esc(s.note)}</span>` : ""}</li>`).join("");
    const followed = st().follow && st().follow.id === j.id;
    return `<article class="trip-row${j.recommended === 1 ? " best" : ""}" data-trip-id="${esc(j.id)}">
      <div class="trip-times"><div><span class="lbl">Leave</span><b>${hhmm(j.leave)}</b></div>
        <div><span class="lbl">Train</span><b>${hhmm(first.schedDep)}</b>${late ? `<span class="exp">exp ${hhmm(first.dep)}</span>` : ""}</div>
        <div><span class="lbl">Arrive</span><b>${hhmm(j.arrive)}</b></div></div>
      <div class="trip-meta"><span class="lozenge">${esc(j.fromStation.name)}</span> → <span class="lozenge">${esc(j.toStation.name)}</span> · ${esc(summary(j))}</div>
      ${j.flags.length ? `<div class="flags">${j.flags.map(flagHtml).join("")}</div>` : ""}
      <details class="trip-steps"><summary>Journey steps</summary><ol>${steps}</ol></details>
      ${opts.noFollow ? "" : `<button type="button" class="${followed ? "ghost" : "primary"} follow-btn" data-trip-follow="${esc(j.id)}"${followed ? " disabled" : ""}>${followed ? "Following" : "Follow"}</button>`}
    </article>`;
  }
  function blocks() {
    const s = st(), f = s.follow, ph = f ? C.tripPhase(f.journey, now(), f.confirmed).phase : null;
    return C.chooseTripView({ plan: s.question.kind, following: !!f && ph !== "arrived", phase: ph || undefined });
  }
  function renderResults() {
    if (!mounted) return;
    const s = st(), setup = root.querySelector("#tripSetup");
    setup.hidden = hasGoogle();
    if (!hasGoogle()) setup.innerHTML = `<p>${S().googleVia === "proxy" ? "Set your proxy's address in Settings to search addresses and time the trip to the station." : "Add a Google Maps key in Settings to search addresses and time the trip to the station."}</p><button type="button" class="ghost" data-trip-settings>Open Settings</button>`;
    root.querySelector("#tripStage").textContent = better ? "Better option found" : stageText;
    const out = root.querySelector("#tripResults");
    if (error) { out.innerHTML = `<div class="trip-card empty" role="alert">${esc(error)}</div>`; return; }
    if (!result) { out.innerHTML = s.to || !hasGoogle() ? "" : `<p class="note">Choose where you're going.</p>`; return; }
    const r = result, best = r.picks[0], pres = blocks(), fu = r.followUpdate;
    const html = { label: () => `<div class="lbl trip-label">${esc(s.from ? s.from.name : "")} → ${esc(s.to.name)} · ${s.question.kind === "now" ? "Leave now" : s.question.kind === "by" ? `Arrive by ${hhmm(s.question.t)}` : `Leave around ${hhmm(s.question.t)}`}</div>`,
      headline: () => fu && pres.view.startsWith("trip-") ? `<div class="trip-headline ${fu.level}"><b>${esc(fu.text)}</b>${fu.notice ? `<p>${esc(fu.notice.text)}</p>` : ""}${fu.nextStep ? `<p>Next: ${fu.nextStep.t != null ? hhmm(fu.nextStep.t) + " " : ""}${esc(fu.nextStep.d)}</p>` : ""}
          ${fu.alternative ? `<p>Something better: ${esc(summary(fu.alternative))}, arrive ${hhmm(fu.alternative.arrive)} <button type="button" class="ghost" data-trip-follow="${esc(fu.alternative.id)}">Follow this instead</button></p>` : ""}
          <button type="button" class="ghost" data-trip-stop>Stop following</button></div>`
        : best ? `<div class="trip-headline"><span class="lbl">${best.rides[0].from.crs && best.before.every(x => x.kind === "station") ? "Departs" : "Leave by"}</span><b class="big">${hhmm(best.before.every(x => x.kind === "station") ? mains(best)[0].dep : best.leave)}</b><span>Arrive ${hhmm(best.arrive)} · ${esc(summary(best))}</span></div>`
        : `<div class="trip-card empty">No journeys found.</div>`,
      options: () => r.picks.length ? `<h3 class="trip-h">Best${r.picks[1] ? " and next best" : ""}</h3>${r.picks.map(j => journeyRow(j)).join("")}` : "",
      others: () => r.others.length ? `<details class="trip-others"><summary>Other stations</summary><ul>${r.others.map(o => `<li>${esc(o.text)}</li>`).join("")}</ul></details>` : "",
      board: () => `<h3 class="trip-h">Every journey, in leaving order</h3>${r.journeys.map(j => journeyRow(j)).join("") || `<p class="note">None found.</p>`}`,
      why: () => (r.failed.length || r.notes.length) ? `<details class="diag"><summary>Why these trains?</summary><ul>${r.failed.map(f => `<li>${esc(f.pair)}: ${esc(f.why)}</li>`).join("")}${r.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul></details>` : "",
      source: () => `<p class="note trip-source">Trains: TfL journey planner (timetable), live times from National Rail where shown. Station times: ${esc(google().attribution)}.${r.close ? " These places are close enough to walk, cycle or drive: no train needed." : ""}</p>`,
      which: () => "", progress: () => "", way: () => "",
      then: () => fu ? `<details class="trip-steps" open><summary>Your trip</summary><ol>${C.journeySteps(fu.route.journey).map(x => `<li><time>${x.t != null ? hhmm(x.t) : ""}</time> ${esc(x.d)}${x.note ? ` <span class="note">${esc(x.note)}</span>` : ""}</li>`).join("")}</ol></details>` : "" };
    out.innerHTML = pres.blocks.map(b => (html[b] ? html[b]() : "")).join("");
    out.dataset.view = pres.view;
  }
  function onResultClick(e) {
    const t = e.target;
    if (t.closest("[data-trip-settings]")) { openSettings(); return; }
    if (t.closest("[data-trip-stop]")) { save({ follow: null }); if (result) result.followUpdate = null; renderResults(); return; }
    const f = t.closest("[data-trip-follow]");
    if (f && result) { const j = result.journeys.find(x => x.id === f.dataset.tripFollow) || (result.followUpdate && result.followUpdate.alternative);
      if (j) { save({ follow: C.startFollowTrip(j, now()) }); live(true).then(renderResults); } }
  }
  return {
    show() { mount(); root.hidden = false; fill(); renderResults(); if (!result && st().to) plan(); },
    hide() { root.hidden = true; },
    refresh, plan, renderResults,
    reset() { result = null; liveBoards = {}; lastBest = null; plannerCache.clear(); accessCache.clear(); planToken++; },
    state: () => ({ result, error, stage: stageText }),
  };
}
if (typeof module !== "undefined") module.exports = { createTripUi, validTripState };
