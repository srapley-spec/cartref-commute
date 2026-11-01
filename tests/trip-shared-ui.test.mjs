import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,sleep} from './harness.mjs';
import {TRIP_SETTINGS,tripRoute,tripRouteWithNextBest,planBrightonCanterbury,until} from './trip-fixtures.mjs';
after(closeAll);
const NOW=Date.parse('2026-11-03T10:00:00Z');

test('Trip cards: one complete recommendation and compact rows retain every connection, canonical facts and shared actions',async()=>{
 const a=await createApp({now:NOW,settings:TRIP_SETTINGS,route:tripRoute});
 await planBrightonCanterbury(a);
 const hero=a.d.querySelector('.trip-recommendations'),pick=hero.querySelector('.journey-option');
 assert.equal(hero.querySelectorAll('.journey-heading').length,1,'the planning headline is not repeated above the card');
 assert.equal(a.d.querySelector('#tripResults>.trip-headline'),null);
 const all=[pick,...a.d.querySelectorAll('.trip-list>.journey-row')];
 assert.equal(all.length,4,'all three recorded journeys survive alongside the recommendation');
 for(const row of all){
  assert.equal(row.querySelectorAll('.journey-heading').length,1);
  assert.equal(row.querySelectorAll('.journey-facts').length,1);
  assert.equal(row.querySelectorAll('[data-fact="total-duration"]').length,1);
  assert.ok(row.querySelector('[data-fact="train-duration"]'));
  assert.match(row.querySelector('.journey-times>div:last-child small').textContent,/At Canterbury Cathedral/);
  assert.equal(row.querySelector('.steps').open,false);
  assert.ok(row.querySelector('.steps>.legs>.t+.d'),'Trip uses the same time/description steps as Auto/Plan');
  assert.equal(row.querySelector('[data-trip-follow]').dataset.tripFollow,row.dataset.tripId);
  assert.equal(row.querySelector('.trip-meta'),null,'duration and operator are not duplicated in a separate summary');
 }
 assert.equal(pick.querySelector('[data-fact="train-duration"]').dataset.ms,String(127*60000));
 assert.equal(pick.querySelector('[data-fact="total-duration"]').textContent,'2h 48m');
 assert.deepEqual([...pick.querySelectorAll('[data-connection-time="scheduled"]')].map(e=>e.textContent),['10:06','10:27','10:54','12:20']);
 const third=a.d.querySelectorAll('.trip-list>.journey-row')[1];
 assert.equal(third.querySelector('[data-fact="train-duration"]').textContent,'2h 22m','each itinerary owns its duration');
 assert.deepEqual(a.errors,[]);a.close();
});

test('Trip cards: Journey steps keep their own disclosure state through refresh and Follow uses the selected itinerary',async()=>{
 const a=await createApp({now:NOW,settings:TRIP_SETTINGS,route:tripRoute});
 await planBrightonCanterbury(a);
 const row=a.d.querySelectorAll('.trip-list>.journey-row')[1],id=row.dataset.tripId;
 row.querySelector('.steps').open=true;
 a.d.querySelector('#refreshBtn').click();await sleep(700);
 const refreshed=[...a.d.querySelectorAll('.trip-list>.journey-row')].find(e=>e.dataset.tripId===id);
 assert.equal(refreshed.querySelector('.steps').open,true);
 assert.equal(a.d.querySelector('.trip-recommendations .steps').open,false,'opening a list itinerary does not open a different card');
 refreshed.querySelector('[data-trip-follow]').click();await until(()=>a.d.querySelector('[data-trip-stop]'));
 assert.equal(a.c.state.saved.tripMode.follow.id,id);
 const follow=a.d.querySelector('.trip-follow-card');assert.ok(follow);
 assert.equal(follow.querySelectorAll('.journey-heading').length,1);
 assert.equal(follow.querySelectorAll('.journey-facts').length,1);
 assert.equal(follow.querySelector('.steps>summary').textContent,'Your trip');
 assert.deepEqual([...follow.querySelectorAll('.trip-follow-connections [data-connection-time="scheduled"]')].map(e=>e.textContent),['10:28','12:04','12:57'],'the selected itinerary retains all three trains in order');
 a.d.querySelector('[data-trip-stop]').click();
 assert.equal(a.c.state.saved.tripMode.follow,null);
 assert.ok(a.d.querySelector('.trip-recommendations'));
 assert.deepEqual(a.errors,[]);a.close();
});

test('Trip cards: Next best has the same complete headline, facts, connections and actions in all planning questions',async()=>{
 const a=await createApp({now:NOW,settings:TRIP_SETTINGS,route:tripRouteWithNextBest});
 await planBrightonCanterbury(a);
 for(const [kind,time] of [['now',null],['by','2026-11-03T13:10'],['at','2026-11-03T10:00']]){
  if(kind!=='now'){
   a.d.querySelector(`[data-trip-q="${kind}"]`).click();
   const input=a.d.querySelector('#tripWhen');input.value=time;input.dispatchEvent(new a.w.Event('change',{bubbles:true}));
   await until(()=>a.d.querySelectorAll('.trip-recommendations>.journey-option').length===2);
  }
  const picks=[...a.d.querySelectorAll('.trip-recommendations>.journey-option')];assert.equal(picks.length,2,kind);
  assert.equal(picks[1].querySelector('.signal-alt-label').textContent,'Next best');
  assert.notEqual(picks[0].dataset.tripId,picks[1].dataset.tripId);
  for(const row of picks){
   assert.ok(row.querySelector('[data-fact="leave-by"] [data-cd]'));
   assert.ok(row.querySelector('[data-fact="total-duration"][data-ms]'));
   assert.ok(row.querySelector('[data-fact="train-duration"][data-ms]'));
   assert.equal(row.querySelectorAll('.journey-connection').length,4);
   assert.equal(row.querySelector('.steps').open,false);
   assert.equal(row.querySelector('[data-trip-follow]').dataset.tripFollow,row.dataset.tripId);
  }
 }
 assert.deepEqual(a.errors,[]);a.close();
});

test('Trip context: the selected places replace commute copy only while Trip is active',async()=>{
 const a=await createApp({now:NOW,settings:TRIP_SETTINGS,route:tripRoute});
 const route=a.text('#routeLabel'),context=a.text('#signalContextSummary');
 await planBrightonCanterbury(a);
 assert.equal(a.text('#routeLabel'),'Brighton Station → Canterbury Cathedral');
 assert.equal(a.text('#signalContextSummary'),'Trip · Journey options');
 assert.ok(a.d.querySelector('#signalAdjustments #tripForm'),'Trip uses the existing Journey options component');
 assert.equal(a.d.querySelectorAll('#tripInput-from').length,1,'the original controls are moved, not cloned');
 assert.ok(!a.d.querySelector('[aria-label="Trip question"]').closest('details'),'the planning question stays exposed');
 a.d.querySelector('[data-mode="commute"]').click();
 await sleep(400); // Let the existing mode-switch refresh settle before closing jsdom.
 assert.equal(a.text('#routeLabel'),route);
 assert.equal(a.text('#signalContextSummary'),context);
 assert.equal(a.d.querySelector('#signalAdjustments #tripForm'),null,'Trip controls cannot leak into the commute');
 assert.deepEqual(a.errors,[]);a.close();
});
