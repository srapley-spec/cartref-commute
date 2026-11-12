// The clean baseline of 11 Nov 2026 on the page (issue #57; Sam, 12:10: "fix all of them and then we have a clean
// baseline against which to test tonight and tomorrow"). Stories: docs/stories/journey-progress.md ("Where you are
// on the leg"), follow-a-route.md ("Clean baseline, 11 Nov"), which-train.md, nearly-home.md.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, hm, at, closeAll, sleep } from "./harness.mjs";
after(closeAll);

const T0 = at("2026-11-03", "10:00"), m = 60e3;
const svc = (o) => Object.assign({ std: hm(o.dep), depLate: 0, depUnknown: false, arrLate: 0, arrUnknown: false, platform: null, operator: "Great Northern", cancelled: false, reason: "", origin: "" }, o);
const squash = (s) => s.replace(/\s+/g, " ").trim();

// Following the 10:20 Thameslink to King's Cross from 10:00 (a 10:15 stopper also runs, and a 09:40 well ahead).
async function journey() {
  const app = await createApp({ settings: { provider: "demo", followRoute: true }, saved: { dirMode: "office" }, geo: null, now: T0 });
  const c = app.c, K = app.w.CommuteCore, P = K.profiles.samCommute, line = P.lines.KGX;
  c.state.boards = { "LET-KGX": { msgs: [], services: [
    svc({ from: "LET", to: "KGX", dep: T0 - 20 * m, arr: T0 + 36 * m, serviceId: "EARLY", destination: "King's Cross" }),
    svc({ from: "LET", to: "KGX", dep: T0 + 15 * m, arr: T0 + 70 * m, serviceId: "SLOW", destination: "King's Cross" }),
    svc({ from: "LET", to: "KGX", dep: T0 + 20 * m, arr: T0 + 55 * m, operator: "Thameslink", serviceId: "FAST", destination: "Brighton", platform: "4" })] },
    "LET-ZFD": { msgs: [], services: [] }, "LET-STP": { msgs: [], services: [] } };
  c.state.boardsAt = T0; c.state.status = []; c.state.nrStatus = []; c.render();
  [...app.d.querySelectorAll("[data-follow]")].find((b) => /10:20 Thameslink/.test(b.getAttribute("aria-label"))).click();
  const seg = line.slice(1).map((p, i) => K.km(line[i], p)), total = seg.reduce((a, b) => a + b, 0);
  const pointOn = (f) => { let d = f * total; for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const k = Math.max(0, Math.min(1, d / seg[i]));
    return [line[i][0] + (line[i + 1][0] - line[i][0]) * k, line[i][1] + (line[i + 1][1] - line[i][1]) * k]; } d -= seg[i]; } };
  const place = (min, here, more = {}) => { const now = T0 + min * m; app.setNow(now); c.state.boardsAt = now;
    Object.assign(c.state, { here, locAcc: 20, lastFixAt: now, locStatus: "ok", onLine: false, atHub: null, ...more }); c.render(); return now; };
  const panel = app.d.querySelector("#followPanel");
  return { app, c, K, P, pointOn, place, panel, text: () => squash(panel.textContent) };
}

