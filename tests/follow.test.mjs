// Whole built-page integration: real planning, inference, controls and browser persistence.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,sleep,at,json,parseJourneyUrl} from './harness.mjs';
import {services,tflResponder,darwinResponder} from './golden/feeds.mjs';
after(closeAll);
const MIN=60e3,DAY='2026-11-03',NOW=at(DAY,'07:00');
const plain=x=>JSON.parse(JSON.stringify(x));
const demo=async(extra={})=>createApp({now:NOW,settings:{provider:'demo',followRoute:true,signal:true},saved:{dirMode:'office'},...extra});
function pick(a,match=o=>o.recommended===1){
 const entry=[...a.c.followChoices].find(([,o])=>match(o));assert.ok(entry,'real app offers requested journey');
 const button=[...a.d.querySelectorAll('[data-follow]:not([disabled])')].find(b=>b.dataset.follow===entry[0]);assert.ok(button,'journey has enabled Follow action');button.click();
 assert.equal(a.c.state.saved.followRoute.id,entry[0]);assert.equal(a.d.querySelector('#followPanel').hidden,false);return plain(a.c.state.saved.followRoute);
}
function selectedTrain(a,route){const b=a.c.state.boards[`${route.option.train.from}-${route.option.train.to}`];assert.ok(b,'selected route board remains loaded');const t=b.services.find(t=>t.std===route.option.train.std&&t.operator===route.option.train.operator);assert.ok(t,'original service stays in real board fixture');return t;}
function settings(a,changes){a.d.querySelector('#settingsBtn').click();for(const[k,v]of Object.entries(changes)){const el=a.d.querySelector('#s_'+k);assert.ok(el);if(el.type==='checkbox')el.checked=v;else el.value=v;}a.d.querySelector('#settingsForm').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));}
async function live({now=NOW,geo={coords:{latitude:51.9799,longitude:-.229,accuracy:15}},saved={},settings:extra={}}={}){
 let current=now;const all=services(DAY),dar=darwinResponder(all,()=>current),tf=tflResponder(all);
 const a=await createApp({now,geo,saved:{dirMode:'office',...saved},settings:{provider:'rdm',rdmKey:'test',rdmBase:'https://darwin.test/LDBWS/api/20220120',followRoute:true,...extra},settle:600,
 route:u=>{if(u.includes('darwin.test')){const b=dar(u);return b?json(b):json({},404);}const q=parseJourneyUrl(u);if(q?.from&&q?.to)return json(tf(q));}});
 a.moveClock=t=>{current=t;a.setNow(t);};return a;
}

test('follow page: feature off preserves the ordinary board and has no Follow actions',async()=>{
 const a=await demo({settings:{provider:'demo'}});assert.equal(a.d.querySelectorAll('[data-follow]').length,0);assert.equal(a.d.querySelector('#followPanel').hidden,true);assert.match(a.text('#hero'),/best, and the next best/);assert.ok(a.rows().length);assert.deepEqual(a.errors,[]);a.close();
});

test('follow page: chosen itinerary and arrival survive re-ranking, refreshed access and approach location',async()=>{
 const a=await demo(),r=pick(a),originalSteps=plain(r.option.legs);
 const other=Object.values(a.c.state.boards).flatMap(b=>b.services).find(t=>t.operator!==r.option.train.operator&&t.dep>NOW);assert.ok(other);other.arr-=5*MIN;
 a.c.render();assert.equal(a.c.state.saved.followRoute.id,r.id);assert.equal(a.c.state.saved.followRoute.expectedArrival,r.expectedArrival);
 a.c.onPosition({coords:{latitude:51.9778,longitude:-.2295,accuracy:12,speed:1},timestamp:NOW});a.c.render();
 assert.deepEqual(plain(a.c.state.saved.followRoute.option.legs),originalSteps);assert.equal(a.c.state.saved.followRoute.expectedArrival,r.expectedArrival);assert.equal(a.c.state.saved.followRoute.id,r.id);assert.deepEqual(a.errors,[]);a.close();
});

