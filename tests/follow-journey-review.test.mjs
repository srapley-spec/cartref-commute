// Independent regression probes from the whole-journey review, using the real built page.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp, closeAll, IN_LONDON } from './harness.mjs';
after(closeAll);
const MIN=60000;
const evening=Date.parse('2026-11-03T18:00:00Z');
const morning=Date.parse('2026-11-03T07:00:00Z');
const plain=x=>JSON.parse(JSON.stringify(x));
async function demo({now=morning,saved={dirMode:'office'},geo,...extra}={}){
 return createApp({now,saved,geo,settings:{provider:'demo',followRoute:true},...extra});
}
function follow(a,predicate=o=>o.recommended===1){
 const entry=[...a.c.followChoices].find(([,o])=>predicate(o));assert.ok(entry,'requested real journey is available');
 const b=[...a.d.querySelectorAll('[data-follow]:not([disabled])')].find(b=>b.dataset.follow===entry[0]);assert.ok(b,'requested journey is followable');b.click();
 return plain(a.c.state.saved.followRoute);
}
function train(a,r){return a.c.state.boards[`${r.option.train.from}-${r.option.train.to}`].services.find(t=>t.std===r.option.train.std&&t.operator===r.option.train.operator);}
function fresh(a,now,here){a.setNow(now);Object.assign(a.c.state,{here,lastFixAt:now,lastFixRecvAt:now,locAcc:12,locStatus:'ok',atHub:null,onLine:false,boardsAt:now});}

test('journey review: a caught Circle still reaches the followed Thameslink, rather than replanning from the office',async()=>{
 const a=await demo({now:evening,saved:{dirMode:'home'},geo:IN_LONDON});
 const r=follow(a,o=>o.hub==='ZFD'&&o.train.std==='18:34'&&o.effort==='walk');
 const now=evening+20*MIN;fresh(a,now,[51.5186,-.0886]);
 a.c.state.saved.tubeRide={hub:'ALD',from:'ALD',t:evening+18*MIN,line:'Circle',vehicle:'tube-review',picked:true,confirmed:true,rideMs:7*MIN,stop:'Farringdon',stopGeo:[51.52036,-.10514]};
 a.c.render();
 assert.match(a.text('#hero'),/Farringdon 18:25 → 18:34 Thameslink/,'existing connection engine proves the selected train remains catchable');
 assert.equal(a.c.state.followUpdate.status,'on-track');
 assert.equal(a.c.state.saved.followRoute.id,r.id);
 assert.equal(a.c.state.saved.followRoute.expectedArrival,r.expectedArrival);
 assert.doesNotMatch(a.text('#followPanel'),/no longer make|A way on/);
 assert.match(a.text('#followPanel'),/at your connection/);
 assert.deepEqual(a.errors,[]);a.close();
});

test('journey review: final-walk following cannot offer original-origin trains or revive a completed rail cancellation',async()=>{
 const a=await demo(),r=follow(a);
 const now=r.option.train.arr+5*MIN;fresh(a,now,[51.518,-.075]);
 a.c.state.saved.followRoute.phase='after-train';
 a.c.state.saved.followRoute.lastTrain.arrLate=15;
 train(a,r).cancelled=true;
 const candidate=plain(r.option);candidate.train={...candidate.train,std:'10:00',dep:now+30*MIN,arr:now+60*MIN,serviceId:'future-original-origin',cancelled:false};candidate.leave=now+10*MIN;candidate.arrive=now+90*MIN;candidate.effort='walk';candidate.missed=false;
 const result=a.w.CommuteCore.updateFollowRoute(a.c.state.saved.followRoute,{now,options:[candidate],availableOptions:[candidate],dataFresh:true,phase:'after-train',hasReliableLocation:true});
 assert.equal(result.alternative,null,'being late on the completed train cannot propose boarding another train at the old origin');
 a.c.render();
 assert.equal(a.c.state.followUpdate.alternative,null);
 assert.notEqual(a.c.state.followUpdate.status,'cancelled');
 assert.notEqual(a.c.state.saved.followRoute.expectedArrival,r.expectedArrival,'a current onward walk can revise arrival');
 assert.match(a.text('#followPanel'),/Your onward journey has changed/);
 const originalRailArrival=r.option.legs.find(l=>l.t===r.option.train.arr&&!l.train);
 assert.ok(originalRailArrival);
 const completedRail=a.w.CommuteCore.followedLegs(a.c.state.saved.followRoute).find(l=>l.d===originalRailArrival.d);
 assert.equal(completedRail.t,originalRailArrival.t,'observing the final walk cannot retime the completed rail leg');
 assert.doesNotMatch(a.text('#followPanel'),/is cancelled|Follow this instead/);
 assert.deepEqual(a.errors,[]);a.close();
});

