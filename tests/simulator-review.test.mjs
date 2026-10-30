// Independent review regressions: controls are exercised through the real built page.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,sleep} from './harness.mjs';
after(closeAll);
async function enabled(options={}){
 const a=await createApp({settle:100,...options});
 a.d.querySelector('#settingsBtn').click();
 a.d.querySelector('#s_simulator').checked=true;
 a.d.querySelector('#s_simulatedFeeds').checked=true;
 a.d.querySelector('#settingsForm').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));
 await sleep(50);return a;
}
test('independent review: Clear before Start keeps selected scenario date and renders without errors',async()=>{
 const a=await enabled();a.d.querySelector('#simClear').click();
 assert.ok(a.c.simClock.now()>=Date.parse('2026-11-03T00:00:00Z'),'Clear must not jump clock to1970');
 assert.deepEqual(a.errors,[]);await sleep(400);
});
test('independent review: Stop restores actual clock and both real input providers',async()=>{
 const a=await enabled();a.d.querySelector('#simPlay').click();a.d.querySelector('#simExit').click();
 assert.equal(a.c.simClock.active,false,'Stop returns to device clock');
 assert.equal(!!a.c.S().simulatedFeeds,false,'Stop returns to live transport feeds');
 assert.equal(!!a.c.S().simulatorEnabled,false,'Stop returns to native GPS');
 assert.equal(a.c.simulator.sim.active,false);assert.equal(a.c.simulator.sim.timer,null);
 await sleep(400);assert.deepEqual(a.errors,[]);
});
test('independent review: changing route then Continue cannot produce an epoch date',async()=>{
 const a=await enabled();a.d.querySelector('#simPlay').click();
 const e=a.d.querySelector('#simPath');e.value='far';e.dispatchEvent(new a.w.Event('change'));
 a.d.querySelector('#simContinue').click();
 await sleep(1100);a.d.querySelector('#simPause').click();
 assert.ok(a.c.simClock.now()>=Date.parse('2026-11-03T00:00:00Z'),'changed selection must restart or require Start');
 assert.deepEqual(a.errors,[]);await sleep(400);
});
test('independent review: virtual time never replaces browser Date',async()=>{
 const a=await enabled();const NativeDate=a.w.Date,before=NativeDate.now();
 a.d.querySelector('#simPlay').click();
 assert.equal(a.w.Date,NativeDate);assert.ok(Math.abs(NativeDate.now()-before)<10000);
 assert.equal(a.c.simClock.now(),Date.parse('2026-11-03T08:44:00Z'));
 await sleep(400);assert.deepEqual(a.errors,[]);
});

