// Where your tube is going (Sam, 19 Nov: "Can we be clear here what the destination of the train is. This helps
// confirm which one you're on / getting on"). docs/stories/follow-a-route.md, "The tube's destination".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { core } from './helpers.mjs';

test("Tube destination: its own when TfL gave one; else the same vehicle on the same line in another TfL list; never a placeholder", () => {
  assert.equal(core.tubeDestination({ dest: 'Uxbridge Underground Station', vehicle: '12' }, []), 'Uxbridge');
  assert.equal(core.tubeDestination({ dest: 'Edgware Road (Circle Line)', vehicle: '' }, []), 'Edgware Road');
  const kgx = [{ vehicle: '7', lineId: 'circle', dest: 'Edgware Road (Circle Line) Underground Station' }, { vehicle: '12', lineId: 'metropolitan', dest: 'Amersham Underground Station' }];
  assert.equal(core.tubeDestination({ dest: 'Check Front of Train', vehicle: '12', lineId: 'metropolitan' }, [null, kgx]), 'Amersham');
  assert.equal(core.tubeDestination({ dest: '', vehicle: '12', lineId: 'circle' }, [kgx]), '', 'the same number on another line is another train');
  assert.equal(core.tubeDestination({ dest: '', vehicle: '99' }, [kgx]), '', 'nobody says: empty');
  assert.equal(core.tubeDestination({ dest: '', vehicle: '12' }, [[{ vehicle: '12', dest: 'Check front of train' }], kgx]), 'Amersham', 'placeholders are skipped');
  assert.equal(core.tubeDestination({ dest: 'Aldgate', vehicle: '12', lineId: 'metropolitan' }, [kgx], /^aldgate\b/i), 'Amersham', 'going home, Aldgate is where you got on, not where it goes');
  assert.equal(core.tubeDestination(null, [kgx]), '');
});
