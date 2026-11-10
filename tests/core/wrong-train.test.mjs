// The station check for a train you selected (docs/stories/which-train.md; issue #57 C1). 10 Nov 2026: Sam was
// following and riding the 07:20 fast train and had selected the late 07:15 stopper. The two were never more than a
// few minutes of travel apart until well after the fast train overtook, so the distance rule (6 min) stayed quiet.
// A station report the train can't share with you settles it sooner, however close the trains are.
import { test } from "node:test";
import assert from "node:assert/strict";
import { core, testville, train, MIN } from "./helpers.mjs";

const T = (hm) => new Date(`2026-11-10T${hm}:00`).getTime();
// The made-up line: Riverside (0) → Midway (halfway, about 6.6 km) → Central (1), about 13.2 km.
const LINE = testville.lines.CEN, GEO = testville.stationGeo, KM = core.lineLengthKm(LINE);
const pointAt = (frac) => [50.1 - 0.1 * frac, -1.1 + 0.1 * frac];
const kmShortOfMid = (k) => pointAt(0.5 - k / KM), kmPastMid = (k) => pointAt(0.5 + k / KM);
const toCity = (std, dep, len, extra = {}) => train({ from: "RVS", to: "CEN", std, dep, arr: dep + len * MIN, operator: "Express Rail", ...extra });
const PICK = { operator: "Express Rail", std: "07:40", from: "RVS", serviceId: "S1", picked: true };
const PICK_FAR = { operator: "Express Rail", std: "07:30", from: "RVS", serviceId: "S1", picked: true };

test("lineLengthKm: the made-up line is about 13 km, and Midway is halfway", () => {
  assert.ok(KM > 12.5 && KM < 14, String(KM));
  assert.ok(Math.abs(core.lineProgress(GEO.MID, LINE).frac - 0.5) < 0.01);
});

test("Station check: the train left a station a minute or more ago and you still hadn't reached it → not your train", () => {
  const now = T("08:00"), mine = (k) => core.lineProgress(kmShortOfMid(k), LINE).frac;
  const pg = { last: { code: "MID", name: "Midway", t: now - 2 * MIN }, next: { code: "CEN", t: now + 18 * MIN }, at: () => null };
  const c = core.stationContradiction(pg, true, mine(1.5), now, LINE, GEO, 20);
  assert.deepEqual(c, { kind: "left-before-you", code: "MID", name: "Midway", t: now - 2 * MIN });
  // Thresholds: the fix must be at least a minute after the reported minute (reports are whole minutes)…
  assert.ok(core.stationContradiction({ ...pg, last: { ...pg.last, t: now - 60e3 } }, true, mine(1.5), now, LINE, GEO, 20), "exactly a minute later counts");
  assert.equal(core.stationContradiction({ ...pg, last: { ...pg.last, t: now - 59e3 } }, true, mine(1.5), now, LINE, GEO, 20), null, "59 s later doesn't");
  // …and you must be short of the station by more than 1 km.
  assert.equal(core.stationContradiction(pg, true, mine(0.9), now, LINE, GEO, 20), null, "0.9 km short: could be the same train");
  assert.ok(core.stationContradiction(pg, true, mine(1.1), now, LINE, GEO, 20), "1.1 km short counts");
  // Only a fix good to 250 m is evidence (a Wi-Fi or mast position, or one with no known accuracy, never is).
  for (const acc of [null, undefined, NaN, 251, 1400, -1]) assert.equal(core.stationContradiction(pg, true, mine(3), now, LINE, GEO, acc), null, `accuracy ${acc}`);
  assert.ok(core.stationContradiction(pg, true, mine(3), now, LINE, GEO, 250), "±250 m is the limit");
  // On the train: just past the station it left → nothing.
  assert.equal(core.stationContradiction(pg, true, core.lineProgress(kmPastMid(0.5), LINE).frac, now, LINE, GEO, 20), null);
  // No report, no feed, a station the profile doesn't know: nothing.
  assert.equal(core.stationContradiction(null, true, mine(3), now, LINE, GEO, 20), null);
  assert.equal(core.stationContradiction({ last: null, next: null, at: () => null }, true, mine(3), now, LINE, GEO, 20), null);
  assert.equal(core.stationContradiction({ ...pg, last: { code: "ZZZ", t: now - 5 * MIN } }, true, mine(3), now, LINE, GEO, 20), null);
  // A station that isn't on this line (over 1 km off it) is never evidence.
  assert.equal(core.stationContradiction({ ...pg, last: { code: "OFF", t: now - 5 * MIN } }, true, mine(3), now, LINE, { ...GEO, OFF: [50.05, -0.95] }, 20), null);
});

