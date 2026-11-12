// One journey card while you follow a route (10 Nov amendment §1; Sam, 11 Nov: "Build the single card view as this
// was confusing"). docs/stories/follow-a-route.md, "One journey card". Until now the followed card and the live
// card ("On the train", "You're at Farringdon", "On the tube", "Walking to the office") stood one above the other.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, hm, at, closeAll } from "./harness.mjs";
after(closeAll);

const T0 = at("2026-11-03", "10:00"), m = 60e3;
const svc = (o) => Object.assign({ std: hm(o.dep), depLate: 0, depUnknown: false, arrLate: 0, arrUnknown: false, platform: null, operator: "Great Northern", cancelled: false, reason: "", origin: "" }, o);
const squash = (s) => s.replace(/\s+/g, " ").trim();
const before = (a, b) => !!(a.compareDocumentPosition(b) & 4);
const folded = (n) => !!n.closest("details") && !n.closest("details").open;

// Following a route from 10:00; `dir` "office" follows the 10:20 Thameslink to King's Cross (a 10:15 stopper also runs)
// or, with hub "ZFD", the 10:50 to Farringdon; "home" follows the 10:30 Thameslink from Farringdon.
async function journey(dir = "office", hub = "KGX") {
  const app = await createApp({ settings: { provider: "demo", followRoute: true }, saved: { dirMode: dir }, geo: null, now: T0 });
  const c = app.c, K = app.w.CommuteCore, P = K.profiles.samCommute, line = P.lines.KGX;
  const boards = dir === "home"
    ? { "KGX-LET": [], "ZFD-LET": [svc({ from: "ZFD", to: "LET", dep: T0 + 30 * m, arr: T0 + 70 * m, operator: "Thameslink", serviceId: "TL", destination: "Cambridge" })], "STP-LET": [] }
    : hub === "ZFD" ? { "LET-KGX": [], "LET-ZFD": [svc({ from: "LET", to: "ZFD", dep: T0 + 50 * m, arr: T0 + 92 * m, operator: "Thameslink", serviceId: "TR", destination: "Brighton" })], "LET-STP": [] }
    : { "LET-KGX": [svc({ from: "LET", to: "KGX", dep: T0 + 15 * m, arr: T0 + 70 * m, serviceId: "SLOW", destination: "King's Cross" }),
        svc({ from: "LET", to: "KGX", dep: T0 + 20 * m, arr: T0 + 55 * m, operator: "Thameslink", serviceId: "FAST", destination: "Brighton", platform: "4" })], "LET-ZFD": [], "LET-STP": [] };
  c.state.boards = Object.fromEntries(Object.entries(boards).map(([k, services]) => [k, { msgs: [], services }]));
  c.state.boardsAt = T0; c.state.status = []; c.state.nrStatus = []; c.render();
  [...app.d.querySelectorAll("[data-follow]")].find((b) => /Thameslink/.test(b.getAttribute("aria-label"))).click();
  const seg = line.slice(1).map((p, i) => K.km(line[i], p)), total = seg.reduce((a, b) => a + b, 0);
  const pointOn = (f) => { let d = f * total; for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const k = Math.max(0, Math.min(1, d / seg[i]));
    return [line[i][0] + (line[i + 1][0] - line[i][0]) * k, line[i][1] + (line[i + 1][1] - line[i][1]) * k]; } d -= seg[i]; } };
  const place = (min, here, more = {}) => { const now = T0 + min * m; app.setNow(now); c.state.boardsAt = now;
    Object.assign(c.state, { here, locAcc: 20, lastFixAt: now, locStatus: "ok", onLine: false, atHub: null, ...more }); c.render(); return now; };
  const panel = app.d.querySelector("#followPanel"), hero = app.d.querySelector("#hero");
  const one = (sel) => { const all = panel.querySelectorAll(sel); assert.equal(all.length, 1, `exactly one ${sel} in the card`); return all[0]; };
  // Exactly one journey card on screen: the live card is not drawn, and nothing in the card is there twice.
  const single = () => { assert.equal(hero.hidden, true, "the live card is not drawn beside the followed card"); assert.equal(panel.hidden, false); assert.equal(panel.dataset.single, "1");
    for (const sel of [".journey-heading", ".follow-status", ".steps", '[data-follow-action="stop"]']) one(sel);
    assert.ok(panel.querySelectorAll(".journey-progress").length <= 1); assert.ok(panel.querySelectorAll(".fold").length <= 2);
    for (const b of panel.querySelectorAll(".hero.merged")) assert.ok(b.textContent.trim() || b.querySelector("button,svg"), `no empty leftovers (${b.dataset.slot})`); };
  return { app, c, K, P, pointOn, place, panel, hero, one, single, text: () => squash(panel.textContent) };
}

