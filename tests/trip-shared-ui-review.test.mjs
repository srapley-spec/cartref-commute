// Independent review: the shared journey facts survive the whole selected trip,
// while the engine's arrival/next-action priority replaces the origin deadline.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp,closeAll,sleep,json} from './harness.mjs';
import {TRIP_SETTINGS,tripRoute,tripRouteWithNextBest,planBrightonCanterbury,until} from './trip-fixtures.mjs';
after(closeAll);

const MIN=60000,NOW=Date.parse('2026-11-03T10:00:00Z');
const on=(a,mode)=>a.d.querySelector(`[data-journey-view="${mode}"]`).click();
async function followFirst(a){
 a.d.activeElement?.blur();a.d.querySelector('.trip-recommendations [data-trip-follow]').click();
 await until(()=>a.d.querySelector('[data-trip-stop]'));
 assert.ok(a.d.querySelector('.trip-follow-card'),'the selected route is foregrounded');
}
function exposed(a,node){
 assert.ok(node);
 for(let n=node;n;n=n.parentElement){
  assert.ok(!n.hidden&&a.w.getComputedStyle(n).display!=='none','facts are exposed');
  assert.ok(n.tagName!=='DETAILS'||n.open,'facts cannot require opening steps');
 }
}

test('Trip shared UI review: Follow retains rail duration and updates journey remaining through every phase',async()=>{
 const a=await createApp({now:Date.parse('2026-11-03T10:00:00Z'),settings:TRIP_SETTINGS,route:tripRoute});
 await planBrightonCanterbury(a);
 await followFirst(a);
 const original=a.c.state.saved.tripMode.follow,id=original.id;
 const total=original.journey.arrive-original.journey.leave;
 assert.equal(Number(a.d.querySelector('.trip-follow-card [data-fact="remaining-duration"]').dataset.ms),original.expectedArrival-NOW,'selected before leaving includes the wait before set-off');
 assert.notEqual(original.expectedArrival-NOW,total,'the fixture distinguishes remaining time from the original total');
 for(const [time,view] of [['10:00','trip-follow'],['10:03','trip-access'],['10:07','trip-ride'],['10:25','trip-change'],['12:40','trip-final']]){
  const now=Date.parse(`2026-11-03T${time}:00Z`);a.setNow(now);
  a.d.querySelector('#refreshBtn').click();await sleep(350);
  assert.equal(a.d.querySelector('#tripResults').dataset.view,view);
  const card=a.d.querySelector('.trip-follow-card');assert.ok(card);
  assert.equal(card.querySelectorAll('.journey-facts').length,1,view+': same journey facts stay exposed');
  assert.equal(card.querySelector('[data-fact="total-duration"]'),null,'active cards must not substitute the historical total');
  assert.equal(Number(card.querySelector('[data-fact="remaining-duration"]').dataset.ms),original.expectedArrival-now,view+': remaining time ends at the final destination, including changes and access');
  assert.equal(Number(card.querySelector('[data-fact="train-duration"]').dataset.ms),127*60000,view+': preserve the complete canonical rail duration');
  for(const fact of card.querySelectorAll('.journey-facts,.journey-total-time,.journey-train-time'))exposed(a,fact);
  const heading=card.querySelector('.trip-headline>.journey-heading');exposed(a,heading);
  assert.equal(heading.querySelector('.journey-times>div:last-child .optbig').textContent,'12:50','the whole-journey headline remains the final destination');
  const pill=heading.querySelector(':scope>.journey-total-time');exposed(a,pill);
  assert.ok(pill.previousElementSibling.matches('.journey-times'),'duration sits directly below the time row');
  if(!['trip-follow','trip-access'].includes(view))assert.equal(heading.hasAttribute('data-fact'),false,'a ride/change/final headline does not restart the origin leave deadline');
  for(const panel of card.querySelectorAll('.trip-follow-connections .journey-connection')){
   assert.equal(panel.querySelectorAll('[data-connection-time]').length,3,'every remaining ride has all three timing slots');
   assert.match(panel.querySelector('.connection-arrival').textContent,/At /);
  }
  assert.equal(a.c.state.saved.tripMode.follow.id,id,'phase changes preserve the selected itinerary');
  assert.ok(card.querySelector('[data-trip-stop]'));
 }
 assert.equal(a.d.querySelector('.trip-follow-connections'),null,'the final walk does not advertise completed trains');
 assert.deepEqual(a.errors,[]);a.close();
});