test("Station check: you're past a station the train isn't due at for two minutes yet → not your train", () => {
  const now = T("08:00"), mine = core.lineProgress(kmPastMid(1.5), LINE).frac;
  const calls = (midExpected, midActual = null) => [{ code: "RVS", name: "Riverside", actualAt: now - 12 * MIN, expectedAt: null },
    { code: "MID", name: "Midway", actualAt: midActual, expectedAt: midExpected }, { code: "CEN", name: "Central", actualAt: null, expectedAt: now + 20 * MIN }];
  const pg = (midExpected, midActual) => ({ last: { code: "RVS", t: now - 12 * MIN }, next: { code: "MID", t: midExpected }, at: () => null, calls: calls(midExpected, midActual) });
  assert.deepEqual(core.stationContradiction(pg(now + 5 * MIN), true, mine, now, LINE, GEO, 20), { kind: "behind-you", code: "MID", name: "Midway", t: now + 5 * MIN });
  assert.equal(core.stationContradiction(pg(now + 2 * MIN), true, mine, now, LINE, GEO, 20), null, "due in exactly 2 min: could just be an early train");
  assert.ok(core.stationContradiction(pg(now + 2 * MIN + 1000), true, mine, now, LINE, GEO, 20));
  assert.equal(core.stationContradiction(pg(null), true, mine, now, LINE, GEO, 20), null, "no expected time: nothing to go on");
  assert.equal(core.stationContradiction(pg(now + 5 * MIN), true, core.lineProgress(kmPastMid(0.9), LINE).frac, now, LINE, GEO, 20), null, "0.9 km past: within the margin");
  // A station whose report never arrived is skipped once a later station has reported.
  // (Quarry, a made-up station 70% of the way along, reported 30 s ago; Midway's report never came.)
  const geo = { ...GEO, QRY: pointAt(0.7) }, pastQuarry = core.lineProgress(kmPastMid(3.5), LINE).frac;
  const stops = (quarryActual) => [{ code: "RVS", actualAt: now - 20 * MIN, expectedAt: null }, { code: "MID", name: "Midway", actualAt: null, expectedAt: now + 5 * MIN },
    { code: "QRY", actualAt: quarryActual, expectedAt: quarryActual ? null : now + 9 * MIN }, { code: "CEN", actualAt: null, expectedAt: now + 14 * MIN }];
  const skipped = { last: { code: "QRY", t: now - 30e3 }, next: { code: "MID", t: now + 5 * MIN }, at: () => null, calls: stops(now - 30e3) };
  assert.equal(core.stationContradiction(skipped, true, pastQuarry, now, LINE, geo, 20), null);
  assert.equal(core.stationContradiction({ ...skipped, last: { code: "RVS", t: now - 20 * MIN }, calls: stops(null) }, true, pastQuarry, now, LINE, geo, 20).code, "MID", "with no later report, Midway is next");
  // In the ordered stops: a station the profile doesn't know is passed over, a cancelled stop is never evidence,
  // and a stop with no estimate of its own falls back to the feed's time for it.
  const order = (extra) => ({ last: { code: "RVS", t: now - 12 * MIN }, next: null, at: (c) => (c === "MID" ? now + 5 * MIN : null),
    calls: [{ code: "RVS", actualAt: now - 12 * MIN, expectedAt: null }, ...extra, { code: "CEN", name: "Central", actualAt: null, expectedAt: now + 20 * MIN }] });
  assert.equal(core.stationContradiction(order([{ code: "ZZZ", actualAt: null, expectedAt: now + 3 * MIN }, { code: "MID", name: "Midway", actualAt: null, expectedAt: now + 5 * MIN }]), true, mine, now, LINE, GEO, 20).code, "MID");
  assert.equal(core.stationContradiction(order([{ code: "MID", name: "Midway", actualAt: null, expectedAt: null }]), true, mine, now, LINE, GEO, 20).kind, "behind-you", "the feed's time for the stop is used");
  assert.equal(core.stationContradiction(order([{ code: "MID", name: "Midway", actualAt: null, expectedAt: now + 5 * MIN, cancelled: true }]), true, mine, now, LINE, GEO, 20), null, "a cancelled stop isn't somewhere it is due");
  // Without the ordered stops, the feed's "next" counts only when it lies beyond the last report.
  const plain = { last: { code: "RVS", t: now - 12 * MIN }, next: { code: "MID", name: "Midway", t: now + 5 * MIN }, at: () => null };
  assert.equal(core.stationContradiction(plain, true, mine, now, LINE, GEO, 20).kind, "behind-you");
  assert.equal(core.stationContradiction({ ...plain, last: { code: "QRY", t: now - 30e3 } }, true, pastQuarry, now, LINE, geo, 20), null, "a 'next' behind its last report is ignored");
  // The train has reached its destination and you haven't: that is the first kind of evidence.
  assert.equal(core.stationContradiction({ ...plain, last: { code: "CEN", t: now - MIN } }, true, mine, now, LINE, GEO, 20).kind, "left-before-you");
});

