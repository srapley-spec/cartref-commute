// Independent adverse-transition tests. The feature reviewer did not implement simulator behavior.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,sleep} from './harness.mjs';
const reviewWindows=[];
after(async()=>{await sleep(350);closeAll();for(const w of reviewWindows)w.close();});
const click=(a,id)=>{const e=a.d.getElementById(id);assert.ok(e,'missing '+id);e.click();};
const select=(a,id,value)=>{const e=a.d.getElementById(id);assert.ok(e,'missing '+id);e.value=value;e.dispatchEvent(new a.w.Event('change',{bubbles:true}));};
async function settled(a){const end=Date.now()+5000;while(a.c.state.loading||a.c.state.again){assert.ok(Date.now()<end,'application refresh must settle');await sleep(10);}await sleep(20);}
async function begin(a){click(a,'journeySimulatorBtn');click(a,'journeyStart');await sleep(30);await settled(a);assert.equal(a.c.simulator.sim.active,true);}

test('independent UX: opening Journey Mode leaves real operation unchanged until Start',async()=>{
 const a=await createApp({settle:100});await settled(a);
 const before=a.w.localStorage.getItem('cartrefCommute.v1');
 click(a,'journeySimulatorBtn');
 assert.equal(a.d.getElementById('simPanel').hidden,false);
 assert.equal(!!a.c.S().simulatorEnabled,false);assert.equal(!!a.c.S().simulatedFeeds,false);assert.equal(a.c.simClock.active,false);assert.equal(a.c.simulator.sim.active,false);
 assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),before,'opening setup does not overwrite real context');
 await sleep(350);assert.deepEqual(a.errors,[]);
});

test('independent UX: guided draft choices and opening Advanced preserve the active journey',async()=>{
 const a=await createApp({settle:100});await begin(a);
 const simulator=a.c.simulator,config=JSON.parse(JSON.stringify(simulator.getScenario())),instant=a.c.simClock.now(),index=simulator.sim.index,sessionId=simulator.sim.sessionId;
 const baseline=a.w.localStorage.getItem('cartrefCommute.v1');
 click(a,'simToggle');select(a,'journeyDirection','return');select(a,'journeyRoute','far');select(a,'journeyScenario','cancellation');
 assert.deepEqual(JSON.parse(JSON.stringify(simulator.getScenario())),config,'draft setup does not switch provider scenario underneath active history');
 click(a,'journeyAdvancedButton');
 assert.equal(a.c.simClock.now(),instant);assert.equal(simulator.sim.index,index);assert.equal(simulator.sim.sessionId,sessionId);assert.equal(simulator.sim.timer,null);
 assert.equal(a.c.S().simulatorEnabled,true);assert.equal(a.c.S().simulatedFeeds,true);
 assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),baseline,'mode changes do not save synthetic settings/context');
 click(a,'journeyModeButton');assert.equal(a.c.simClock.now(),instant);assert.equal(simulator.sim.index,index);
 click(a,'simExit');await sleep(350);assert.deepEqual(a.errors,[]);
});

