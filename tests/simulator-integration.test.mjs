import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,sleep} from './harness.mjs';
after(closeAll);

async function settings(a,gps,feeds){
 a.d.querySelector('#settingsBtn').click();
 a.d.querySelector('#s_simulator').checked=gps;
 a.d.querySelector('#s_simulatedFeeds').checked=feeds;
 a.d.querySelector('#settingsForm').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));
 await sleep(30);
}
function select(a,id,value){const e=a.d.querySelector('#'+id);e.value=value;e.dispatchEvent(new a.w.Event('change'));}
function click(a,id){a.d.querySelector('#'+id).click();}
function playbackScheduler(a){
 const nativeSet=a.w.setInterval.bind(a.w),nativeClear=a.w.clearInterval.bind(a.w),tasks=new Map();let serial=100000;
 a.w.setInterval=(fn,ms)=>{if(ms!==1000)return nativeSet(fn,ms);const id=serial++;tasks.set(id,fn);return id;};
 a.w.clearInterval=id=>{if(!tasks.delete(id))nativeClear(id);};
 return {tasks,step(){for(const fn of [...tasks.values()])fn();}};
}
async function nextCheckpoint(a,scheduler){
 click(a,'simContinue');assert.equal(scheduler.tasks.size,1,'Continue schedules playback');
 let steps=0;while(scheduler.tasks.size&&steps++<2000)scheduler.step();
 assert.ok(steps<2000,'playback reached checkpoint');assert.equal(scheduler.tasks.size,0,'checkpoint clears playback timer');
 assert.match(a.text('#simStatus'),/^Paused at/);await sleep(5);
}