test("Station check: going home it reads the line the other way", () => {
  const now = T("18:00");
  // A train from Central to Riverside reported leaving Midway two minutes ago; you're still 1.5 km on the city side.
  const mineHome = 1 - core.lineProgress(kmPastMid(1.5), LINE).frac;
  const pg = { last: { code: "MID", name: "Midway", t: now - 2 * MIN }, next: { code: "RVS", t: now + 8 * MIN }, at: () => null };
  assert.equal(core.stationContradiction(pg, false, mineHome, now, LINE, GEO, 20).kind, "left-before-you");
  assert.equal(core.stationContradiction(pg, false, 1 - core.lineProgress(kmShortOfMid(0.5), LINE).frac, now, LINE, GEO, 20), null, "already past Midway towards home");
});

test("whichTrain: a selected train contradicted by a station asks, though it is under 6 minutes away; a stale fix never does", () => {
  const now = T("08:00"), here = kmShortOfMid(1.2);
  const picked = toCity("07:40", now - 20 * MIN, 30, { serviceId: "S1" }), other = toCity("07:43", now - 17 * MIN, 30, { serviceId: "S2" });
  const boards = { "RVS-CEN": { msgs: [], services: [picked, other] } };
  const prog = { S1: { last: { code: "MID", name: "Midway", t: now - 2 * MIN }, next: { code: "CEN", t: now + 10 * MIN }, at: () => null } };
  const r = core.whichTrain(boards, here, "office", now, PICK, (id) => prog[id] || null, testville, now, 20).result;
  assert.equal(r.t.serviceId, "S1", "the selection is kept: the app never switches for you");
  assert.ok(r.offMin < 6, `the distance rule alone would stay quiet (${r.offMin.toFixed(1)} min)`);
  assert.equal(r.conflict, true); assert.equal(r.sure, false); assert.equal(r.confidence, "low");
  assert.deepEqual(r.contradiction, { kind: "left-before-you", code: "MID", name: "Midway", t: now - 2 * MIN });
  assert.equal(r.others[0].t.serviceId, "S2", "the other train is offered");
  // Without a usable accuracy the station check is silent (as before 10 Nov).
  assert.equal(core.whichTrain(boards, here, "office", now, PICK, (id) => prog[id] || null, testville, now).result.conflict, false);
  // A fix over 2 minutes old can't raise it.
  const old = core.whichTrain(boards, here, "office", now + 3 * MIN, PICK, (id) => prog[id] || null, testville, now, 20).result;
  assert.equal(old.conflict, false); assert.equal(old.stale, true); assert.equal(old.contradiction, undefined);
});

