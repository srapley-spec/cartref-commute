// The leg strip on the lock screen (#71, Sam 19 Nov: "strip + diagram"). The Live Activity draws the strip the card
// draws, from the same progress model: on the train and on the tube, not before or after. docs/stories/journey-progress.md,
// "Strip and diagram (19 Nov 2026)".
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, hm, at, closeAll } from "./harness.mjs";
after(closeAll);

const T0 = at("2026-11-03", "10:00"), m = 60e3;
const svc = (o) => Object.assign({ std: hm(o.dep), depLate: 0, depUnknown: false, arrLate: 0, arrUnknown: false, platform: null, operator: "Great Northern", cancelled: false, reason: "", origin: "" }, o);
async function journey() {
  const app = await createApp({ settings: { provider: "demo" }, saved: { dirMode: "office" }, geo: null, now: T0 });
  const c = app.c, P = app.w.CommuteCore.profiles.samCommute;
  const boards = { "LET-KGX": [svc({ from: "LET", to: "KGX", dep: T0 + 20 * m, arr: T0 + 55 * m, operator: "Thameslink", serviceId: "FAST", destination: "Brighton", platform: "4" })], "LET-ZFD": [], "LET-STP": [] };
  c.state.boards = Object.fromEntries(Object.entries(boards).map(([k, services]) => [k, { msgs: [], services }]));
  c.state.boardsAt = T0; c.state.status = []; c.state.nrStatus = []; c.render();
  [...app.d.querySelectorAll("[data-follow]")].find((b) => /Thameslink/.test(b.getAttribute("aria-label"))).click();
  const place = (min, here, more = {}) => { const now = T0 + min * m; app.setNow(now); c.state.boardsAt = now; c.state.fetchedAt = now;
    Object.assign(c.state, { here, locAcc: 20, lastFixAt: now, locStatus: "ok", onLine: false, atHub: null, ...more }); c.render(); return now; };
  return { app, c, P, place };
}

test("Lock screen strip: none before you set off; on the tube after the train, the Met's colour, TfL's place as a solid marker, Last/Next/Your stop named", async () => {
  const { app, c, P, place } = await journey();
  place(5, P.stationGeo.LET);
  assert.equal(c.nativeSnapshot().strip, null, "at home: no strip");
  c.state.saved.followRoute.phase = "after-train";
  const now = place(60, [51.5201, -0.0973], { inLondon: true });
  c.state.saved.tubeRide = { hub: "KGX", from: "KGX", t: now - 3 * m, line: "Met", vehicle: "v9", rideMs: 10 * m, stop: "Aldgate", stopGeo: [51.5142, -0.0755], picked: true };
  c.state.ald = { at: now, arrivals: [{ vehicle: "v9", lineId: "metropolitan", stopId: "940GZZLUALD", platform: "Northbound - Platform 2", observedAt: now, t: now + 6 * m, where: "Between Farringdon and Barbican" }] };
  c.render();
  const s = c.nativeSnapshot();
  assert.ok(app.d.querySelector(".journey-progress .jp-strip"), "(the card draws the strip)");
  assert.ok(s.strip, JSON.stringify(s.phase));
  assert.equal(s.strip.colour, "#9B0058");
  assert.deepEqual({ ...s.strip.marker }, { at: 1.5, kind: "reported" });
  assert.equal(s.strip.last, "Farringdon"); assert.equal(s.strip.next, "Barbican"); assert.equal(s.strip.yours, "Aldgate");
  assert.equal(s.strip.stations, 6); assert.equal(s.strip.yoursAt, now + 6 * m);
  // Review (19 Nov): only for the commute's own train or tube, while you're on it.
  assert.ok(c.nativeStrip(null, "walk-last"), "(on the tube: a strip)");
  assert.equal(c.nativeStrip({ id: "t1" }, "walk-last"), null, "not for a followed Trip");
  for (const phase of ["leave", "arrived", "missed", "cancelled"]) assert.equal(c.nativeStrip(null, phase), null, phase);
  const pm = c.state.rendered.progressModel, kind = pm.current.kind;
  pm.current.kind = "walk"; assert.equal(c.nativeStrip(null, "walk-last"), null, "a walking leg: none"); pm.current.kind = kind;
  // With no place from TfL the lock screen gets an estimate, never a solid marker.
  c.state.ald.arrivals[0].where = ""; c.render();
  const e = c.nativeSnapshot().strip;
  assert.equal(e.marker.kind, "estimate"); assert.equal(e.last, null); assert.equal(e.next, null);
  assert.deepEqual(app.errors, []);
});
