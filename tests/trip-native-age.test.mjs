// Trip source age uses the actual engine budget and the UI's real fetch lifecycle, without mounting a page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { core, fixture, at } from './core/helpers.mjs';
const { createTripUi } = createRequire(import.meta.url)('../src/trip-ui.js');
const cfg = core.tripConfig(), start = at('2026-11-03', '09:40');
const index = core.stationIndex(JSON.parse(readFileSync(new URL('../data/stations.json', import.meta.url))).stations);
const raw = core.tflRailJourneys(fixture('trip/tfl-brighton-canterburywest.json').body,
  index.byCrs('BTN'), index.byCrs('CBW'), index, cfg.endMatchM).journeys[0];
const journey = core.buildJourney(raw, null, null, { from: 'walk', to: 'walk' }, [], [], cfg, start);

function setup() {
  let clock = start, state = { active: true, follow: core.startFollowTrip(journey, start) };
  const pending = [], requests = [];
  const ui = createTripUi({ root: {}, C: core, S: () => ({}), now: () => clock,
    store: { get: () => state, set: value => { state = value; } },
    fetchBoard: (from, to) => {
      requests.push(`${from}-${to}`);
      return new Promise((resolve, reject) => pending.push({ key: `${from}-${to}`, resolve, reject }));
    } });
  return { ui, pending, requests, setNow: value => { clock = value; } };
}
const flushed = () => new Promise(setImmediate);
const emptyBoard = () => ({ services: [], msgs: [] });

test('Trip native age is the oldest distinct watched-board success, retained after failure and cleared on reset', async () => {
  const { ui, pending, requests, setNow } = setup();
  const initial = ui.refresh();
  assert.deepEqual(requests, ['BTN-LWS', 'LWS-HMD'], 'Use two actual engine-selected boards.');
  setNow(start + 10_000); pending[0].resolve(emptyBoard()); await flushed();
  setNow(start + 20_000); pending[1].resolve(emptyBoard()); await initial;
  assert.equal(ui.followedDataAt(), start + 10_000);
  setNow(start + 25_000); await ui.refresh();
  assert.equal(requests.length, 2, 'A no-fetch refresh cannot make the source newer.');
  assert.equal(ui.followedDataAt(), start + 10_000);
  setNow(start + 60_000); const later = ui.refresh();
  pending[2].reject(new Error('older board unavailable'));
  setNow(start + 70_000); pending[3].resolve(emptyBoard()); await later;
  assert.equal(ui.followedDataAt(), start + 10_000, 'A failed older board cannot borrow the other board\'s new age.');
  ui.reset();
  assert.equal(ui.followedDataAt(), null);
});

test('Trip native age stays unknown while one currently watched board has never succeeded', async () => {
  const { ui, pending, requests, setNow } = setup();
  const initial = ui.refresh();
  assert.deepEqual(requests, ['BTN-LWS', 'LWS-HMD']);
  setNow(start + 10_000); pending[0].resolve(emptyBoard()); await flushed();
  pending[1].reject(new Error('second board unavailable')); await initial;
  assert.equal(ui.followedDataAt(), null, 'One known source cannot cover a missing required source.');
});