for(const route of ['kgx','far'])for(const direction of ['outbound','return']){
 test(`simulator app: ${direction} ${route} traverses every checkpoint and freezes`,async()=>{
  const a=await createApp({settings:{provider:'rdm',rdmKey:'test'},settle:60});
  await settings(a,true,true);select(a,'simPath',route);select(a,'simDirection',direction);select(a,'simSpeed','20');
  const scheduler=playbackScheduler(a);click(a,'simPlay');await sleep(10);
  const sim=a.c.simulator;assert.ok(sim,'real page exposes simulator inspection API');
  const total=sim.route().length;assert.ok(total>=13);
  const initialCalls=a.calls.length;
  const baseline=a.w.localStorage.getItem('cartrefCommute.v1');
  assert.equal(a.c.direction(),direction==='outbound'?'office':'home');
  const seen=[];let tubeVehicle=null;
  for(let i=0;i<total;i++){
   assert.equal(sim.sim.index,i);assert.equal(sim.sim.timer,null);
   const instant=a.c.simClock.now();await sleep(2);
   assert.equal(a.c.simClock.now(),instant,'paused clock stays exactly frozen');
   assert.match(a.text('#simCheckpoint'),new RegExp(`${i+1}/${total}`));
   const checkpoint=a.text('#simCheckpoint');seen.push(checkpoint);
   if(checkpoint.includes('Travelling to Letchworth'))assert.ok(a.c.onWay(),'real engine recognises walk to station');
   if(checkpoint.includes('Stevenage')){
    await a.c.refresh({force:true});await sleep(10);
    assert.equal(a.c.state.onLine,true,'GPS movement establishes rail travel');
    const match=a.c.whichTrain(a.c.simClock.now());assert.ok(match&&!match.none);
    const expected=(route==='kgx'?'SIM-GN':'SIM-TL')+(direction==='return'?'-HOME':'')+(route==='kgx'?(direction==='return'?'-1617':'-0905'):(direction==='return'?'-1620':'-0912'));
    assert.equal(match.t.serviceId,expected,'actual train identified for route and direction');assert.match(a.text('#hero'),/On the train/,'real card shows rail travel');
   }
   if(checkpoint.includes('Walk to Underground platforms')||checkpoint.includes('At Aldgate westbound platforms')){
    await a.c.refresh({force:true});await sleep(10);a.c.render();
    const boardAt=a.c.simulator.route()[i+1].at*60000+a.c.simulator.getScenario().startTime;
    const picks=[...a.d.querySelectorAll('[data-tubepick]')];
    const pick=picks.find(b=>Math.abs(Number(b.dataset.tubepick.split('|')[1])-boardAt)<1000);
    assert.ok(pick,'actual platform controls offer scenario vehicle');tubeVehicle=pick.dataset.tubepick.split('|')[3];pick.click();
   }
   if(checkpoint.includes('Board eastbound Underground')){
    a.d.querySelector('#simLat').value='51.5142';a.d.querySelector('#simLon').value='-0.0755';a.d.querySelector('#simAccuracy').value='1400';click(a,'simApply');
    const roughRide=a.c.currentRide(a.c.simClock.now());assert.ok(roughRide,'poor GPS near destination cannot manufacture alighting');assert.equal(roughRide.vehicle,tubeVehicle);a.d.querySelector('#simAccuracy').value='12';
   }
   if(checkpoint.includes('Barbican')){
    const ride=direction==='outbound'?a.c.currentRide(a.c.simClock.now()):a.c.homeRide(a.c.simClock.now());
    assert.ok(ride,'application maintains an Underground ride at Barbican');assert.equal(ride.vehicle,tubeVehicle,'actual ride keeps selected TfL vehicle');
   }
   if(checkpoint.includes('Waiting at King'))assert.equal(a.c.hubHere(),'KGX');
   if(checkpoint.includes('Alight at Farringdon')){
    assert.equal(a.c.hubHere(),'ZFD');
    if(direction==='return'&&a.c.homeRide(a.c.simClock.now())){
     // Farringdon is also a passing point on the faster King's Cross option. Confirm the
     // actual station using the same alighting choice a passenger sees in the real app.
     const off=[...a.d.querySelectorAll('[data-ride="off"]')].find(b=>b.textContent.includes('Farringdon'));assert.ok(off,'real screen offers the alternative alighting station');off.click();await a.c.refresh({force:true});await sleep(10);
    }
   }
   if(checkpoint.includes('Waiting on northbound Thameslink platform')){assert.equal(a.c.state.atHub,'ZFD');assert.equal(a.c.homeRide(a.c.simClock.now()),null,'confirmed alighting ends the actual ride');assert.doesNotMatch(a.text('#hero'),/^On the tube/);}

   if(checkpoint.includes('Alight at Aldgate')){assert.equal(a.c.onTube(a.c.simClock.now()),false,'arrival fix ends actual Underground ride');assert.equal(a.c.inLondonToOffice(a.c.simClock.now()),true,'actual engine now plans office walk');}
   if(direction==='return'&&checkpoint.includes('Nearly home'))assert.match(a.text('#hero'),/Nearly home/);
   if(direction==='return'&&checkpoint.includes('Arrive home'))assert.match(a.text('#hero'),/You're home/);
   if(checkpoint.includes('Arrive at office'))assert.match(a.text('#hero'),/At the office|arrived/);
   if(checkpoint.includes('Office dwell'))assert.equal(a.c.direction(),'home','office dwell turns journey around');
   if(i<total-1)await nextCheckpoint(a,scheduler);
  }
  assert.ok(seen.some(x=>x.includes('Barbican')));assert.ok(seen.some(x=>x.includes('Stevenage')));
  const expected=direction==='outbound'?[51.5139,-.071]:[51.975,-.23];
  assert.ok(Math.abs(a.c.state.here[0]-expected[0])<.00001);
  assert.equal(a.calls.length,initialCalls,'synthetic playback makes no live network calls');
  assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),baseline,'no simulated journey persistence');
  assert.deepEqual(a.errors,[]);
  await sleep(350);a.close();
 });
}

