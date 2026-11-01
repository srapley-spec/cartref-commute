// Independent review of the simulator against the released train-stop speed watch.
// All stops are inferred by the genuine position handler from sequential GPS observations.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,sleep} from './harness.mjs';
const apps=[];
after(async()=>{for(const a of apps)if(a.c?.simulator?.sim.active)a.c.simulator.simStop({resume:false});await sleep(350);closeAll();});
const plain=value=>JSON.parse(JSON.stringify(value));
const click=(a,id)=>{const e=a.d.getElementById(id);assert.ok(e,'missing '+id);e.click();};
const choose=(a,id,value)=>{const e=a.d.getElementById(id);e.value=value;e.dispatchEvent(new a.w.Event('change',{bubbles:true}));};
const view=a=>a.c.simulator.getView();
async function until(check,why){for(let n=0;n<1200;n++){if(check())return;await sleep(10);}assert.fail(why);}
async function settled(a){await until(()=>!a.c.state.loading&&!a.c.state.again,'normal provider work settles');await sleep(10);}
async function checked(a){await until(()=>!view(a).verification.pending&&view(a).verification.current?.index===view(a).index,'checkpoint observation settles');}
async function begin(a,direction,route){click(a,'journeySimulatorBtn');choose(a,'journeyDirection',direction);choose(a,'journeyRoute',route);click(a,'journeyStart');await until(()=>a.c.simulator.sim.active&&a.d.getElementById('simPanel').hidden,'guided Start collapses');await checked(a);}
async function next(a){const i=view(a).index;click(a,'journeyNext');await until(()=>view(a).index===i+1,'sequential next checkpoint');await checked(a);}
function chooseRealTube(a){
 const v=view(a),p=v.checkpoints[v.index];
 if(p.label==='At Aldgate westbound platforms'){
  const dep=v.startTime+v.checkpoints[v.index+1].at*60000;
  const b=[...a.d.querySelectorAll('[data-tubepick]')].find(e=>Math.abs(Number(e.dataset.tubepick.split('|')[1])-dep)<1000);assert.ok(b,'actual app offers the passenger tube');b.click();
 }
 if(p.label==='Alight at Farringdon'){
  const off=[...a.d.querySelectorAll('[data-ride="off"]')].find(e=>e.textContent.includes('Farringdon'));if(off)off.click();
 }
}

