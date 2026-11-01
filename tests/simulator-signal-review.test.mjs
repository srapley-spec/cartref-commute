// Independent integration review of the simulator against the newly released Signal/Follow shell.
// Exercises real controls and observes normal render outputs; never assigns a train or followed route.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,sleep} from './harness.mjs';
const apps=[];
after(async()=>{for(const a of apps)if(a.c?.simulator?.sim.active)a.c.simulator.simStop({resume:false});await sleep(350);closeAll();});
const click=(a,id)=>{const e=a.d.getElementById(id);assert.ok(e,'missing control '+id);e.click();};
const choose=(a,id,value)=>{const e=a.d.getElementById(id);assert.ok(e,'missing input '+id);e.value=value;e.dispatchEvent(new a.w.Event('change',{bubbles:true}));};
async function until(check,why){for(let n=0;n<1200;n++){if(check())return;await sleep(10);}assert.fail(why);}
const view=a=>a.c.simulator.getView();
async function checked(a){await until(()=>!view(a).verification.pending&&view(a).verification.current?.index===view(a).index,'normal checkpoint observation settles');return view(a).verification.current;}
async function start(route='kgx'){
 const a=await createApp({settings:{provider:'rdm',rdmKey:'review-fixture-secret',followRoute:true},settle:120});apps.push(a);
 click(a,'journeySimulatorBtn');choose(a,'journeyRoute',route);click(a,'journeyStart');await until(()=>a.c.simulator.sim.active&&a.d.getElementById('simPanel').hidden,'guided Start collapses');await checked(a);
 assert.equal(a.d.documentElement.dataset.design,'signal','guided Start preserves the real application design');assert.equal(a.c.S().followRoute,true,'guided Start preserves Follow capability');return a;
}
async function next(a){const i=view(a).index;click(a,'journeyNext');await until(()=>view(a).index===i+1,'one sequential checkpoint');return checked(a);}
function appControl(a,selector){const e=a.d.querySelector(selector);assert.ok(e,'genuine app control '+selector);e.click();}

test('independent Signal simulator: explicit Planner pin is inconclusive while tracking remains genuine and Return to Auto recovers',async()=>{
 const a=await start();while(view(a).checkpoints[view(a).index].point!=='north')await next(a);
 const observed=await checked(a);assert.ok(observed.assertions.some(row=>row.id==='rail-identity'&&row.status==='PASS'),'normal real inference identifies the synthetic passenger train');
 assert.equal(a.c.state.onLine,true);const lock=JSON.stringify(a.c.state.trainLock),instant=a.c.simClock.now(),session=a.c.simulator.sim.sessionId;
 appControl(a,'[data-journey-view="plan"]');await sleep(30);const pinned=await checked(a);
 assert.equal(a.c.state.presentation.mode,'plan');assert.equal(a.c.readSimulationActual().view,'plan-now');
 assert.equal(a.c.state.onLine,true,'the app still tracks travel while the user inspects planning');assert.equal(JSON.stringify(a.c.state.trainLock),lock,'pinning cannot assign a different train');
 assert.equal(pinned.status,'INCONCLUSIVE','a deliberate app Planner choice is not an inference defect or fabricated pass');assert.equal(pinned.assertions.some(row=>row.status==='FAIL'),false);
 click(a,'simToggle');click(a,'journeyAdvancedButton');click(a,'journeyTimelineToggle');
 assert.equal(a.c.simClock.now(),instant);assert.equal(a.c.simulator.sim.sessionId,session);assert.equal(a.c.state.presentation.mode,'plan','simulator inspection does not alter the real app view');
 appControl(a,'[data-journey-view="auto"]');await sleep(30);const recovered=await checked(a);
 assert.equal(a.c.state.presentation.mode,'auto');assert.equal(a.c.readSimulationActual().view,'on-train');assert.ok(recovered.assertions.some(row=>row.id==='rail-identity'&&row.status==='PASS'));
 assert.deepEqual(a.errors,[]);
});

