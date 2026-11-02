import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,sleep} from './harness.mjs';
import {TRIP_SETTINGS,tripRouteWithNextBest,planBrightonCanterbury,until} from './trip-fixtures.mjs';
after(closeAll);
const NOW=Date.parse('2026-11-03T10:00:00Z');
const visible=(a,node)=>{for(let p=node;p;p=p.parentElement)if(p.hidden||a.w.getComputedStyle(p).display==='none')return false;return !!node;};

test('approved journey UI: compact controls keep original identities and destination beside view choices in Commute and Trip',async()=>{
 const a=await createApp({now:NOW,settings:TRIP_SETTINGS,route:tripRouteWithNextBest});
 const settings=a.d.querySelector('#settingsBtn'),refresh=a.d.querySelector('#refreshBtn'),commute=a.d.querySelector('[data-mode="commute"]');
 assert.equal(a.d.querySelector('header').hidden,true);
 assert.equal(settings.getAttribute('aria-label'),'Settings');assert.equal(refresh.getAttribute('aria-label'),'Refresh');
 assert.match(a.text('#signalContextSummary'),/To office/);
 await planBrightonCanterbury(a);
 for(const node of [settings,refresh,commute])assert.ok(visible(a,node),'original mode and utility actions are reachable in Trip');
 assert.match(a.text('#signalContextSummary'),/Brighton Station → Canterbury Cathedral/);
 assert.match(a.text('#signalContextSummary'),/Walk to · Walk from/);
 assert.equal(a.d.querySelectorAll('#settingsBtn').length,1);assert.equal(a.d.querySelector('#settingsBtn'),settings);
 settings.click();assert.equal(a.d.querySelector('#settings').open,true);a.d.querySelector('#settings').close();
 commute.click();await sleep(100);assert.equal(a.d.querySelector('#refreshBtn'),refresh);
 assert.deepEqual(a.errors,[]);a.close();
});

test('approved journey UI: both complete recommendations place the total immediately beneath their own arrow before countdown',async()=>{
 const a=await createApp({now:NOW,settings:TRIP_SETTINGS,route:tripRouteWithNextBest});await planBrightonCanterbury(a);
 const cards=[...a.d.querySelectorAll('.trip-recommendations>.journey-option')];assert.equal(cards.length,2);
 for(const card of cards){
  const heading=card.querySelector('.journey-heading'),clocks=heading.querySelector('.journey-times'),total=heading.querySelector('.journey-total-time');
  assert.equal(clocks.nextElementSibling,total);assert.equal(total.nextElementSibling.className,'journey-countdown');
  assert.equal(card.querySelectorAll('[data-fact="total-duration"]').length,1);
  for(const connection of card.querySelectorAll('.journey-connection')){
   assert.equal(connection.querySelectorAll('[data-connection-time]').length,3);
   assert.match(connection.querySelector('.connection-arrival>small').textContent,/^At /);
  }
 }
 assert.deepEqual(a.errors,[]);a.close();
});

test('approved journey UI: Trip Live loads current departures while preserving the future planning question for return',async()=>{
 const a=await createApp({now:NOW,settings:TRIP_SETTINGS,route:tripRouteWithNextBest});await planBrightonCanterbury(a);
 a.d.querySelector('[data-trip-q="by"]').click();
 const input=a.d.querySelector('#tripWhen');input.value='2026-11-03T13:30';input.dispatchEvent(new a.w.Event('change',{bubbles:true}));input.blur();
 await until(()=>/To arrive by 13:30/.test(a.text('#tripResults')));
 const question=JSON.stringify(a.c.state.saved.tripMode.question);
 a.d.querySelector('[data-journey-view="live"]').click();
 await until(()=>a.d.querySelector('.trip-live-row'));
 assert.match(a.text('#tripResults'),/Live · loaded first connections/);assert.doesNotMatch(a.text('#tripResults'),/To arrive by/);
 assert.equal(a.d.querySelector('[data-journey-view="live"]').getAttribute('aria-pressed'),'true');
 assert.equal(JSON.stringify(a.c.state.saved.tripMode.question),question);
 a.d.querySelector('[data-journey-view="plan"]').click();
 await until(()=>/To arrive by 13:30/.test(a.text('#tripResults')));
 assert.equal(JSON.stringify(a.c.state.saved.tripMode.question),question);
 assert.equal(input.value,'2026-11-03T13:30');assert.deepEqual(a.errors,[]);a.close();
});

test('approved journey UI: active Trip stays available while an independent plan loads or fails',async()=>{
 let fail=false;
 const a=await createApp({now:NOW,settings:TRIP_SETTINGS,route:u=>{
  if(fail&&/JourneyResults/.test(u))throw new Error('Planner unavailable for this question');
  return tripRouteWithNextBest(u);
 }});await planBrightonCanterbury(a);
 a.d.activeElement?.blur();a.d.querySelector('.trip-recommendations .signal-alternative [data-trip-follow]').click();
 await until(()=>a.d.querySelector('.trip-follow-card'));
 const id=a.c.state.saved.tripMode.follow.id,arrival=a.c.state.saved.tripMode.follow.plannedArrival;
 a.d.querySelector('[data-journey-view="plan"]').click();fail=true;
 a.d.querySelector('[data-trip-q="at"]').click();
 const input=a.d.querySelector('#tripWhen');input.value='2026-11-04T14:30';input.dispatchEvent(new a.w.Event('change',{bubbles:true}));input.blur();
 assert.ok(visible(a,a.d.querySelector('.trip-tracking')),'active route stays available immediately during loading');
 await sleep(700);
 assert.ok(visible(a,a.d.querySelector('.trip-tracking')),'the failed independent query does not hide the chosen route');
 assert.equal(a.c.state.saved.tripMode.follow.id,id);assert.equal(a.c.state.saved.tripMode.follow.plannedArrival,arrival);
 a.d.querySelector('[data-trip-view="live"]').click();assert.ok(visible(a,a.d.querySelector('.trip-follow-card')));
 assert.equal(a.c.state.saved.tripMode.follow.id,id);assert.deepEqual(a.errors,[]);a.close();
});

test('approved journey UI: an expired unselected Trip Live pin restores its preserved planning question and matching result',async()=>{
 const a=await createApp({now:NOW,settings:TRIP_SETTINGS,route:tripRouteWithNextBest});await planBrightonCanterbury(a);
 a.d.querySelector('[data-trip-q="by"]').click();
 const input=a.d.querySelector('#tripWhen');input.value='2026-11-03T13:30';input.dispatchEvent(new a.w.Event('change',{bubbles:true}));input.blur();
 await until(()=>/To arrive by 13:30/.test(a.text('#tripResults')));
 a.d.querySelector('[data-journey-view="live"]').click();await until(()=>a.d.querySelector('.trip-live-row'));
 a.setNow(NOW+20*60000);a.c.render();
 await until(()=>/To arrive by 13:30/.test(a.text('#tripResults')));
 assert.equal(a.c.state.saved.tripMode.viewOverride,null);assert.equal(a.d.querySelector('#tripResults').dataset.view,'plan-trip-by');
 assert.match(a.text('#tripResults'),/To arrive by 13:30/);assert.equal(a.d.querySelector('[data-journey-view="auto"]').getAttribute('aria-pressed'),'true');
 assert.equal(input.value,'2026-11-03T13:30');assert.deepEqual(a.errors,[]);a.close();
});