test('journey review: a missed selected train no longer promises its old arrival',async()=>{
 const a=await demo(),r=follow(a),now=r.option.train.dep+MIN;
 fresh(a,now,[51.975,-.23]);a.c.render();
 assert.equal(a.c.state.followUpdate.status,'missed');
 assert.match(a.text('#followPanel .big'),/Arrival uncertain/);
 assert.doesNotMatch(a.text('#followPanel .big'),/Arriving/);
 assert.match(a.text('#followPanel'),/no longer make/);
 assert.equal(a.c.state.saved.followRoute.id,r.id);
 assert.deepEqual(a.errors,[]);a.close();
});

test('journey review: an onboard train recovered from twenty to two minutes late uses its arrival status',async()=>{
 const a=await demo(),r=follow(a),t=train(a,r);
 t.dep+=20*MIN;t.depLate=20;t.arr+=2*MIN;t.arrLate=2;
 const now=t.dep+MIN;fresh(a,now,[51.956,-.26]);
 // This persisted phase represents already-observed boarding, independently of a transient new fix.
 a.c.state.saved.followRoute.phase='on-train';a.c.render();
 assert.equal(a.c.state.followUpdate.trainStatus.level,'ok');
 assert.match(a.c.state.followUpdate.trainStatus.text,/2 min late/);
 assert.doesNotMatch(a.c.state.followUpdate.trainStatus.text,/20/);
 assert.match(a.text('#followPanel .pill.ok'),/2 min late/);
 assert.equal(a.c.state.saved.followRoute.expectedArrival,r.expectedArrival+2*MIN);
 assert.deepEqual(a.errors,[]);a.close();
});

test('journey review: absent live line-status evidence never becomes a good-service claim',async()=>{
 const a=await demo();
 for(const b of Object.values(a.c.state.boards))for(const t of b.services){t.cancelled=false;t.depUnknown=false;t.arrUnknown=false;t.depLate=0;t.arrLate=0;t.reason='';}
 a.c.state.railSource='darwin';a.c.state.saved.settings.provider='rdm';
 a.c.state.errors=[];a.c.state.status=[];a.c.state.nrStatus=[];a.c.render();
 assert.doesNotMatch(a.text('#signalStatus'),/Good service|all good/i);
 assert.match(a.text('#signalStatus'),/status.*unavailable|unavailable.*status/i);
 assert.deepEqual(a.errors,[]);a.close();
});

test('journey review: reaching the office cannot complete a Leisure journey to another destination',async()=>{
 const a=await demo({saved:{dirMode:'office',mode:'leisure'}}),r=follow(a,o=>o.effort==='walk');
 a.c.state.saved.followRoute.phase='after-train';
 a.c.state.saved.followRoute.option.dest='Science Museum';
 fresh(a,r.option.train.arr+20*MIN,[51.5139,-.071]);a.c.render();
 assert.equal(a.c.state.saved.followRoute.mode,'leisure');
 assert.notEqual(a.c.state.followUpdate.status,'arrived');
 assert.notEqual(a.c.state.saved.followRoute.phase,'arrived');
 assert.doesNotMatch(a.text('#followPanel'),/Journey complete/);
 assert.deepEqual(a.errors,[]);a.close();
});

