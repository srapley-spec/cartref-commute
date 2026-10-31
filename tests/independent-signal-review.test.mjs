// Independent review regressions. These assertions target user-visible invariants, not implementation shape.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../dist/core.mjs';
import {createApp,closeAll,at,sleep,json,parseJourneyUrl} from './harness.mjs';
import {services,darwinResponder,tflResponder} from './golden/feeds.mjs';
after(closeAll);
const NOW=at('2026-11-03','07:00'),MIN=60000;
const app=(extra={})=>createApp({now:NOW,settings:{provider:'demo',signal:true,followRoute:true},saved:{dirMode:'office'},...extra});
function pick(a){const b=a.d.querySelector('[data-follow]:not([disabled])');assert.ok(b,'a reachable planned option has a Follow action');b.click();return JSON.parse(JSON.stringify(a.c.state.saved.followRoute));}
function option(extra={},trainExtra={}){return {hub:'MID',leave:NOW+10*MIN,arrive:NOW+70*MIN,effort:'walk',flags:[],legs:[{t:NOW+10*MIN,d:'Walk to Central'},{t:NOW+30*MIN,d:'Train to Riverside',train:true},{t:NOW+70*MIN,d:'Arrive destination'}],train:{from:'MID',to:'END',std:'07:30',dep:NOW+30*MIN,arr:NOW+60*MIN,depLate:0,arrLate:0,depUnknown:false,platform:'1',operator:'Example Rail',cancelled:false,reason:'',serviceId:'chosen',...trainExtra},...extra};}
const start=()=>core.startFollowRoute(option(),{now:NOW,direction:'home',mode:'commute'});

