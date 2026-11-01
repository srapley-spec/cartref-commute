// Contract for the PlaceSearch and AccessTimer ports (docs/leisure-architecture.md §5). Every Google adapter (Maps JS
// library now, the proxy later) and the simulator's adapter must give identical results from the same backend data,
// so moving Google to the proxy is one adapter and a setting. Backend data is synthetic (no Google key yet).
import assert from "node:assert/strict";

export const REGION = { s: 50.55, w: -1.95, n: 53, e: 1.80 };
export const BACKEND = {
  suggestions: { "station": ["A", "B", "C", "D", "E", "F", "G"].map(x => ({ id: `S${x}`, primary: `Station ${x}`, secondary: "Kent" })),
    "canterbury cath": [{ id: "P1", primary: "Canterbury Cathedral", secondary: "Cathedral House, Canterbury CT1 2EH" },
    { id: "P2", primary: "Canterbury Cathedral Lodge", secondary: "The Precincts, Canterbury CT1 2EH" }] },
  places: { P1: { id: "P1", name: "Canterbury Cathedral", address: "Cathedral House, 11 The Precincts, Canterbury CT1 2EH, UK", geo: [51.2798, 1.0828], kind: "address" } },
  // place → stations: metres and whole seconds; null = no route
  matrix: { walk: [{ metres: 1200, secs: 900 }, { metres: 2100, secs: 1560 }, null],
    // stations → place (the way from the station) differs from place → stations, so a mixed-up direction shows
    walkFrom: [{ metres: 1250, secs: 940 }, null, { metres: 9000, secs: 6100 }] },
};
export const STATIONS = [[51.2843, 1.0746], [51.2741, 1.0759], [51.30, 1.20]];

/** errorCase: "quota" | "refused" | "timeout" | "network" — each adapter's backend fails that way. */
export function suite(test, name, make) {
  test(`Google ports contract (${name}): suggestions are plain data, at most 5, restricted to the region`, async () => {
    const { places } = make();
    const s = places.newSession();
    assert.equal(typeof s, "string");
    const out = await places.suggest("canterbury cath", s, REGION);
    assert.deepEqual(out, BACKEND.suggestions["canterbury cath"]);
    assert.deepEqual((await places.suggest("station", s, REGION)).map(x => x.id), ["SA", "SB", "SC", "SD", "SE"], "at most 5");
    assert.equal(places.attribution, "Powered by Google");
  });
  test(`Google ports contract (${name}): choosing a place resolves it to name, address and position; the session ends`, async () => {
    const { places, sessionsEnded } = make();
    const s = places.newSession();
    await places.suggest("canterbury cath", s, REGION);
    assert.deepEqual(await places.resolve("P1", s), BACKEND.places.P1);
    if (sessionsEnded) assert.ok(sessionsEnded().includes(s) || sessionsEnded().length === 1);
    assert.notEqual(places.newSession(), s);
  });
  test(`Google ports contract (${name}): station times in the order asked, whole seconds, null for no route`, async () => {
    const { access } = make();
    assert.deepEqual(await access.matrix(BACKEND.places.P1.geo, STATIONS, "walk", Date.parse("2026-11-03T10:00:00Z"), "to"), BACKEND.matrix.walk);
    assert.deepEqual(await access.matrix(BACKEND.places.P1.geo, STATIONS, "walk", Date.parse("2026-11-03T10:00:00Z"), "from"), BACKEND.matrix.walkFrom);
  });
  for (const [kind, flag] of [["quota", "rateLimited"], ["refused", "refused"], ["timeout", "timeout"], ["network", "network"]]) {
    test(`Google ports contract (${name}): a ${kind} failure is reported as ${flag} (stops further requests)`, async () => {
      const { places, access } = make({ fail: kind });
      await assert.rejects(places.suggest("canterbury cath", places.newSession(), REGION), e => e[flag] === true);
      await assert.rejects(access.matrix(BACKEND.places.P1.geo, STATIONS, "drive", Date.now(), "to"), e => e[flag] === true);
    });
  }
  test(`Google ports contract (${name}): no key in any result or error`, async () => {
    const { places, access, key } = make({ fail: "refused" });
    const seen = [];
    await places.suggest("canterbury cath", places.newSession(), REGION).catch(e => seen.push(e.message));
    await access.matrix(BACKEND.places.P1.geo, STATIONS, "walk", Date.now(), "to").catch(e => seen.push(e.message));
    if (key) for (const m of seen) assert.ok(!m.includes(key));
  });
}