test('follow page: a live delay explains changed arrival and Seen stays acknowledged across refresh',async()=>{
 const a=await demo(),r=pick(a),t=selectedTrain(a,r);t.dep+=6*MIN;t.arr+=6*MIN;t.depLate=6;t.arrLate=6;a.c.render();
 assert.equal(a.c.state.saved.followRoute.expectedArrival,r.expectedArrival+6*MIN);assert.match(a.text('#followPanel'),/6 min late/);assert.ok(a.d.querySelector('[data-follow-action="seen"]'));
 a.d.querySelector('[data-follow-action="seen"]').click();a.c.render();assert.equal(a.d.querySelector('[data-follow-action="seen"]'),null);assert.equal(a.c.state.saved.followRoute.id,r.id);assert.deepEqual(a.errors,[]);a.close();
});

test('follow page: cancellation keeps selected service and offers an explicit way on; switching and Stop are deliberate',async()=>{
 const a=await demo(),r=pick(a);selectedTrain(a,r).cancelled=true;a.c.render();
 assert.equal(a.c.state.saved.followRoute.id,r.id);assert.match(a.text('#followPanel'),/Arrival uncertain/);assert.match(a.text('#followPanel'),/is cancelled/);assert.ok(a.c.state.followUpdate.alternative);const next=a.c.state.followUpdate.alternative;
 a.d.querySelector('[data-follow-action="switch"]').click();assert.notEqual(a.c.state.saved.followRoute.id,r.id);assert.equal(a.c.state.saved.followRoute.option.train.std,next.train.std);
 a.d.querySelector('[data-follow-action="stop"]').click();assert.equal(a.c.state.saved.followRoute,null);assert.equal(a.d.querySelector('#followPanel').hidden,true);assert.ok(a.rows().length);a.close();
});

test('follow page: no-estimate null arrival remains selected through repeated renders and persisted reload',async()=>{
 const a=await demo(),r=pick(a),t=selectedTrain(a,r);t.arr=null;t.depUnknown=true;t.arrUnknown=true;a.c.render();
 assert.match(a.text('#followPanel'),/Arrival uncertain/);assert.match(a.text('#followPanel'),/no estimate/);assert.equal(a.c.state.saved.followRoute.id,r.id);a.c.render();assert.equal(a.d.querySelector('#followPanel').hidden,false);
 const saved=JSON.parse(a.w.localStorage.getItem('cartrefCommute.v1'));a.close();
 const b=await demo({saved});assert.equal(b.c.state.saved.followRoute.id,r.id);assert.equal(b.d.querySelector('#followPanel').hidden,false);assert.deepEqual(b.errors,[]);b.close();
});

test('follow page: platform changes are explained without changing chosen route',async()=>{
 const a=await demo(),r=pick(a);selectedTrain(a,r).platform='12';a.c.render();assert.equal(a.c.state.saved.followRoute.id,r.id);assert.equal(a.c.state.saved.followRoute.expectedArrival,r.expectedArrival);assert.match(a.text('#followPanel'),/platform 12/);assert.match(a.c.state.followUpdate.notice.text,/now leaves from platform 12/);a.close();
});

test('follow page: an actual departed selected train continues through movement inference, never becomes missed',async()=>{
 const a=await live(),r=pick(a,o=>o.train.std==='07:08'&&o.train.operator==='Great Northern');
 const now=at(DAY,'07:13');a.moveClock(now);a.c.onPosition({coords:{latitude:51.956,longitude:-.26,accuracy:15,speed:25},timestamp:now});await sleep(700);
 assert.equal(a.c.state.onLine,true);assert.equal(a.c.whichTrain(now).t.std,'07:08');assert.equal(a.c.state.saved.followRoute.phase,'on-train');assert.equal(a.c.state.followUpdate.status,'on-track');assert.equal(a.c.state.saved.followRoute.id,r.id);assert.doesNotMatch(a.text('#followPanel'),/no longer make/);assert.deepEqual(a.errors,[]);a.close();
});