test('independent UX: exported evidence is allowlisted, redacted, immutable and keeps observed failures',async()=>{
 const {readFileSync}=await import('node:fs'),vm=await import('node:vm');
 const context=vm.createContext({Date});
 vm.runInContext(readFileSync(new URL('../src/simulator/report.js',import.meta.url),'utf8')+';globalThis.reporter=createJourneySimulationReporter;',context);
 const secret='review-private[abc].*?$key',laterSecret='review-rotated-private-credential',home='51.976543,-0.231234';
 const r=context.reporter({now:()=>123456789,privateValues:[secret,home]});
 r.start({route:'far',direction:'return',scenario:'normal',totalCheckpoints:14,settings:{tflKey:secret},home:[51.976543,-.231234],sessionId:7});
 r.recordCheckpoint({sessionId:7,index:0,point:'office',label:'Office',assertions:[{id:'real-evidence',status:'FAIL',expected:'Actual train must match GPS',actual:'Observed '+secret+' at '+home,evidence:{view:'on-train',serviceId:secret,settings:{tflKey:secret},latitude:51.976543,here:[51.976543,-.231234]}}]});
 r.recordCheckpoint({sessionId:7,index:0,point:'office',label:'Office',assertions:[{id:'real-evidence',status:'PASS',expected:'Actual train must match GPS',actual:'Recovered'}]});
 r.recordEvent({sessionId:7,type:'observation',message:'Later private value '+laterSecret,evidence:{requestUrl:'https://example.test?api_key='+secret}});
 r.setPrivateValues([secret,home,laterSecret]);
 const exported=JSON.parse(r.serialize());
 for(const value of [secret,laterSecret,home,'51.976543','0.231234','tflKey','requestUrl','"settings"','"here"','"latitude"'])assert.equal(JSON.stringify(exported).includes(value),false,'report must omit '+value);
 assert.equal(exported.checkpoints[0].status,'FAIL','recovery must not erase the earlier observed failure');
 assert.ok(exported.checkpoints[0].revisions.some(revision=>revision.status==='PASS'),'recovery remains inspectable');
 exported.config.route='kgx';exported.checkpoints[0].assertions[0].actual='tampered';
 assert.equal(r.getReport().config.route,'far');assert.notEqual(r.getReport().checkpoints[0].assertions[0].actual,'tampered');
 assert.equal(r.recordCheckpoint({sessionId:8,index:1,assertions:[{status:'PASS'}]}),null,'another run cannot append to this report');
 r.finish('stopped');assert.equal(r.recordEvent({sessionId:7,message:'late callback'}),null,'a finished report rejects late observations');
});

test('independent UX: GPS-only verification settles instead of waiting forever on device time',async()=>{
 const a=await createApp({settle:100});
 click(a,'settingsBtn');a.d.getElementById('s_simulator').checked=true;
 a.d.getElementById('settingsForm').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));click(a,'simPlay');
 await sleep(150);await settled(a);
 const verification=a.c.simulator.getView().verification;
 assert.equal(a.c.simClock.active,false,'GPS-only playback retains the device clock');
 assert.equal(verification.pending,false,'normal device clock progress must not leave verification permanently pending');
 assert.ok(verification.current,'an explicit inconclusive result is still observable with live transport');
 assert.equal(verification.current.status,'INCONCLUSIVE');
 click(a,'simExit');await sleep(350);assert.deepEqual(a.errors,[]);
});

test('independent UX: Copy results redacts credentials changed during a session even after Stop restores settings',async()=>{
 const a=await createApp({settings:{provider:'rdm',rdmKey:'initial-review-credential'},settle:100});await begin(a);
 click(a,'settingsBtn');a.d.getElementById('s_rdmKey').value='secondapikey';
 a.d.getElementById('settingsForm').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));await sleep(50);await settled(a);
 // Restart clears earlier report rows, but the original credential remains private while
 // the temporarily changed credential is active and the original settings are retained.
 click(a,'simPlay');await sleep(50);await settled(a);
 a.c.simulationReporter.recordEvent({type:'provider-message',message:'Original initial-review-credential and changed secondapikey'});
 assert.equal(a.c.simulationReporter.serialize().includes('initial-review-credential'),false,'Restart must retain privacy knowledge of the pre-simulation settings');
 // Provider messages are untrusted report inputs. A changed credential must still be recognised
 // without relying on its format or on a nearby "api_key=" label.
 a.c.simulationReporter.recordEvent({type:'provider-message',message:'Observed secondapikey'});
 click(a,'simExit');await sleep(50);
 assert.equal(a.c.S().rdmKey,'initial-review-credential','Stop restores the original real settings');
 let copied='';Object.defineProperty(a.w.navigator,'clipboard',{configurable:true,value:{writeText:async value=>{copied=value;}}});
 click(a,'journeySimulatorBtn');click(a,'journeyCopyResults');await sleep(30);
 assert.ok(copied.length>0);assert.equal(copied.includes('secondapikey'),false,'a credential used during the session must not leak after settings restoration');
 assert.equal(copied.includes('initial-review-credential'),false);assert.equal(JSON.parse(copied).kind,'cartref-commute-simulation');
 await sleep(350);assert.deepEqual(a.errors,[]);
});