test("whichTrain: 'Keep' answers the evidence it was asked about (that station); another station asks again; the answer stays with the selection", () => {
  const now = T("08:00"), here = kmShortOfMid(1.5);
  const picked = toCity("07:40", now - 20 * MIN, 40, { serviceId: "S1" });
  const boards = { "RVS-CEN": { msgs: [], services: [picked, toCity("07:43", now - 17 * MIN, 40, { serviceId: "S2" })] } };
  const report = (t, code = "MID") => ({ S1: { last: { code, name: code, t }, next: { code: "CEN", t: now + 18 * MIN }, at: () => null } });
  const run = (lock, rep, where = here, at = now, fix = at) => core.whichTrain(boards, where, "office", at, lock, (id) => rep[id] || null, testville, fix, 20);
  const ask = run(PICK, report(now - 2 * MIN));
  const key = core.contradictionKey(ask.result.contradiction);
  assert.equal(key, "left-before-you|MID", "the kind and the station, not the minute");
  const kept = run({ ...PICK, kept: key }, report(now - 2 * MIN));
  assert.equal(kept.result.conflict, false, "not asked again for the same evidence");
  assert.equal(kept.result.kept, true); assert.equal(kept.result.sure, true);
  assert.equal(kept.result.confidence, "low", "but the evidence still stands");
  assert.equal(kept.lock.kept, key);
  // The feed correcting the minute is the same evidence: still quiet.
  assert.equal(run({ ...PICK, kept: key }, report(now - 3 * MIN)).result.conflict, false);
  // The answer survives a fix that has gone stale, and a position wobbling back inside the 1 km margin…
  const stale = run({ ...PICK, kept: key }, report(now - 2 * MIN), here, now + 3 * MIN, now);
  assert.equal(stale.result.stale, true); assert.equal(stale.lock.kept, key);
  const inside = run({ ...PICK, kept: key }, report(now - 2 * MIN), kmShortOfMid(0.95));
  assert.equal(inside.result.conflict, false); assert.equal(inside.result.confidence, "high"); assert.equal(inside.lock.kept, key);
  assert.equal(run(inside.lock, report(now - 2 * MIN), kmShortOfMid(1.05)).result.conflict, false, "…so the same station can't ask twice");
  // …and the lock learning the train's service ID.
  const { serviceId: _id, ...noId } = PICK;
  const learnt = run({ ...noId, kept: key }, report(now - 2 * MIN));
  assert.equal(learnt.lock.serviceId, "S1"); assert.equal(learnt.lock.kept, key); assert.equal(learnt.result.conflict, false);
  // Another station is new evidence (Quarry, a made-up station 70% of the way along).
  const withQuarry = { ...testville, stationGeo: { ...GEO, QRY: pointAt(0.7) } };
  const next = core.whichTrain(boards, here, "office", now, { ...PICK, kept: key }, (id) => report(now - 90e3, "QRY")[id] || null, withQuarry, now, 20);
  assert.equal(next.result.conflict, true); assert.equal(core.contradictionKey(next.result.contradiction), "left-before-you|QRY");
});

test("whichTrain: 'Keep' answers distance evidence too (no station report): key \"far\"", () => {
  const now = T("08:00");
  assert.equal(core.contradictionKey(null), "far"); assert.equal(core.contradictionKey(undefined), "far");
  // Selected: a train that left 30 min ago and is nearly there; you are near the start of the line. No reports.
  const picked = toCity("07:30", now - 30 * MIN, 40, { serviceId: "S1" });
  const boards = { "RVS-CEN": { msgs: [], services: [picked] } };
  const run = (lock) => core.whichTrain(boards, pointAt(0.1), "office", now, lock, () => null, testville, now, 20);
  const far = run(PICK_FAR);
  assert.ok(far.result.offMin > 12, String(far.result.offMin));
  assert.equal(far.result.conflict, true); assert.equal(far.result.contradiction, undefined);
  const kept = run({ ...PICK_FAR, kept: "far" });
  assert.equal(kept.result.conflict, false); assert.equal(kept.result.kept, true); assert.equal(kept.result.confidence, "low");
});

test("whichTrain: the station check uses when the fix was taken, not when the card is drawn", () => {
  // The train left Midway 30 s before the fix; the card is drawn a minute later. Still under a minute at fix time.
  const now = T("08:00"), here = kmShortOfMid(1.2);
  const picked = toCity("07:40", now - 20 * MIN, 30, { serviceId: "S1" });
  const boards = { "RVS-CEN": { msgs: [], services: [picked] } };
  const prog = { S1: { last: { code: "MID", name: "Midway", t: now - 30e3 }, next: { code: "CEN", t: now + 10 * MIN }, at: () => null } };
  assert.equal(core.whichTrain(boards, here, "office", now + 60e3, PICK, (id) => prog[id] || null, testville, now, 20).result.conflict, false);
});

