// The 11 Nov 2026 retest on the page (issue #57, comment "Retest, 11 Nov morning"; docs/stories/which-train.md,
// "The train you said you're on holds", and follow-a-route.md): the pick holds off the line and across a reload, last
// seen at the station is never "missed", "Your tube:", the Thameslink note, no empty status strip under way.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, hm, at, closeAll } from "./harness.mjs";
after(closeAll);

const T0 = at("2026-11-03", "10:00"), m = 60e3;
const svc = (o) => Object.assign({ std: hm(o.dep), depLate: 0, depUnknown: false, arrLate: 0, arrUnknown: false, platform: null, operator: "Great Northern", cancelled: false, reason: "", origin: "" }, o);
const squash = (s) => s.replace(/\s+/g, " ").trim();
const FAST_LOCK = { operator: "Thameslink", std: "10:20", from: "LET", serviceId: "FAST", picked: true };

async function outbound(saved = {}) {
  const app = await createApp({ settings: { provider: "demo", followRoute: true }, saved: { dirMode: "office", ...saved }, geo: null, now: T0 });
  const c = app.c, K = app.w.CommuteCore, P = K.profiles.samCommute;
  c.state.boards = boards();
  c.state.boardsAt = T0; c.state.status = []; c.state.nrStatus = []; c.render();
  const fixAt = (min, lat, lon, acc = 20) => { const now = T0 + min * m; app.setNow(now); c.state.boardsAt = now;
    c.onPosition({ coords: { latitude: lat, longitude: lon, accuracy: acc, speed: null }, timestamp: now }); c.render(); };
  return { app, c, K, P, fixAt, panel: () => squash(app.text("#followPanel")) };
}
function boards() {
  return { "LET-KGX": { msgs: [], services: [
    svc({ from: "LET", to: "KGX", dep: T0 + 15 * m, arr: T0 + 70 * m, serviceId: "SLOW", destination: "King's Cross" }),
    svc({ from: "LET", to: "KGX", dep: T0 + 20 * m, arr: T0 + 55 * m, operator: "Thameslink", serviceId: "FAST", destination: "Brighton" })] },
    "LET-ZFD": { msgs: [], services: [] }, "LET-STP": { msgs: [], services: [] } };
}

test("A train you picked stays picked while the phone isn't placed on the line; it goes at the station it takes you to, or 30 min after its arrival", async () => {
  const { app, c, P, fixAt } = await outbound();
  // 10:30, aboard the 10:20 you picked; then a fix 2 km off the line (a tunnel, a coarse fix): it used to be dropped.
  c.state.trainLock = { ...FAST_LOCK, at: T0 + 25 * m }; c.state.onLine = true;
  fixAt(30, 51.86, -0.10);
  assert.equal(c.state.onLine, false, "(the fix doesn't place you on the line)");
  assert.equal(c.state.trainLock?.serviceId, "FAST", "still the train you picked");
  // At King's Cross, the station it takes you to: the pick has done its job.
  fixAt(56, ...P.stationGeo.KGX);
  assert.equal(c.state.trainLock?.picked, undefined, "no longer a pick (the screen may still work out a train for itself)");
  // Picked again; 31 minutes after its arrival, off the line: gone. (Its board still listing it.)
  c.state.boards = boards();
  c.state.trainLock = { ...FAST_LOCK, at: T0 + 25 * m };
  fixAt(55 + 31, 51.86, -0.10);
  assert.equal(c.state.trainLock?.picked, undefined, "30 minutes after it was due in");
  // A pick made more than 4 hours ago: gone.
  c.state.trainLock = { ...FAST_LOCK, at: T0 + 30 * m - 4 * 3600e3 - 1 };
  fixAt(31, 51.86, -0.10);
  assert.equal(c.state.trainLock?.picked, undefined);
  assert.deepEqual(app.errors, []);
});

test("The pick survives a reload: kept with when it was made, restored if under 4 hours old, cleared when dropped", async () => {
  const fresh = await outbound({ trainPick: { ...FAST_LOCK, at: T0 - 10 * m } });
  assert.equal(fresh.c.state.trainLock?.serviceId, "FAST", "restored after a reload");
  const old = await outbound({ trainPick: { ...FAST_LOCK, at: T0 - 4 * 3600e3 - 1 } });
  assert.equal(old.c.state.trainLock || null, null); assert.equal(old.c.state.saved.trainPick, undefined, "an old pick is cleared");
  const bad = await outbound({ trainPick: { picked: true, std: 1020 } });
  assert.equal(bad.c.state.trainLock || null, null, "a malformed saved pick is ignored");
  // Picking saves it; dropping it clears it.
  const { c } = await outbound();
  c.state.trainLock = { ...FAST_LOCK, at: T0 }; c.render();
  assert.deepEqual(JSON.parse(JSON.stringify(c.state.saved.trainPick)), { ...FAST_LOCK, at: T0 });
  c.state.trainLock = null; c.render();
  assert.equal(c.state.saved.trainPick, undefined, "a pick that's gone isn't kept");
  for (const a of [fresh, old, bad]) assert.deepEqual(a.app.errors, []);
});

test("Seen at the station, then the train pulls out and the phone is neither at the station nor placed on the line: never 'missed', it asks", async () => {
  const { app, c, P, fixAt, panel } = await outbound();
  [...app.d.querySelectorAll("[data-follow]")].find((b) => /Thameslink/.test(b.getAttribute("aria-label"))).click();
  fixAt(18, ...P.stationGeo.LET);
  assert.match(panel(), /Be on the platform by/);
  // 10:21, a minute after departure, 600 m down the line from the station, no speed from the phone.
  fixAt(21, P.stationGeo.LET[0] - 0.004, P.stationGeo.LET[1] - 0.005);
  assert.notEqual(c.state.saved.followRoute.incident, "missed");
  assert.doesNotMatch(panel(), /no longer make|Can't make it/);
  assert.match(panel(), /Departure passed · confirm if you are on it/);
  // Never seen at the station (left home late, nowhere near): the old rule still applies after the departure.
  const other = await outbound();
  [...other.app.d.querySelectorAll("[data-follow]")].find((b) => /Thameslink/.test(b.getAttribute("aria-label"))).click();
  other.fixAt(21, P.stationGeo.LET[0] - 0.004, P.stationGeo.LET[1] - 0.005);
  assert.match(other.panel(), /You can no longer make your 10:20/);
  assert.deepEqual(app.errors, []); assert.deepEqual(other.app.errors, []);
});

test("Thameslink trains carry the note in the train panel; others don't", async () => {
  const { app } = await outbound();
  const panels = [...app.d.querySelectorAll(".tl-note")].map((n) => squash(n.textContent));
  assert.ok(panels.length >= 1 && panels.every((t) => t === "Thameslink: first class at the rear is open to standard tickets."), JSON.stringify(panels));
  const notes = [...app.d.querySelectorAll(".tl-note")];
  for (const n of notes) assert.match(squash(n.parentElement.textContent), /Thameslink/, "only beside a Thameslink train");
  assert.deepEqual(app.errors, []);
});
