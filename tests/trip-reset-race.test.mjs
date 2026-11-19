// Trip reset race (docs/reviews/ios-native-2026-11-18.md, follow-up closed 19 Nov; docs/stories/leisure-journeys.md,
// "Trip on the journey card"). A board request started before reset() must not touch anything after it: not the board
// ages that set the iPhone's "as of" time, and not the boards a newer request has loaded. Response order is controlled
// explicitly: request, reset, newer request, then the old response.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { core, fixture, at } from './core/helpers.mjs';
const { createTripUi } = createRequire(import.meta.url)('../src/trip-ui.js');
const cfg = core.tripConfig(), start = at('2026-11-03', '09:40');
const index = core.stationIndex(JSON.parse(readFileSync(new URL('../data/stations.json', import.meta.url))).stations);
const raw = core.tflRailJourneys(fixture('trip/tfl-brighton-canterburywest.json').body, index.byCrs('BTN'), index.byCrs('CBW'), index, cfg.endMatchM).journeys[0];
const journey = core.buildJourney(raw, null, null, { from: 'walk', to: 'walk' }, [], [], cfg, start);

function setup() {
  let clock = start, state = { active: true, follow: core.startFollowTrip(journey, start) };
  const pending = [];
  const ui = createTripUi({ root: {}, C: core, S: () => ({}), now: () => clock, store: { get: () => state, set: (v) => { state = v; } },
    fetchBoard: (from, to) => new Promise((resolve, reject) => pending.push({ key: `${from}-${to}`, resolve, reject })) });
  return { ui, pending, setNow: (v) => { clock = v; } };
}
const board = () => ({ services: [], msgs: [] });
const flushed = () => new Promise(setImmediate);

test('Trip reset race: a response that arrives after reset (late success) changes nothing, and never overwrites a newer request', async () => {
  const { ui, pending, setNow } = setup();
  const old = ui.refresh();                       // the old request: two boards outstanding
  assert.equal(pending.length, 2);
  ui.reset();                                     // reset while it is outstanding
  setNow(start + 31_000);
  const newer = ui.refresh();                     // the newer request
  assert.equal(pending.length, 4);
  setNow(start + 40_000); pending[2].resolve(board()); pending[3].resolve(board()); await newer;
  assert.equal(ui.followedDataAt(), start + 40_000, 'the newer request sets the age');
  setNow(start + 50_000); pending[0].resolve(board()); pending[1].resolve(board()); await old; await flushed();
  assert.equal(ui.followedDataAt(), start + 40_000, 'the old response does not move the age on');
  // And with no newer request: the old response can't restore what reset cleared.
  const b = setup();
  const older = b.ui.refresh(); b.ui.reset();
  b.setNow(start + 10_000); b.pending[0].resolve(board()); b.pending[1].resolve(board()); await older; await flushed();
  assert.equal(b.ui.followedDataAt(), null, 'reset stays reset');
  assert.deepEqual(b.ui.state().boards, [], 'no board from before the reset');
  // After a reset the next refresh loads again at once (it doesn't wait out the old 30 s spacing).
  const c = setup(); const first = c.ui.refresh(); c.pending[0].resolve(board()); c.pending[1].resolve(board()); await first;
  c.ui.reset(); c.setNow(start + 5_000); c.ui.refresh();
  assert.equal(c.pending.length, 4, 'fetched again straight after reset');
});

test('Trip reset race: an old request failing after reset (late failure) does not clear the boards a newer request loaded', async () => {
  const { ui, pending, setNow } = setup();
  const old = ui.refresh(); ui.reset();
  setNow(start + 31_000); const newer = ui.refresh();
  setNow(start + 40_000); pending[2].resolve(board()); pending[3].resolve(board()); await newer;
  const loaded = ui.state().boards;
  assert.equal(loaded.length, 2, '(the newer boards are loaded)');
  pending[0].reject(new Error('timeout')); pending[1].reject(new Error('timeout')); await old; await flushed();
  assert.deepEqual(ui.state().boards, loaded, 'the newer boards stay');
  assert.equal(ui.followedDataAt(), start + 40_000);
});

test('Trip without reset: ordinary successes and failures still work as before', async () => {
  const { ui, pending, setNow } = setup();
  const first = ui.refresh();
  setNow(start + 10_000); pending[0].resolve(board()); pending[1].reject(new Error('down')); await first;
  assert.deepEqual(ui.state().boards, [pending[0].key], 'the board that loaded is kept; the failed one is not');
  assert.equal(ui.followedDataAt(), null, 'one watched board never loaded: unknown');
  setNow(start + 45_000); const second = ui.refresh();
  setNow(start + 50_000); pending[2].resolve(board()); pending[3].resolve(board()); await second;
  assert.equal(ui.followedDataAt(), start + 50_000);
});
