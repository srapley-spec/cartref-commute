// "Be on the platform by" (Sam, 17 Nov, on the way home: "the on the platform time is later than the time for leaving
// Farringdon. And it's not clear what platform it's talking about"): a late train is planned on its timetable time;
// the label names the platform and the station; set off needs a fresh position and, going home, is measured from
// where you started following; once set off, the rows below the card show the platform too.
// docs/stories/follow-a-route.md, "Platform time and label (17 Nov)".
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, hm, at, closeAll } from "./harness.mjs";
after(closeAll);

const T0 = at("2026-11-03", "10:00"), m = 60e3;
const svc = (o) => Object.assign({ std: hm(o.dep), depLate: 0, depUnknown: false, arrLate: 0, arrUnknown: false, platform: null, operator: "Great Northern", cancelled: false, reason: "", origin: "" }, o);

// 10:00 at the office: the 10:30 Thameslink from Farringdon (platform 4, `late` minutes late) and a 10:36 from King's Cross.
async function homeward(late = 0) {
  const app = await createApp({ settings: { provider: "demo", followRoute: true }, saved: { dirMode: "home" }, geo: null, now: T0 });
  const c = app.c, P = app.w.CommuteCore.profiles.samCommute;
  const far = svc({ from: "ZFD", to: "LET", std: "10:30", dep: T0 + (30 + late) * m, depLate: late, arr: T0 + (70 + late) * m, arrLate: late, operator: "Thameslink", serviceId: "TL", destination: "Cambridge", platform: "4" });
  const kx = svc({ from: "KGX", to: "LET", dep: T0 + 36 * m, arr: T0 + 68 * m, serviceId: "GN", destination: "Cambridge" });
  c.state.boards = { "KGX-LET": { msgs: [], services: [kx] }, "ZFD-LET": { msgs: [], services: [far] }, "STP-LET": { msgs: [], services: [] } };
  c.state.boardsAt = T0; c.state.status = []; c.state.nrStatus = []; c.render();
  [...app.d.querySelectorAll("[data-follow]")].find((b) => /Thameslink via Farringdon/.test(b.getAttribute("aria-label"))).click();
  const place = (min, here, more = {}) => { const now = T0 + min * m; app.setNow(now); c.state.boardsAt = now;
    Object.assign(c.state, { here, locAcc: 20, lastFixAt: now, locStatus: "ok", onLine: false, atHub: null, ...more }); c.render(); return now; };
  const head = () => app.text("#followPanel > .journey-heading, #followPanel .journey-heading");
  return { app, c, P, place, panel: () => app.text("#followPanel"), head };
}

test("A train 7 min late: be on the platform by its timetable time less the margin, never the later estimate; the label names platform 4 at Farringdon", async () => {
  const { app, P, place, panel } = await homeward(7);
  place(1, P.places.office);
  place(8, [51.5145, -0.0805]);   // 400 m on: set off
  assert.match(panel(), /Be on platform 4 at Farringdon by\s*10:29/, "the 10:30, 7 min late: 10:29, not 10:36");
  assert.doesNotMatch(panel(), /by\s*10:36/);
  assert.match(panel(), /on the platform in 21m 00s/);
  // At Farringdon: inside the last minute before the timetable time, that time; once it has gone, the expected departure.
  place(29.5, P.stationGeo.ZFD, { atHub: "ZFD" });
  assert.match(panel(), /Be on platform 4 at Farringdon by\s*10:30/);
  place(31, P.stationGeo.ZFD, { atHub: "ZFD" });
  assert.match(panel(), /Be on platform 4 at Farringdon by\s*10:37/);
  assert.deepEqual(app.errors, []); app.close();
});

test("Before the platform is announced: 'Be on the platform at Farringdon by'", async () => {
  const { app, c, P, place, panel } = await homeward();
  c.state.boards["ZFD-LET"].services[0].platform = null;
  place(1, P.places.office);
  place(8, [51.5145, -0.0805]);
  assert.match(panel(), /Be on the platform at Farringdon by\s*10:29/);
  assert.deepEqual(app.errors, []); app.close();
});

test("Set off needs a position no more than 2 minutes old: an older one keeps Leave by", async () => {
  const { app, P, place, panel } = await homeward();
  place(1, P.places.office);
  place(8, [51.5145, -0.0805], { lastFixAt: T0 + 8 * m - 2.5 * m });
  assert.match(panel(), /Leave by/, "a position 2½ minutes old doesn't say you've set off");
  assert.doesNotMatch(panel(), /Be on (the platform|platform 4) at/);
  place(8.5, [51.5145, -0.0805], { lastFixAt: T0 + 8.5 * m - 1.5 * m });
  assert.match(panel(), /Be on platform 4 at Farringdon by/, "1½ minutes old: set off");
  assert.deepEqual(app.errors, []); app.close();
});

test("Commute going home from somewhere other than the office: Leave by where you started following; 200 m on, the platform", async () => {
  const { app, place, panel } = await homeward();
  const elsewhere = [51.5155, -0.0985];   // near St Paul's, 1.4 km from the office
  place(1, elsewhere);
  assert.match(panel(), /Leave by/, "where you started: Leave by (it used to count as set off, 1.4 km from the office)");
  place(3, [51.5155 + 0.0027, -0.0985]);   // 300 m on
  assert.match(panel(), /Be on platform 4 at Farringdon by/);
  assert.deepEqual(app.errors, []); app.close();
});

test("Once set off, the rows below the card show their platform time too; in Plan they keep Leave by", async () => {
  const { app, P, place } = await homeward();
  place(1, P.places.office);
  const rows = () => [...app.d.querySelectorAll("#list .journey-heading")].map((h) => h.textContent.replace(/\s+/g, " "));
  assert.ok(rows().length > 0 && rows().every((h) => /Leave by/.test(h)), "at the office: " + JSON.stringify(rows()));
  place(8, [51.5145, -0.0805]);
  assert.ok(rows().length > 0 && rows().every((h) => /Be on (the platform|platform \w+) at [A-Za-z' ]+ by/.test(h) && !/Leave by/.test(h)), JSON.stringify(rows()));
  assert.ok(rows().some((h) => /Be on the platform at King's Cross by ?10:35/.test(h)), "the 10:36 from King's Cross, its own station named");
  app.d.querySelector('[data-journey-view="plan"]').click();
  const planned = [...app.d.querySelectorAll("#list .journey-heading, #hero .journey-heading")].map((h) => h.textContent);
  assert.ok(planned.length > 0 && planned.every((h) => /Leave by/.test(h) && !/Be on/.test(h)), "Plan pinned: " + JSON.stringify(planned));
  assert.deepEqual(app.errors, []); app.close();
});