for(const direction of ['outbound','return'])for(const route of ['kgx','far']){
 test(`independent train-stop simulation: ${direction} ${route} uses rail speed until real alighting, freezes and resets`,async()=>{
  const a=await createApp({settings:{provider:'rdm',rdmKey:'stop-review-fixture'},settle:120});apps.push(a);await begin(a,direction,route);
  const destination=direction==='outbound'?(route==='kgx'?'kgx':'far'):'let';let waited=false;
  while(!(view(a).checkpoints[view(a).index].point===destination&&view(a).checkpoints[view(a).index].label.startsWith('Alight'))){
   const v=view(a),p=v.checkpoints[v.index],upcoming=v.checkpoints[v.index+1];
   if(!waited&&p.label.startsWith('Waiting')&&upcoming?.mode==='rail'){
    const boarding=v.startTime+upcoming.at*60000,position=JSON.stringify(a.c.state.here);a.c.simulator.tick(20);await settled(a);
    assert.ok(a.c.simClock.now()<boarding,'this is still before scheduled boarding');assert.equal(JSON.stringify(a.c.state.here),position,'waiting remains at the same station coordinate');
    assert.equal(a.c.state.stopWatch?.fastAt??null,null,'stationary waiting cannot fabricate a train-speed reading before departure');assert.equal(a.c.state.stopWatch?.moving,false);waited=true;
   }
   chooseRealTube(a);await next(a);
  }
  assert.equal(waited,true,'the route exercised stationary waiting before boarding');
  const v=view(a),now=a.c.simClock.now(),watch=a.c.state.stopWatch;
  assert.equal(watch.stoppedAt,now,'the normal engine observes the train stop at the alighting checkpoint');
  assert.equal(watch.moving,false);assert.ok(watch.fastAt<=now&&now-watch.fastAt<=60000,'a real recent train-speed fix supports the stop');
  const expected=(route==='kgx'?'SIM-GN':'SIM-TL')+(direction==='return'?'-HOME':'')+(route==='kgx'?(direction==='return'?'-1617':'-0905'):(direction==='return'?'-1620':'-0912'));
  const trains=Object.values(a.c.state.boards||{}).flatMap(b=>b?.services||[]),service=trains.find(t=>t.serviceId===expected&&t.to===(direction==='return'?'LET':route==='kgx'?'KGX':'ZFD'));
  assert.ok(service,'the actual parsed provider has the passenger train');assert.equal(service.arr,now,'Darwin arrival and GPS stop use the same virtual instant');
  if(direction==='outbound'){
   const observed=view(a).verification.current;assert.equal(observed.assertions.find(row=>row.id==='station-stop-clock')?.status,'PASS','the visible runtime assertion verifies the genuine stop instant');assert.equal(observed.assertions.find(row=>row.id==='rail-arrival-clock')?.status,'PASS','the runtime assertion verifies actual parsed Darwin arrival');
   assert.equal(a.c.state.atHub,route==='kgx'?'KGX':'ZFD');assert.equal(a.c.state.hubSince.stopped,now,'real station visit uses the observed stop');assert.equal(a.c.state.saved.hubSince.stopped,now,'the isolated visit records the same stop');
  }else{
   assert.equal(a.c.state.atHub,null,'arrival home is not a new London hub');assert.equal(a.c.state.hubSince?.stopped??null,null,'Letchworth stop is never attached to the old London visit');
  }
  const before=JSON.stringify({watch:a.c.state.stopWatch,visit:a.c.state.hubSince}),instant=now;await sleep(30);
  assert.equal(a.c.simClock.now(),instant);assert.equal(JSON.stringify({watch:a.c.state.stopWatch,visit:a.c.state.hubSince}),before,'paused device time does not alter stop chronology');assert.equal(a.c.simulator.sim.timer,null);
  a.c.simulator.restart();await checked(a);assert.equal(a.c.state.stopWatch?.stoppedAt??null,null,'Restart forgets the previous simulated stop');assert.equal(a.c.state.stopWatch?.fastAt??null,null,'Restart forgets the previous fast reading');assert.equal(a.c.state.saved.hubSince?.stopped??null,null);
  assert.deepEqual(a.errors,[]);
 });
}

test('independent train-stop simulation: Stop restores a real saved stop before resumed native station fixes',async()=>{
 const now=Date.parse('2026-11-03T10:00:00Z'),visit={hub:'KGX',at:now-180000,stopped:now-120000,away:now-240000};
 const a=await createApp({now,saved:{dirMode:'office',hubSince:visit},settings:{provider:'tfl'},geo:{coords:{latitude:51.53197,longitude:-.12341,accuracy:12}},settle:200});apps.push(a);await settled(a);
 assert.equal(a.c.state.hubSince.stopped,visit.stopped);const original=plain(a.c.state.saved.hubSince);
 for(const exit of ['dock','settings']){
  await begin(a,'outbound','far');assert.equal(a.c.state.saved.hubSince,undefined,'real stop is excluded from simulation');
  if(exit==='dock')click(a,'simExit');
  else{click(a,'settingsBtn');a.d.getElementById('s_simulator').checked=false;a.d.getElementById('s_simulatedFeeds').checked=false;a.d.getElementById('settingsForm').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));}
  await sleep(150);await settled(a);
  assert.equal(a.c.simClock.active,false);assert.equal(a.c.state.atHub,'KGX','real native GPS resumes at the original station');
  assert.equal(a.c.state.hubSince.stopped,original.stopped,exit+': resuming normal GPS must keep the real stopped-at timestamp');
  assert.equal(a.c.state.saved.hubSince.stopped,original.stopped);assert.equal(JSON.parse(a.w.localStorage.getItem('cartrefCommute.v1')).hubSince.stopped,original.stopped,'synthetic reset cannot overwrite the real saved stop');
 }
 assert.equal(a.c.state.stopWatch?.stoppedAt??null,null,'no synthetic speed watch escapes into real operation');assert.deepEqual(a.errors,[]);
});

