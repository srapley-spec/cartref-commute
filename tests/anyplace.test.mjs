// Feature toggle: any start and end point (Settings → Experimental). Off = exactly as before.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, sleep, closeAll } from "./harness.mjs";

after(closeAll);

const NEAR_LET = { coords: { latitude: 51.975, longitude: -0.23, accuracy: 15 } };

test("Toggle off: Leisure going out is unchanged (no 'Where to?', King's Cross or St Pancras)", async () => {
  const app = await createApp({ settings: { provider: "demo" }, saved: { mode: "leisure", dirMode: "office", dest: "Science Museum" }, geo: NEAR_LET });
  assert.equal(app.d.querySelector("#destRow").hidden, true);
  assert.equal(app.text("#routeLabel"), "Cartref → King's Cross or St Pancras");
  assert.doesNotMatch(app.text("#hero"), /Science Museum/);
  app.close();
});

test("Toggle on: going out to a London place — train, then TfL's leg from the station; the place is on the card", async () => {
  const app = await createApp({ settings: { provider: "demo", anyPlace: true }, saved: { mode: "leisure", dirMode: "office", dest: "Science Museum" }, geo: NEAR_LET });
  await sleep(300);
  assert.equal(app.d.querySelector("#destRow").hidden, false);
  assert.equal(app.d.querySelector("#destInput").value, "Science Museum");
  assert.equal(app.text("#routeLabel"), "Cartref → Science Museum");
  const hero = app.text("#hero");
  assert.match(hero, /Science Museum/);
  // Demo London legs: 18 min from King's Cross St Pancras, 21 from Farringdon, plus the change.
  const opt = app.c.ranked(Date.now()).find(o => o.recommended === 1);
  assert.ok(opt && opt.outTo, "planned to the place");
  assert.equal(opt.arrive - opt.train.arr, ({ KGX: 400, STP: 420, ZFD: 240 }[opt.hub] * 1.15 + (opt.hub === "ZFD" ? 21 : 18) * 60) * 1000);
  app.close();
});

test("Toggle on: 'Where to?' plans the new place; going home, 'Where from?' is always offered", async () => {
  const app = await createApp({ settings: { provider: "demo", anyPlace: true }, saved: { mode: "leisure", dirMode: "office" }, geo: NEAR_LET });
  assert.match(app.text("#hero"), /./);
  app.d.querySelector("#destInput").value = "Tate Modern";
  app.d.querySelector("#destRow").dispatchEvent(new app.w.Event("submit", { cancelable: true }));
  await sleep(400);
  assert.equal(app.c.state.saved.dest, "Tate Modern");
  assert.equal(app.text("#routeLabel"), "Cartref → Tate Modern");
  app.c.state.saved.dirMode = "home"; app.c.render();
  assert.equal(app.d.querySelector("#destRow").hidden, true);
  app.close();
});