test('independent review: a stale matching service cannot change arrival, status or platform',()=>{
 const r=start(),changed=option({}, {arr:NOW+80*MIN,arrLate:20,platform:'9',cancelled:true});
 const u=core.updateFollowRoute(r,{now:NOW,options:[changed],dataFresh:false});
 assert.equal(u.route.expectedArrival,r.expectedArrival);assert.deepEqual(u.route.lastTrain,r.lastTrain);
 assert.equal(u.notice,null);assert.notEqual(u.status,'cancelled');assert.equal(u.alternative,null);
});
test('independent review: a better offer never replaces any part of the chosen itinerary',()=>{
 const r=start(),before=JSON.parse(JSON.stringify(r.option));
 const better=option({arrive:NOW+60*MIN,legs:[{t:NOW+5*MIN,d:'Different walk'},{t:NOW+25*MIN,d:'Different train',train:true}]},{serviceId:'better',std:'07:25',dep:NOW+25*MIN,arr:NOW+50*MIN});
 const u=core.updateFollowRoute(r,{now:NOW,options:[better,option()],dataFresh:true});
 assert.ok(u.alternative,'a valid offer makes the preservation assertion meaningful');
 assert.equal(u.alternative.train.serviceId,'better');assert.equal(u.route.id,r.id);assert.deepEqual(u.route.option,before);assert.equal(u.route.lastTrain.serviceId,'chosen');assert.equal(u.route.expectedArrival,r.expectedArrival);
});
test('independent review: a Follow selection is saved immediately before any later interaction',async()=>{
 const a=await app(),r=pick(a),saved=JSON.parse(a.w.localStorage.getItem('cartrefCommute.v1'));
 assert.equal(saved.followRoute?.id,r.id);assert.deepEqual(saved.followRoute.option.legs,r.option.legs);a.close();
});
test('independent review: choosing a future homeward journey while still at home does not complete it',async()=>{
 const a=await app({saved:{dirMode:'home',home:[51.975,-.23]}});a.d.querySelector('[data-journey-view="plan"]').click();const r=pick(a);
 assert.ok(r.option.train.dep>NOW);assert.notEqual(a.c.state.saved.followRoute.phase,'arrived');assert.notEqual(a.c.state.followUpdate.status,'arrived');a.close();
});
test('independent review: a followed route counts as active before leaving the origin',async()=>{
 const a=await app(),r=pick(a);a.d.querySelector('[data-journey-view="live"]').click();
 assert.equal(a.c.state.presentation.noActiveJourney,false);assert.equal(a.c.state.saved.followRoute.id,r.id);assert.equal(a.d.querySelector('#followPanel').hidden,false);assert.doesNotMatch(a.text('#hero'),/No active journey yet/);a.close();
});
test('independent review: on-line uncertainty cannot prove the followed departure was missed',async()=>{
 const a=await app(),r=pick(a),now=r.option.train.dep+2*MIN;a.setNow(now);a.c.state.boardsAt=now;a.c.state.lastFixAt=now;a.c.state.onLine=true;a.c.state.here=[51.8667,-.1876];a.c.state.locAcc=15;
 for(const b of Object.values(a.c.state.boards))b.services=[];a.c.render();
 assert.notEqual(a.c.state.followUpdate.status,'missed');assert.equal(a.c.state.saved.followRoute.id,r.id);assert.doesNotMatch(a.text('#followPanel'),/no longer make/);a.close();
});
test('independent review: a train already boarded cannot offer a new departure back at the origin',()=>{
 const r=start(),better=option({arrive:NOW+60*MIN},{serviceId:'back-at-origin'});
 const u=core.updateFollowRoute(r,{now:NOW+35*MIN,phase:'on-train',options:[],availableOptions:[{...better,train:{...better.train,dep:NOW+40*MIN}}],dataFresh:true});
 assert.equal(u.alternative,null);assert.equal(u.route.phase,'on-train');assert.equal(u.route.id,r.id);
});
function settings(a,changes){a.d.querySelector('#settingsBtn').click();for(const[k,v]of Object.entries(changes)){const e=a.d.querySelector('#s_'+k);if(e.type==='checkbox')e.checked=v;else e.value=v;}a.d.querySelector('#settingsForm').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));}
test('independent review: feed-only opt-in isolates the real followed route before Start',async()=>{
 const a=await app(),r=pick(a),saved=a.w.localStorage.getItem('cartrefCommute.v1');settings(a,{simulatedFeeds:true});
 assert.equal(a.c.state.saved.followRoute,undefined,'real route is removed before any synthetic feed update');assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),saved);
 a.d.querySelector('#simExit').click();assert.equal(a.c.state.saved.followRoute.id,r.id);await sleep(350);a.close();
});
test('independent review: planning pin retains the followed-route cancellation alert',async()=>{
 const a=await app(),r=pick(a);a.d.querySelector('[data-journey-view="plan"]').click();
 const chosen=a.c.state.boards[`${r.option.train.from}-${r.option.train.to}`].services.find(t=>t.std===r.option.train.std&&t.operator===r.option.train.operator);assert.ok(chosen);chosen.cancelled=true;a.c.render();
 assert.equal(a.c.state.presentation.mode,'plan');assert.equal(a.d.querySelector('#followPanel').hidden,false);assert.match(a.text('#followPanel'),/is cancelled/);assert.equal(a.c.state.saved.followRoute.id,r.id);a.close();
});

