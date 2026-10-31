import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createApp,closeAll,sleep} from './harness.mjs';
const apps=[];
after(async()=>{await sleep(350);for(const a of apps)await until(()=>!a.c.state.loading&&!a.c.state.again,'refreshes finish before teardown');closeAll();});
const plain=value=>JSON.parse(JSON.stringify(value));
const view=a=>a.c.simulator.getView();
const click=(a,id)=>a.d.querySelector('#'+id).click();
function select(a,id,value){const e=a.d.querySelector('#'+id);e.value=value;e.dispatchEvent(new a.w.Event('change',{bubbles:true}));}
async function until(predicate,message,timeout=60000){const end=performance.now()+timeout;while(!predicate()){assert.ok(performance.now()<end,message);await sleep(10);}}
async function checked(a){await until(()=>!view(a).verification.pending&&view(a).verification.current?.index===view(a).index,'cold checkpoint verification settles');return view(a).verification.current;}
async function start({direction='outbound',route='kgx',signal=false,scenario='normal',...options}={}){
 const a=await createApp({settings:{provider:'rdm',rdmKey:'test',signal,followRoute:true},settle:100,...options});apps.push(a);
 a.original=a.w.localStorage.getItem('cartrefCommute.v1');
 click(a,'journeySimulatorBtn');select(a,'journeyDirection',direction);select(a,'journeyRoute',route);select(a,'journeyScenario',scenario);click(a,'journeyStart');
 await until(()=>view(a).active&&a.d.querySelector('#simPanel').hidden,'guided start');await checked(a);return a;
}
async function next(a){
 const v=view(a),point=v.checkpoints[v.index];
 if(/platforms/.test(point.label)&&v.checkpoints[v.index+1]?.mode==='tube'){
  const at=v.startTime+v.checkpoints[v.index+1].at*60000;
  [...a.d.querySelectorAll('[data-tubepick]')].find(b=>Math.abs(Number(b.dataset.tubepick.split('|')[1])-at)<1000)?.click();
 }
 if(/Alight at Farringdon/.test(point.label))[...a.d.querySelectorAll('[data-ride="off"]')].find(b=>b.textContent.includes('Farringdon'))?.click();
 const index=v.index;
 await until(()=>{const b=a.d.querySelector('#journeyNext');if(b.disabled)return false;b.click();return true;},'Next ready');
 await until(()=>view(a).index===index+1,'Next reaches exactly the adjacent checkpoint');return checked(a);
}
async function reach(a,predicate){while(!predicate(view(a).checkpoints[view(a).index]))await next(a);}
async function stop(a){click(a,'simExit');assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),a.original,'simulation never overwrites persistent real state');await sleep(350);assert.deepEqual(a.errors,[]);}

for(const signal of [false,true])for(const direction of ['outbound','return'])for(const route of ['kgx','far']){
 test(`cold Back and Reset: ${signal?'Signal':'Panda'} ${direction} ${route}`,async()=>{
  const a=await start({signal,direction,route});await reach(a,p=>p.point==='north');
  assert.equal(a.c.state.onLine,true,'real journey engine establishes movement before losing state');
  const old=view(a),oldReport=a.c.simulationReporter.getReport(),target=old.index-1;
  assert.equal(a.d.querySelector('#journeyBack').disabled,false);click(a,'journeyBack');
  assert.equal(view(a).index,target);assert.equal(a.c.simClock.now(),old.startTime+old.checkpoints[target].at*60000);
  assert.equal(view(a).playing,false);assert.equal(a.c.state.saved.dirMode,'auto');
  const cold=await checked(a);
  assert.equal(cold.assertions.find(row=>row.id==='journey-context-cleared')?.status,'PASS','observed old train/rendered/movement/visit memory is absent');
  const report=a.c.simulationReporter.getReport();
  assert.equal(report.previousAttempts.length,1);assert.equal(report.previousAttempts[0].checkpoints.length,oldReport.checkpoints.length);
  assert.ok(report.checkpoints.every(row=>row.index<=target),'no future checkpoint is counted after Back');
  assert.equal(a.c.state.trainLock?.picked||false,false,'old explicit identity is not restored');
  const before={time:a.c.simClock.now(),fix:plain(a.c.state.lastPosition),index:view(a).index};
  click(a,'simToggle');click(a,'journeyResetState');await checked(a);
  assert.equal(a.c.simClock.now(),before.time);assert.equal(view(a).index,before.index);assert.deepEqual(plain(a.c.state.lastPosition),before.fix);
  assert.equal(a.c.simulationReporter.getReport().previousAttempts.length,2);
  if(direction==='return')a.d.querySelector('[data-dir="home"]').click();
  await next(a);
  assert.equal(a.c.state.onLine,true,'normal new GPS movement re-establishes a real rail journey');
  const recovered=await checked(a);
  assert.equal(recovered.assertions.find(row=>row.id==='rail-identity')?.status,'PASS','cold mode does not suppress recovered normal service assertions');
  await stop(a);
 });
}