test('simulator app: 1x 5x and 20x advance the shared clock at selected speed and pause immediately',async()=>{
 const a=await createApp({settle:60});await settings(a,true,true);const scheduler=playbackScheduler(a);
 for(const speed of [1,5,20]){
  select(a,'simSpeed',String(speed));click(a,'simPlay');const before=a.c.simClock.now();
  click(a,'simContinue');scheduler.step();assert.equal(a.c.simClock.now()-before,speed*1000);
  click(a,'simPause');assert.equal(scheduler.tasks.size,0);const paused=a.c.simClock.now();await sleep(10);assert.equal(a.c.simClock.now(),paused);
  await nextCheckpoint(a,scheduler);assert.equal(a.c.simulator.sim.index,1);assert.equal(a.c.simClock.now()-before,8*60000,'each speed lands exactly on checkpoint');
 }
 await sleep(350);a.close();
});

test('simulator app: coarse manual fixes reach real inference and precise recovery restores a station',async()=>{
 const a=await createApp({settle:60});await settings(a,true,true);
 select(a,'simAccuracyMode','manual');a.d.querySelector('#simLat').value='51.53197';a.d.querySelector('#simLon').value='-0.12341';a.d.querySelector('#simAccuracy').value='1400';click(a,'simApply');
 assert.equal(a.c.state.locAcc,1400);assert.equal(a.c.hubHere(),null,'coarse indoor fix cannot identify station');assert.equal(a.c.state.onLine,false,'coarse fix cannot invent boarding');
 a.d.querySelector('#simAccuracy').value='15';click(a,'simApply');assert.equal(a.c.state.locAcc,15);assert.equal(a.c.hubHere(),'KGX');
 a.d.querySelector('#simAccuracy').value='-1';click(a,'simApply');assert.equal(a.c.state.locAcc,15,'invalid accuracy is rejected');assert.match(a.text('#simStatus'),/Invalid/);
 await sleep(350);a.close();
});

test('simulator app: pending and permission denied GPS scenarios use normal location presentation',async()=>{
 const a=await createApp({settle:60});await settings(a,true,true);
 select(a,'simScenario','awaiting-location');click(a,'simPlay');assert.equal(a.c.state.here,null);assert.equal(a.c.state.locStatus,'pending');assert.equal(a.c.state.autoDir,null);
 select(a,'simScenario','permission-denied');click(a,'simPlay');assert.equal(a.c.state.locStatus,'denied');assert.equal(a.c.state.here,null);assert.match(a.text('#simFixStatus'),/permission denied/i);
 select(a,'simScenario','normal');click(a,'simPlay');assert.equal(a.c.state.locStatus,'ok');assert.ok(a.c.state.here);
 await sleep(350);a.close();
});

test('simulator app: GPS-only and feed-only are independent and both disabled restore normal operation',async()=>{
 const a=await createApp({settle:60});await settings(a,true,false);click(a,'simPlay');
 assert.equal(a.c.simClock.active,false);assert.ok(a.c.state.here);
 await settings(a,false,true);assert.equal(!!a.c.S().simulatorEnabled,false);assert.equal(a.c.simClock.active,true);
 const prior=a.calls.length;await a.c.fetchT('https://api.tfl.gov.uk/Line/metropolitan/Status');assert.equal(a.calls.length,prior);
 await settings(a,false,false);assert.equal(a.c.simClock.active,false);assert.equal(a.c.simulator.sim.active,false);assert.equal(a.d.querySelector('#simPanel').hidden,true);
 const before=a.calls.length;await a.c.fetchT('https://api.tfl.gov.uk/Line/metropolitan/Status');assert.equal(a.calls.length,before+1);
 await sleep(350);a.close();
});