test('journey review: a fresh Service Details arrival remains authoritative when departure boards are stale',async()=>{
 const a=await demo(),r=follow(a);
 const result=a.w.CommuteCore.updateFollowRoute(r,{now:r.option.train.dep+MIN,phase:'on-train',options:[],availableOptions:[],dataFresh:false,
  trainArrivalLive:true,currentTrainArrival:r.option.train.arr+10*MIN,hasReliableLocation:true});
 assert.equal(result.route.expectedArrival,r.expectedArrival+10*MIN,'fresh live rail arrival updates the original onward tail independently of a stale departure board');
 assert.match(result.notice.text,/live arrival changed|late/);
 assert.equal(result.alternative,null,'stale board still cannot supply replacement journeys');
 assert.deepEqual(a.errors,[]);a.close();
});

test('journey review: stale Darwin boards are not called live, while a fresh Service Details report updates the followed ETA',async()=>{
 const a=await demo(),r=follow(a),t=train(a,r);
 const now=t.dep+10*MIN;fresh(a,now,[51.866,-.185]);
 t.serviceId='review-service';
 Object.assign(a.c.state,{onLine:true,trainLock:{operator:t.operator,std:t.std,from:t.from,serviceId:t.serviceId,picked:true},boardsAt:now-4*MIN});
 a.c.render();
 assert.equal(a.c.state.saved.followRoute.phase,'on-train');
 assert.equal(a.c.state.followUpdate.trainStatus,null,'a stale live-source board is still stale evidence');
 assert.equal(a.c.state.saved.followRoute.expectedArrival,r.expectedArrival);
 const liveArrival=t.arr+10*MIN;
 a.c.state.progressById={[t.serviceId]:{at:now,data:{at:()=>liveArrival,last:null,next:null}}};
 a.c.render();
 assert.equal(a.c.state.saved.followRoute.expectedArrival,r.expectedArrival+10*MIN);
 assert.match(a.c.state.followUpdate.trainStatus.text,/10 min late/);
 assert.match(a.text('#followPanel'),/live arrival changed|late/);
 assert.equal(a.c.state.followUpdate.alternative,null);
 assert.deepEqual(a.errors,[]);a.close();
});

test('journey review: the home walk updates the followed ETA with a reason even when rail boards are old',async()=>{
 const a=await demo({now:evening,saved:{dirMode:'home'},geo:IN_LONDON}),r=follow(a,o=>o.hub==='ZFD'&&o.train.std==='18:34'&&o.effort==='walk');
 const now=r.option.train.arr+5*MIN;
 fresh(a,now,[51.977,-.23]);a.c.state.boardsAt=now-10*MIN;a.c.state.saved.followRoute.phase='after-train';
 a.c.render();
 assert.notEqual(a.c.state.saved.followRoute.expectedArrival,r.expectedArrival);
 assert.match(a.text('#followPanel'),/Your onward journey has changed/);
 assert.equal(a.c.state.followUpdate.alternative,null);
 assert.equal(a.c.state.saved.followRoute.id,r.id);
 const oldRailStep=r.option.legs.find(l=>l.t===r.option.train.arr&&!l.train);
 const newRailStep=a.w.CommuteCore.followedLegs(a.c.state.saved.followRoute).find(l=>l.d===oldRailStep.d);
 assert.equal(newRailStep.t,oldRailStep.t);
 assert.deepEqual(a.errors,[]);a.close();
});