test('Reset discards a genuine explicit train choice without moving GPS or time',async()=>{
 const a=await start({scenario:'uncertain'});await reach(a,p=>p.point==='north');
 const choice=a.d.querySelector('[data-pick]');assert.ok(choice,'actual app asks which train');choice.click();
 assert.equal(a.c.state.trainLock?.picked,true);
 const instant=a.c.simClock.now(),fix=plain(a.c.state.lastPosition),id=view(a).index;
 click(a,'simToggle');click(a,'journeyResetState');await checked(a);
 assert.equal(a.c.state.trainLock?.picked||false,false);assert.equal(a.c.simClock.now(),instant);assert.equal(view(a).index,id);assert.deepEqual(plain(a.c.state.lastPosition),fix);
 assert.equal(view(a).verification.current.status,'INCONCLUSIVE','one fix cannot inherit the old boarding decision');
 await stop(a);
});

test('Reset while moving keeps the interpolated fix; Back returns to the last reached checkpoint',async()=>{
 const a=await start();assert.equal(a.d.querySelector('#journeyBack').disabled,true);
 const beginning=a.c.simClock.now();assert.equal(a.c.simulator.previousCheckpoint(),false);assert.equal(a.c.simClock.now(),beginning);
 a.c.simulator.tick(47);await until(()=>!a.c.state.loading,'interpolated location settles');
 const moved={time:a.c.simClock.now(),fix:plain(a.c.state.lastPosition)};assert.ok(moved.time>beginning);
 click(a,'simToggle');click(a,'journeyResetState');await checked(a);
 assert.equal(a.c.simClock.now(),moved.time);assert.deepEqual(plain(a.c.state.lastPosition),moved.fix);assert.equal(view(a).index,0);
 assert.equal(a.d.querySelector('#journeyBack').disabled,false);click(a,'journeyBack');await checked(a);
 assert.equal(a.c.simClock.now(),beginning);assert.equal(view(a).index,0);assert.equal(a.d.querySelector('#journeyBack').disabled,true);await stop(a);
});

test('Reset retains rough GPS uncertainty and never acts when both simulation sources are off',async()=>{
 const a=await start();click(a,'simToggle');select(a,'simPreset','kgx');a.d.querySelector('#simAccuracy').value='1400';click(a,'simJump');
 const fix=plain(a.c.state.lastPosition),instant=a.c.simClock.now();click(a,'journeyResetState');await checked(a);
 assert.deepEqual(plain(a.c.state.lastPosition),fix);assert.equal(a.c.simClock.now(),instant);assert.equal(a.c.state.locAcc,1400);assert.equal(a.c.state.atHub,null);
 assert.equal(view(a).verification.current.assertions.find(row=>row.id==='recovery-accuracy')?.status,'PASS');await stop(a);
 const saved=plain(a.c.state.saved);assert.equal(a.c.simulator.resetJourneyState(),false);assert.deepEqual(plain(a.c.state.saved),saved);
});