test("On the train: the leg is one line and a folded list of every station (option A), no bar, and one 'behind' figure", async () => {
  const { app, pointOn, place, panel, text } = await journey();
  place(34, pointOn(14 / 35), { onLine: true });
  [...panel.querySelectorAll("[data-pick]")].find((b) => /10:20 Thameslink/.test(b.textContent)).click();
  const legs = panel.querySelector(".journey-progress");
  assert.ok(legs, "the legs are in the one card");
  assert.equal(legs.querySelector(".jp-current-track"), null, "no bar that looks like a station position");
  assert.equal(legs.querySelector(".jp-stops"), null, "no sideways row of stations running off the page");
  const all = legs.querySelector("details.jp-all");
  assert.ok(all, "every station, folded"); assert.equal(all.open, false);
  assert.match(squash(all.querySelector("summary").textContent), /^All \d+ stations$/);
  assert.match(squash(all.textContent), /King's Cross · your stop/);
  // No report for this train in the example data: no position is claimed.
  assert.match(squash(legs.querySelector(".jp-where").textContent), /^No live position yet · your stop: King's Cross/);
  assert.equal(panel.querySelectorAll(".jp-heading > .jp-status").length, 0, "the legs' own status goes: the card's status says how it stands (H10)");
  assert.doesNotMatch(text(), /Next train:/, "the train panel names the train: no 'Next train:' line (amendment §3)");
  assert.deepEqual(app.errors, []);
});

test("The correction list offers trains you could be on (C12), the rest folded under 'More trains'; the train you're following is always among them", async () => {
  const { app, c, pointOn, place, panel } = await journey();
  place(34, pointOn(14 / 35), { onLine: true });
  const offered = () => [...panel.querySelectorAll("[data-pick]")].filter((b) => !b.closest(".more-trains")).map((b) => squash(b.textContent));
  assert.ok(offered().some((t) => /10:15 Great Northern/.test(t)), JSON.stringify(offered()));
  assert.ok(!offered().some((t) => /09:40/.test(t)), "the 09:40, half an hour further down the line, isn't offered among them");
  const more = panel.querySelector(".more-trains");
  assert.ok(more && !more.open, "the rest are folded under 'More trains'"); assert.equal(squash(more.querySelector("summary").textContent), "More trains");
  assert.ok([...more.querySelectorAll("[data-pick]")].some((b) => /09:40/.test(b.textContent)), "never hidden: the 09:40 is there to pick");
  assert.ok(c.state.rendered.train.others.some((o) => o.t.serviceId === "EARLY"), "(it is still a candidate the engine knows about)");
  assert.deepEqual(app.errors, []);
});

test("Under way the controls fold into one row: 'Commute · To office · Leave now', which opens them; planning keeps them all", async () => {
  const { app, c, pointOn, place } = await journey();
  const b = app.d.querySelector("#signalUnderwaySummary"), body = app.d.body;
  assert.ok(b, "the summary button is drawn");
  assert.equal(body.hasAttribute("data-underway"), true, "following counts as under way");
  assert.equal(b.hidden, false); assert.equal(squash(b.textContent), "Commute · To office · Leave now");
  b.click(); assert.equal(body.hasAttribute("data-controls-open"), true); assert.equal(b.getAttribute("aria-expanded"), "true");
  b.click(); assert.equal(body.hasAttribute("data-controls-open"), false);
  // Every control is still there, with its handler: the fold only hides them.
  for (const sel of ['[data-mode="commute"]', '[data-dir="home"]', '[data-view="by"]', '[data-journey-view="plan"]', "#settingsBtn", "#refreshBtn"]) assert.ok(app.d.querySelector(sel), sel);
  place(34, pointOn(14 / 35), { onLine: true });
  assert.equal(body.hasAttribute("data-underway"), true);
  // Planning (nothing followed, not live): every control in view, no summary.
  const plan = await createApp({ settings: { provider: "demo" }, saved: { dirMode: "office" }, geo: null, now: T0 });
  assert.equal(plan.d.body.hasAttribute("data-underway"), false);
  assert.equal(plan.d.querySelector("#signalUnderwaySummary")?.hidden ?? true, true);
  assert.deepEqual(app.errors, []);
});

test("The location line names the nearest station out of London, says 'as of' an old position, and offers 'Update location' only then", async () => {
  const app = await createApp({ settings: { provider: "demo" }, saved: { dirMode: "office" }, geo: null, now: T0 });
  const c = app.c, P = app.w.CommuteCore.profiles.samCommute;
  const fixAt = (here, t = Date.now()) => c.onPosition({ coords: { latitude: here[0], longitude: here[1], accuracy: 20, speed: null }, timestamp: t });
  // At Hitchin station, off the line's track: "near Hitchin", not "near Letchworth" (C8).
  fixAt([P.stationGeo.HIT[0] + 0.004, P.stationGeo.HIT[1] + 0.004]);
  assert.match(app.text("#dirNote"), /near Hitchin/); assert.doesNotMatch(app.text("#dirNote"), /near Letchworth/);
  assert.equal(app.d.querySelector("#dirNote [data-update-location]"), null, "a fresh position: nothing to update");
  // In London, a kilometre or more from any station on the line: "in London".
  fixAt([51.515, -0.08]);
  assert.match(app.text("#dirNote"), /in London/);
  // Two minutes on with no new fix: when it's from, and a button that asks again.
  app.setNow(T0 + 2 * m); c.render();
  assert.match(app.text("#dirNote"), /as of 10:00/); assert.doesNotMatch(app.text("#dirNote"), /stale fix/);
  const upd = app.d.querySelector("#dirNote [data-update-location]");
  assert.ok(upd, "Update location"); assert.equal(squash(upd.textContent), "Update location");
  assert.equal(app.d.querySelector("#dirNote").classList.contains("needed"), true, "shown even with the controls folded");
  upd.click();
  assert.deepEqual(app.errors, []);
});

test("Delays are said once: the status strip says it, and the disruption card under it keeps its details without repeating the heading", async () => {
  const app = await createApp({ settings: { provider: "demo" }, saved: { dirMode: "office" }, geo: null, now: T0 });
  const c = app.c;
  c.state.boards = { "LET-KGX": { msgs: [], services: [
    svc({ from: "LET", to: "KGX", dep: T0 + 15 * m, arr: T0 + 70 * m, depLate: 12, arrLate: 12, serviceId: "L1", destination: "King's Cross" }),
    svc({ from: "LET", to: "KGX", dep: T0 + 25 * m, arr: T0 + 80 * m, depLate: 12, arrLate: 12, serviceId: "L2", destination: "King's Cross" })] },
    "LET-ZFD": { msgs: [], services: [] }, "LET-STP": { msgs: [], services: [] } };
  c.state.boardsAt = T0; c.state.status = []; c.state.nrStatus = []; c.render();
  const strip = app.d.querySelector("#signalStatus");
  assert.equal(strip.hidden, false); assert.match(squash(strip.textContent), /^Delays up to 12 min on your route/);
  const shownTitles = [...app.d.querySelectorAll("#signalDisruptions .signal-disruption-title")].filter((h) => !h.hidden).map((h) => squash(h.textContent));
  assert.ok(!shownTitles.some((t) => /Delays up to/.test(t)), `the card doesn't repeat it: ${JSON.stringify(shownTitles)}`);
  const card = app.d.querySelector("#signalDisruptions .signal-disruption");
  assert.ok(card && card.hasAttribute("data-titled-by-status")); assert.match(squash(card.textContent), /12 min late: 10:15 Great Northern/, "its details stay");
  assert.deepEqual(app.errors, []);
});

test("Once you've set off the deadline is the platform ('Be on the platform by'); at home Leave by; a train you can't make shows the way on ('Instead: …')", async () => {
  const app = await createApp({ settings: { provider: "demo", followRoute: true }, saved: { dirMode: "office" }, geo: null, now: T0 });
  const c = app.c, P = app.w.CommuteCore.profiles.samCommute;
  c.state.boards = { "LET-KGX": { msgs: [], services: [
    svc({ from: "LET", to: "KGX", dep: T0 + 40 * m, arr: T0 + 75 * m, operator: "Thameslink", serviceId: "FAST", destination: "Brighton" }),
    svc({ from: "LET", to: "KGX", dep: T0 + 70 * m, arr: T0 + 105 * m, operator: "Thameslink", serviceId: "NEXT", destination: "Brighton" })] },
    "LET-ZFD": { msgs: [], services: [] }, "LET-STP": { msgs: [], services: [] } };
  c.state.boardsAt = T0; c.state.status = []; c.state.nrStatus = []; c.render();
  [...app.d.querySelectorAll("[data-follow]")].find((b) => /10:40 Thameslink/.test(b.getAttribute("aria-label"))).click();
  const panel = () => squash(app.text("#followPanel"));
  const fixAt = (min, here) => { const now = T0 + min * m; app.setNow(now); c.state.boardsAt = now;
    c.onPosition({ coords: { latitude: here[0], longitude: here[1], accuracy: 20, speed: null }, timestamp: now }); c.render(); };
  // At home (the saved home): the card's leave time as before, the protected answer before you go.
  const home = [51.9752, -0.2402], st = P.stationGeo.LET, mid = [(home[0] + st[0]) / 2, (home[1] + st[1]) / 2];
  c.state.saved.home = home;
  fixAt(2, home);
  assert.match(panel(), /Next action ?10:14/); assert.doesNotMatch(panel(), /Be on the platform by/);
  // 10:12, halfway between home and the station: the deadline is the platform (Sam, 12 Nov: "yes. Be on the platform by").
  fixAt(12, mid);
  assert.match(panel(), /Be on the platform by/); assert.doesNotMatch(panel(), /Next action|Leave by/, "no leave time once you've left");
  // 10:41, never seen at the station: the 10:40 has gone; the header shows the way on.
  fixAt(41, [st[0] - 0.02, st[1] - 0.02]);
  assert.match(panel(), /You can no longer make your 10:40/);
  assert.match(panel(), /Instead: the \d\d:\d\d [A-Za-z ]+ Leave by ?\d\d:\d\d → At office ?\d\d:\d\d/, "the next train you can make, with its own leave and arrival");
  assert.doesNotMatch(panel(), /Journey remaining unavailable/, "its own figures, not 'unavailable'");
  await sleep(300);   // the refresh a position change starts finishes before the page is closed
  assert.deepEqual(app.errors, []);
});

test("Nearly home and the walk to the office: no heading over nothing, and 'Nearly home' said once", async () => {
  const home = [51.9752, -0.2402];
  const app = await createApp({ settings: { provider: "demo" }, saved: { dirMode: "home", home }, geo: null, now: T0 });
  const c = app.c, Q = app.w.CommuteCore.profiles.samCommute;
  const fixAt = (here) => c.onPosition({ coords: { latitude: here[0], longitude: here[1], accuracy: 20, speed: null }, timestamp: Date.now() });
  // Walking home from Letchworth station, halfway.
  const st = Q.stationGeo.LET; fixAt([(home[0] + st[0]) / 2, (home[1] + st[1]) / 2]);
  assert.equal(c.state.rendered?.view, "nearly-home");
  assert.equal(app.text("#listTitle"), "", "no 'Nearly home' heading under the card");
  assert.match(app.text("#list"), /^Tomorrow's trains appear once you set off for work\.$/);
  const said = (app.text("#hero") + " " + app.text("#list") + " " + app.text("#listTitle")).match(/Nearly home/g) || [];
  assert.ok(said.length <= 1, `said ${said.length} times`);
  // Walking to the office, 300 m away: no "Nearly there" heading over an empty list.
  const off = await createApp({ settings: { provider: "demo" }, saved: { dirMode: "office" }, geo: null, now: T0 });
  off.c.onPosition({ coords: { latitude: Q.places.office[0] + 0.0027, longitude: Q.places.office[1], accuracy: 20, speed: null }, timestamp: Date.now() });
  assert.match(off.text("#hero"), /Walking to the office/);
  assert.equal(off.text("#listTitle"), ""); assert.equal(off.text("#list"), "");
  await sleep(300);
  assert.deepEqual(app.errors, []); assert.deepEqual(off.errors, []);
});

test("Under way, 'Along the line' folds under the one-row controls with everything else; open them and it's there", async () => {
  // Sam, 11 Nov 18:46: "Can you hide the along the line button under the drop down at the top".
  const app = await createApp({ settings: { provider: "demo", followRoute: true, alongLine: true }, saved: { dirMode: "office" }, geo: null, now: T0 });
  const shown = (node) => { for (let n = node; n; n = n.parentElement) { if (n.hidden || app.w.getComputedStyle(n).display === "none") return false; } return true; };
  const nav = app.d.querySelector("#alongNavigation");
  assert.ok(nav && !nav.hidden, "(Along the line is switched on)");
  assert.equal(app.d.body.hasAttribute("data-underway"), false); assert.equal(shown(nav), true, "planning: in view");
  [...app.d.querySelectorAll("[data-follow]")][0].click();
  assert.equal(app.d.body.hasAttribute("data-underway"), true);
  assert.equal(shown(nav), false, "under way: folded");
  app.d.querySelector("#signalUnderwaySummary").click();
  assert.equal(shown(nav), true, "opened: there, with its handler");
  app.d.querySelector("#signalUnderwaySummary").click();
  assert.equal(shown(nav), false);
  assert.deepEqual(app.errors, []);
});

test("The location line: 3 km out of London names the station; under 1 km in London; no location at all keeps the line out of the fold and offers Update location, which restarts the watch", async () => {
  const app = await createApp({ settings: { provider: "demo" }, saved: { dirMode: "office" }, geo: null, now: T0 });
  const c = app.c, P = app.w.CommuteCore.profiles.samCommute;
  const fixAt = (here) => c.onPosition({ coords: { latitude: here[0], longitude: here[1], accuracy: 20, speed: null }, timestamp: Date.now() });
  // 2.5 km from Stevenage station, off the line, out of London: "near Stevenage".
  fixAt([P.stationGeo.SVG[0], P.stationGeo.SVG[1] + 0.036]);
  assert.match(app.text("#dirNote"), /near Stevenage/);
  // 1.5 km from Finsbury Park (in London, over 1 km from every station on the line): not "near Finsbury Park".
  fixAt([P.stationGeo.FPK[0] - 0.0135, P.stationGeo.FPK[1]]);
  assert.match(app.text("#dirNote"), /in London/); assert.doesNotMatch(app.text("#dirNote"), /near Finsbury Park/);
  // The phone gives no location (an error, not a refusal): the line stays out of the fold and asks again when tapped.
  let watches = 0; app.w.navigator.geolocation.watchPosition = () => ++watches;
  c.state.locStatus = "error"; c.state.lastFixAt = Date.now(); c.render();
  const note = app.d.querySelector("#dirNote");
  assert.equal(note.classList.contains("needed"), true);
  const upd = note.querySelector("[data-update-location]"); assert.ok(upd, "Update location offered");
  upd.click(); assert.equal(watches, 1, "the phone's location watch is restarted");
  // Location refused: the line is shown, but no button (asking again can't help).
  c.state.locStatus = "denied"; c.render();
  assert.equal(app.d.querySelector("#dirNote [data-update-location]"), null);
  assert.deepEqual(app.errors, []);
});

test("C12 thresholds: within 12 min and not ruled out is offered; 13 min or ruled out goes under 'More trains'; the followed train is always offered; a stale position filters nothing", async () => {
  const { app, c, pointOn, place } = await journey();
  const now = place(34, pointOn(14 / 35), { onLine: true });
  const base = c.state.rendered.train, t = base.t;
  const tr = (std, id) => ({ ...t, std, serviceId: id, operator: "Great Northern" });
  const fit = (std, id, offMin, ruledOut = false) => ({ ...base, t: tr(std, id), offMin, ruledOut, others: undefined });
  const others = [fit("10:01", "A11", 11.9), fit("10:02", "B13", 13), fit("10:03", "C2R", 2, true)];
  const offered = (m) => { c.renderOnTrain(now, m); const h = app.d.querySelector("#hero");
    return [...h.querySelectorAll("[data-pick]")].filter((b) => !b.closest(".more-trains")).map((b) => squash(b.textContent)).join(" | "); };
  let s = offered({ ...base, sure: true, conflict: false, others });
  assert.match(s, /10:01/); assert.doesNotMatch(s, /10:02|10:03/);
  // The followed train (the 10:20 Thameslink) is offered however far off, even ruled out.
  s = offered({ ...base, t: tr("09:50", "X"), sure: true, conflict: false, others: [...others, { ...base, offMin: 40, ruledOut: true, others: undefined }] });
  assert.match(s, /10:20 Thameslink/);
  // Stale position: nothing to judge by, so every train is offered.
  s = offered({ ...base, sure: true, stale: true, conflict: false, others });
  assert.match(s, /10:01/); assert.match(s, /10:02/); assert.match(s, /10:03/);
  assert.deepEqual(app.errors, []);
});


test("Followed card: no 'Next:' naming the train before boarding, and none naming the arrival on the last walk", async () => {
  const { app, c, place, panel, text } = await journey();
  place(2, c.state.saved.home || app.w.CommuteCore.profiles.samCommute.places.homeStation);
  assert.doesNotMatch(text(), /Next: \d\d:\d\d · [^·]*Thameslink/, "before boarding the train panel names the train; 'Next:' doesn't repeat it");
  const r = c.state.saved.followRoute, office = app.w.CommuteCore.profiles.samCommute.places.office;
  r.phase = "after-train";
  place(Math.round((r.expectedArrival - T0) / m) - 4, [office[0] + 0.004, office[1]]);
  assert.doesNotMatch(text(), /Next:[^]*Arrive office/, "the last walk: 'Journey remaining' says it");
  assert.deepEqual(app.errors, []);
});


test("A route that takes the tube before the train says 'Tube and walk at your usual pace' (H18); one that doesn't says 'Walk at your usual pace'", async () => {
  const eve = at("2026-11-03", "17:30");
  const home = await createApp({ settings: { provider: "demo" }, saved: { dirMode: "home", view: "now" }, geo: null, now: eve });
  const reach = (a) => [...a.d.querySelectorAll("#hero .journey-reach, #list .journey-reach")].map((n) => squash(n.textContent)).join(" | ");
  assert.match(reach(home), /Tube and walk at your usual pace/);
  assert.doesNotMatch(reach(home), /(^|\| )Walk at your usual pace/);
  const out = await createApp({ settings: { provider: "demo" }, saved: { dirMode: "office", view: "now" }, geo: null, now: T0 });
  assert.match(reach(out), /Walk at your usual pace/); assert.doesNotMatch(reach(out), /Tube and walk/);
  assert.deepEqual(home.errors, []); assert.deepEqual(out.errors, []);
});


test("Waiting for a location in Auto is planning, not under way: every control stays in view", async () => {
  const app = await createApp({ settings: { provider: "demo" }, saved: { dirMode: "auto" }, geo: null, now: T0 });
  app.c.render();
  assert.equal(app.c.state.rendered?.view || app.c.state.presentation?.view, "awaiting-location", "(Auto, no location yet)");
  assert.equal(app.d.body.hasAttribute("data-underway"), false);
  assert.equal(app.d.querySelector("#signalUnderwaySummary")?.hidden ?? true, true);
  assert.deepEqual(app.errors, []);
});