test('independent simulation isolation: real planning dates and runtime origin return after dock Stop and source disable',async()=>{
 const results=[],expected=[];
 for(const question of ['by','at'])for(const exit of ['dock','settings']){
  const a=await createApp({now:Date.parse('2026-11-03T10:00:00Z'),saved:{mode:'leisure',dirMode:'home'},settings:{provider:'tfl',tflKey:'input-review-fixture',followRoute:false,anyPlace:true},geo:{coords:{latitude:51.515,longitude:-.08,accuracy:12}},settle:150,
   route:url=>url.includes('/JourneyResults/')&&!url.includes('timeIs=')?{ok:true,status:200,json:async()=>({journeys:[{duration:12,arrivalDateTime:'2026-11-03T10:12:00Z',legs:[{mode:{id:'walking'},duration:12}]}]})}:undefined});apps.push(a);await settled(a);
  const submit=(id)=>a.d.getElementById(id).dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));
  a.d.getElementById('originInput').value='Aldgate';submit('originRow');await sleep(30);
  a.d.querySelector('[data-view="'+question+'"]').click();choose(a,'byDate','2026-11-05');choose(a,'byTime','11:23');await sleep(70);await settled(a);
  const unsaved='Input-review private draft origin';a.d.getElementById('originInput').value=unsaved;
  const original={date:a.d.getElementById('byDate').value,time:a.d.getElementById('byTime').value,origin:a.c.state.origin,originInput:a.d.getElementById('originInput').value,destInput:a.d.getElementById('destInput').value};
  assert.equal(a.c.state[question]?.T,Date.parse('2026-11-05T11:23:00Z'),'normal app has the original actual planning question');
  await begin(a,'outbound','kgx');a.c.simulationReporter.recordEvent({sessionId:a.c.simulator.sim.sessionId,type:'review',message:'Example parser diagnostic '+unsaved});assert.equal(a.c.simulationReporter.serialize().includes(unsaved),false,'original unsubmitted location text is private during simulation');
  a.d.querySelector('[data-mode="leisure"]').click();a.d.querySelector('[data-dir="office"]').click();a.d.getElementById('destInput').value='Science Museum';submit('destRow');
  a.d.querySelector('[data-dir="home"]').click();a.d.getElementById('originInput').value='Science Museum';submit('originRow');
  a.d.querySelector('[data-view="'+question+'"]').click();choose(a,'byDate','2026-11-08');choose(a,'byTime','14:47');await sleep(70);await settled(a);
  assert.equal(a.c.state.origin,'Science Museum');assert.equal(a.d.getElementById('byDate').value,'2026-11-08');
  if(exit==='dock')click(a,'simExit');else{click(a,'settingsBtn');a.d.getElementById('s_simulator').checked=false;a.d.getElementById('s_simulatedFeeds').checked=false;submit('settingsForm');}
  await sleep(180);await settled(a);
  const actual={question,exit,date:a.d.getElementById('byDate').value,time:a.d.getElementById('byTime').value,origin:a.c.state.origin,originInput:a.d.getElementById('originInput').value,destInput:a.d.getElementById('destInput').value,target:a.c.state[question]?.T??null};
  results.push(actual);expected.push({question,exit,...original,target:Date.parse('2026-11-05T11:23:00Z')});
  assert.equal(a.c.simulationReporter.serialize().includes(unsaved),false,'original private-input knowledge survives snapshot restoration');
  assert.equal(a.c.state.saved.view,question);assert.equal(a.c.simClock.active,false);assert.deepEqual(a.errors,[]);
 }
 console.log('Independent real input restoration:',JSON.stringify({actual:results,expected}));
 assert.deepEqual(results,expected,'Stop/source disable restores DOM inputs, runtime origin and the actual planning question, not only saved preferences');
});