test('Trip shared UI review: manual planning retains the chosen service, original arrival and active cancellation alert',async()=>{
 const a=await createApp({now:NOW,settings:TRIP_SETTINGS,route:tripRouteWithNextBest});await planBrightonCanterbury(a);await followFirst(a);
 const selected=JSON.parse(JSON.stringify(a.c.state.saved.tripMode.follow));
 on(a,'plan');
 assert.equal(a.d.querySelector('#tripResults').dataset.view,'plan-trip-now');
 assert.ok(a.d.querySelector('.trip-recommendations'),'planning answer stays usable');
 const tracking=a.d.querySelector('.trip-tracking');exposed(a,tracking);
 assert.equal(a.c.state.saved.tripMode.follow.id,selected.id);
 assert.equal(a.c.state.saved.tripMode.follow.plannedArrival,selected.plannedArrival);
 const future=a.c.state.saved.tripMode.follow.journey.rides.at(-1);future.cancelled=true;a.c.render();
 const alert=a.d.querySelector('.trip-tracking');exposed(a,alert);
 assert.match(alert.textContent,/cancelled/i,'active disruption is not hidden by the planning pin');
 assert.equal(alert.querySelector('[data-fact="remaining-duration"]')?.hasAttribute('data-ms'),false,'cancelled arrival cannot retain a promised remaining duration');
 assert.equal(a.c.state.saved.tripMode.follow.id,selected.id);
 alert.querySelector('[data-trip-view="live"]').click();
 assert.equal(a.c.state.saved.tripMode.follow.id,selected.id,'returning to Live keeps the same route');
 assert.match(a.text('.trip-follow-card'),/cancelled/i);
 assert.deepEqual(a.errors,[]);a.close();
});

test('Trip shared UI review: Next best selects its own itinerary and confirmation stays separate from clock progression',async()=>{
 const a=await createApp({now:NOW,settings:TRIP_SETTINGS,route:tripRouteWithNextBest});await planBrightonCanterbury(a);
 const second=a.d.querySelector('.trip-recommendations .signal-alternative'),secondId=second.dataset.tripId;
 const scheduled=[...second.querySelectorAll('[data-connection-time="scheduled"]')].map(n=>n.textContent);
 a.d.activeElement?.blur();second.querySelector('[data-trip-follow]').click();await until(()=>a.d.querySelector('[data-trip-boarded]'));
 assert.equal(a.c.state.saved.tripMode.follow.id,secondId,'Next best follows its own concrete connections');
 assert.deepEqual([...a.d.querySelectorAll('.trip-follow-connections [data-connection-time="scheduled"]')].map(n=>n.textContent),scheduled);
 const f=a.c.state.saved.tripMode.follow,ride=f.journey.rides[0];
 a.setNow(ride.dep+MIN);a.c.render();
 assert.match(a.text('.trip-confirmation'),/Expected stage|planned|inferred/i,'timetable progression alone does not claim confirmed boarding');
 assert.doesNotMatch(a.text('.trip-confirmation'),/Confirmed by you/);
 a.d.querySelector('[data-trip-boarded="0"]').click();
 assert.equal(a.c.state.saved.tripMode.follow.activeRide,0);
 assert.match(a.text('.trip-confirmation'),/Confirmed by you/);
 a.setNow(ride.arr+MIN);a.c.render();
 assert.equal(a.d.querySelector('#tripResults').dataset.view,'trip-ride','a confirmed ride is retained until explicit alighting/correction');
 a.d.querySelector('[data-trip-alighted]').click();
 assert.equal(a.c.state.saved.tripMode.follow.activeRide,null);
 assert.equal(a.c.state.saved.tripMode.follow.alightedRide,0);
 assert.equal(a.d.querySelector('#tripResults').dataset.view,'trip-change');
 const last=a.c.state.saved.tripMode.follow.journey.rides.length-1;
 a.d.querySelector(`[data-trip-boarded="${last}"]`).click();a.d.querySelector('[data-trip-alighted]').click();
 assert.equal(a.d.querySelector('#tripResults').dataset.view,'trip-final');
 assert.equal(a.c.state.saved.tripMode.follow.arrivedAt,undefined,'alighting is not final destination arrival');
 a.d.querySelector('[data-trip-arrived]').click();
 assert.ok(Number.isFinite(a.c.state.saved.tripMode.follow.arrivedAt));
 assert.match(a.text('.trip-follow-card'),/arrival confirmed by you/i);
 assert.deepEqual(a.errors,[]);a.close();
});

test('Trip shared UI review: an unreachable selected-access departure stays listed with no enabled Follow or arrival-first claim',async()=>{
 const a=await createApp({now:NOW,settings:TRIP_SETTINGS,route:tripRouteWithNextBest});await planBrightonCanterbury(a);
 a.d.activeElement?.blur();a.setNow(NOW+4*MIN);on(a,'live');
 const row=[...a.d.querySelectorAll('.trip-live-row')].find(n=>n.querySelector('[data-connection-time="scheduled"]')?.textContent==='10:06');
 exposed(a,row);assert.match(row.textContent,/can.t make|not reachable|leave time passed/i);
 assert.doesNotMatch(row.textContent,/Arrives first/,'an outdated walking winner is not current reachability evidence');
 assert.equal(row.querySelector('[data-trip-follow]')?.disabled,true,'the first train is still future, but its required access deadline has passed');
 row.querySelector('[data-trip-follow]')?.click();assert.equal(a.c.state.saved.tripMode.follow,null);
 assert.deepEqual(a.errors,[]);a.close();
});