for(const scenario of ['normal','later-train','wrong-train','delay']){
 test(`simulator app: ${scenario} identifies the passenger train from GPS and Darwin with competitors`,async()=>{
  const a=await createApp({settings:{provider:'rdm',rdmKey:'test'},settle:60});await settings(a,true,true);
  select(a,'simScenario',scenario);select(a,'simSpeed','20');const scheduler=playbackScheduler(a);click(a,'simPlay');
  while(!a.text('#simCheckpoint').includes('Stevenage'))await nextCheckpoint(a,scheduler);
  await a.c.refresh({force:true});await sleep(20);
  assert.equal(a.c.state.onLine,true,'real movement inference recognises rail travel');
  const match=a.c.whichTrain(a.c.simClock.now());
  assert.ok(match&&!match.none,'production engine finds a train');
  const later=['later-train','wrong-train'].includes(scenario);
  assert.equal(match.t.serviceId,later?'SIM-GN-LATER-0917':'SIM-GN-0905');
  assert.ok(Object.values(a.c.state.boards).flatMap(b=>b?.services||[]).some(t=>t.serviceId===(later?'SIM-GN-0905':'SIM-GN-LATER-0917')),'alternative train remains in actual boards');
  if(scenario==='delay')assert.ok(match.t.dep-match.t.scheduledDep>=8*60000||a.text('#main').includes('late')||a.d.body.textContent.includes('late'));
  assert.deepEqual(a.errors,[]);await sleep(350);a.close();
 });
}

test('simulator app: cancelled departure stays visible and replans to an available service',async()=>{
 const a=await createApp({settings:{provider:'rdm',rdmKey:'test'},settle:60});await settings(a,true,true);select(a,'simScenario','cancellation');select(a,'simSpeed','20');const scheduler=playbackScheduler(a);click(a,'simPlay');
 while(!a.text('#simCheckpoint').includes('Waiting at Letchworth'))await nextCheckpoint(a,scheduler);
 await a.c.refresh({force:true});await sleep(20);
 const trains=Object.values(a.c.state.boards||{}).flatMap(b=>b?.services||[]);
 assert.ok(trains.some(t=>t.serviceId==='SIM-GN-0905'&&t.cancelled));assert.ok(trains.some(t=>!t.cancelled));
 assert.match(a.d.body.textContent,/cancelled/i);assert.ok(a.c.ranked(a.c.simClock.now()).some(j=>!j.train.cancelled),'planner has a usable alternative');
 await sleep(350);a.close();
});

test('simulator app: nearby departures remain uncertain and manual train selection uses real pick controls',async()=>{
 const a=await createApp({settings:{provider:'rdm',rdmKey:'test'},settle:60});await settings(a,true,true);select(a,'simScenario','uncertain');select(a,'simSpeed','20');const scheduler=playbackScheduler(a);click(a,'simPlay');
 while(!a.text('#simCheckpoint').includes('Stevenage'))await nextCheckpoint(a,scheduler);
 await a.c.refresh({force:true});await sleep(20);a.c.render();
 const match=a.c.whichTrain(a.c.simClock.now());assert.ok(match&&!match.none);assert.equal(!!match.sure,false,'close competitors cannot produce certain identity');
 const buttons=[...a.d.querySelectorAll('[data-pick]')];assert.ok(buttons.length>=2,'real screen offers train identity choice');
 const chosen=buttons.find(b=>b.dataset.pick.endsWith('SIM-GN-LATER-0917'));assert.ok(chosen);chosen.click();
 assert.equal(a.c.state.trainLock.serviceId,'SIM-GN-LATER-0917');assert.equal(a.c.state.trainLock.picked,true);
 const picked=a.c.whichTrain(a.c.simClock.now());assert.equal(picked.t.serviceId,'SIM-GN-LATER-0917');assert.equal(picked.picked,true);
 await sleep(350);a.close();
});

test('simulator app: provider outage retains usable state and recovers during playback',async()=>{
 const a=await createApp({settings:{provider:'rdm',rdmKey:'test'},settle:60});await settings(a,true,true);select(a,'simScenario','outage');select(a,'simSpeed','20');const scheduler=playbackScheduler(a);click(a,'simPlay');await sleep(20);
 assert.ok(a.c.state.boards);
 while(!a.text('#simCheckpoint').includes('Waiting at Letchworth'))await nextCheckpoint(a,scheduler);
 await a.c.refresh({force:true});await sleep(20);assert.ok(a.c.state.errors.length,'outage reaches actual application errors');
 while(!a.text('#simCheckpoint').includes('Approaching'))await nextCheckpoint(a,scheduler);
 await a.c.refresh({force:true});await sleep(20);assert.equal(a.c.state.railSource,'darwin');assert.ok(Object.values(a.c.state.boards).some(b=>b?.services?.length),'recovered provider supplies real parsed boards');
 assert.equal(a.c.state.darwinFailed,false);await sleep(350);a.close();
});