async function independentBuiltApp(mutate){
 const {readFileSync}=await import('node:fs'),{JSDOM}=await import('jsdom');
 let html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 if(mutate){
  const needle='function whichTrain(boards, here, dir, now, lock, progress, p, fixAt) {';
  assert.ok(html.includes(needle),'independent production-inference mutation target exists');
  html=html.replace(needle,needle+'\n return {result:{none:true,others:[]},lock:null}; // deliberate production train-identification defect');
 }
 const errors=[],calls=[];
 const dom=new JSDOM(html,{url:'https://srapley-spec.github.io/cartref-commute/',runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  const NativeDate=w.Date;w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[Date.now()]));}static now(){return Date.now();}};
  w.COMMUTE_FETCH_TIMEOUT_MS=200;w.COMMUTE_RELOCATE_MS=0;
  w.localStorage.setItem('cartrefCommute.v1',JSON.stringify({mode:'commute',dirMode:'auto',pace:'avg',home:[51.975,-.23],settings:{provider:'tfl'}}));
  w.addEventListener('error',e=>errors.push(e.message));
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  Object.defineProperty(w.navigator,'geolocation',{value:{watchPosition(ok){setTimeout(()=>ok({coords:{latitude:51.975,longitude:-.23,accuracy:12},timestamp:Date.now()}),20);return 1;},clearWatch(){}}});
  w.fetch=async url=>{calls.push(String(url));return {ok:true,status:200,json:async()=>[]};};
 }});
 reviewWindows.push(dom.window);await sleep(100);
 return {w:dom.window,d:dom.window.document,c:dom.window.__commute,errors,calls};
}
async function waitReview(predicate,message){const end=Date.now()+12000;while(!predicate()){assert.ok(Date.now()<end,message);await sleep(10);}}
async function reviewAtStevenage(a){
 await begin(a);
 await waitReview(()=>!a.c.simulator.getView().verification.pending&&a.c.simulator.getView().verification.current?.index===0,'first checkpoint verification settles');
 while(a.c.simulator.getView().checkpoints[a.c.simulator.sim.index].point!=='north'){
  const before=a.c.simulator.sim.index;click(a,'journeyNext');
  await waitReview(()=>a.c.simulator.sim.index===before+1&&!a.c.simulator.getView().verification.pending&&a.c.simulator.getView().verification.current?.index===before+1,'sequential checkpoint and its real application verification settle');
 }
 return a.c.simulator.getView().verification.current;
}
for(const mutate of [false,true])test(`independent UX: ${mutate?'production train-identification defect is visibly detected':'unmodified production train identification passes its runtime assertion'}`,async()=>{
 const a=await independentBuiltApp(mutate),result=await reviewAtStevenage(a);
 assert.equal(a.c.state.onLine,true,'real movement still establishes National Rail travel');
 const identity=result.assertions.find(row=>row.id==='rail-identity');assert.ok(identity,'a train-identity assertion was actually evaluated');
 assert.equal(identity.status,mutate?'FAIL':'PASS');assert.equal(result.status,mutate?'FAIL':'PASS');
 assert.match(a.d.getElementById('journeyVerificationBadge').textContent,mutate?/FAIL/:/PASS/);
 if(mutate){
  assert.match(a.d.getElementById('hero').textContent,/no .*train matches|no train matches/i,'the actual production card exposes the broken inference');
  click(a,'journeyVerificationBadge');assert.match(a.d.getElementById('journeyVerificationResults').textContent,/No service identified|No inferred train/);
 }
 a.c.simulator.simStop({resume:false});await sleep(350);assert.deepEqual(a.errors,[]);
});