test('Reset underground loses the ride and does not fabricate a fresh station fix',async()=>{
 const a=await start();await reach(a,p=>p.label==='Walk to Underground platforms');await next(a);
 assert.ok(a.c.state.saved.tubePick||a.c.state.saved.tubeRide,'actual platform choice existed');
 assert.equal(a.c.state.locStatus,'unavailable');
 const instant=a.c.simClock.now();click(a,'simToggle');click(a,'journeyResetState');await checked(a);
 assert.equal(a.c.simClock.now(),instant);assert.equal(a.c.state.here,null);assert.equal(a.c.state.locStatus,'unavailable');
 assert.equal(a.c.state.saved.tubePick,undefined);assert.equal(a.c.state.saved.tubeRide,undefined);assert.equal(a.c.readSimulationActual().ride,null);
 assert.equal(view(a).verification.current.assertions.find(row=>row.id==='recovery-no-fabricated-position')?.status,'PASS');
 assert.equal(view(a).verification.current.status,'INCONCLUSIVE');await stop(a);
});

test('Back after completion reopens a cold attempt and retains prior failures and results',async()=>{
 const a=await start();while(view(a).index<view(a).checkpoints.length-1)await next(a);
 const final=view(a);assert.equal(final.summary.finished,true);
 click(a,'journeyBack');await checked(a);
 let report=a.c.simulationReporter.getReport();assert.equal(report.finishedAt,null);assert.equal(report.previousAttempts[0].reason,'completed');
 assert.equal(report.checkpoints.length,1);assert.equal(report.checkpoints[0].index,final.index-1);
 click(a,'journeyBack');await checked(a);report=a.c.simulationReporter.getReport();
 assert.equal(view(a).index,final.index-2);assert.equal(report.previousAttempts.length,2);assert.ok(report.checkpoints.every(row=>row.index<=final.index-2));
 await stop(a);
});

test('Back interrupts sequential work, rejects stale JSON and cancels old interval callbacks',async()=>{
 const a=await start();await reach(a,p=>p.point==='let'&&p.mode!=='rail');
 let hold=true,release;const barrier=new Promise(resolve=>{release=resolve;}),NativeProxy=a.w.Proxy;
 a.w.Proxy=function(target,handler){if(hold&&typeof target?.json==='function'){const json=target.json;target.json=async()=>{const data=await json.call(target);if(data.trainServices?.length)data.trainServices[0].serviceID='STALE-RESET';await barrier;return data;};}return new NativeProxy(target,handler);};
 const startIndex=view(a).index;click(a,'journeyNext');
 await until(()=>view(a).stepping&&a.c.state.loading,'real sequential action has an in-flight synthetic body');
 hold=false;click(a,'journeyBack');const time=a.c.simClock.now(),session=a.c.simulator.sim.sessionId;
 release();await checked(a);await sleep(50);a.w.Proxy=NativeProxy;
 assert.equal(view(a).index,startIndex,'while between checkpoints Back returns to the last reached waypoint');assert.equal(a.c.simClock.now(),time);assert.equal(a.c.simulator.sim.sessionId,session);
 assert.ok(Object.values(a.c.state.boards||{}).flatMap(b=>b.services||[]).every(t=>t.serviceId!=='STALE-RESET'));
 const nativeSet=a.w.setInterval,nativeClear=a.w.clearInterval;let callback;
 a.w.setInterval=(fn,ms)=>{if(ms===1000){callback=fn;return 987654;}return nativeSet.call(a.w,fn,ms);};
 a.w.clearInterval=id=>{if(id!==987654)nativeClear.call(a.w,id);};
 click(a,'simAdvance');assert.ok(callback);click(a,'journeyResetState');const frozen=a.c.simClock.now();callback();
 assert.equal(a.c.simClock.now(),frozen,'queued old timer cannot advance the new context');
 a.w.setInterval=nativeSet;a.w.clearInterval=nativeClear;await checked(a);await stop(a);
});