test('independent review: a saved real trip cannot determine a restarted simulated return direction',async()=>{
 const trip={dir:'office',at:Date.now()+10*3600000};
 const a=await enabled({saved:{trip},geoDelay:"manual"});
 const direction=a.d.querySelector('#simDirection');direction.value='return';direction.dispatchEvent(new a.w.Event('change'));
 a.d.querySelector('#simPlay').click();
 assert.equal(a.c.direction(),'home','return from office must use new scenario evidence, not a future real trip');
 a.d.querySelector('#simExit').click();
 assert.equal(a.c.state.saved.trip.dir,trip.dir);assert.equal(a.c.state.saved.trip.at,trip.at,'real memory restored on exit');
 await sleep(400);assert.deepEqual(a.errors,[]);
});
test('independent review: restarting a completed outbound journey clears synthetic return memory',async()=>{
 const a=await enabled();a.d.querySelector('#simSpeed').value='20';
 const originalSet=a.w.setInterval.bind(a.w),originalClear=a.w.clearInterval.bind(a.w),tasks=new Map();let sequence=90000;
 a.w.setInterval=(fn,ms)=>{if(ms!==1000)return originalSet(fn,ms);const id=sequence++;tasks.set(id,fn);return id;};
 a.w.clearInterval=id=>{if(!tasks.delete(id))originalClear(id);};
 a.d.querySelector('#simPlay').click();
 const sim=a.c.simulator;
 while(sim.sim.index<sim.route().length-1){
  a.d.querySelector('#simContinue').click();let guard=0;
  while(tasks.size&&guard++<3000)for(const fn of [...tasks.values()])fn();
  assert.ok(guard<3000);await sleep(5);
 }
 assert.equal(a.c.direction(),'home','completed office dwell establishes return journey');
 a.d.querySelector('#simPlay').click();
 const restartedDirection=a.c.direction();
 await sleep(500);
 assert.equal(restartedDirection,'office','Restart at home must begin a fresh outbound journey');
 assert.equal(a.c.state.saved.tubeRide,undefined);assert.equal(a.c.state.saved.tubePick,undefined);
 await sleep(500);assert.deepEqual(a.errors,[]);
});
test('independent review: stale live JSON never writes a board during synthetic playback',async()=>{
 const release=[];
 const a=await enabled({settings:{provider:'rdm',rdmKey:'test'},route:url=>{
  if(url.includes('GetDepBoardWithDetails'))return {ok:true,status:200,json:()=>new Promise(resolve=>release.push(()=>resolve({locationName:'Stale live',trainServices:[{std:'09:05',etd:'On time',serviceID:'STALE-LIVE',operator:'Great Northern',subsequentCallingPoints:[{callingPoint:[{crs:'KGX',st:'09:41',et:'On time'}]}]}]})))};
 }});
 assert.ok(release.length);a.d.querySelector('#simPlay').click();await sleep(50);
 let boards=a.c.state.boards;const writes=[];
 Object.defineProperty(a.c.state,'boards',{configurable:true,enumerable:true,get:()=>boards,set:value=>{boards=value;writes.push(value);}});
 release.forEach(done=>done());await sleep(100);
 const staleWrites=writes.flatMap(value=>Object.values(value||{})).flatMap(b=>b?.services||[]).filter(t=>t.serviceId==='STALE-LIVE');
 await sleep(400);assert.equal(staleWrites.length,0,'old JSON must never enter current session, even if a later refresh would replace it');assert.deepEqual(a.errors,[]);
});
test('independent review: feed-only native GPS preserves observation age in virtual time',async()=>{
 const nativeNow=Date.parse('2026-11-03T10:00:00Z');
 const a=await createApp({now:nativeNow,geoDelay:'manual',geo:{coords:{latitude:51.98002,longitude:-.22909,accuracy:12},timestamp:nativeNow-30000},settle:60});
 a.d.querySelector('#simDate').value='2026-11-04T08:44';
 a.d.querySelector('#settingsBtn').click();a.d.querySelector('#s_simulatedFeeds').checked=true;
 a.d.querySelector('#settingsForm').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));
 a.giveLocation();
 const age=a.c.simClock.now()-a.c.state.lastFixAt;
 await sleep(400);assert.equal(age,30000,'native GPS age must be preserved across clock domains');assert.equal(a.c.state.locAcc,12);assert.deepEqual(a.errors,[]);
});
test('independent review: configured home drives both simulator endpoints and actual home arrival',async()=>{
 const home=[51.974,-.236];const a=await enabled({saved:{home}});
 a.d.querySelector('#simSpeed').value='20';a.d.querySelector('#simPlay').click();
 assert.equal(a.c.state.here[0],home[0]);assert.equal(a.c.state.here[1],home[1]);
 const direction=a.d.querySelector('#simDirection');direction.value='return';direction.dispatchEvent(new a.w.Event('change'));
 const originalSet=a.w.setInterval.bind(a.w),originalClear=a.w.clearInterval.bind(a.w),tasks=new Map();let sequence=95000;
 a.w.setInterval=(fn,ms)=>{if(ms!==1000)return originalSet(fn,ms);const id=sequence++;tasks.set(id,fn);return id;};
 a.w.clearInterval=id=>{if(!tasks.delete(id))originalClear(id);};a.d.querySelector('#simPlay').click();
 const sim=a.c.simulator;
 while(sim.sim.index<sim.route().length-1){a.d.querySelector('#simContinue').click();let guard=0;while(tasks.size&&guard++<3000)for(const fn of [...tasks.values()])fn();assert.ok(guard<3000);await sleep(5);}
 a.c.render();const hero=a.text('#hero'),position=[...a.c.state.here];
 a.d.querySelector('#simExit').click();await sleep(400);
 assert.deepEqual(position,home);assert.match(hero,/at home|you're home/i,'actual application recognises the configured home');
 assert.deepEqual(JSON.parse(JSON.stringify(a.c.state.saved.home)),home);assert.deepEqual(a.errors,[]);
});
test('independent review: empty scenario date cannot partially enable synthetic feeds',async()=>{
 const a=await createApp({settle:80});
 a.d.querySelector('#simDate').value='';a.d.querySelector('#settingsBtn').click();
 a.d.querySelector('#s_simulatedFeeds').checked=true;
 a.d.querySelector('#settingsForm').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));
 await sleep(100);
 const valid=a.c.simClock.active&&Number.isFinite(a.c.simClock.now());
 const disabled=!a.c.S().simulatedFeeds&&!a.c.simClock.active;
 assert.ok(valid||disabled,'invalid date must be rejected or safely defaulted before source switching');
 assert.equal(a.d.querySelector('#simDate').value,'2026-11-03T08:44');
 assert.match(a.text('#simStatus'),/date|time/i);
 if(valid)assert.equal(a.d.querySelector('#simPanel').hidden,false);
 assert.deepEqual(a.errors,[]);await sleep(350);
});