test("whichTrain: with nothing selected, a train contradicted by a station is ruled out, so the other is yours", () => {
  const now = T("08:00"), here = kmShortOfMid(1.5);
  const a = toCity("07:40", now - 20 * MIN, 40, { serviceId: "S1" }), b = toCity("07:43", now - 17 * MIN, 40, { serviceId: "S2" });
  const boards = { "RVS-CEN": { msgs: [], services: [a, b] } };
  const prog = { S1: { last: { code: "MID", name: "Midway", t: now - 2 * MIN }, next: { code: "CEN", t: now + 18 * MIN }, at: () => null },
    S2: { last: { code: "RVS", t: now - 17 * MIN }, next: { code: "MID", t: now + MIN }, at: () => null } };
  const r = core.whichTrain(boards, here, "office", now, null, (id) => prog[id] || null, testville, now, 20);
  assert.equal(r.result.t.serviceId, "S2"); assert.equal(r.result.sure, true);
  assert.equal(r.result.others[0].ruledOut, true); assert.equal(r.result.others[0].contradiction.code, "MID");
  // A train that was yours by inference lets go when a station contradicts it.
  const let_go = core.whichTrain(boards, here, "office", now, { operator: "Express Rail", std: "07:40", from: "RVS", serviceId: "S1" }, (id) => prog[id] || null, testville, now, 20);
  assert.equal(let_go.result.t.serviceId, "S2");
});

test("10 Nov replay (model): the late 07:15 stopper selected, the 07:20 fast train ridden: asked at the first station it leaves ahead of you, minutes before the distance rule", () => {
  const P = core.profiles.samCommute, line = P.lines.KGX, D = (hm) => new Date(`2026-11-10T${hm}:00`).getTime();
  const fracOf = (code) => core.lineProgress(P.stationGeo[code], line).frac;
  const seg = line.slice(1).map((p, i) => core.km(line[i], p)), total = seg.reduce((a, b) => a + b, 0);
  const pointOn = (f) => { let d = f * total; for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const k = Math.max(0, Math.min(1, d / seg[i]));
    return [line[i][0] + (line[i + 1][0] - line[i][0]) * k, line[i][1] + (line[i + 1][1] - line[i][1]) * k]; } d -= seg[i]; } };
  // Ridden: the 07:20 fast train (Hitchin 07:25, Stevenage 07:30, then non-stop to Finsbury Park 07:51).
  const fast = [["LET", "07:20"], ["HIT", "07:25"], ["SVG", "07:30"], ["FPK", "07:51"]];
  const myFrac = (now) => { const done = fast.filter(([, t]) => D(t) <= now), a = done.at(-1), b = fast[done.length]; if (!b) return fracOf("FPK");
    return fracOf(a[0]) + (fracOf(b[0]) - fracOf(a[0])) * (now - D(a[1])) / (D(b[1]) - D(a[1])); };
  // Selected: the 07:15 stopper running 2 min late (modelled times; the real ones weren't recorded).
  const stops = [["LET", 2], ["HIT", 7], ["SVG", 12], ["KBW", 16], ["WLW", 20], ["WGC", 24], ["HAT", 28], ["PBR", 34], ["FPK", 49], ["KGX", 56]].map(([c, m]) => [c, D("07:15") + m * MIN]);
  const GN = train({ from: "LET", to: "KGX", std: "07:15", dep: stops[0][1], arr: stops.at(-1)[1], operator: "Great Northern", serviceId: "GN0715", depLate: 2, arrLate: 2 });
  const boards = { "LET-KGX": { msgs: [], services: [GN] } };
  const progress = (now) => () => { const done = stops.filter(([, t]) => t <= now), nxt = stops[done.length];
    return { last: { code: done.at(-1)[0], name: P.stationNames?.[done.at(-1)[0]] || done.at(-1)[0], t: done.at(-1)[1] }, next: nxt ? { code: nxt[0], t: nxt[1] } : null,
      at: (c) => (stops.find(([k]) => k === c) || [])[1] ?? null, calls: stops.map(([code, t]) => ({ code, name: code, actualAt: t <= now ? t : null, expectedAt: t > now ? t : null })) }; };
  const lock = { operator: "Great Northern", std: "07:15", from: "LET", serviceId: "GN0715", picked: true };
  const first = (acc) => { for (let now = D("07:22"); now <= D("07:56"); now += MIN) {
    const r = core.whichTrain(boards, pointOn(myFrac(now)), "office", now, lock, progress(now), P, now, acc).result;
    if (r.conflict) return { now, r }; } return null; };
  const withStations = first(20), distanceOnly = first(undefined);
  assert.ok(withStations, "the station check asks");
  assert.equal(withStations.r.contradiction.kind, "left-before-you");
  assert.ok(withStations.now <= D("07:30"), `asked by 07:30 (was ${new Date(withStations.now).toTimeString().slice(0, 5)} at ${withStations.r.contradiction.code})`);
  assert.ok(withStations.r.offMin < 6, "while the trains are still under 6 minutes apart");
  assert.ok(distanceOnly && distanceOnly.now >= D("07:38"), "the distance rule alone speaks only after the overtake");
  assert.ok(distanceOnly.now - withStations.now >= 8 * MIN, "at least 8 minutes later");
});