test('simulator app: arrival-by and leave-around plan from synthetic providers',async()=>{
 const a=await createApp({settings:{provider:'rdm',rdmKey:'test'},settle:60});await settings(a,true,true);click(a,'simPlay');await a.c.refresh({force:true});await sleep(20);
 for(const [view,time,run,result] of [['by','11:00','planBy','byOptions'],['at','09:00','planAt','atOptions']]){
  a.d.querySelector(`[data-view="${view}"]`).click();a.d.querySelector('#byDate').value='2026-11-03';a.d.querySelector('#byTime').value=time;
  await a.c[run]();await sleep(20);const options=a.c[result]();assert.ok(options.length,'actual '+view+' plan offers journeys');assert.ok(options.some(j=>j.train.serviceId?.startsWith('SIM-')),'plan uses simulated Darwin services');
 }
 await sleep(350);a.close();
});

test('simulator app: reload and background resume keep simulation session isolated',async()=>{
 const a=await createApp({settle:60});await settings(a,true,true);click(a,'simPlay');const instant=a.c.simClock.now(),saved=a.w.localStorage.getItem('cartrefCommute.v1');
 a.d.dispatchEvent(new a.w.Event('visibilitychange'));await sleep(30);assert.equal(a.c.simClock.now(),instant,'resume cannot unfreeze virtual time');assert.equal(a.c.simulator.sim.timer,null);
 const data=JSON.parse(saved);const b=await createApp({settings:data.settings,saved:data,settle:60});assert.equal(b.c.simulator.sim.active,false,'new page never resumes a simulated journey');assert.equal(b.c.simClock.active,false,'reload restores real time');assert.equal(!!b.c.S().simulatedFeeds,false,'reload does not retain synthetic feeds');
 assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),saved);await sleep(350);a.close();b.close();
});

test('simulator app: rail identity remains coherent through midnight',async()=>{
 const a=await createApp({settings:{provider:'rdm',rdmKey:'test'},settle:60});await settings(a,true,true);select(a,'simDate','2026-11-03T23:44');select(a,'simSpeed','20');const scheduler=playbackScheduler(a);click(a,'simPlay');
 while(!a.text('#simCheckpoint').includes('Stevenage'))await nextCheckpoint(a,scheduler);
 await a.c.refresh({force:true});await sleep(20);assert.equal(new a.w.Date(a.c.simClock.now()).getUTCDate(),4);
 const match=a.c.whichTrain(a.c.simClock.now());assert.ok(match&&!match.none);assert.equal(match.t.serviceId,'SIM-GN-0905');assert.equal(new a.w.Date(match.t.dep).getUTCDate(),4,'Darwin departure is on next calendar day');
 await sleep(350);a.close();
});

test('simulator app: alternative London origin uses real leisure journey planning',async()=>{
 const a=await createApp({settings:{provider:'rdm',rdmKey:'test',anyPlace:true},settle:60});await settings(a,true,true);select(a,'simDirection','return');click(a,'simPlay');
 a.d.querySelector('[data-mode="leisure"]').click();
 a.d.querySelector('#originInput').value='Science Museum';a.d.querySelector('#originRow').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));
 await a.c.refresh({force:true});await sleep(100);
 assert.ok(a.c.state.london,'alternative origin response passes into real leisure planner');assert.ok(a.c.state.london.KXSP&&a.c.state.london.FAR,'both London stations remain possible');assert.ok(a.c.state.london.KXSP.dur>0);assert.ok(a.c.state.london.FAR.dur>0);
 const options=a.c.ranked(a.c.simClock.now());assert.ok(options.length,'real leisure ranking includes rail options');assert.ok(options.every(j=>j.arrive>j.leave));
 await sleep(350);a.close();
});

