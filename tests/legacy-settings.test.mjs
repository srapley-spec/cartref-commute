// Saved state with no usable `settings` object (follow-up to docs/reviews/permanent-features-2026-11-18.md, 19 Nov).
// Before #63, Follow, Trip and Any start and end point could only be used once switched on, and the switches lived in
// `settings`. With no settings object (or one that isn't an object), nothing says a switch was on, so the state is
// treated as every switch off, as the defaults were: a saved route isn't followed, an open Trip isn't reopened, a
// "Where to?" place isn't planned to. The migration then runs once, as for any device from before #63.
// docs/stories/follow-a-route.md, "Permanent since 18 Nov".
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, at, closeAll } from "./harness.mjs";
after(closeAll);

const T0 = at("2026-11-03", "10:00"), LS = "cartrefCommute.v1";
const DORMANT = { dirMode: "office", mode: "commute", followRoute: { id: "dormant", phase: "before-train", direction: "office", mode: "commute" },
  follow: { train: { std: "08:00" } }, tripMode: { active: true, from: { name: "Home" }, follow: { id: "t-old", journey: { rides: [] } } }, dest: "Science Museum", home: [51.975, -0.23] };
// Writes exactly this saved state (the harness always adds a settings object; these tests need none).
const raw = (value) => (w) => { w.localStorage.setItem(LS, typeof value === "string" ? value : JSON.stringify(value)); };
const stored = (app) => JSON.parse(app.w.localStorage.getItem(LS));
const submit = (app) => { app.d.querySelector("#settingsBtn").click(); app.d.querySelector("#settingsForm").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true })); };
const shellWith = (settingsValue) => (w) => { w.Capacitor = { isNativePlatform: () => true, Plugins: { CommuteNative: {
  capabilities: async () => ({ v: 1, offline: true }), ready: async () => {}, configure: async () => {}, publish: async () => {}, cache: async () => {},
  cached: async () => ({ entries: [{ key: "settings", v: 1, dataAt: T0, savedAt: T0, value: settingsValue }] }),
  addListener: () => {} } } }; };

for (const [label, settings] of [["missing", undefined], ["null", null], ["a string", "on"], ["an array", ["followRoute"]], ["a number", 1]]) {
  test(`Settings ${label}: a dormant route, Trip and destination stay dormant; the migration is done once`, async () => {
    const app = await createApp({ now: T0, beforeScripts: raw({ ...DORMANT, ...(settings === undefined ? {} : { settings }) }) });
    const s = app.c.state.saved;
    assert.equal(s.followRoute ?? null, null, "not followed"); assert.equal(s.follow ?? null, null, "the legacy record too");
    assert.equal(s.tripMode.active, false, "Trip not reopened"); assert.equal(s.tripMode.follow, undefined, "its followed Trip dropped");
    assert.deepEqual(JSON.parse(JSON.stringify(s.tripMode.from)), { name: "Home" }, "the rest of Trip kept");
    assert.equal(s.dest, undefined, "no destination planned to");
    assert.equal(app.d.querySelector("#followPanel").hidden, true);
    assert.equal(app.c.nativeFollowPlan(), null, "nothing for the iPhone app");
    assert.equal(s.settings.featuresPermanent, 1, "marked done");
    assert.equal(typeof s.settings, "object"); assert.ok(!Array.isArray(s.settings));
    assert.deepEqual(JSON.parse(JSON.stringify(s.home)), DORMANT.home, "unrelated saved data kept");
    assert.deepEqual(app.errors, []); app.close();
  });
}

test("Missing settings: the one-time migration doesn't run again: a route followed after it survives save and reload, twice", async () => {
  const app = await createApp({ now: T0, beforeScripts: raw({ dirMode: "office", mode: "commute", home: [51.975, -0.23] }) });
  app.c.state.saved.settings.provider = "demo"; app.c.render();
  [...app.d.querySelectorAll("[data-follow]")][0].click();
  assert.ok(app.c.state.saved.followRoute, "followed");
  submit(app);
  const once = stored(app); app.close();
  assert.equal(once.settings.featuresPermanent, 1); assert.ok(once.followRoute, "saved with the route");
  let state = once;
  for (let i = 0; i < 2; i++) {
    const again = await createApp({ now: T0, beforeScripts: raw(state) });
    assert.ok(again.c.state.saved.followRoute, `reload ${i + 1}: still followed`);
    state = stored(again); again.close();
  }
});

test("Missing settings on the iPhone: cached settings restored after the migration can't bring the dormant route back", async () => {
  const app = await createApp({ now: T0, beforeScripts: (w) => { raw(DORMANT)(w); shellWith({ provider: "demo", followRoute: true, trip: true, anyPlace: true, appearance: "dark" })(w); } });
  await new Promise((r) => setTimeout(r, 60));
  const s = app.c.state.saved;
  assert.equal(app.c.S().appearance, "dark", "(the cached settings were restored)");
  assert.equal(s.followRoute ?? null, null); assert.equal(s.tripMode.active, false); assert.equal(s.dest, undefined);
  assert.equal(s.settings.featuresPermanent, 1); assert.equal("followRoute" in s.settings, false, "retired switches dropped");
  app.close();
});

test("Valid settings are unchanged by this: explicit switches on keep their journey; a migrated device keeps everything", async () => {
  const on = await createApp({ now: T0, beforeScripts: raw({ ...DORMANT, settings: { provider: "demo", followRoute: true, trip: true, anyPlace: true } }) });
  assert.equal(on.c.state.saved.followRoute.id, "dormant"); assert.equal(on.c.state.saved.tripMode.active, true); assert.equal(on.c.state.saved.dest, "Science Museum");
  on.close();
  const done = await createApp({ now: T0, beforeScripts: raw({ ...DORMANT, settings: { provider: "demo", featuresPermanent: 1 } }) });
  assert.equal(done.c.state.saved.followRoute.id, "dormant", "already migrated: nothing dropped");
  done.close();
});

test("Unreadable saved state starts fresh rather than half-loading", async () => {
  for (const value of ["not json", "[1,2]", "null", "42"]) {
    const app = await createApp({ now: T0, beforeScripts: raw(value) });
    assert.equal(app.c.state.saved.settings.featuresPermanent, 1, value);
    assert.equal(app.c.state.saved.followRoute ?? null, null);
    assert.deepEqual(app.errors, [], value); app.close();
  }
});

test("A really cleared iPhone web view (nothing saved at all) gets its settings back from the app's cache", async () => {
  const cached = { provider: "demo", appearance: "dark", leaveAlarmMin: 7 };
  const app = await createApp({ now: T0, beforeScripts: (w) => { w.localStorage.removeItem(LS); shellWith(cached)(w); } });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(app.c.S().appearance, "dark"); assert.equal(app.c.S().leaveAlarmMin, 7); assert.equal(app.c.S().provider, "demo");
  assert.equal(app.c.state.saved.settings.featuresPermanent, 1);
  app.close();
  // Settings of its own (anything beyond what start-up writes) are never replaced.
  const own = await createApp({ now: T0, beforeScripts: (w) => { raw({ settings: { provider: "proxy", appearance: "light" } })(w); shellWith(cached)(w); } });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(own.c.S().appearance, "light"); own.close();
});