for(const sources of [{gps:true,feeds:false},{gps:false,feeds:true}])test(`independent reset is safe; Back unavailable (GPS ${sources.gps}, feeds ${sources.feeds})`,async()=>{
 const a=await start();click(a,'simToggle');
 const source=a.d.querySelector(sources.gps?'#simAdvancedFeeds':'#simAdvancedGPS');source.checked=false;source.dispatchEvent(new a.w.Event('change'));
 click(a,'simPlay');await checked(a);
 const before={time:a.c.simClock.now(),fix:a.c.state.lastPosition&&plain(a.c.state.lastPosition)};
 assert.equal(a.d.querySelector('#journeyBack').disabled,true);assert.equal(a.c.simulator.previousCheckpoint(),false);
 a.c.simulator.resetJourneyState();await checked(a);
 if(sources.feeds)assert.equal(a.c.simClock.now(),before.time);else assert.ok(Math.abs(a.c.simClock.now()-before.time)<1000,'device clock continues normally');
 if(before.fix)assert.deepEqual(plain(a.c.state.lastPosition),before.fix);
 assert.equal(a.c.S().simulatorEnabled,sources.gps);assert.equal(a.c.S().simulatedFeeds,sources.feeds);await stop(a);
});

test('manual and stale GPS reset preserves the observation age, then normal playback can recover',async()=>{
 const a=await start();click(a,'simToggle');
 select(a,'simPreset','kgx');click(a,'simJump');const instant=a.c.simClock.now();
 a.c.onPosition({coords:{latitude:51.53197,longitude:-.12341,accuracy:12,speed:0},timestamp:instant-300000});
 const taken=a.c.state.lastFixAt;click(a,'journeyResetState');await checked(a);
 assert.equal(a.c.state.lastFixAt,taken);assert.equal(a.c.simClock.now(),instant);assert.equal(a.c.simulator.sim.manualOverride,false);
 assert.equal(view(a).verification.current.assertions.find(row=>row.id==='recovery-stale-location')?.status,'INCONCLUSIVE');
 await next(a);assert.ok(a.c.state.lastFixAt>taken);assert.equal(view(a).verification.current.assertions.find(row=>row.id==='journey-context-cleared')?.status,'PASS');await stop(a);
});

test('Reset clears transient origin and Follow choices while Stop restores real drafts and saved journey',async()=>{
 const a=await createApp({settings:{provider:'tfl',signal:true,followRoute:true},saved:{dest:'Original private destination'},settle:150});apps.push(a);
 await until(()=>a.d.querySelector('[data-follow]'),'real journey Follow option');a.d.querySelector('[data-follow]').click();
 const originalFollow=plain(a.c.state.saved.followRoute);a.c.state.origin='51.4966,-0.1764';a.d.querySelector('#originInput').value='Original private draft';a.original=a.w.localStorage.getItem('cartrefCommute.v1');
 click(a,'journeySimulatorBtn');click(a,'journeyStart');await until(()=>view(a).active&&!view(a).verification.pending,'guided start');
 const choice=[...a.d.querySelectorAll('[data-follow]')].find(b=>a.c.followChoices.get(b.dataset.follow)?.train?.serviceId?.startsWith('SIM'));assert.ok(choice);choice.click();
 assert.ok(a.c.state.saved.followRoute);a.c.state.origin='51.5000,-0.1000';a.d.querySelector('#originInput').value='Synthetic origin';
 click(a,'simToggle');click(a,'journeyResetState');await checked(a);
 assert.equal(a.c.state.saved.followRoute,undefined);assert.equal(a.c.state.origin,'');assert.equal(a.d.querySelector('#originInput').value,'');
 click(a,'simExit');assert.deepEqual(plain(a.c.state.saved.followRoute),originalFollow);assert.equal(a.c.state.origin,'51.4966,-0.1764');assert.equal(a.d.querySelector('#originInput').value,'Original private draft');
 assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),a.original);await sleep(350);assert.deepEqual(a.errors,[]);
});