test('journey review: a reinstated train replaces the old cancellation notice and can be cancelled again',async()=>{
 const a=await demo(),r=follow(a),t=train(a,r);
 t.cancelled=true;a.c.render();assert.match(a.text('#followPanel'),/is cancelled/);
 a.d.querySelector('[data-follow-action="seen"]').click();
 t.cancelled=false;a.c.render();
 assert.equal(a.c.state.followUpdate.status,'on-track');
 assert.match(a.text('#followPanel'),/running again/);
 assert.doesNotMatch(a.text('#followPanel'),/is cancelled/);
 a.d.querySelector('[data-follow-action="seen"]').click();a.c.render();
 assert.equal(a.c.state.followUpdate.notice,null,'the recovery message remains acknowledged');
 t.cancelled=true;a.c.render();
 assert.equal(a.c.state.followUpdate.status,'cancelled');assert.match(a.text('#followPanel'),/is cancelled/);
 assert.equal(a.c.state.saved.followRoute.id,r.id);assert.deepEqual(a.errors,[]);a.close();
});

test('journey review: I am on it explicitly corrects missed inference and preserves the selected service',async()=>{
 const a=await demo(),r=follow(a),now=r.option.train.dep+MIN;
 fresh(a,now,[51.975,-.23]);a.c.render();assert.equal(a.c.state.followUpdate.status,'missed');
 const button=a.d.querySelector('[data-follow-action="boarded"]');assert.ok(button,'a passenger can correct missing boarding evidence');button.click();
 assert.equal(a.c.state.saved.followRoute.phase,'on-train');
 assert.equal(a.c.state.saved.followRoute.id,r.id);
 assert.equal(a.c.state.trainLock.picked,true);
 assert.equal(a.c.state.trainLock.std,r.option.train.std);
 assert.notEqual(a.c.state.followUpdate.status,'missed');
 assert.doesNotMatch(a.text('#followPanel'),/no longer make/);
 assert.match(a.text('#followPanel'),/confirmed you are on/);
 assert.deepEqual(a.errors,[]);a.close();
});

test('journey review: an explained arrival change keeps the original plan visible',async()=>{
 const a=await demo(),r=follow(a),t=train(a,r);t.arr+=7*MIN;t.arrLate=7;a.c.render();
 assert.equal(a.c.state.saved.followRoute.expectedArrival,r.expectedArrival+7*MIN);
 assert.match(a.text('#followPanel'),/Original plan: arrive/);
 assert.match(a.text('#followPanel'),new RegExp(a.w.CommuteCore.hhmm(r.plannedArrival)));
 assert.match(a.text('#followPanel'),/7 min late/);
 assert.deepEqual(a.errors,[]);a.close();
});

test('journey review: observed same-train boarding calls can continue tracking without changing the chosen boarding point',async()=>{
 const a=await demo({now:evening,saved:{dirMode:'home'},geo:IN_LONDON});
 const r=follow(a,o=>o.hub==='ZFD'&&o.train.std==='18:34'&&o.effort==='walk');
 const chosen=plain(r.option);
 const alt=chosen.alts?.find(o=>o.train.from==='STP');assert.ok(alt,'real merged journey contains the alternate boarding call');
 a.c.state.saved.followRoute.option.alts=[alt];
 const now=alt.train.dep+MIN;fresh(a,now,[51.601,-.111]);
 Object.assign(a.c.state,{onLine:true,trainLock:{operator:alt.train.operator,std:alt.train.std,from:alt.train.from,picked:true,...(alt.train.serviceId?{serviceId:alt.train.serviceId}:{})}});
 const found=a.c.whichTrain(now);assert.equal(found.t.from,'STP','existing inference follows the known alternative call');
 a.c.render();
 assert.equal(a.c.state.saved.followRoute.phase,'on-train');
 assert.equal(a.c.state.saved.followRoute.option.train.from,'ZFD','recognition is not silent boarding-plan replacement');
 assert.equal(a.c.state.saved.followRoute.option.hub,'ZFD');
 assert.equal(a.c.state.saved.followRoute.id,r.id);
 assert.notEqual(a.c.state.followUpdate.status,'missed');
 assert.deepEqual(a.errors,[]);a.close();
});