test('independent UX: stale verification cannot publish into a restarted session or clear its pending result',async()=>{
 const {readFileSync}=await import('node:fs'),vm=await import('node:vm');
 const context=vm.createContext({Date,queueMicrotask});
 vm.runInContext(readFileSync(new URL('../src/simulator/report.js',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../src/simulator/session.js',import.meta.url),'utf8')+';globalThis.makeReport=createJourneySimulationReporter;globalThis.makeSession=createJourneySimulationSession;',context);
 const waiting=[],listeners=new Set(),sim={active:true,startTime:100000,index:0,elapsed:0,sessionId:1,verification:{current:null,results:[],pending:false}};
 const simulator={sim,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},notify:(type)=>{for(const fn of [...listeners])fn({type});},getView:()=>({index:sim.index,elapsed:sim.elapsed,startTime:sim.startTime,clockNow:sim.startTime,config:{direction:'outbound',route:'kgx',scenario:'normal'},sources:{gps:true,feeds:true},checkpoints:[{point:'home',label:'Home',at:0},{point:'walk',label:'Walk',at:8}]})};
 const reporter=context.makeReport({now:()=>100000});
 const session=context.makeSession({simulator,reporter,readActual:()=>({view:'plan-now',heroText:'Normal application card'}),settle:()=>new Promise(resolve=>waiting.push(resolve)),evaluate:c=>({sessionId:c.sessionId,index:c.index,point:c.point,label:c.label,at:c.now,status:c.app.loading?'INCONCLUSIVE':'PASS',assertions:[{id:'observed',expected:'Observe the settled current application',actual:c.app.heroText,status:c.app.loading?'INCONCLUSIVE':'PASS'}]}),document:{defaultView:{document:{}},getElementById:id=>({value:id==='simSpeed'?'20':'realistic'})}});
 simulator.notify('start');const old=session.verifyCurrentCheckpoint();
 sim.sessionId=2;sim.verification={current:null,results:[],pending:false};simulator.notify('start');const fresh=session.verifyCurrentCheckpoint();
 waiting.shift()(true);assert.equal(await old,null);
 assert.equal(reporter.getReport().checkpoints.length,0,'the earlier provider completion cannot create a result in the new report');
 assert.equal(sim.verification.pending,true,'the stale job cannot clear a newer job pending flag');
 waiting.shift()(true);await fresh;assert.equal(reporter.getReport().checkpoints.length,1);assert.equal(reporter.getReport().config.sessionId,2);assert.equal(sim.verification.pending,false);
 sim.sessionId=3;sim.verification={current:null,results:[],pending:false};simulator.notify('start');const stopped=session.verifyCurrentCheckpoint();
 simulator.notify('stopping');sim.active=false;sim.sessionId++;const before=reporter.serialize();waiting.shift()(true);assert.equal(await stopped,null);
 assert.equal(reporter.serialize(),before,'late completion after Stop cannot revise a finished report');
 session.destroy();
});

test('independent UX: Stop during the first checkpoint refresh cannot reactivate a late Start callback',async()=>{
 const a=await createApp({geoDelay:'manual',settle:80}),before=a.w.localStorage.getItem('cartrefCommute.v1');
 click(a,'journeySimulatorBtn');let stopped=false;
 const unsubscribe=a.c.simulator.subscribe(({type})=>{if(type==='checkpoint'&&a.c.simulator.sim.active&&!stopped){stopped=true;click(a,'simExit');}});
 click(a,'journeyStart');
 await waitReview(()=>stopped&&!a.d.getElementById('journeyStart').disabled,'the cancelled Start callback completes');unsubscribe();await sleep(100);
 assert.equal(a.c.simulator.sim.active,false);assert.equal(a.c.simClock.active,false);assert.equal(a.c.S().simulatorEnabled,false);assert.equal(a.c.S().simulatedFeeds,false);
 assert.equal(a.c.simulator.sim.timer,null);assert.equal(a.c.simulator.getView().verification.pending,false);
 assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),before,'synthetic Start/Stop does not replace the saved real journey');
 const report=a.c.simulationReporter.getReport();assert.ok(report.summary.finished);assert.equal(report.summary.reason,'stopped');
 await sleep(350);assert.deepEqual(a.errors,[]);
});

