// Trip mode screen (docs/leisure-architecture.md §10). Draws what the engine returns, in the engine's block order;
// fetches only through the ports it is given. Mounted by page.html into #tripRoot; uses no page globals beyond the
// deps passed in. Its controls can occupy an explicitly injected shared host;
// only Trip-owned nodes are moved, and they return to the Trip root on hide.
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
  const override=C?.restoreViewOverride(x.viewOverride);if(override)out.viewOverride=override;
  if(Number.isFinite(x.notBefore)&&x.notBefore>=0)out.notBefore=x.notBefore;
  return out;
}

function createTripUi(deps) {
  const { root, C, S, store, net, here, now, fetchBoard, loadScript, openSettings, esc, connectionMarkup,
    journeyTimesMarkup, journeyFactsMarkup, journeyStepsMarkup, arrangeJourneySummaries, tick, optionMarkup, flagsMarkup } = deps;
  const cfg = () => C.tripConfig({ allow: { parkMin: S().tripParkMin, lockMin: S().tripLockMin, stationMin: S().tripStationMin, exitMin: S().tripExitMin, carBackMin: S().tripCarBackMin } });
  const hhmm = C.hhmm, dur = C.dur;
  let mounted = false, idx = null, idxLoading = null, result = null, stageText = "", error = "", liveBoards = {}, boardAt = {}, lastBest = null, better = false;
  let followUpdate=null,previousPresentation=null,resultQuestion=null;
  let planToken = 0, lastPlanAt = 0, lastLiveAt = 0, driveNote = "", googleAd = null, googleVia = null;
  const plannerCache = new Map();
  const st = () => validTripState(store.get(), C);
  const save = (patch) => {
    if(!Object.prototype.hasOwnProperty.call(patch,'notBefore')&&['from','to','modes','question'].some(k=>k in patch))patch={...patch,notBefore:null};
    store.set({ ...st(), ...patch });
  };
  const find = selector => root.querySelector(selector) || deps.controlsRoot?.querySelector(selector);
  const findAll = selector => [...new Set([...root.querySelectorAll(selector), ...(deps.controlsRoot?.querySelectorAll(selector) || [])])];

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
      // Drive times depend on when you'd set off and on the traffic now: keyed by both (5-min slots), so the 5-min
      // re-check asks again even for the same set-off. Walk and cycle don't change: kept for the session.
      const slot = mode === "drive" ? `${Math.floor(at / (5 * 60e3))}@${Math.floor(now() / (5 * 60e3))}` : 0;
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
          <span class="trip-mode-label">To the station</span>
          <div class="seg" role="group" aria-label="Getting to the station">${modeBtns("from")}</div>
          <span class="trip-mode-label">From the station</span>
          <div class="seg" role="group" aria-label="Getting from the station">${modeBtns("to")}</div>
        </div>
      </form>
      <div class="trip-planning-controls">
        <div class="seg" role="group" aria-label="Trip question">
          <button type="button" data-trip-q="now">Leave now</button><button type="button" data-trip-q="by">Arrive by</button><button type="button" data-trip-q="at">Leave around</button>
        </div>
        <label class="trip-when" id="tripWhenRow" hidden><span id="tripWhenLabel">Time</span><input type="datetime-local" id="tripWhen" step="60"></label>
      </div>
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
    const input = find(`#tripInput-${end}`), list = find(`#tripList-${end}`);
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
      else if (e.key === "ArrowUp") { e.preventDefault(); highlight(n ? (active <= 0 ? n - 1 : active - 1) : -1); }
      else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(active); }
      else if (e.key === "Escape") { e.preventDefault(); close(); input.focus(); }
    });
    list.addEventListener("mousedown", e => e.preventDefault());
    list.addEventListener("click", e => { const li = e.target.closest("[data-i]"); if (li) choose(+li.dataset.i); });
    input.addEventListener("blur", () => setTimeout(close, 150));
  }
  function fill() {
    const s = st();
    ["from", "to"].forEach(end => { const el = find(`#tripInput-${end}`); if (document.activeElement !== el) el.value = s[end] ? s[end].name : ""; });
    findAll("[data-trip-mode]").forEach(b => { const [end, m] = b.dataset.tripMode.split(":"); b.setAttribute("aria-pressed", String(s.modes[end] === m)); });
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
  /** Plan. `prev`: the best journey before a re-plan, so a drive re-timed for traffic can say what changed. */
  const questionKey=q=>q.kind+'|'+(q.kind==='now'?0:q.t);
  function effectiveQuestion(){
    const s=st();
    const view=C.resolveViewControl({auto:C.chooseTripView({plan:s.question.kind,following:false}),live:null,
      hasActiveJourney:false,plan:s.question.kind,override:s.viewOverride,now:now(),situationKey:tripSituationKey(),views:C.TRIP_VIEWS});
    return !s.follow&&view.mode==='live'?{kind:'now',t:now()}:s.question;
  }
  async function plan(prev) {
    const s = st(),question=effectiveQuestion(); error = ""; better = false;
    if(!prev)previousPresentation=null;
    if (!hasGoogle()) { renderResults(); return; }
    const f = resolvedFrom();
    if (!s.to || !f.place) { result = null; error = s.to ? f.err : ""; renderResults(); return; }
    // A new question or place: the old journeys go, so they are never shown under the new question's label. A
    // refresh of the same plan (prev) keeps them on screen until the new answer arrives.
    resultQuestion=question;
    const mine = ++planToken; stageText = "Finding trains…"; if (!prev) result = null; renderResults();
    try {
      const index = await stations();
      const planningNow=s.notBefore&&s.notBefore>now()?s.notBefore:now();
      const q = question.kind === "now" ? { kind: "now", t: planningNow } : question;
      const leisureKmh = deps.leisureKmh();
      const r = await C.planTrip({ from: f.place, to: s.to, modes: s.modes, question: q, now: planningNow, leisureKmh, cfg: cfg() },
        { stations: index, access, planner: planner(index) },
        part => { if (mine !== planToken) return; result = part; stageText = part.stage === "complete" ? "Checking live times…" : "Finding more trains…"; renderResults();
          // Live times for the first answer straight away (the third step), not after the whole plan.
          if (part.stage === "timetable") live(true).then(() => { if (mine === planToken) renderResults(); }); });
      if (mine !== planToken) return;
      result = r; lastPlanAt = now();
      const best = r.picks[0];
      if (prev && best && s.modes.from === "drive" && Math.abs(best.leave - prev.leave) >= cfg().drive.moveMin * 60e3) {
        const d = Math.round((prev.leave - best.leave) / 60e3); driveNote = `Traffic: leave ${Math.abs(d)} min ${d > 0 ? "earlier" : "later"}`;
      } else if (prev) driveNote = "";
      await live(true);
    } catch (e) { if (mine !== planToken || (e && (e.staleSource || e.sourceChanged))) return; error = e.message; result = null; }
    if (mine === planToken) { stageText = ""; renderResults(); }
  }
  async function live(force) {
    if ((!result&&!st().follow) || !fetchBoard) return;
    if (!force && now() - lastLiveAt < cfg().live.refreshMs) return;
    lastLiveAt = now();
    const followed = st().follow ? st().follow.journey : null;
    const want = C.liveBudget(result?.journeys||[], followed, now(), cfg());
    // One board per station pair per 30 s (refreshMs), however often the screen asks: a forced redraw reuses it.
    await Promise.all(want.filter(b => !boardAt[b.key] || now() - boardAt[b.key] >= cfg().live.refreshMs).map(async b => {
      boardAt[b.key] = now();
      try { liveBoards[b.key] = await fetchBoard(b.from, b.to); } catch (e) { liveBoards[b.key] = undefined; } }));
    const planned=resultQuestion||effectiveQuestion();
    const q = planned.kind === "now" ? { kind: "now", t: now() } : planned;
    const js = C.rankTrips((result?.journeys||[]).map(j => C.applyLive(j, liveBoards, cfg())), q, now(), cfg());
    const picks = js.filter(j => j.recommended).sort((a, b) => a.recommended - b.recommended);
    better = C.betterOption(lastBest || undefined, picks[0], cfg().betterMin);
    if (!lastBest || better) lastBest = picks[0] || null;
    if(result)result = { ...result, journeys: js, picks, others: C.otherStations(js, picks[0], cfg().otherStationsMax) };
    updateFollowing(js);

  }
  function updateFollowing(options=result?.journeys||[]){
    const f=st().follow;if(!f){followUpdate=null;return;}
    const current=C.applyLive(f.journey,liveBoards,cfg());
    followUpdate=C.updateFollowTrip(f,{now:now(),current,options,accessReason:driveNote||null});
    if(JSON.stringify(f)!==JSON.stringify(followUpdate.route))save({follow:followUpdate.route});
    if(result)result.followUpdate=followUpdate;
  }
  /** Refresh: live every 30 s, re-plan every 5 min (drive re-timed with it), when Trip is on screen. */
  async function refresh() {
    if (!st().active) return;
    if (result && now() - lastPlanAt >= 5 * 60e3) { await plan(result.picks[0] || null); return; }
    await live(false); renderResults();
  }

  // ---------- Drawing (engine block order: present.ts) ----------
  const mains = j => C.mainRides(j.rides);
  const summary = j => { const m = mains(j), ch = m.length - 1; return `${ch ? `${ch} change${ch > 1 ? "s" : ""}` : "Direct"} · ${dur(j.arrive - j.leave)} · ${[...new Set(m.map(r => r.operator || r.label))].join(", ")}`; };
  function connections(j, firstRide = 0) {
    let mainIndex = 0;
    return j.rides.map((r, index) => {
      const main = C.isMain(r), change = main && mainIndex > 0 ? j.changes[mainIndex - 1] : null;
      if (main) mainIndex++;
      if (index < firstRide) return '';
      if (r.kind === 'walk') return `<p class="connection-transfer">${esc(r.label||`Walk from ${r.from.name} to ${r.to.name}`)}</p>`;
      const departure = r.cancelled?{level:'bad',text:'Cancelled',showTime:false}:r.train ? C.departureStatus(r.train) : {level:'info',text:r.live.dep?'Live departure':'Not live',showTime:r.dep!==r.schedDep};
      let status = r.cancelled?departure:r.train ? (departure.text==='Early'?departure:C.trainStatus(r.train)||departure) : departure;
      // The ride's endpoint evidence is authoritative after a failed board refresh.
      // A retained Train still carries its last status; it must not claim current on-time running.
      if(!r.live.dep){
        const unqualified=status.text==='On time'||status.text==='Not live';
        status={level:unqualified?'info':status.level,text:unqualified?'Not live':`${status.text} · Not live`};
      }
      const expectedLabel=!r.live.dep&&r.train&&!r.train.timetable&&!r.train.depUnknown?'Last known':'Expected departure';
      return `${change?`<p class="connection-transfer ${esc(change.level)}">${esc(change.text)} · ${esc(change.at)}${change.notLive.length?' · Not live':''}${Number.isFinite(change.betweenMs)?`<br>${dur(change.betweenMs)} between services · ${change.transferMs!=null?`${dur(change.transferMs)} transfer${change.spare>=0?` + ${change.spare} min spare`:''}`:'transfer allowance not separately supplied'}`:''}</p>`:''}${connectionMarkup({from:r.from.name,scheduled:hhmm(r.schedDep),expected:departure.showTime?hhmm(r.dep):departure.text,expectedLabel,level:departure.level,status,operator:r.operator||r.label,platform:r.platform||r.train?.platform,kind:r.kind==='tube'?'Tube':r.kind==='bus'?'Bus':r.kind==='rail'?'Train':'Connection',to:r.to.name,destination:r.destination||r.train?.destination||'',arrival:C.tripRideTimingUsable(r,false)?hhmm(r.arr):null,departureSource:r.live.dep?'Live':expectedLabel==='Last known'?'Last known':'Timetable',arrivalSource:r.live.arr?'Live':r.train&&!r.train.timetable?'Last known':'Timetable',arrivalLabel:r.live.arr?'Expected':r.train&&!r.train.timetable?'Last known':'Timetable'})}`;
    }).join('');
  }
  function journeyHeading(j, arrival = j.arrive) {
    const countdown=j.leave>now()?`leave in ${C.countdown(j.leave-now())}`:'leave time passed';
    return journeyTimesMarkup({leave:j.leave,arrive:arrival,dest:j.to?.name||j.toStation.name,available:C.tripJourneyFacts(j).totalDurationMs!=null,countdown});
  }
  function journeyRow(j, opts = {}) {
    const followed = st().follow && st().follow.id === j.id, changes = Math.max(0,mains(j).length-1);
    const overview=`${journeyHeading(j)}
      ${tripAccessMarkup(j)}${tripNextMarkup(j)}
      ${journeyFactsMarkup(C.tripJourneyFacts(j))}
      ${connections(j)}
      <div class="optroute route"><span class="chip rail">${esc(j.fromStation.name)} → ${esc(j.toStation.name)}</span><span class="chip rail">${changes?`${changes} change${changes>1?'s':''}`:'Direct'}</span></div>`;
    const flags=j.flags.filter(f=>!f.status&&!/^(Arrives first|Latest for|Least late)/.test(f.txt)).length ? `<div class="flags">${flagsMarkup(j.flags.filter(f=>!f.status&&!/^(Arrives first|Latest for|Least late)/.test(f.txt)))}</div>` : '';
    const steps=journeyStepsMarkup(C.journeySteps(j),{key:`trip|${opts.compact?'list':'pick'}|${j.id}`,extraClass:'trip-steps',tubeLegs:true});
    const follow=opts.noFollow ? '' : `<button type="button" class="${followed ? "ghost" : "primary"} follow-btn" data-trip-follow="${esc(j.id)}"${followed||!C.tripCanFollow(j,now()) ? " disabled" : ""}>${followed ? "Following" : "Follow"}</button>`;
    if(!opts.compact)return optionMarkup({attributes:`data-trip-id="${esc(j.id)}"`,extraClass:'trip-row',next:opts.next,overview,flags,steps,follow});
    return `<section class="trip-row row journey-row${j.recommended?' best':''}" data-trip-id="${esc(j.id)}">
      ${overview}
      ${flags}
      ${steps}
      ${follow}
    </section>`;
  }
  function tripSituationKey(){
    const f=st().follow;
    return f?['trip',f.id,f.activeRide??'',f.alightedRide??'',f.arrivedAt!=null?'arrived':''].join('|'):'trip|unselected';
  }
  function pinView(mode){
    save({viewOverride:mode==='auto'?null:C.createViewOverride(mode,now(),tripSituationKey())});
    if(result&&questionKey(resultQuestion||st().question)!==questionKey(effectiveQuestion()))plan();
    else renderResults();
  }
  function blocks(){
    const s=st(),f=s.follow,phase=f?C.followedTripPhase(f,now()).phase:null;
    const active=C.chooseTripView({plan:'now',following:!!f,phase:phase==='arrived'?'final':phase||undefined});
    const auto=f?active:C.chooseTripView({plan:s.question.kind,following:false});
    const interacting=!!root.ownerDocument.activeElement?.closest('#tripForm,#tripWhen')||[...root.querySelectorAll('details[open]')].length>0;
    const shown=C.resolveViewControl({auto,live:f?active:null,hasActiveJourney:!!f,hasFollowedJourney:!!f,plan:s.question.kind,override:s.viewOverride,now:now(),situationKey:tripSituationKey(),previous:previousPresentation,interacting,views:C.TRIP_VIEWS});
    if(JSON.stringify(s.viewOverride||null)!==JSON.stringify(shown.override))save({viewOverride:shown.override});
    previousPresentation=shown;deps.renderView?.(shown);return shown;
  }
  function tripAccessMarkup(j){
    const names={walk:'Walk to station',cycle:'Cycle to station · bicycle required',drive:'Drive to station · car required'};
    const reachable=C.tripCanFollow(j,now());
    return `<div class="journey-reach" data-access-mode="${esc(j.modes.from)}">${reachable?flagsMarkup(j.flags.filter(f=>/^(Arrives first|Latest for|Least late)/.test(f.txt))):''}<span class="pill ${reachable?(j.modes.from==='walk'?'info':'warn'):'bad'}">${reachable?names[j.modes.from]:j.uncertain||j.missed?'Access / connection uncertain':'Can’t make it from here · '+names[j.modes.from]}</span></div>`;
  }
  function tripNextMarkup(j,first=0,label='Next'){
    const ride=j.rides.slice(first).find(r=>r.kind!=='walk');
    if(ride?.cancelled||ride?.train?.cancelled)label='Selected service · cancelled';
    else if(ride?.train?.depUnknown)label='Selected service · departure estimate unavailable';
    return ride?`<div class="journey-next-service"><b>${label}:</b> <strong class="t">${hhmm(ride.schedDep)} ${esc(ride.operator||ride.label)}</strong> from ${esc(ride.from.name)}${ride.dep!==ride.schedDep?` · expected ${hhmm(ride.dep)}`:''}</div>`:'';
  }
  function tripFollowHeading(fu){
    const f=fu.route,j=f.journey,phase=C.followedTripPhase(f,now()),ride=j.rides[phase.ride];
    const destination=j.to?.name||j.toStation.name;
    if(fu.phase==='before'||fu.phase==='access')return journeyTimesMarkup({leave:j.leave,arrive:fu.arrival,dest:destination,available:fu.arrival!=null,countdown:j.leave>now()?`leave in ${C.countdown(j.leave-now())}`:'leave time passed'});
    const left=fu.phase==='ride'?(C.tripRideTimingUsable(ride,false)?ride.arr:null):fu.phase==='change'?(ride.cancelled||ride.train?.cancelled||ride.train?.depUnknown?null:ride.dep):fu.phase==='final'?now():fu.arrival;
    const label=fu.phase==='ride'?'At '+ride.to.name:fu.phase==='change'?'Next departure':fu.phase==='arrived'?'Arrived':'Now · final leg';
    return journeyTimesMarkup({leave:left,arrive:fu.arrival,dest:destination,leftLabel:label,isLeave:false});
  }
  function tripConfirmation(fu){
    const f=fu.route,phase=C.followedTripPhase(f,now()),ride=f.journey.rides[phase.ride];
    if(fu.phase==='arrived')return '<p>Journey complete · arrival confirmed by you.</p>';
    if(fu.phase==='final')return `<div class="trip-confirmation"><p>Final leg · arrival has not been confirmed.</p><button type="button" class="ghost" data-trip-arrived>I’ve arrived</button></div>`;
    const confirmed=f.activeRide!=null,cancelled=ride.cancelled||ride.train?.cancelled;
    return `<div class="trip-confirmation"><p>${confirmed?'Confirmed by you: on':cancelled?'Cancelled in the feed · confirm only if you are actually aboard:':'Expected stage from journey times: '+esc(fu.phase)+'. Next/current service:'} ${hhmm(ride.schedDep)} ${esc(ride.operator||ride.label)} · ${esc(ride.from.name)} → ${esc(ride.to.name)}</p>
      <div class="controls">${confirmed?`<button type="button" class="ghost" data-trip-alighted>Got off at ${esc(ride.to.name)}</button>`:`<button type="button" class="ghost" data-trip-boarded="${phase.ride}">${cancelled?'Actually on this service':'I’m on this service'}</button>`}</div>
      <details class="steps" data-key="trip-correction|${esc(f.id)}"><summary>Different service or stage?</summary><div class="controls">${f.journey.rides.map((r,index)=>r.kind==='walk'?'':`<button type="button" class="ghost" data-trip-boarded="${index}">On the ${hhmm(r.schedDep)} ${esc(r.operator||r.label)} from ${esc(r.from.name)}</button>`).join('')}<button type="button" class="ghost" data-trip-view="plan">Choose another journey</button></div></details></div>`;
  }
  function trackingMarkup(fu){
    const f=fu.route,ride=f.journey.rides[0];
    return `<section class="trip-tracking" role="status" aria-label="Active journey while planning"><b>Following ${hhmm(ride.schedDep)} ${esc(ride.operator||ride.label)}</b><p>${esc(fu.text)}</p>${journeyFactsMarkup(C.tripJourneyFacts(f.journey),{arrival:fu.arrival})}${fu.notice?`<p>${esc(fu.notice.text)}</p>`:''}<button type="button" class="ghost" data-trip-view="live">Return to your journey</button></section>`;
  }
  function tripLiveBoard(journeys){
    const rows=C.tripDepartureBoard(journeys,now());
    return `<div class="lbl">Live · loaded first connections for this Trip</div><p class="note">No journey selected. Follow a departure to choose its whole itinerary.</p><div class="list">${rows.map(({ride,journey})=>`<section class="row journey-row trip-live-row" data-trip-id="${esc(journey.id)}">${connections({...journey,rides:[ride],changes:[]})}${tripAccessMarkup(journey)}<div class="journey-projection"><b>At ${esc(journey.to?.name||journey.toStation.name)}:</b> ${!C.tripCanFollow(journey,now())?'Unavailable':hhmm(journey.arrive)}${journeyFactsMarkup(C.tripJourneyFacts(journey),{arrival:!C.tripCanFollow(journey,now())?null:journey.arrive})}</div><button type="button" class="primary follow-btn" data-trip-follow="${esc(journey.id)}"${!C.tripCanFollow(journey,now())?' disabled':''}>Follow</button></section>`).join('')||'<p>No loaded departures now. Change your journey or refresh.</p>'}</div>`;
  }
  function renderResults() {
    if (!mounted||!root.isConnected||!root.ownerDocument.defaultView?.document) return;
    const s = st(), setup = root.querySelector("#tripSetup");
    deps.renderContext?.(s);blocks();
    if(result&&!s.follow&&questionKey(resultQuestion||s.question)!==questionKey(effectiveQuestion())){plan();return;}
    setup.hidden = hasGoogle();
    if (!hasGoogle()) setup.innerHTML = `<p>${S().googleVia === "proxy" ? "Set your proxy's address in Settings to search addresses and time the trip to the station." : "Add a Google Maps key in Settings to search addresses and time the trip to the station."}</p><button type="button" class="ghost" data-trip-settings>Open Settings</button>`;
    root.querySelector("#tripStage").textContent = better ? "Better option found" : stageText || driveNote;
    const out = root.querySelector("#tripResults");
    updateFollowing();
    if (error&&!s.follow) { out.innerHTML = `<div class="trip-card empty" role="alert">${esc(error)}</div>`; return; }
    if (!result&&!s.follow) { out.innerHTML = s.to || !hasGoogle() ? "" : `<p class="note">Choose where you're going.</p>`; return; }
    const r = result||{picks:[],journeys:[],others:[],failed:[],notes:[]}, best = r.picks[0], pres = blocks(), fu = followUpdate, following = fu && pres.view.startsWith("trip-");
    const followFacts = following ? fu.phase==='arrived'?'<span class="journey-facts"><span class="journey-total-time" data-duration-kind="complete">Journey complete</span></span>':journeyFactsMarkup(C.tripJourneyFacts({...fu.route.journey,arrive:fu.arrival??NaN}),{arrival:fu.arrival}) : '';
    const shownQuestion=resultQuestion||s.question;
    const questionDay=shownQuestion.kind==='now'?'':deps.dayLabel?.(shownQuestion.t)||'';
    const label = following?'Following your trip':shownQuestion.kind==='now'?(s.notBefore&&s.notBefore>now()?`From ${esc(s.from?.name||'the station')} after ${hhmm(s.notBefore)}`:`If you leave now · ${hhmm(now())}`)
      :shownQuestion.kind==='by'?`To arrive by ${hhmm(shownQuestion.t)} ${esc(questionDay)}`
      :`Leaving around ${hhmm(shownQuestion.t)} ${esc(questionDay)}`;
    const close = r.close ? `<div class="trip-card">Close enough to ${s.modes.from === "drive" ? "drive" : s.modes.from === "cycle" ? "cycle" : "walk"}: no train needed.${r.journeys.length ? " The trains are below anyway." : ""}</div>` : "";
    const html = { label: () => close + (following||!best?`<div class="lbl trip-label">${label}</div>`:''),
      headline: () => following ? `<div class="trip-headline ${fu.level}">${tripFollowHeading(fu)}${followFacts}<b class="${esc(fu.level)}">${esc(fu.text)}</b>${fu.notice?`<p>${esc(fu.notice.text)}</p>`:''}${fu.arrival==null||fu.route.expectedArrival!==fu.route.plannedArrival?`<p>Original plan: arrive ${hhmm(fu.route.plannedArrival)}</p>`:''}
          ${fu.phase==='before'||fu.phase==='access'?tripAccessMarkup(fu.route.journey):''}
          ${fu.phase==='final'||fu.phase==='arrived'?'':tripNextMarkup(fu.route.journey,C.followedTripPhase(fu.route,now()).ride,fu.phase==='ride'?'Current service':'Next')}
          ${fu.nextStep&&fu.arrival!=null?`<p>Next action: ${fu.nextStep.t!=null&&!fu.nextStep.d.startsWith(hhmm(fu.nextStep.t))?hhmm(fu.nextStep.t)+' ':''}${esc(fu.nextStep.d)}</p>`:''}
          ${fu.route.notices.filter(n=>n.id.startsWith('recovery:')).slice(-1).map(n=>`<p>${esc(n.text)}</p>`).join('')}${tripConfirmation(fu)}
          ${fu.alternative?`<section class="follow-alternative"><b>A way on · not selected</b>${journeyRow(fu.alternative,{noFollow:true})}<button type="button" class="ghost" data-trip-follow="${esc(fu.alternative.id)}">Follow this instead</button><button type="button" class="ghost" data-trip-dismiss="${esc(fu.alternative.id)}">Keep my route</button></section>`:''}
          ${fu.arrival==null?`<button type="button" class="ghost" data-trip-replan>Plan from ${esc(C.tripRecoveryStart(fu.route,now()).station.name)}</button>`:''}
          <button type="button" class="ghost" data-trip-stop>${fu.phase==='arrived'?'Done':'Stop following'}</button></div>`
        : error?`<div class="trip-card empty" role="alert">${esc(error)}</div>`:best?'':r.close?'':`<div class="trip-card empty">${r.journeys.length?'No journey we can recommend from here. All services are listed below.':'No journeys found.'}</div>`,

      options: () => r.picks.length ? `<div class="hero trip-recommendations"><div class="lbl trip-label">${label} · best${r.picks[1] ? ", and the next best" : ""}</div>${r.picks.map((j,i) => journeyRow(j,{next:i>0})).join("")}</div>` : "",
      others: () => r.others.length ? `<details class="trip-others"><summary>Other stations</summary><ul>${r.others.map(o => `<li>${esc(o.text)}</li>`).join("")}</ul></details>` : "",
      board: () => `<h3 class="trip-h">Every journey, in leaving order</h3><div class="list trip-list">${r.journeys.map(j => journeyRow(j,{compact:true})).join("") || `<p class="note">None found.</p>`}</div>`,
      why: () => (r.failed.length || r.notes.length) ? `<details class="diag"><summary>Why these trains?</summary><ul>${r.failed.map(f => `<li>${esc(f.pair)}: ${esc(f.why)}</li>`).join("")}${r.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul></details>` : "",
      source: () => `<p class="note trip-source">Trains: TfL journey planner (timetable), live times from National Rail where shown. Station times: ${esc(google().attribution)}.</p>`,
      which: () => "", progress: () => "", way: () => "",
      then: () => fu ? `${fu.phase==='final'||fu.phase==='arrived'?'':`<div class="trip-follow-connections">${connections(fu.route.journey,C.followedTripPhase(fu.route,now()).ride)}</div>`}${journeyStepsMarkup(C.journeySteps(fu.route.journey),{key:`trip|follow|${fu.route.id}`,summary:'Your trip',open:false,extraClass:'trip-steps',tubeLegs:true})}` : "" };
    const disclosures = new Map([...out.querySelectorAll('details[data-key]')].map(el=>[el.dataset.key,el.open]));
    const content = pres.blocks.filter(b=>!following||b!=='source').map(b => (html[b] ? html[b]() : "")).join("");
    const liveBoard=pres.mode==='live'&&pres.noActiveJourney&&!fu;
    out.innerHTML = liveBoard?tripLiveBoard(r.journeys):following ? `<div class="hero trip-follow-card">${content}</div>${pres.blocks.includes('source')?html.source():''}` : (fu?trackingMarkup(fu):'')+content;
    arrangeJourneySummaries?.(out);tick?.();
    for(const el of out.querySelectorAll('details[data-key]'))if(disclosures.has(el.dataset.key))el.open=disclosures.get(el.dataset.key);
    out.dataset.view = pres.view;
  }
  function onResultClick(e) {
    const t = e.target;
    if (t.closest("[data-trip-settings]")) { openSettings(); return; }
    if (t.closest("[data-trip-stop]")) { save({ follow: null }); previousPresentation=null; if (result) result.followUpdate = null; renderResults(); return; }
    const view=t.closest('[data-trip-view]');if(view){pinView(view.dataset.tripView);return;}
    const boarded=t.closest('[data-trip-boarded]');if(boarded&&st().follow){save({follow:C.confirmTripRide(st().follow,Number(boarded.dataset.tripBoarded))});previousPresentation=null;renderResults();return;}
    if(t.closest('[data-trip-alighted]')&&st().follow){save({follow:C.alightTripRide(st().follow)});previousPresentation=null;renderResults();return;}
    if(t.closest('[data-trip-arrived]')&&st().follow){save({follow:C.completeFollowTrip(st().follow,now())});previousPresentation=null;renderResults();return;}
    const dismiss=t.closest('[data-trip-dismiss]');if(dismiss&&st().follow){save({follow:C.dismissTripAlternative(st().follow,dismiss.dataset.tripDismiss)});renderResults();return;}
    if(t.closest('[data-trip-replan]')&&st().follow){
      const route=st().follow,start=C.tripRecoveryStart(route,now()),station=start.station;
      const place={id:'station:'+station.crs,name:station.name,address:'',geo:station.geo,kind:'station'};
      const destination=route.journey.to||{id:'station:'+route.journey.toStation.crs,name:route.journey.toStation.name,address:'',geo:route.journey.toStation.geo,kind:'station'};
      save({from:place,to:destination,modes:{...route.journey.modes,from:'walk'},question:{kind:'now',t:0},notBefore:start.readyAt});pinView('plan');fill();plan();return;
    }
    const f = t.closest("[data-trip-follow]");
    if (f) { const j = result?.journeys.find(x => x.id === f.dataset.tripFollow) || (followUpdate?.alternative?.id===f.dataset.tripFollow?followUpdate.alternative:null);
      if (j&&C.tripCanFollow(j,now())) { const prior=st().follow;save({ follow: prior?(C.recoverFollowTrip(prior,j,now(),cfg())||C.startFollowTrip(j,now())):C.startFollowTrip(j, now()),viewOverride:null }); previousPresentation=null; renderResults();live(true).then(renderResults); } }
  }
  return {
    show() { mount(); root.hidden = false;
      const form=find('#tripForm');if(deps.controlsRoot&&form.parentNode!==deps.controlsRoot)deps.controlsRoot.append(form);
      fill(); renderResults(); if (!result && st().to) plan(); },
    hide() { const form=find('#tripForm');if(form&&form.parentNode!==root)root.prepend(form);root.hidden = true; },
    refresh, plan, renderResults, pinView,
    reset() { result = null; liveBoards = {}; boardAt = {}; lastBest = null; plannerCache.clear(); accessCache.clear(); planToken++; },
    state: () => ({ result, error, stage: stageText }),
  };
}
if (typeof module !== "undefined") module.exports = { createTripUi, validTripState };