test("On the train: one journey card, in order: the journey and the train you're on, the legs, what's next, then the fold-aways", async () => {
  const { app, c, pointOn, place, panel, hero, one, single, text } = await journey();
  // Before you're under way, what's under the followed card (a plan, or here "nothing you can catch on foot") is its own card.
  assert.equal(hero.hidden, false); assert.equal(panel.dataset.single, undefined); assert.equal(panel.querySelector(".hero.merged"), null);
  // 10:34, on the line where the 10:20 fast train should be; you've said that's the one you're on.
  place(34, pointOn(14 / 35), { onLine: true });
  assert.equal(c.state.saved.followRoute.phase, "on-train");
  [...panel.querySelectorAll("[data-pick]")].find((b) => /10:20 Thameslink/.test(b.textContent)).click();
  assert.equal(c.state.rendered.train.sure, true);
  single();
  const heading = one(".journey-heading"), service = one(".follow-service"), status = one(".follow-status"), legs = one(".journey-progress"),
    next = one(".follow-next"), tube = one('[data-block="tube-line"]'), steps = one(".steps"), stop = one('[data-follow-action="stop"]');
  for (const [a, b, why] of [[heading, service, "the clocks, then the train you're on"], [service, status, "then how it's going"], [status, legs, "then the legs"],
    [legs, next, "then what's next"], [next, tube, "then the onward tube"], [tube, steps, "then the fold-aways"], [steps, stop, "Stop following last"]]) assert.ok(before(a, b), why);
  assert.match(squash(heading.textContent), /At King's Cross ?10:55 → At office/);
  assert.match(squash(service.textContent), /^You're on the 10:20 Thameslink to Brighton/);
  assert.doesNotMatch(squash(service.textContent) + squash(heading.textContent), /platform/i, "the departure platform is not shown once aboard");
  assert.equal(panel.querySelector(".journey-connection"), null, "the three-column departure panel is not shown once aboard");
  assert.doesNotMatch(text(), /Timetable departure|Expected departure/);
  assert.match(squash(legs.textContent), /Journey stages.*Current leg · Train/);
  assert.equal(text().match(/At King's Cross/g).length >= 1 && text().match(/Journey remaining/g).length, 1, "the journey is stated once");
  // "Not your train?" holds the other candidates, folded while the app is sure.
  const correct = [...panel.querySelectorAll(".fold")].find((f) => f.querySelector("summary").textContent === "Not your train?");
  assert.ok(correct, "the correction is in the card"); assert.equal(correct.open, false, "folded while the train is certain");
  assert.match(squash(correct.textContent), /10:15 Great Northern to King's Cross/);
  assert.ok(before(tube, correct) && before(correct, steps));
  // Where the figures come from sits in the one "Report details".
  const report = [...panel.querySelectorAll("details")].filter((d) => /Report details/.test(d.querySelector("summary").textContent));
  assert.equal(report.length, 1); assert.match(squash(report[0].textContent), /On the train · 10:34 · worked out from your location/);
  // Drawing again (every refresh) gives the same card, not a longer one, and when nothing has changed its buttons
  // are the same buttons (a tap that began before the redraw still lands); the legs are drawn afresh each time.
  const once = text(), stopBtn = one('[data-follow-action="stop"]'), pickBtn = correct.querySelector("[data-pick]");
  c.render(); c.render(); single(); assert.equal(text(), once);
  assert.equal(one('[data-follow-action="stop"]'), stopBtn); assert.ok(panel.contains(pickBtn));
  assert.ok(before(one(".follow-status"), one(".journey-progress")) && before(one(".journey-progress"), one(".follow-next")), "the legs keep their place");
  assert.equal([...panel.querySelectorAll("details")].filter((d) => /Report details/.test(d.querySelector("summary").textContent) && /worked out from your location/.test(d.textContent)).length, 1);
  // A minute on, the card is rebuilt with the new times and is still one card.
  place(35, pointOn(15 / 35), { onLine: true }); single();
  assert.match(squash(one(".journey-progress").parentElement.closest("#followPanel") ? text() : ""), /On the train · 10:35/);
  // Pinned to Plan while aboard: the plan is its own card again, and the followed card keeps its legs (once).
  app.d.querySelector('[data-journey-view="plan"]').click();
  assert.equal(panel.dataset.single, undefined); assert.equal(hero.hidden, false); assert.equal(panel.querySelector(".hero.merged"), null);
  assert.equal(panel.querySelectorAll(".journey-progress").length, 1, "the legs stay on the followed card");
  assert.doesNotMatch(squash(one(".follow-service").textContent), /platform/i);
  app.d.querySelector('[data-journey-view="auto"]').click();
  single(); one(".journey-progress");
  // Stop following: the live card is back on its own.
  one('[data-follow-action="stop"]').click();
  assert.equal(panel.hidden, true); assert.equal(hero.hidden, false);
  assert.match(squash(hero.textContent), /On the train/);
  assert.deepEqual(app.errors, []);
});

test("On the train and unsure which: the card says 'Probably', and 'Not your train?' stands open; choosing folds it", async () => {
  const { app, c, pointOn, place, panel, single, one } = await journey();
  // 10:22, two minutes out: the 10:15 stopper and the 10:20 fast train are both about here.
  place(22, pointOn(2 / 35), { onLine: true });
  c.state.saved.followRoute.phase = "on-train"; c.render();
  single();
  assert.equal(c.state.rendered.train.sure, false, "the staging leaves the app unsure");
  assert.match(squash(one(".follow-service").textContent), /^Probably the /);
  const correct = [...panel.querySelectorAll(".fold")].find((f) => f.querySelector("summary").textContent === "Not your train?");
  assert.ok(correct && correct.open, "open while the app is unsure");

  [...correct.querySelectorAll("[data-pick]")].find((b) => /10:20 Thameslink/.test(b.textContent)).click();
  single();
  assert.match(squash(one(".follow-service").textContent), /^You're on the 10:20 Thameslink to Brighton.*you picked this/);
  const after = [...panel.querySelectorAll(".fold")].find((f) => f.querySelector("summary").textContent === "Not your train?");
  assert.ok(!after || !after.open, "folded once you've said");
  assert.deepEqual(app.errors, []);
  // Standing open by itself is not you reading it: arriving at King's Cross while still unsure changes the view at once.
  const b = await journey();
  b.place(22, b.pointOn(2 / 35), { onLine: true }); b.c.state.saved.followRoute.phase = "on-train"; b.c.render();
  assert.ok([...b.panel.querySelectorAll(".fold")].some((f) => f.open && f.querySelector("summary").textContent === "Not your train?"));
  b.place(57, b.P.stationGeo.KGX, { atHub: "KGX" });
  assert.equal(b.c.state.presentation.view, "at-hub");
  assert.equal(b.c.state.presentation.pending, false); assert.equal(b.app.d.querySelector("#journeyViewNote").textContent, "", 'no "Journey update ready · finish what you’re reading"');
  assert.deepEqual(b.app.errors, []);
});

test("At the change station, on the tube and on the walk to the office: still one card, with the tube choices in view", async () => {
  const { app, c, P, place, panel, single, one, text } = await journey("office", "ZFD");
  c.state.saved.followRoute.phase = "after-train";
  // 11:35 at Farringdon, with live tubes.
  c.state.tube = { hub: "ZFD", at: T0 + 95 * m, arrivals: [{ t: T0 + 102 * m, line: "Circle", lineId: "circle", platform: "Eastbound - Platform 1", dest: "Aldgate", vehicle: "v9" }] };
  place(95, P.stationGeo.ZFD, { atHub: "ZFD" });
  single();
  assert.equal(c.state.presentation.view, "at-hub");
  const pick = panel.querySelector("[data-tubepick]");
  assert.ok(pick, "the tubes you can board are in the card"); assert.equal(folded(pick), false, "and not folded away");
  // The live "Get on the …" is the next step; the saved "Next: Circle or Met to Aldgate" isn't said beside it
  // (follow-a-route.md, Clean baseline; this asserted the opposite until the independent review, 12 Nov).
  assert.equal(panel.querySelector(".follow-next"), null, "no saved 'Next:' beside the live instruction");
  assert.equal(panel.querySelector('[data-fact="train-duration"]'), null, "the finished train is not on the card");
  // No live tubes yet: what the card says about that stays in view, not in a fold.
  c.state.tube = { hub: "ZFD", at: T0 + 95 * m, arrivals: [] }; c.render(); single();
  const note = [...panel.querySelectorAll('[data-block="source"]')].find((n) => /Allowing/.test(n.textContent));
  assert.ok(note, "the allowances note is in the card"); assert.equal(folded(note), false);
  c.state.tube = { hub: "ZFD", at: T0 + 95 * m, arrivals: [{ t: T0 + 102 * m, line: "Circle", lineId: "circle", platform: "Eastbound - Platform 1", dest: "Aldgate", vehicle: "v9" }] }; c.render();
  // 11:40 on the tube.
  c.state.saved.tubeRide = { hub: "ZFD", from: "ZFD", t: T0 + 97 * m, line: "Circle", vehicle: "v9", picked: true, rideMs: 7 * m, stop: "Aldgate", stopGeo: [51.5142, -0.0755] };
  place(100, [51.519, -0.094]);
  single();
  assert.match(squash(one(".follow-service").textContent), /^Your tube: 11:37 Circle/);
  assert.match(squash(one(".journey-progress").textContent), /Current leg · Tube/);
  // 11:46 at Aldgate, walking.
  c.state.saved.tubeRide = null; place(106, [51.5142, -0.0755]);
  single();
  assert.match(text(), /Now ?11:46 → At office/);
  assert.equal(text().match(/At office/g).length, 1, "one arrival, not one per card");
  assert.deepEqual(app.errors, []);
});

test("Coming home on the tube: one card, 'Got off already?' in view; at the station your train leaves from the plan card is still its own; walking home, one card", async () => {
  const { app, c, P, place, panel, hero, single, one, text } = await journey("home");
  c.state.saved.tubeRide = { hub: "ALD", from: "ALD", t: T0 + 10 * m, line: "Circle", vehicle: "v1", picked: true, rideMs: 8 * m, stop: "Farringdon", stopGeo: P.stationGeo.ZFD };
  place(12, [51.519, -0.094]);
  single();
  assert.match(text(), /Tube: Circle Met Aldgate → Farringdon · 7 min/);
  assert.match(squash(one(".follow-service").textContent), /^Your tube: the Circle that left Aldgate at 10:10/);
  const gotOff = [...panel.querySelectorAll("button")].find((b) => /At Farringdon/.test(b.textContent));
  assert.ok(gotOff, "'Got off already?' is in the card"); assert.equal(folded(gotOff), false);
  assert.doesNotMatch(text(), /Get off at King's Cross/, "the tube card's own journey is not repeated");
  assert.ok(one('.journey-connection'), "before the train, its panel (and scheduled departure) stays");
  assert.ok(before(one('[data-block="tube-line"]'), one(".journey-connection")) && before(one(".journey-connection"), one(".journey-progress")), "coming home the tube is named first, above the train, then the legs");
  // At Farringdon: the departures are a plan, not the journey; they stay a separate card (unchanged).
  c.state.saved.tubeRide = null; place(22, P.stationGeo.ZFD, { atHub: "ZFD" });
  assert.equal(hero.hidden, false); assert.equal(panel.dataset.single, undefined);
  assert.equal(panel.querySelectorAll(".journey-heading").length, 1); assert.equal(panel.querySelector(".hero.merged"), null, "nothing left over from the merged card");
  // Off the train at Letchworth, walking home.
  c.state.saved.followRoute.phase = "after-train"; place(75, P.stationGeo.LET);
  single();
  assert.match(text(), /Now ?11:15 → At home/);
  assert.deepEqual(app.errors, []);
});

test("Not one card when the live card is about something else: a different train selected, or no route followed", async () => {
  const { app, c, pointOn, place, panel, hero } = await journey();
  // 10:34 where the fast train should be (so Follow has you aboard it), then you say you're on the stopper and confirm
  // the switch: the live card shows that train in full.
  place(34, pointOn(14 / 35), { onLine: true });
  assert.equal(c.state.saved.followRoute.phase, "on-train");
  [...panel.querySelectorAll("[data-pick]")].find((b) => /10:15 Great Northern/.test(b.textContent)).click();
  app.d.querySelector("[data-pick-confirmed]").click();
  assert.equal(c.state.rendered.train.t.serviceId, "SLOW", "the staging shows the stopper on the live card");
  assert.equal(hero.hidden, false, "a card about a different train is shown in full"); assert.equal(panel.dataset.single, undefined);
  // Never two cards claiming two trains: the live card says which train you're on; the followed card names its own.
  assert.match(squash(hero.textContent), /You're on the 10:15 Great Northern/);
  const mine = squash(panel.querySelector(".follow-service").textContent);
  assert.match(mine, /^10:20 Thameslink to Brighton/); assert.doesNotMatch(mine, /You.re on|platform/i);
  panel.querySelector('[data-follow-action="stop"]').click();
  assert.equal(hero.hidden, false); assert.equal(panel.hidden, true);
  assert.equal(app.d.querySelector(".hero.merged"), null);
  assert.deepEqual(app.errors, []);
});

test("A doubt about the train you're following is asked inside the one card, in view, never folded", async () => {
  const { app, c, K, P, pointOn, place, panel, single, one } = await journey();
  const line = P.lines.KGX, total = K.lineLengthKm(line), frac = (code) => K.lineProgress(P.stationGeo[code], line).frac;
  // 10:34, 1.5 km short of Knebworth, following (and aboard, you've said) the 10:20 fast train…
  const now = place(34, pointOn(frac("KBW") - 1.5 / total), { onLine: true });
  [...panel.querySelectorAll("[data-pick]")].find((b) => /10:20 Thameslink/.test(b.textContent))?.click();
  // …which National Rail says left Welwyn Garden City, well ahead of you, a minute ago.
  const stops = [["LET", "Letchworth", 20], ["SVG", "Stevenage", 26], ["WGC", "Welwyn Garden City", 33], ["KGX", "King's Cross", 55]].map(([code, name, min]) => ({ code, name, scheduledAt: T0 + min * m }));
  const calls = stops.map((s, i) => ({ ...s, actualAt: i <= 2 ? s.scheduledAt : null, expectedAt: i > 2 ? s.scheduledAt : null, cancelled: false, noEstimate: false }));
  c.state.progressById = { FAST: { id: "FAST", at: now, err: null, data: { last: { name: "Welwyn Garden City", code: "WGC", t: T0 + 33 * m, late: 0 }, next: { name: "King's Cross", code: "KGX", t: T0 + 55 * m },
    at: (code) => { const x = calls.find((k) => k.code === code); return x ? x.actualAt ?? x.expectedAt : null; }, calls, cancelled: false, reason: "" } } };
  c.render();
  assert.ok(c.state.rendered.train.conflict, "the staging produces a doubt about the followed train");
  single();
  const question = one("[data-wrong-train]");
  assert.equal(question.closest("details"), null, "the question is never folded away");
  assert.match(squash(question.textContent), /Welwyn Garden City.*Which train are you on\?/);
  assert.ok(before(one(".follow-status"), question) && before(question, one(".follow-next")), "with the status, above what's next");
  assert.equal([...panel.querySelectorAll(".fold")].some((f) => f.querySelector("summary").textContent === "Not your train?"), false, "the question stands in for the folded correction");
  assert.match(squash(panel.textContent), /Station reports are hidden until you say which train you.re on/);
  assert.deepEqual(app.errors, []);
});


test("At the change station the followed card's arrival is the listed next tube's office time, and the saved 'Next:' isn't said beside 'Get on …'", async () => {
  const { app, c, P, place, panel, single, text } = await journey("office", "ZFD");
  c.state.saved.followRoute.phase = "after-train";
  c.state.tube = { hub: "ZFD", at: T0 + 95 * m, arrivals: [{ t: T0 + 102 * m, line: "Circle", lineId: "circle", platform: "Eastbound - Platform 1", dest: "Aldgate", vehicle: "v9" }] };
  // TfL's journey planner disagrees (11 Nov: 08:44 in the headline while the list said 08:30).
  c.state.toOffice = { at: T0 + 95 * m, arrive: T0 + 140 * m };
  place(95, P.stationGeo.ZFD, { atHub: "ZFD" });
  single();
  assert.ok(c.state.hubOffice && c.state.hubOffice.hub === "ZFD", "(the tube list worked out the office time)");
  const head = panel.querySelector(".journey-heading");
  assert.match(squash(head.textContent), new RegExp(`At office ?${hm(c.state.hubOffice.arrive)}`), "the headline uses the listed tube");
  assert.match(text(), /Next tube and measured onward walk/);
  assert.doesNotMatch(text(), /Next: ?\d\d:\d\d · [^·]*(Circle|Met)[^·]*Aldgate[^]*Get on the/, "no saved 'Next:' beside the live instruction");
  assert.equal(panel.querySelector(".follow-next"), null);
  assert.deepEqual(app.errors, []);
});
