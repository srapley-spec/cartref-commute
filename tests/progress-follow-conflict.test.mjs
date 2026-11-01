import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,sleep} from './harness.mjs';

const apps=[];
after(async()=>{for(const a of apps)if(a.c.simulator.sim.active)a.c.simulator.simStop({resume:false});await sleep(350);closeAll();});
async function until(check){for(let n=0;n<1200;n++){if(check())return;await sleep(10);}assert.fail('checkpoint did not settle');}
const view=a=>a.c.simulator.getView();
async function settled(a){await until(()=>!a.c.state.loading&&!a.c.state.again&&!view(a).verification.pending&&view(a).verification.current?.index===view(a).index);}

for(const signal of [false,true])for(const route of ['kgx','far']){
 test(`progress keeps the actual ${route} train reports while following a later service in ${signal?'Signal':'Panda'}`,async()=>{
  const a=await createApp({settings:{provider:'rdm',rdmKey:'fixture-only',signal,followRoute:true,alongLine:true},settle:120});apps.push(a);
  a.d.getElementById('journeySimulatorBtn').click();
  const choice=a.d.getElementById('journeyRoute');choice.value=route;choice.dispatchEvent(new a.w.Event('change',{bubbles:true}));
  a.d.getElementById('simDate').value='2026-11-03T06:30';
  a.d.getElementById('journeyStart').click();await settled(a);
  const actualId=route==='kgx'?'SIM-GN-0905':'SIM-TL-0912',laterId=route==='kgx'?'SIM-GN-LATER-0917':'SIM-TL-LATER-0927';
  const [key]=[...a.c.followChoices].find(([,o])=>o.train.serviceId===laterId)||[];assert.ok(key);
  const follow=[...a.d.querySelectorAll('#list [data-follow]')].find(b=>b.dataset.follow===key);assert.ok(follow);follow.click();await settled(a);
  while(view(a).index<5){
   await a.c.simulator.nextCheckpoint();await settled(a);
   if(view(a).index<4)continue;
   const s=a.c.state,m=s.rendered.progressModel;
   assert.equal(s.rendered.train.t.serviceId,actualId,'normal GPS/feed inference identifies the actual service');
   assert.equal(s.followUpdate.route.lastTrain.serviceId,laterId,'the separate passenger Follow choice is retained');
   assert.equal(m.source,'reported','following a different service must not discard this train’s fresh reports');
   assert.equal(m.current.kind,'rail');
   assert.equal(m.current.start,s.rendered.progress.train.dep,'the diagram uses this card’s departure');
   assert.equal(m.legs[0].state,'complete');assert.equal(m.legs.find(l=>l.kind==='rail').state,'current');
   assert.ok(m.fraction>0);
   for(const code of ['HIT','SVG'])assert.equal(m.calls.find(c=>c.code===code)?.state,'reported',code+' actual report survives');
   assert.equal(view(a).verification.current.status,'PASS');
   assert.equal(view(a).verification.current.assertions.find(r=>r.id==='rail-calling-reports')?.status,'PASS','runtime verification checks calling-point progress');
   if(signal){
    assert.equal(a.text('.jp-leg[data-state="complete"] .jp-leg-state'),'Done');
    assert.equal(a.text('.jp-leg[aria-current="step"] .jp-leg-state'),'Now');
    assert.equal(a.text('.jp-leg[aria-current="step"] .jp-leg-name'),'Train');
    assert.match(a.text('.jp-stop[data-code="HIT"]'),/Reported/);
   }
  }
  a.d.getElementById('alongEntry').click();
  assert.match(a.text('#alongStrip [data-point="station-HIT"]'),/Reported/,'Along the line consumes the same correct report in either design');
  assert.deepEqual(a.errors,[]);
 });
}