test('independent review: through-service movement cannot override uncertainty overlapping its destination',async()=>{
 const {core,at,MIN,train}=await import('./core/helpers.mjs'),profile=core.profiles.samCommute,now=at('2026-11-03','09:58');
 const fix={here:[51.522692,-.109992],acc:45,at:now};
 const service=train({from:'LET',to:'ZFD',std:'09:12',dep:now-46*MIN,arr:now+2*MIN,serviceId:'REVIEW-THROUGH',calls:[{code:'LET'},{code:'STP'},{code:'ZFD'}]});
 const distance=core.km(fix.here,profile.stationGeo.ZFD);
 assert.ok(distance>profile.places.atHubKm&&distance<profile.places.atHubKm+fix.acc/1000,'the centre is outside the station but its uncertainty overlaps arrival');
 assert.equal(core.hubHere(fix,profile),null);
 const context=core.railTrackingContext({fix,speed:25,track:{at:now-10000,km:50,moving:true},train:service,dir:'office',now,onTube:false},profile);
 assert.equal(context.continuing,false,'known service identity cannot convert an ambiguous destination arrival into definite continued travel');
});

test('independent review: Follow planning metadata and caches stay isolated while observing Follow is read-only',async()=>{
 const a=await createApp({settings:{provider:'demo',follow:true},settle:120});
 await waitReview(()=>!!a.d.querySelector('[data-follow]'),'ordinary application offers Follow');
 a.d.querySelector('[data-follow]').click();
 const originalFollow=JSON.parse(JSON.stringify(a.c.state.saved.follow));assert.ok(originalFollow);
 a.d.querySelector('[data-view="by"]').click();await sleep(50);
 const originalViewAt=a.c.state.saved.viewAt,originalViewKey=a.c.state.saved.viewKey,originalLS=a.w.localStorage.getItem('cartrefCommute.v1');
 assert.ok(originalViewAt);assert.ok(originalViewKey);
 // Sentinels represent cache entries from a different provider/time session, not journey inputs.
 a.c.state.followable['STALE-REVIEW-FOLLOW']={sentinel:true};
 a.c.state.tubeEta={vehicle:'STALE-REVIEW-VEHICLE',hub:'KGX',at:Date.now(),t:Date.now()+600000};
 await begin(a);
 assert.equal(a.c.S().follow,true,'user feature preference remains enabled');
 for(const key of ['follow','viewAt','viewKey'])assert.equal(a.c.state.saved[key],undefined,key+' does not carry into simulation');
 assert.equal(a.c.state.followable?.['STALE-REVIEW-FOLLOW'],undefined);assert.equal(a.c.state.tubeEta,null);
 await waitReview(()=>!!a.d.querySelector('[data-follow]'),'genuine Follow remains available with synthetic providers');
 a.d.querySelector('[data-follow]').click();assert.ok(a.c.state.saved.follow);assert.match(a.d.getElementById('hero').textContent,/Following/);
 const snapshot=()=>JSON.stringify({saved:a.c.state.saved,lock:a.c.state.trainLock,rendered:a.c.state.rendered}),before=snapshot();
 assert.ok(a.c.readSimulationActual().follow);assert.equal(a.c.readSimulationActual().following,true);
 for(let n=0;n<5;n++)a.c.readSimulationActual();assert.equal(snapshot(),before,'diagnostics do not execute Follow inference or mutate its state');
 click(a,'simPlay');await sleep(80);assert.equal(a.c.state.saved.follow,undefined,'Restart clears only the synthetic followed journey');
 assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),originalLS,'simulation and Restart never save synthetic Follow/planning metadata');
 click(a,'simExit');await sleep(100);
 assert.deepEqual(JSON.parse(JSON.stringify(a.c.state.saved.follow)),originalFollow);
 assert.equal(a.c.state.saved.viewAt,originalViewAt);assert.equal(a.c.state.saved.viewKey,originalViewKey);
 assert.deepEqual(JSON.parse(a.w.localStorage.getItem('cartrefCommute.v1')).follow,originalFollow,'resumed real GPS can advance ordinary trip timestamps, while the real followed journey remains intact');
 assert.equal(a.c.state.tubeEta,null);assert.equal(a.c.state.followable?.['STALE-REVIEW-FOLLOW'],undefined);
 await sleep(350);assert.deepEqual(a.errors,[]);
});