test('follow page: temporary location denial retains route with an unknown position, never a missed train',async()=>{
 const a=await demo(),r=pick(a);a.c.state.locStatus='denied';a.c.state.lastFixAt=null;a.c.render();
 assert.equal(a.c.state.followUpdate.status,'unknown');assert.equal(a.c.state.followUpdate.level,'info');assert.equal(a.c.state.saved.followRoute.id,r.id);assert.equal(a.c.state.saved.followRoute.expectedArrival,r.expectedArrival);assert.doesNotMatch(a.text('#followPanel'),/no longer make/);assert.match(a.text('#followPanel'),/Location unavailable/);a.close();
});

test('follow page: malformed saved journey is ignored without breaking the rest of the app',async()=>{
 for(const followRoute of [{version:1}, {version:99,option:{}},'broken']){
  const a=await demo({saved:{dirMode:'office',followRoute}});assert.equal(a.d.querySelector('#followPanel').hidden,true);assert.ok(a.rows().length);assert.ok(a.d.querySelector('[data-follow]:not([disabled])'));assert.deepEqual(a.errors,[]);a.close();
 }
});

test('follow page: Signal to Panda and reload retain route, full steps and planning question',async()=>{
 const a=await demo(),r=pick(a);settings(a,{signal:false,followRoute:true});await sleep(60);
 assert.equal(a.d.documentElement.dataset.design,'panda');assert.equal(a.c.state.saved.followRoute.id,r.id);assert.deepEqual(plain(a.c.state.saved.followRoute.option.legs),r.option.legs);
 const saved=JSON.parse(a.w.localStorage.getItem('cartrefCommute.v1'));a.close();const b=await demo({saved});assert.equal(b.d.documentElement.dataset.design,'panda');assert.equal(b.c.state.saved.followRoute.id,r.id);assert.equal(b.d.querySelector('#followPanel').hidden,false);assert.deepEqual(b.errors,[]);b.close();
});

test('follow page: changing presentation and rendering adds no transport calls or clears no cached boards',async()=>{
 const a=await createApp({now:NOW,settings:{provider:'tfl',tflKey:'test',followRoute:true},saved:{dirMode:'office'},settle:600});
 const r=pick(a),count=a.calls.length,boards=a.c.state.boards;
 a.c.render();a.c.render();assert.equal(a.calls.length,count);
 settings(a,{signal:true,followRoute:true,appearance:'dark'});await sleep(60);
 assert.equal(a.calls.length,count,'design-only preference never fetches transport again');assert.equal(a.c.state.boards,boards,'same feed cache survives appearance change');assert.equal(a.c.state.saved.followRoute.id,r.id);assert.equal(a.d.documentElement.dataset.theme,'dark');assert.deepEqual(a.errors,[]);a.close();
});

test('follow page: simulator restart clears simulated selection and Stop restores the real followed route',async()=>{
 const a=await demo(),r=pick(a),storage=a.w.localStorage.getItem('cartrefCommute.v1');settings(a,{simulator:true,simulatedFeeds:true});
 a.d.querySelector('#simPlay').click();await sleep(80);assert.equal(a.c.state.saved.followRoute,undefined,'real route does not leak into simulated journey');assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),storage,'synthetic changes are never persisted');
 const b=a.d.querySelector('[data-follow]:not([disabled])');assert.ok(b,'simulated app also offers real Follow controls');b.click();assert.ok(a.c.state.saved.followRoute);a.d.querySelector('#simPlay').click();assert.equal(a.c.state.saved.followRoute,undefined,'restart clears prior simulation route');
 a.d.querySelector('#simExit').click();await sleep(80);assert.equal(a.c.state.saved.followRoute.id,r.id);assert.equal(a.c.simClock.active,false);assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),storage);assert.deepEqual(a.errors,[]);a.close();
});