test('Trip shared UI review: explicit recovery preserves the completed train and original destination promise with a reason',async()=>{
 // Synthetic recovery built from the recorded remaining rail legs: Lewes onward,
 // shifted twenty minutes. It is not an additional production provider/request.
 const body=JSON.parse(readFileSync(new URL('./fixtures/trip/tfl-brighton-canterburywest.json',import.meta.url),'utf8')).body;
 const replacement=JSON.parse(JSON.stringify({...body,journeys:[{...body.journeys[0],legs:body.journeys[0].legs.slice(1)}]}),(_key,value)=>
  typeof value==='string'&&/^2026-11-03T\d\d:\d\d:\d\d$/.test(value)?new Date(Date.parse(value)+20*MIN).toISOString().slice(0,19):value);
 const route=url=>/JourneyResults\/(?:1001661|910GLEWES)\/to\/1001160/.test(url)?json(replacement):tripRouteWithNextBest(url);
 const a=await createApp({now:NOW,settings:TRIP_SETTINGS,route});await planBrightonCanterbury(a);await followFirst(a);
 a.d.querySelector('[data-trip-boarded="0"]').click();a.setNow(NOW+15*MIN);
 a.c.state.saved.tripMode.follow.journey.rides[0].arr=NOW+35*MIN;a.c.render();
 const original=JSON.parse(JSON.stringify(a.c.state.saved.tripMode.follow));
 assert.match(a.text('.trip-follow-card'),/Connection missed/);
 assert.equal(a.d.querySelector('.trip-headline>.journey-heading [data-fact="remaining-duration"]')?.hasAttribute('data-ms'),false);
 assert.doesNotMatch(a.text('.follow-alternative'),/Next:\s*10:28 Thameslink from Brighton/,'someone confirmed aboard the incoming train cannot recover by a future train from the old origin');
 assert.match(a.d.querySelector('[data-trip-replan]').textContent,/Lewes/);
 a.d.querySelector('[data-trip-replan]').click();
 await until(()=>a.d.querySelector('.trip-recommendations [data-trip-follow]'));
 assert.equal(a.c.state.saved.tripMode.follow.id,original.id,'planning a recovery does not silently replace the selected route');
 assert.equal(a.c.state.saved.tripMode.notBefore,NOW+35*MIN,'recovery cannot leave before the incoming train can reach Lewes');
 a.d.activeElement?.blur();a.d.querySelector('.trip-recommendations [data-trip-follow]').click();
 await until(()=>a.d.querySelector('.trip-follow-card'));
 const recovered=a.c.state.saved.tripMode.follow;
 assert.notEqual(recovered.id,original.id,'explicit choice takes the replacement connection');
 assert.equal(recovered.plannedArrival,original.plannedArrival,'the original destination arrival remains the reference after recovery');
 assert.ok(recovered.expectedArrival>original.plannedArrival);
 assert.match(a.text('.trip-follow-card'),/Original plan: arrive 12:50/);
 assert.match(a.text('.trip-follow-card'),/chose.*route|connection|missed|replacement|recovery|instead/i,'the new expected arrival has an explicit change reason');
 assert.match(a.text('.trip-follow-card .trip-steps'),/10:06.*Brighton/,'completed/incoming history remains available after selecting the way on');
 a.setNow(NOW+35*MIN);a.d.querySelector('[data-trip-alighted]').click();
 assert.equal(a.d.querySelector('.trip-headline>.journey-heading .journey-times>div:first-child .optbig').textContent,'10:47','next departure identifies the train rather than the transfer start');
 assert.match(a.text('.trip-confirmation>p'),/10:47.*Southern/,'walking to the platform is not a service the person can confirm boarding');
 a.d.querySelector('details[data-key^="trip-correction"]>summary').click();a.d.querySelector('[data-trip-boarded="0"]').click();
 // The recovery form required three fixed minutes from station arrival to its
 // 10:47 departure. Composition must retain that allowance for later updates.
 a.c.state.saved.tripMode.follow.journey.rides[0].arr=NOW+46*MIN;a.c.render();
 assert.match(a.text('.trip-follow-card'),/Connection missed|cannot be made/i,'a one-minute gap cannot satisfy the recovery’s fixed three-minute boarding access');
 assert.equal(a.d.querySelector('.trip-headline>.journey-heading [data-fact="remaining-duration"]')?.hasAttribute('data-ms'),false,'a newly impossible recovery withdraws the final promise');
 assert.deepEqual(a.errors,[]);a.close();
});