test('independent Signal simulator: genuine followed Thameslink remains on rail through St Pancras and its actual panel is report evidence',async()=>{
 const a=await start('far');
 const [key]=[...a.c.followChoices].find(([,o])=>o.train.serviceId==='SIM-TL-0912')||[];assert.ok(key,'real application offers selected synthetic Thameslink');
 const button=[...a.d.querySelectorAll('[data-follow]:not([disabled])')].find(e=>e.dataset.follow===key);assert.ok(button);button.click();await sleep(30);await checked(a);
 assert.equal(a.c.state.saved.followRoute.lastTrain.serviceId,'SIM-TL-0912');assert.equal(a.d.getElementById('followPanel').hidden,false);
 let sawIdentity=false;
 while(view(a).checkpoints[view(a).index].point!=='stp'){
  const p=view(a).checkpoints[view(a).index],r=await checked(a);
  if(p.point==='north'){assert.ok(r.assertions.some(row=>row.id==='rail-identity'&&row.status==='PASS'));assert.equal(r.assertions.find(row=>row.id==='follow-phase')?.status,'PASS','the actual Follow panel must recognise the inferred train even with the richer on-train main view');sawIdentity=true;}
  await next(a);
 }
 assert.equal(sawIdentity,true);const actual=a.c.readSimulationActual(),result=await checked(a);
 assert.equal(actual.view,'on-train','a richer actual live view remains primary while Follow is shown separately');assert.equal(actual.onLine,true);assert.equal(actual.train.serviceId,'SIM-TL-0912');assert.equal(actual.follow.phase,'on-train');
 assert.equal(result.assertions.find(row=>row.id==='follow-phase')?.status,'PASS');assert.ok(result.assertions.some(row=>row.id==='rail-progress'&&row.status==='PASS'),'the runtime assertion observes real continued National Rail travel');assert.equal(result.assertions.some(row=>row.status==='FAIL'),false,'legitimate following presentation does not fail a headline assertion for another app view');
 const report=a.c.simulationReporter.getReport(),row=report.checkpoints.find(r=>r.index===view(a).index);
 assert.match(row.actualDisplay.followCard,/Following your route/,'export retains the actual Follow panel as evidence');assert.doesNotMatch(JSON.stringify(report),/review-fixture-secret/);
 const before=JSON.stringify({saved:a.c.state.saved,lock:a.c.state.trainLock,rendered:a.c.state.rendered,followUpdate:a.c.state.followUpdate});for(let n=0;n<5;n++)a.c.readSimulationActual();assert.equal(JSON.stringify({saved:a.c.state.saved,lock:a.c.state.trainLock,rendered:a.c.state.rendered,followUpdate:a.c.state.followUpdate}),before,'observation never performs another mutating inference pass');
 assert.deepEqual(a.errors,[]);
});


test('independent Signal simulator: exported Follow panel text and revisions are sanitized by the diagnostic allowlist',async()=>{
 const {readFileSync}=await import('node:fs'),vm=await import('node:vm');
 const c=vm.createContext({Date});vm.runInContext(readFileSync(new URL('../src/simulator/report.js',import.meta.url),'utf8')+';globalThis.makeReport=createJourneySimulationReporter;',c);
 const secret='signal-review-private-credential',message='Following your route '+secret+' https://api.example.test?key=credential at 51.976543,-0.231234 and AB12 3CD';
 const reporter=c.makeReport({now:()=>12345,privateValues:[secret]});reporter.start({sessionId:1,route:'far',direction:'outbound',scenario:'normal',totalCheckpoints:3});
 for(const status of ['FAIL','PASS'])reporter.recordCheckpoint({sessionId:1,index:0,point:'north',label:'Stevenage',assertions:[{id:'follow-phase',status,expected:'On the selected train',actual:'Observed follower state'}],actualDisplay:{view:'on-train',mainCard:'On the train',followCard:message,notices:[]}});
 const output=reporter.serialize(),r=JSON.parse(output);assert.equal(r.checkpoints[0].status,'FAIL','later recovery cannot erase the failure');assert.match(r.checkpoints[0].actualDisplay.followCard,/Following your route/);assert.ok(r.checkpoints[0].revisions.length);
 for(const forbidden of [secret,'https://api.example.test','credential at','51.976543','0.231234','AB12 3CD'])assert.equal(output.includes(forbidden),false,'Follow evidence/redacted revisions must omit '+forbidden);
});

test('independent Signal simulator: focused technical speed control cannot defer the real application live transition',async()=>{
 const a=await start();while(view(a).index<3)await next(a);
 assert.equal(view(a).checkpoints[view(a).index].point,'let');
 click(a,'simToggle');click(a,'journeyAdvancedButton');
 const speed=a.d.getElementById('simSpeed');speed.focus();choose(a,'simSpeed','20');assert.equal(a.d.activeElement,speed);
 // Next uses the same normal sequential GPS/feed reconstruction as the button. Keep focus
 // on the technical selector to represent changing speed while playback is already running.
 await a.c.simulator.nextCheckpoint();await checked(a);
 assert.equal(view(a).checkpoints[view(a).index].point,'north');assert.equal(a.d.activeElement,speed);
 assert.equal(a.c.state.onLine,true);assert.equal(a.c.readSimulationActual().view,'on-train','technical controller editing is not an instruction to pin the commuter application');
 assert.equal(a.c.state.presentation.pending,false);assert.ok(view(a).verification.current.assertions.some(row=>row.id==='rail-identity'&&row.status==='PASS'));
 // Genuine commuter editing remains a valid reason to defer a presentation transition.
 a.c.simulator.restart();await checked(a);while(view(a).index<3)await next(a);
 click(a,'settingsBtn');const editing=a.d.getElementById('s_rdmKey');editing.focus();assert.equal(a.d.getElementById('settings').open,true);
 await a.c.simulator.nextCheckpoint();await checked(a);
 assert.equal(a.c.state.onLine,true);assert.equal(a.c.state.presentation.pending,true,'real Settings editing defers the automatic view');assert.equal(a.c.readSimulationActual().presentationInteracting,true);
 assert.equal(view(a).verification.current.status,'INCONCLUSIVE');assert.ok(view(a).verification.current.assertions.some(row=>row.id==='presentation-deferred'));
 a.d.getElementById('settings').click();editing.blur();await sleep(30);const resumed=await checked(a);
 assert.equal(a.c.state.presentation.pending,false);assert.equal(a.c.readSimulationActual().view,'on-train');assert.ok(resumed.assertions.some(row=>row.id==='rail-identity'&&row.status==='PASS'),'closing genuine editing lets the actual app resume normal inference presentation');
 assert.deepEqual(a.errors,[]);
});