test("The questions' words: the evidence, then the question (wording confirmed by Sam, 10 Nov)", () => {
  const t = new Date("2026-11-10T07:33:00").getTime();
  assert.equal(core.wrongTrainQuestion("07:15 Great Northern to King's Cross", { contradiction: { kind: "left-before-you", code: "KBW", name: "Knebworth", t } }),
    "The 07:15 Great Northern to King's Cross stopped at Knebworth at 07:33; you didn't. Which train are you on?");
  assert.equal(core.wrongTrainQuestion("07:15 Great Northern", { contradiction: { kind: "behind-you", code: "WGC", name: "Welwyn Garden City", t } }),
    "You've passed Welwyn Garden City; the 07:15 Great Northern isn't due there until 07:33. Which train are you on?");
  assert.equal(core.wrongTrainQuestion("07:15 Great Northern", { reported: true }), "The 07:15 Great Northern doesn't match where you are or where it was last reported. Which train are you on?");
  assert.equal(core.wrongTrainQuestion("07:15 Great Northern", {}), "The 07:15 Great Northern doesn't match where you are. Which train are you on?");
  assert.equal(core.switchTrainQuestion("07:20 Thameslink to Brighton", "07:15 Great Northern to King's Cross"),
    "You're following the 07:20 Thameslink to Brighton. Switch to the 07:15 Great Northern to King's Cross?");
});

test("Journey progress: a train the evidence contradicts shows no station reports until you've answered; the stages stay", () => {
  const now = T("08:00");
  const legs = [{ id: "walk", kind: "walk", label: "Walk", start: now - 30 * MIN, end: now - 20 * MIN }, { id: "rail", kind: "rail", label: "Train", start: now - 20 * MIN, end: now + 20 * MIN, from: "Riverside", to: "Central" }];
  const calls = [{ code: "RVS", name: "Riverside", scheduledAt: now - 20 * MIN, actualAt: now - 20 * MIN, expectedAt: null }, { code: "MID", name: "Midway", scheduledAt: now - 2 * MIN, actualAt: now - 2 * MIN, expectedAt: null },
    { code: "CEN", name: "Central", scheduledAt: now + 20 * MIN, actualAt: null, expectedAt: now + 20 * MIN }];
  const input = { now, legs, activeLeg: "rail", calls, evidence: { source: "reported", observedAt: now - 30e3, expectedAt: now + 20 * MIN, scheduledAt: now + 20 * MIN, identityMatched: true } };
  const normal = core.journeyProgress(input);
  assert.equal(normal.calls.length, 3); assert.equal(normal.calls[1].state, "reported");
  const doubted = core.journeyProgress({ ...input, uncertainIdentity: true, contradictedIdentity: true });
  assert.deepEqual(doubted.calls, []);
  assert.equal(doubted.fraction, null);
  assert.equal(doubted.evidenceLabel, "Station reports are hidden until you say which train you’re on.");
  assert.equal(doubted.status.text, "Train not confirmed");
  assert.deepEqual(doubted.legs.map((l) => l.state), ["complete", "current"], "Journey stages stay");
  assert.equal(doubted.legs[1].fraction, 0);
});

// ---------- "I'm on it" and the train you follow (#57 C2) ----------
const followed = (extra = {}) => {
  const dep = T("07:20"), t = train({ from: "RVS", to: "CEN", std: "07:20", dep, arr: dep + 30 * MIN, operator: "Express Rail", serviceId: "F1", ...extra });
  const opt = { id: "f", train: t, hub: "CEN", leave: dep - 10 * MIN, arrive: dep + 45 * MIN, flags: [], legs: [{ t: dep - 10 * MIN, d: "Leave home" }, { t: dep, d: "07:20 Express Rail from Riverside" }] };
  const route = core.startFollowRoute(opt, { now: dep - 20 * MIN, direction: "office", mode: "commute" });
  assert.ok(route, "the route can be followed");
  return { route, t };
};

