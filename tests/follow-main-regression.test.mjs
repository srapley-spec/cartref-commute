// Behavioral preservation of the Follow scenarios released on main at be1e58e.
// These use the shared engine/current controls rather than pinning the superseded HTML wording/API.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, closeAll, json, sleep, parseJourneyUrl } from './harness.mjs';
import { services, darwinResponder, tflResponder, serviceDetailsResponder } from './golden/feeds.mjs';
after(closeAll);
const scenarios=[];const scenario=(name,fn)=>scenarios.push([name,fn]);
const DAY='2026-11-03',MIN=60000,T=h=>new Date(`${DAY}T${h}:00`).getTime();
const OFFICE=[51.5139,-.071],ALD=[51.5142,-.0755],KX=[51.5309,-.1236];
const RDM={provider:'rdm',rdmKey:'test',rdmBase:'https://darwin.test/LDBWS/api/20220120',rdmSdBase:'https://darwin.test/SD/LDBWS/api/20220120',tflKey:'test'};
const plain=x=>JSON.parse(JSON.stringify(x));
const status=(id,name)=>({id,name,lineStatuses:[{statusSeverity:10,statusSeverityDescription:'Good Service'}]});
async function settle(a){for(let n=0;n<100;n++){await sleep(10);if(!a.c.state.loading)return;}assert.fail('fixture refresh did not finish');}
// Every scenario runs in both designs (Panda and Signal; Sam, 31 Oct: everything recent must work in both).
let SIGNAL=false;
async function open({now=T('18:19'),geo=OFFICE,enabled=true,saved={},extra}={}){
 let current=now;const svcs=[...services('2026-11-02'),...services(DAY),...services('2026-11-04')];
 const dar=darwinResponder(svcs,()=>current),tfl=tflResponder(svcs),details=serviceDetailsResponder(svcs,()=>current);
 const a=await createApp({now,geo:geo?{coords:{latitude:geo[0],longitude:geo[1],accuracy:10}}:null,
  settings:{...RDM,...(SIGNAL?{signal:true}:{}),...(enabled?{followRoute:true}: {})},saved:{dirMode:'home',...saved},settle:650,
  route:u=>{
   const response=extra?.(u,current);if(response!==undefined)return response;
   if(/darwin\.test\/SD\//.test(u)){const r=details(u);return r?json(r):json({},404);}
   if(/darwin\.test/.test(u)){const r=dar(u);return r?json(r):json({},404);}
   if(/Line\/circle/.test(u))return json([status('circle','Circle'),status('metropolitan','Metropolitan'),status('hammersmith-city','H&C')]);
   if(/national-rail\/Status/.test(u))return json([status('great-northern','Great Northern'),status('thameslink','Thameslink')]);
   if(/\/Arrivals/.test(u))return json([]);
   const q=parseJourneyUrl(u);if(q?.from&&q?.to)return json(tfl(q));
  }});
 a.at=t=>{current=t;a.setNow(t);};
 a.fix=async(point,t,accuracy=15)=>{a.at(t);a.c.onPosition({coords:{latitude:point[0],longitude:point[1],accuracy},timestamp:t});await settle(a);};
 return a;
}
function choose(a,std,hub='KGX'){
 const entry=[...a.c.followChoices].find(([,o])=>o.train.std===std&&o.hub===hub);
 assert.ok(entry,`${std} via ${hub} is offered`);
 const button=[...a.d.querySelectorAll('[data-follow]:not([disabled])')].find(b=>b.dataset.follow===entry[0]);assert.ok(button,'the chosen service is followable');button.click();
 return plain(a.c.state.saved.followRoute);
}
const currentTrain=(a,r)=>Object.values(a.c.state.boards).flatMap(b=>b?.services||[]).filter(t=>t.std===r.option.train.std&&t.operator===r.option.train.operator);
function freshRender(a,t){a.at(t);a.c.state.boardsAt=t;a.c.state.lastFixAt=t;a.c.render();}
function aldgateFeed(){return [['16:41','metropolitan','m41'],['16:46','circle','c46'],['16:52','metropolitan','m52']].map(([hhmm,lineId,vehicleId])=>({vehicleId,lineId,platformName:'Westbound - Platform 1',destinationName:'Edgware Road (Circle Line) Underground Station',expectedArrival:new Date(T(hhmm)).toISOString(),timeToStation:60}));}
function predicted(vehicle,t){return {vehicleId:vehicle,lineId:'circle',platformName:'Westbound - Platform 1',destinationName:'Edgware Road (Circle Line) Underground Station',expectedArrival:new Date(t).toISOString(),timeToStation:60};}
async function tubeApp(target){
 const a=await open({now:T('16:30'),geo:null,extra:u=>/940GZZLUALD\/Arrivals/.test(u)?json(aldgateFeed()):/940GZZLUKSX\/Arrivals/.test(u)?target():undefined});
 await a.fix(ALD,T('16:44'));
 const r=choose(a,'17:18');
 const pick=a.d.querySelector(`[data-tubepick^="ALD|${T('16:46')}|Circle"]`);assert.ok(pick,'normal live Tube controls offer the selected vehicle');pick.click();
 a.at(T('16:48'));await a.c.refresh({force:true});await settle(a);
 return {a,r};
}

scenario('main Follow preservation: 18:48 cancellation from the office offers an explicit best way on without changing the chosen arrival',async()=>{
 const a=await open({now:T('18:10')}),r=choose(a,'18:48');
 assert.equal(a.c.state.followUpdate.status,'on-track');
 const selectedButtons=[...a.d.querySelectorAll('[data-follow]')].filter(b=>b.dataset.follow===r.id);
 assert.ok(selectedButtons.every(b=>b.disabled),'the selected route is marked Following instead of offering a reset that drops its original plan');
 currentTrain(a,r).forEach(t=>{t.cancelled=true;});freshRender(a,T('18:32'));
 assert.equal(a.c.state.saved.followRoute.id,r.id);assert.equal(a.c.state.saved.followRoute.expectedArrival,r.expectedArrival);
 assert.equal(a.c.state.followUpdate.status,'cancelled');assert.match(a.text('#followPanel'),/is cancelled/);
 const next=a.c.state.followUpdate.alternative;assert.ok(next,'the real engine finds a later reachable service');assert.ok(next.arrive>r.expectedArrival);
 a.d.querySelector('[data-follow-action="switch"]').click();
 assert.equal(a.c.state.saved.followRoute.option.train.std,next.train.std);assert.notEqual(a.c.state.saved.followRoute.id,r.id);
 assert.equal(a.c.state.saved.followRoute.notices.length,0);
 a.d.querySelector('[data-follow-action="stop"]').click();assert.equal(a.c.state.saved.followRoute,null);assert.equal(a.d.querySelector('#followPanel').hidden,true);
 assert.deepEqual(a.errors,[]);a.close();
});

scenario('main Follow preservation: reopening retains selection, a seven minute delay is explained, Seen persists and the original arrival stays visible',async()=>{
 let a=await open(),r=choose(a,'18:48');const saved=plain(a.c.state.saved);a.close();
 a=await open({now:T('18:20'),saved});assert.equal(a.c.state.saved.followRoute.id,r.id);
 currentTrain(a,r).forEach(t=>{t.arr+=7*MIN;t.arrLate=7;});a.c.render();
 assert.equal(a.c.state.saved.followRoute.expectedArrival,r.expectedArrival+7*MIN);assert.match(a.c.state.followUpdate.notice.text,/7 min late/);assert.match(a.text('#followPanel'),/Original plan: arrive/);
 a.d.querySelector('[data-follow-action="seen"]').click();a.c.render();assert.equal(a.c.state.followUpdate.notice,null);
 const again=plain(a.c.state.saved);a.close();a=await open({now:T('18:20'),saved:again});assert.equal(a.c.state.saved.followRoute.id,r.id);assert.deepEqual(a.errors,[]);a.close();
 const off=await open({enabled:false});assert.equal(off.d.querySelectorAll('[data-follow]').length,0);off.close();
});

scenario('main Follow preservation: a slow 19:06 route offers only five minute gains, remembers refusal, reports missed and accepts I am on it',async()=>{
 const a=await open(),r=choose(a,'19:06');const better=a.c.state.followUpdate.alternative;assert.ok(better);assert.ok(r.expectedArrival-better.arrive>=5*MIN);
 const declined=a.w.CommuteCore.followServiceKey(better);a.d.querySelector('[data-follow-action="dismiss"]').click();a.c.render();
 assert.ok(a.c.state.saved.followRoute.dismissedAlternatives.includes(declined));assert.notEqual(a.c.state.followUpdate.alternative&&a.w.CommuteCore.followServiceKey(a.c.state.followUpdate.alternative),declined);
 freshRender(a,r.option.leave+MIN);assert.equal(a.c.state.followUpdate.status,'hurry','behind but still makeable at extra effort is not missed');assert.match(a.c.state.followUpdate.text,/behind/i);
 freshRender(a,T('19:30'));assert.equal(a.c.state.followUpdate.status,'missed');assert.match(a.text('#followPanel'),/no longer make/);assert.ok(a.c.state.followUpdate.alternative);
 a.d.querySelector('[data-follow-action="boarded"]').click();assert.equal(a.c.state.trainLock.std,'19:06');assert.equal(a.c.state.trainLock.picked,true);assert.equal(a.c.state.saved.followRoute.phase,'on-train');assert.notEqual(a.c.state.followUpdate.status,'missed');
 assert.deepEqual(a.errors,[]);a.close();
});

scenario('main Follow preservation: the selected Tube vehicle live arrival determines whether the 17:18 connection survives',async()=>{
 let eta=T('16:56');const {a,r}=await tubeApp(()=>json([predicted('c46',eta)]));
 assert.match(a.text('#followPanel'),/Live arrival for your Tube vehicle/);assert.equal(a.c.state.followUpdate.status,'on-track');
 eta=T('17:14');await a.c.refresh({force:true});await settle(a);
 assert.equal(a.c.state.followUpdate.status,'missed');assert.ok(a.c.state.followUpdate.alternative);assert.equal(a.c.state.saved.followRoute.id,r.id);
 assert.deepEqual(a.errors,[]);a.close();
});

scenario('main Follow preservation: planning selected at the office yields to a new station situation and after twenty minutes while moving',async()=>{
 const a=await open({now:T('18:00')});a.d.querySelector('[data-view="by"]').click();await settle(a);
 assert.equal(a.c.state.presentation.mode,'plan');await a.fix(OFFICE,T('18:10'));assert.equal(a.c.state.presentation.mode,'plan');
 await a.fix(KX,T('18:15'));assert.equal(a.c.state.presentation.mode,'auto');assert.notEqual(a.c.state.presentation.view,'plan-by');
 a.d.querySelector('[data-view="at"]').click();await settle(a);await a.fix(KX,T('18:34'));assert.equal(a.c.state.presentation.mode,'plan');
 await a.fix(KX,T('18:36'));assert.equal(a.c.state.presentation.mode,'auto');assert.notEqual(a.c.state.presentation.view,'plan-at');
 assert.deepEqual(a.errors,[]);a.close();
 const off=await open({now:T('18:00'),enabled:false});off.d.querySelector('[data-view="by"]').click();await settle(off);await off.fix(KX,T('18:15'));assert.equal(off.c.state.saved.view,'by');off.close();
});

scenario('main Follow preservation: not-yet-loaded data and direction changes cannot invent a missed train; cancelled rows are not followable',async()=>{
 const a=await open(),r=choose(a,'18:48'),savedBoards=a.c.state.boards;
 a.c.state.boards=null;a.c.render();assert.notEqual(a.c.state.followUpdate.status,'missed');assert.equal(a.c.state.saved.followRoute.id,r.id);
 a.c.state.boards=savedBoards;a.d.querySelector('[data-dir="office"]').click();await settle(a);assert.equal(a.d.querySelector('#followPanel').hidden,true,'the opposite-direction journey is not the current journey');
 a.d.querySelector('[data-dir="home"]').click();await settle(a);assert.equal(a.c.state.saved.followRoute.id,r.id);assert.notEqual(a.c.state.followUpdate.status,'missed');
 const doomed=[...a.c.followChoices.values()].find(o=>o.train.std==='19:06'&&o.hub==='KGX');assert.ok(doomed);
 for(const t of Object.values(a.c.state.boards).flatMap(b=>b?.services||[]))if(t.std==='19:06'&&t.operator==='Great Northern')t.cancelled=true;
 a.c.render();const key=a.w.CommuteCore.followServiceKey(doomed);const buttons=[...a.d.querySelectorAll('[data-follow]')].filter(b=>b.dataset.follow===key);
 assert.ok(buttons.every(b=>b.disabled),'no enabled Follow action can select the cancelled service');
 assert.deepEqual(a.errors,[]);a.close();
});

scenario('main Follow preservation: another vehicle, wrong destination stop, stale or failed predictions use the ride-time fallback',async()=>{
 let fail=false;const {a,r}=await tubeApp(()=>fail?json({},500):json([predicted('c99',T('16:50')),predicted('c46',T('16:57'))]));
 const live=a.c.followedTubeArrival(r,T('16:48'));assert.ok(live);assert.equal(live.arrival,T('16:57'));
 fail=true;a.at(T('16:52'));await a.c.refresh({force:true});await settle(a);
 assert.equal(a.c.followedTubeArrival(r,T('16:52')),null);assert.match(a.text('#followPanel'),/Estimated Tube ride/);
 const cache=a.c.state.followTransport;assert.ok(cache);cache.at=T('16:52');cache.vehicle='c99';
 assert.equal(a.c.followedTubeArrival(r,T('16:52')),null,'wrong vehicle is never used');cache.vehicle='c46';cache.hub='ZFD';
 assert.equal(a.c.followedTubeArrival(r,T('16:52')),null,'wrong destination stop is never used');
 assert.deepEqual(a.errors,[]);a.close();
});

scenario('main Follow preservation: confirmed boarding prevents better offers, while feature off ignores saved follow and makes no extra Tube requests or view writes',async()=>{
 const a=await open({now:T('18:10')}),r=choose(a,'19:06');freshRender(a,T('19:15'));a.d.querySelector('[data-follow-action="boarded"]').click();
 assert.equal(a.c.state.followUpdate.alternative,null);assert.notEqual(a.c.state.followUpdate.status,'missed');a.close();
 const off=await open({now:T('16:30'),geo:null,enabled:false,saved:{followRoute:r},extra:u=>/940GZZLUALD\/Arrivals/.test(u)?json(aldgateFeed()):undefined});
 await off.fix(ALD,T('16:44'));const button=off.d.querySelector(`[data-tubepick^="ALD|${T('16:46')}|Circle"]`);assert.ok(button);button.click();off.at(T('16:48'));await off.c.refresh({force:true});await settle(off);
 assert.ok(off.c.homeRide(T('16:48')));assert.equal(off.d.querySelector('#followPanel').hidden,true);
 assert.equal(off.calls.filter(u=>/940GZZLUKSX\/Arrivals|940GZZLUFCN\/Arrivals/.test(u)).length,0);
 off.d.querySelector('[data-view="by"]').click();await settle(off);assert.equal(off.c.state.saved.viewOverride.mode,'plan','planning pins consistently in both supported designs even with Follow off');assert.equal(off.c.state.saved.viewAt,undefined);assert.equal(off.c.state.saved.viewKey,undefined);
 assert.deepEqual(off.errors,[]);off.close();
});

scenario('main Follow preservation: a planning pin survives nineteen minutes at a station and expires at twenty',async()=>{
 const a=await open({now:T('18:00')});await a.fix(KX,T('18:00'));a.d.querySelector('[data-view="at"]').click();await settle(a);
 await a.fix(KX,T('18:19'));assert.equal(a.c.state.presentation.mode,'plan');assert.equal(a.c.state.presentation.view,'plan-at');
 await a.fix(KX,T('18:20')+1000);assert.equal(a.c.state.presentation.mode,'auto');assert.notEqual(a.c.state.presentation.view,'plan-at');
 assert.deepEqual(a.errors,[]);a.close();
});

for(const signal of [false,true])for(const [name,fn] of scenarios)
 test(`${name}${signal?' (Signal)':''}`,async()=>{SIGNAL=signal;try{await fn();}finally{SIGNAL=false;}});