test('journey review: an observed alternate London stop cannot retime the chosen stop with its different arrival',async()=>{
 const a=await demo(),r=follow(a,o=>o.hub==='STP'&&o.train.std==='07:51'&&o.effort==='walk');
 const alt=r.option.alts?.find(o=>o.train.to==='ZFD');assert.ok(alt,'same train has a later Farringdon call');
 assert.notEqual(alt.train.arr,r.option.train.arr,'the arrival-time assertion must distinguish the two stops');
 const altObservation=a.c.state.boards[`${alt.train.from}-${alt.train.to}`].services.find(t=>t.std===alt.train.std&&t.operator===alt.train.operator);
 assert.ok(altObservation);altObservation.cancelled=false;altObservation.reason='';
 const board=a.c.state.boards[`${r.option.train.from}-${r.option.train.to}`];
 board.services=board.services.filter(t=>t.std!==r.option.train.std||t.operator!==r.option.train.operator);
 const now=r.option.train.dep+10*MIN;fresh(a,now,[51.866,-.185]);
 Object.assign(a.c.state,{onLine:true,trainLock:{operator:alt.train.operator,std:alt.train.std,from:alt.train.from,picked:true,...(alt.train.serviceId?{serviceId:alt.train.serviceId}:{})}});
 const observed=a.c.whichTrain(now);assert.equal(observed.t.to,'ZFD','only the alternate stop remains in the raw boards');
 a.c.render();
 assert.equal(a.c.state.saved.followRoute.phase,'on-train');
 assert.equal(a.c.state.saved.followRoute.option.train.to,'STP');
 assert.equal(a.c.state.saved.followRoute.expectedArrival,r.expectedArrival,'Farringdon arrival cannot be added to the chosen St Pancras onward route');
 assert.equal(a.c.state.saved.followRoute.id,r.id);
 assert.equal(a.c.state.followUpdate.notice,null);
 assert.deepEqual(a.errors,[]);a.close();
});

test('journey review: a delayed live Tube prediction cannot offer an earlier connection at an unobserved station',async()=>{
 const now=Date.parse('2026-10-30T22:43:00Z');
 const predictions=JSON.parse(readFileSync(new URL('./fixtures/tfl-2026-10-30T2243Z/KSX.json',import.meta.url),'utf8'));
 const a=await demo({now,saved:{dirMode:'home'},geo:IN_LONDON,
  route:u=>/940GZZLUKSX\/Arrivals/.test(u)?{ok:true,status:200,json:async()=>predictions}:undefined});
 const r=follow(a,o=>o.hub==='KGX'&&o.effort==='walk'&&o.train.dep>now+20*MIN);
 fresh(a,now,[51.5186,-.0886]);
 a.c.state.saved.tubeRide={hub:'ALD',from:'ALD',vehicle:'441',line:'Met',t:now-2*MIN,rideMs:14*MIN,picked:true,confirmed:true,stop:"King's Cross",stopGeo:null};
 await a.c.refreshFollowTransport(now);
 const observed=a.c.followedTubeArrival(r,now);assert.ok(observed,'the recorded Met vehicle is present at the selected stop');
 const prediction=a.c.state.followTransport.predictions.find(p=>String(p.vehicle)==='441');assert.ok(prediction);
 prediction.t=r.option.train.dep+10*MIN;
 a.c.render();
 assert.equal(a.c.state.followUpdate.status,'missed','the fresh observed late arrival actually misses the chosen train');
 assert.match(a.text('#followPanel'),/Live arrival for your Tube vehicle/);
 const alternative=a.c.state.followUpdate.alternative;
 assert.ok(alternative,'a later recovery at the observed stop keeps the alternative assertion meaningful');
 assert.ok(['KGX','STP'].includes(alternative.hub),'model-only Farringdon readiness cannot override observed late Tube progress');
 assert.ok(alternative.train.dep>=prediction.t,'the offered train cannot leave before the actual Tube reaches its stop');
 assert.equal(a.c.state.saved.followRoute.id,r.id);assert.deepEqual(a.errors,[]);a.close();
});