test('simulator app: missed Underground connection keeps original departures and offers the next vehicle',async()=>{
 const a=await createApp({settings:{provider:'rdm',rdmKey:'test'},settle:60});await settings(a,true,true);select(a,'simScenario','missed-connection');select(a,'simSpeed','20');const scheduler=playbackScheduler(a);click(a,'simPlay');
 while(!a.text('#simCheckpoint').includes('Walk to Underground platforms'))await nextCheckpoint(a,scheduler);
 await a.c.refresh({force:true});await sleep(20);a.c.render();
 const original=[...a.d.querySelectorAll('[data-tubepick]')].map(b=>b.dataset.tubepick.split('|')).sort((a,b)=>Number(a[1])-Number(b[1]));assert.ok(original.length>=2);
 const delayedBoard=a.c.simulator.getScenario().startTime+a.c.simulator.route()[a.c.simulator.sim.index+1].at*60000;
 assert.ok(original.some(p=>Number(p[1])<delayedBoard),'original departure remains visible before passenger misses it');
 await nextCheckpoint(a,scheduler);await a.c.refresh({force:true});await sleep(20);a.c.render();
 const next=[...a.d.querySelectorAll('[data-tubepick]')].find(b=>Number(b.dataset.tubepick.split('|')[1])>=a.c.simClock.now());assert.ok(next,'actual app still offers a reachable departure');
 next.click();assert.ok(a.c.state.saved.tubePick||a.c.state.saved.tubeRide);
 await sleep(350);a.close();
});

test('simulator app: platform changes and Underground disruption reach normal application warnings',async()=>{
 const a=await createApp({settings:{provider:'rdm',rdmKey:'test'},settle:60});await settings(a,true,true);select(a,'simScenario','platform-change');click(a,'simPlay');select(a,'simPreset','let');click(a,'simJump');await a.c.refresh({force:true});await sleep(30);a.c.render();
 const changed=Object.values(a.c.state.boards||{}).flatMap(b=>b?.services||[]).find(t=>t.serviceId==='SIM-GN-0905');assert.ok(changed);assert.equal(changed.platform,'4');assert.match(a.d.body.textContent,/Platform\s*4/i);
 select(a,'simScenario','disruption');click(a,'simPlay');await a.c.refresh({force:true,manual:true});await sleep(30);a.c.render();assert.ok(a.c.state.status.some(l=>l.id==='metropolitan'&&l.statuses.some(s=>s.sev===6)));assert.match(a.d.body.textContent,/Severe Delays|Synthetic signal failure/i);
 await sleep(350);a.close();
});

test('simulator app: a confirmed train conflicting with reported position is retained with an explicit warning',async()=>{
 const a=await createApp({settings:{provider:'rdm',rdmKey:'test'},settle:60});await settings(a,true,true);select(a,'simScenario','wrong-train');select(a,'simSpeed','20');const scheduler=playbackScheduler(a);click(a,'simPlay');
 while(!a.text('#simCheckpoint').includes('Stevenage'))await nextCheckpoint(a,scheduler);
 await a.c.refresh({force:true});await sleep(20);a.c.render();
 assert.equal(a.c.whichTrain(a.c.simClock.now()).t.serviceId,'SIM-GN-LATER-0917');
 const expected=[...a.d.querySelectorAll('[data-pick]')].find(b=>b.dataset.pick.endsWith('|SIM-GN-0905'));assert.ok(expected,'the expected earlier train remains available for explicit selection');expected.click();
 const selected=a.c.whichTrain(a.c.simClock.now());assert.equal(selected.t.serviceId,'SIM-GN-0905','user selection is retained');assert.equal(selected.picked,true);
 assert.equal(selected.conflict,true,'reported position contradicts the confirmed train');assert.match(a.text('#hero'),/does not match|doesn't match|conflict|contradict/i,'actual journey card warns about contradictory evidence');
 await sleep(350);a.close();
});