test('independent review: a failed chosen live board stays stale when a sibling route refreshes successfully',async()=>{
 let now=NOW,failedBoard=null;const hits=[];
 const all=services('2026-11-03'),darwin=darwinResponder(all,()=>now),tfl=tflResponder(all);
 const a=await createApp({now,settings:{provider:'rdm',rdmKey:'test',rdmBase:'https://darwin.test/LDBWS/api/20220120',signal:true,followRoute:true},saved:{dirMode:'office'},settle:700,
  route:u=>{
   if(u.includes('darwin.test')){
    const m=/GetDepBoardWithDetails\/([A-Z]{3})\?/.exec(u),key=m?m[1]+'-'+new URL(u).searchParams.get('filterCrs'):null;
    if(key)hits.push(key);
    if(key&&key===failedBoard)return json({},503);
    const response=darwin(u);return response?json(response):json({},404);
   }
   const q=parseJourneyUrl(u);if(q?.from&&q?.to)return json(tfl(q));
  }});
 const chosen=[...a.d.querySelectorAll('[data-follow]:not([disabled])')].find(b=>{const o=a.c.followChoices.get(b.dataset.follow);return o?.hub==='KGX'&&o.train.operator==='Great Northern';});
 assert.ok(chosen,'a Great Northern choice avoids same-service cross-station derivation');chosen.click();
 const r=JSON.parse(JSON.stringify(a.c.state.saved.followRoute));failedBoard=r.option.train.from+'-'+r.option.train.to;
 const oldBoard=a.c.state.boards[failedBoard];assert.ok(oldBoard);const beforeHits=hits.length;
 now+=MIN;a.setNow(now);a.c.state.lastFixAt=now;await a.c.refresh({force:true});
 assert.ok(hits.slice(beforeHits).includes(failedBoard),'the selected route actually failed a refresh');
 assert.ok(hits.slice(beforeHits).some(k=>k!==failedBoard),'a sibling route actually loaded during that refresh');
 assert.equal(a.c.state.boards[failedBoard],oldBoard,'last good selected-board data is retained');
 assert.equal(a.c.state.boardsAt,now,'the sibling load advanced the shared board timestamp');
 assert.equal(a.c.state.saved.followRoute.id,r.id);assert.equal(a.c.state.saved.followRoute.expectedArrival,r.expectedArrival);
 assert.equal(a.c.state.followUpdate.level,'info','retained route data cannot claim fresh on-track status');
 assert.match(a.text('#followPanel'),/Last known|waiting for fresh/i);
 assert.equal(a.c.state.followUpdate.notice,null);assert.deepEqual(a.errors,[]);a.close();
});

test('independent review: a completed saved journey is not an active route on the next trip',async()=>{
 const a=await app(),r=pick(a);a.c.state.saved.followRoute.phase='arrived';a.c.state.saved.viewOverride=null;a.c.render();
 assert.notEqual(a.c.state.presentation.view,'following','a completed route cannot pin Auto to old journey tracking');
 a.d.querySelector('[data-journey-view="live"]').click();
 assert.equal(a.c.state.presentation.noActiveJourney,true,'old completed history is not evidence of an active journey');
 assert.equal(a.c.state.saved.followRoute.id,r.id,'completed summary may remain available without being active');a.close();
});

test('independent review: explicit direction and mode changes expire a pin despite denied GPS',async()=>{
 for(const [attribute,value] of [['data-dir','home'],['data-mode','leisure']]){
  const a=await app();a.d.querySelector('[data-journey-view="plan"]').click();assert.ok(a.c.state.saved.viewOverride);
  a.c.state.locStatus='denied';a.c.state.lastFixAt=null;
  a.d.querySelector(`[${attribute}="${value}"]`).click();
  assert.equal(a.c.state.saved.viewOverride,null,`${attribute} is an explicit journey-context change, independent of GPS`);
  assert.equal(a.c.state.presentation.mode,'auto');await sleep(350);assert.deepEqual(a.errors,[]);a.close();
 }
});

test('independent review: the same rail service remains selectable as a different Leisure journey',async()=>{
 const a=await app();
 const entry=[...a.c.followChoices].find(([,o])=>o.hub==='KGX'&&o.effort==='walk');assert.ok(entry);
 const first=[...a.d.querySelectorAll('[data-follow]:not([disabled])')].find(b=>b.dataset.follow===entry[0]);assert.ok(first);first.click();
 assert.equal(a.c.state.saved.followRoute.mode,'commute');
 a.d.querySelector('[data-mode="leisure"]').click();await sleep(100);
 assert.equal(a.c.state.saved.mode,'leisure');assert.ok(a.c.followChoices.has(entry[0]),'same service is available for the Leisure destination');
 const leisure=[...a.d.querySelectorAll('[data-follow]:not([disabled])')].find(b=>b.dataset.follow===entry[0]);
 assert.ok(leisure,'a different destination/mode is not the already-selected journey');leisure.click();
 assert.equal(a.c.state.saved.followRoute.mode,'leisure');assert.equal(a.c.state.saved.followRoute.id,entry[0]);
 assert.equal(a.d.querySelector('#followPanel').hidden,false);assert.deepEqual(a.errors,[]);a.close();
});