test("followIsTrain: the train you follow by service ID when both have one, else by operator, time and station; whichever city station it's listed for", () => {
  const { route } = followed();
  assert.equal(core.followIsTrain(route, { operator: "Express Rail", std: "07:20", from: "RVS", serviceId: "F1" }), true);
  assert.equal(core.followIsTrain(route, { operator: "Someone Else", std: "09:99", from: "RVS", serviceId: "F1" }), true, "the ID decides when both have one");
  assert.equal(core.followIsTrain(route, { operator: "Express Rail", std: "07:20", from: "RVS", serviceId: "OTHER" }), false, "same time and operator, another service");
  assert.equal(core.followIsTrain(route, { operator: "Express Rail", std: "07:20", from: "RVS" }), true, "no ID on the selection: operator, time and station");
  assert.equal(core.followIsTrain(route, { operator: "Metro Rail", std: "07:15", from: "RVS" }), false);
  assert.equal(core.followIsTrain(route, { operator: "Express Rail", std: "07:15", from: "RVS" }), false, "another time");
  assert.equal(core.followIsTrain(route, { operator: "Metro Rail", std: "07:20", from: "RVS" }), false, "another operator");
  // A saved route in the old format has no train to compare: never a match, never a crash.
  assert.equal(core.followIsTrain({ id: "old", dir: "office", train: { std: "08:00" } }, { operator: "Express Rail", std: "07:20", from: "RVS" }), false);
  assert.equal(core.followIsTrain(null, { operator: "Express Rail", std: "07:20", from: "RVS" }), false);
  assert.equal(core.followIsTrain(route, { operator: "Express Rail", std: "07:20", from: "MKT" }), false);
});

test("boardingCheck: 'I'm on it' is taken at its word only when nothing says otherwise", () => {
  const { route, t } = followed();
  const other = train({ from: "RVS", to: "CEN", std: "07:15", dep: T("07:17"), arr: T("07:55"), operator: "Metro Rail", serviceId: "M1" });
  const third = train({ from: "RVS", to: "CEN", std: "07:30", dep: T("07:30"), arr: T("08:00"), operator: "Express Rail", serviceId: "E3" });
  // Nothing to compare with: not on the line (no working-out), or no train fits where you are.
  assert.deepEqual(core.boardingCheck(route, null), { ask: false });
  assert.deepEqual(core.boardingCheck(route, { none: true, others: [{ t: other }] }), { ask: false });
  // The working-out is sure it's the train you follow.
  assert.deepEqual(core.boardingCheck(route, { t, sure: true, ruledOut: false, other: null, others: [{ t: other }] }), { ask: false });
  // It can't tell two trains apart (10 Nov, 07:36: "Probably the 07:20 or the 07:15"): ask, the one you follow first.
  const unsure = core.boardingCheck(route, { t: other, sure: false, other: { t }, others: [{ t }, { t: third }] });
  assert.equal(unsure.ask, true);
  assert.deepEqual(unsure.candidates.map((x) => x.serviceId), ["F1", "M1", "E3"]);
  assert.equal(core.boardingCheck(route, { t, sure: false, other: { t: other }, others: [{ t: other }] }).ask, true, "unsure, even when the followed train is the better fit");
  // Its best fit is a different train (one you selected, say): ask.
  const different = core.boardingCheck(route, { t: other, sure: true, others: [{ t, ruledOut: true }] });
  assert.equal(different.ask, true); assert.deepEqual(different.candidates.map((x) => x.serviceId), ["F1", "M1"]);
  // A report has ruled the followed train out: ask, even though it is the selected one.
  assert.equal(core.boardingCheck(route, { t, sure: true, ruledOut: true, others: [{ t: other }] }).ask, true);
  // The runner-up counts as a candidate even when the list of others is empty.
  assert.deepEqual(core.boardingCheck(route, { t, sure: false, other: { t: other }, others: [] }).candidates.map((x) => x.serviceId), ["F1", "M1"]);
  // The followed train isn't among the trains near you at all: it is still offered, first.
  assert.deepEqual(core.boardingCheck(route, { t: other, sure: true, others: [{ t: third }] }).candidates.map((x) => x.serviceId), ["F1", "M1", "E3"]);
});
