// Journey UX checks load the actual generated app. The mutation case changes production
// movement inference in an isolated HTML string; it never changes the verifier or shared files.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {createApp as loadApp,closeAll,sleep} from './harness.mjs';
const isolated=[],apps=[];
async function createApp(options){const a=await loadApp(options);apps.push(a);return a;}
after(async()=>{await sleep(350);await until(()=>apps.every(a=>!a.c.state.loading&&!a.c.state.again),'all test refreshes finish before document teardown');closeAll();for(const window of isolated)window.close();});
const click=(a,id)=>{const element=a.d.querySelector('#'+id);assert.ok(element,'control '+id+' exists');element.click();};
const select=(a,id,value)=>{const e=a.d.querySelector('#'+id);assert.ok(e,'select '+id+' exists');e.value=value;e.dispatchEvent(new a.w.Event('change',{bubbles:true}));};
async function until(predicate,message,timeout=6000){const end=Date.now()+timeout;while(!predicate()){assert.ok(Date.now()<end,message);await sleep(10);}}
const view=a=>a.c.simulator.getView();
async function checked(a){await until(()=>{const v=view(a);return !v.verification.pending&&v.verification.current?.index===v.index;},'checkpoint verification settles');return view(a).verification.current;}
async function openJourney(a){click(a,'journeySimulatorBtn');await sleep(0);assert.equal(a.d.querySelector('#simPanel').hidden,false);}
async function startJourney(a,{direction='outbound',route='kgx',scenario='normal'}={}){
 await openJourney(a);select(a,'journeyDirection',direction);select(a,'journeyRoute',route);select(a,'journeyScenario',scenario);click(a,'journeyStart');
 await until(()=>a.c.simulator.sim.active&&a.d.querySelector('#simPanel').hidden,'guided start collapses to real app');await checked(a);
}
async function next(a){const index=view(a).index;click(a,'journeyNext');await until(()=>view(a).index===index+1,'Next advances one adjacent checkpoint');return checked(a);}
async function finish(a){if(a.c.simulator.sim.active||a.c.S().simulatorEnabled||a.c.S().simulatedFeeds)a.c.simulator.simStop({resume:false});await sleep(50);assert.deepEqual(a.errors,[]);}
function scheduler(a){const nativeSet=a.w.setInterval.bind(a.w),nativeClear=a.w.clearInterval.bind(a.w),tasks=new Map();let id=97000;
 a.w.setInterval=(fn,ms)=>{if(ms!==1000)return nativeSet(fn,ms);const n=id++;tasks.set(n,fn);return n;};
 a.w.clearInterval=n=>{if(!tasks.delete(n))nativeClear(n);};return {tasks,step:()=>[...tasks.values()].forEach(fn=>fn())};}
async function isolatedApp({storage={},mutation=false}={}){
 let html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 if(mutation){
  const name=mutation==='rail-context'?'railTrackingContext':'trackLine';
  const signature=new RegExp('function '+name+'\\([^)]*\\) \\{','g'),matches=html.match(signature);
  assert.equal(matches?.length,1,'one production '+name+' mutation target exists');
  const defect=mutation==='rail-context'?'return {atHub:hubHere(i.fix,p),line:null,continuing:false,passingHub:false};':'return {onLine:false,track:null};';
  html=html.replace(matches[0],matches[0]+'\n '+defect+' // deliberate production inference defect');
 }
 const errors=[],calls=[];
 const dom=new JSDOM(html,{url:'https://srapley-spec.github.io/cartref-commute/',runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  const NativeDate=w.Date;w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[Date.now()]));}static now(){return Date.now();}};
  w.COMMUTE_FETCH_TIMEOUT_MS=200;w.COMMUTE_RELOCATE_MS=0;
  w.localStorage.setItem('cartrefCommute.v1',JSON.stringify({mode:'commute',dirMode:'auto',pace:'avg',home:[51.975,-.23],settings:{provider:'tfl'}}));
  for(const [key,value] of Object.entries(storage))w.localStorage.setItem(key,value);
  w.addEventListener('error',e=>errors.push(e.message));w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  Object.defineProperty(w.navigator,'geolocation',{value:{watchPosition(ok){setTimeout(()=>ok({coords:{latitude:51.975,longitude:-.23,accuracy:12},timestamp:Date.now()}),20);return 1;},clearWatch(){}}});
  w.fetch=async url=>{calls.push(String(url));return {ok:true,status:200,json:async()=>[]};};
 }});isolated.push(dom.window);await sleep(100);const w=dom.window;
 const a={w,d:w.document,c:w.__commute,errors,calls,text:selector=>(w.document.querySelector(selector)?.textContent||'').replace(/\s+/g,' ').trim()};apps.push(a);return a;
}

test('Journey Mode starts either selected corridor and direction in three actions with automatic coordinated sources',async()=>{
 const a=await createApp({settle:80});const original=a.w.localStorage.getItem('cartrefCommute.v1');await openJourney(a);
 assert.equal(a.c.S().simulatorEnabled,false);assert.equal(a.c.S().simulatedFeeds,false,'opening setup cannot activate simulation');
 assert.equal(a.d.querySelector('#journeyScenario').value,'normal');assert.equal(a.d.querySelector('#simAdvanced').open,false,'technical controls are progressively disclosed');
 // After opening Journey Mode: direction, route, Start are the three deliberate actions.
 select(a,'journeyDirection','return');select(a,'journeyRoute','far');click(a,'journeyStart');
 await until(()=>a.c.simulator.sim.active&&a.d.querySelector('#simPanel').hidden,'guided start completes');await checked(a);
 assert.equal(a.c.S().simulatorEnabled,true);assert.equal(a.c.S().simulatedFeeds,true);assert.equal(a.c.simClock.active,true);
 assert.equal(view(a).config.route,'far');assert.equal(view(a).config.direction,'return');assert.equal(view(a).index,0);assert.equal(a.c.simulator.sim.timer,null);
 assert.ok(a.d.querySelector('#hero').textContent.trim(),'real app renders its own recommendation');assert.equal(a.d.querySelector('#simDock').contains(a.d.querySelector('#hero')),false);
 assert.match(a.text('#journeyDockTime'),/\d{2}:\d{2}/);assert.doesNotMatch(a.text('#journeyDockTime'),/T\d{2}:\d{2}:\d{2}.*Z/,'ordinary setup uses British display time');
 assert.ok(a.text('#journeyDockLocation'));assert.ok(a.text('#journeyDockNext'));assert.ok(a.text('#journeyDockProgress'));
 const instant=a.c.simClock.now();await sleep(30);assert.equal(a.c.simClock.now(),instant);assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),original);
 await finish(a);
});

test('Journey scenarios retain every existing fixture and explain their expected application behaviour',async()=>{
 const a=await createApp({settle:80});await openJourney(a);const scenario=a.d.querySelector('#journeyScenario');
 const old=[...a.d.querySelector('#simScenario').options].map(o=>o.value),guided=[...scenario.options].map(o=>o.value);
 assert.deepEqual([...guided].sort(),[...old].sort());assert.ok(scenario.querySelectorAll('optgroup').length>=4);
 for(const value of old){select(a,'journeyScenario',value);assert.ok(a.text('#journeyScenarioDescription').length>15,value+' explains inputs');assert.ok(a.text('#journeyScenarioExpected').length>15,value+' explains expected recognition');}
 assert.equal(a.c.S().simulatorEnabled,false);assert.equal(a.c.simClock.active,false);assert.equal(a.c.simulator.sim.active,false);await finish(a);
});

test('Journey Advanced and timeline inspection preserve the same active simulation and playback timer',async()=>{
 const a=await createApp({settle:80});await startJourney(a);const timer=scheduler(a);select(a,'simSpeed','20');click(a,'simAdvance');assert.equal(timer.tasks.size,1);
 const index=view(a).index,instant=a.c.simClock.now(),sessionId=a.c.simulator.sim.sessionId,selected=view(a).config;assert.equal(typeof sessionId,'number','session identity is observable');
 click(a,'simToggle');click(a,'journeyAdvancedButton');assert.equal(a.d.querySelector('#simAdvanced').open,true);
 for(const id of ['simLat','simLon','simPreset','simAccuracyMode','simAccuracy','simDate','simSpeed','simClear','simPlay','simContinue','simPause'])assert.ok(a.d.querySelector('#'+id),'retained Advanced capability '+id);
 click(a,'journeyTimelineToggle');assert.equal(a.d.querySelector('#journeyTimelineDetails').open,true);
 const timeline=a.d.querySelector('#journeyTimeline');assert.ok(timeline.children.length>=13);
 const inspect=timeline.querySelector('[data-checkpoint-inspect="'+(timeline.children.length-1)+'"]');assert.ok(inspect,'upcoming checkpoint has a read-only inspection control');inspect.click();
 assert.equal(a.c.simulator.sim.sessionId,sessionId);assert.equal(view(a).index,index);assert.equal(a.c.simClock.now(),instant);assert.equal(timer.tasks.size,1);
 assert.equal(view(a).config.route,selected.route);assert.equal(view(a).config.direction,selected.direction);
 timer.step();assert.equal(a.c.simClock.now()-instant,20000,'same playback advances through its original interval');
 click(a,'simAdvance');assert.equal(timer.tasks.size,0);await finish(a);
});

test('Journey preferences remember selection across reload without persisting an active simulation',async()=>{
 const a=await createApp({settle:80});await startJourney(a,{direction:'return',route:'far',scenario:'delay'});click(a,'simExit');await sleep(40);
 const storage=Object.fromEntries(Array.from({length:a.w.localStorage.length},(_,i)=>{const key=a.w.localStorage.key(i);return [key,a.w.localStorage.getItem(key)];}));
 const preferenceEntries=Object.entries(storage).filter(([key])=>key!=='cartrefCommute.v1');assert.equal(preferenceEntries.length,1,'one isolated preference key');
 const prefs=JSON.parse(preferenceEntries[0][1]);assert.ok(Object.keys(prefs).every(key=>['direction','route','scenario','version'].includes(key)),'only allowlisted choices persist');
 assert.doesNotMatch(preferenceEntries[0][1],/simulatorEnabled|simulatedFeeds|startTime|latitude|longitude|trip|active/i);
 const b=await isolatedApp({storage});assert.equal(b.c.simulator.sim.active,false);assert.equal(b.c.simClock.active,false);assert.equal(!!b.c.S().simulatedFeeds,false);assert.equal(!!b.c.S().simulatorEnabled,false);
 await openJourney(b);assert.equal(b.d.querySelector('#journeyDirection').value,'return');assert.equal(b.d.querySelector('#journeyRoute').value,'far');await finish(a);await finish(b);
});

test('Journey verification detects a deliberate production movement defect and exposes expected versus actual failure',async()=>{
 const a=await isolatedApp({mutation:true});await startJourney(a);select(a,'simSpeed','20');
 while(view(a).checkpoints[view(a).index].point!=='north')await next(a);
 const result=await checked(a);assert.equal(a.c.state.onLine,false,'production mutation changes actual inference');assert.doesNotMatch(a.text('#hero'),/^On the train/);
 assert.equal(result.status,'FAIL');assert.ok(result.assertions.some(row=>row.status==='FAIL'&&row.id==='rail-movement'));
 assert.match(a.text('#journeyVerificationBadge'),/FAIL|failed/i,'failure is discoverable in compact overlay');const actualCard=a.text('#hero');click(a,'journeyVerificationBadge');
 assert.match(a.text('#journeyVerificationResults'),/Expected|recognise|rail/i);assert.match(a.text('#journeyVerificationResults'),/Actual|false|not/i);
 assert.ok(a.text('#journeyVerificationResults').includes(actualCard),'comparison retains what the actual main card said');
 assert.equal(a.d.querySelector('#simDock').contains(a.d.querySelector('#hero')),false,'verification never replaces actual app output');await finish(a);
});

test('Journey results distinguish assertion counts and copy a credential-free diagnostic report',async()=>{
 const secret='private-api-key-for-ux-test',home=[51.972345,-.234567];
 const a=await createApp({settings:{provider:'rdm',rdmKey:secret,tflKey:'private-tfl-key-for-ux-test'},saved:{home},settle:80});
 let copied='';Object.defineProperty(a.w.navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied=text;}}});
 await startJourney(a);await next(a);const before=view(a).summary;assert.ok(before.completedCheckpoints>=2);assert.ok(before.passedAssertions>0);
 click(a,'simExit');await openJourney(a);click(a,'journeyAdvancedButton');select(a,'simPath','far');click(a,'journeyTimelineToggle');
 const history=[...a.d.querySelectorAll('#journeyTimeline > li')];assert.equal(history.length,14,'last GN journey does not become the new draft TL route');assert.match(a.text('#journeyTimelineContext'),/Great Northern/);assert.equal(history[0].dataset.status,'completed');assert.equal(history[1].dataset.status,'completed');assert.equal(history[2].dataset.status,'upcoming');
 assert.doesNotMatch(history[0].textContent,/After Start/,'stopped results retain the actual historical clock');assert.equal(a.c.simClock.active,false,'inspecting history cannot reactivate virtual time');
 click(a,'journeyCopyResults');await until(()=>copied.length>0,'copy report completes');
 const report=JSON.parse(copied);assert.equal(report.kind,'cartref-commute-simulation');assert.equal(report.config.route,'kgx');assert.equal(report.config.direction,'outbound');assert.equal(report.summary.finished,true);
 assert.ok(report.checkpoints.length>=2);assert.ok(report.checkpoints.some(c=>c.assertions.some(row=>row.expected!==undefined&&row.actual!==undefined)));
 assert.equal(report.summary.passedAssertions+report.summary.failedAssertions+report.summary.inconclusiveAssertions,report.checkpoints.flatMap(c=>c.assertions).length);
 assert.doesNotMatch(copied,new RegExp(secret));assert.doesNotMatch(copied,/private-tfl-key-for-ux-test|51\.972345|-0\.234567|rdmKey|tflKey|latitude|longitude/);
 assert.equal(a.c.simClock.active,false,'opening finished results does not resume simulation');await finish(a);
});

for(const design of ['panda','signal'])for(const direction of ['outbound','return'])for(const route of ['kgx','far']){
 test(`${design==='signal'?'Signal ':''}Journey verification: ${direction} ${route} evaluates real checkpoints through completion`,async()=>{
  const a=await createApp({settings:{provider:'rdm',rdmKey:'test',signal:design==='signal'},settle:80});await startJourney(a,{direction,route});select(a,'simSpeed','20');const calls=a.calls.length;let svg=null;
  const total=view(a).checkpoints.length;
  while(true){const v=view(a),p=v.checkpoints[v.index],result=await checked(a);assert.equal(result.index,v.index);assert.ok(['PASS','FAIL','INCONCLUSIVE'].includes(result.status));
   if(p.label.includes('Walk to Underground platforms')||p.label.includes('At Aldgate westbound platforms')){
    const boardTime=v.startTime+v.checkpoints[v.index+1].at*60000;const pick=[...a.d.querySelectorAll('[data-tubepick]')].find(b=>Math.abs(Number(b.dataset.tubepick.split('|')[1])-boardTime)<1000);assert.ok(pick,'real platform choice remains available');pick.click();await sleep(10);
   }
   if(direction==='return'&&p.label.includes('Alight at Farringdon')){const off=[...a.d.querySelectorAll('[data-ride="off"]')].find(b=>b.textContent.includes('Farringdon'));if(off){off.click();await sleep(10);}}
   if(p.point==='north'){svg=result;assert.equal(result.status,'PASS','actual SVG rail behaviour meets defined assertions');assert.ok(result.assertions.some(row=>row.id==='rail-identity'&&row.status==='PASS'));}
   const instant=a.c.simClock.now();await sleep(1);assert.equal(a.c.simClock.now(),instant,'verification and timeline do not unfreeze paused time');
   if(v.index===total-1)break;await next(a);
  }
  assert.ok(svg);const final=view(a);assert.equal(final.summary.completedCheckpoints,total);assert.equal(final.summary.failedAssertions,final.verification.results.flatMap(r=>r.assertions).filter(r=>r.status==='FAIL').length,'summary truthfully counts observed application failures');assert.ok(final.summary.passedAssertions>0);
  const failures=final.verification.results.flatMap(r=>r.assertions.filter(row=>row.status==='FAIL').map(row=>({checkpoint:r.label,id:row.id,expected:row.expected,actual:row.actual,mainCard:r.actualDisplay?.mainCard})));
  assert.equal(failures.length,0,'normal coordinated journeys satisfy every defined assertion; unresolved choices may remain inconclusive: '+JSON.stringify(failures));
  assert.equal(a.calls.length,calls,'guided playback never leaks to live providers');assert.match(a.text('#journeyResultsSummary'),/pass|assertion|checkpoint/i);
  assert.equal(a.d.querySelector('#journeyNext').textContent,'Results');click(a,'journeyNext');assert.equal(a.d.querySelector('#journeyResultsDetails').open,true,'completion makes the real summary discoverable');assert.equal(view(a).index,total-1);await finish(a);
 });
}

test('Journey verification recognises known Thameslink continuing through St Pancras before genuine Farringdon alighting',async()=>{
 const a=await createApp({settings:{provider:'rdm',rdmKey:'test'},settle:80});await startJourney(a,{route:'far'});select(a,'simSpeed','20');
 while(!view(a).checkpoints[view(a).index].label.includes('Passing St Pancras'))await next(a);
 const result=await checked(a);assert.equal(a.c.state.onLine,true,'known moving Thameslink is still on its route through the shared station radius');
 assert.equal(result.status,'PASS');assert.ok(result.assertions.some(row=>row.status==='PASS'&&row.id==='rail-progress'));assert.match(a.text('#hero'),/^On the train/);
 await next(a);assert.equal(view(a).checkpoints[view(a).index].point,'far');assert.equal(a.c.state.onLine,false,'stationary destination fix still allows genuine alighting');assert.doesNotMatch(a.text('#hero'),/^On the train/);await finish(a);
});

test('Journey verification visibly fails when known-service through-station inference is deliberately reverted',async()=>{
 const a=await isolatedApp({mutation:'rail-context'});await startJourney(a,{route:'far'});select(a,'simSpeed','20');
 while(!view(a).checkpoints[view(a).index].label.includes('Passing St Pancras'))await next(a);
 const result=await checked(a);assert.equal(a.c.state.onLine,false,'production helper reversion restores premature alighting');
 assert.equal(result.status,'FAIL','the same checkpoint assertion detects the deliberate regression');assert.ok(result.assertions.some(row=>row.status==='FAIL'&&row.id==='rail-progress'));
 assert.match(a.text('#journeyVerificationBadge'),/FAIL/);assert.ok(view(a).summary.failedAssertions>0);await finish(a);
});

test('Journey controls reopened while Start settles are not closed again by a late callback',async()=>{
 const a=await createApp({settle:80});await openJourney(a);let reopened=false;
 const unsubscribe=a.c.simulator.subscribe(event=>{
  if(event.type==='panel'&&a.c.simulator.sim.active&&a.d.querySelector('#simPanel').hidden&&!reopened){
   reopened=true;queueMicrotask(()=>click(a,'simToggle'));
  }
 });
 click(a,'journeyStart');await until(()=>reopened&&!a.d.querySelector('#journeyStart').disabled,'Start callback finishes after user reopens controls');unsubscribe();
 assert.equal(a.d.querySelector('#simPanel').hidden,false,'the user Show controls action wins over a late Start callback');
 assert.equal(a.c.simulator.sim.active,true);assert.equal(a.c.simulator.sim.index,0);assert.equal(a.c.simulator.sim.timer,null);await finish(a);
});

test('Advanced independent sources retain controls and make incomplete checkpoint evidence inconclusive',async()=>{
 const a=await createApp({settle:80});await startJourney(a);click(a,'simToggle');click(a,'journeyAdvancedButton');
 const gps=a.d.querySelector('#simAdvancedGPS'),feeds=a.d.querySelector('#simAdvancedFeeds');assert.equal(gps.checked,true);assert.equal(feeds.checked,true);
 gps.checked=false;gps.dispatchEvent(new a.w.Event('change',{bubbles:true}));
 await until(()=>!a.c.S().simulatorEnabled&&a.c.S().simulatedFeeds,'Advanced source selection applies safely');
 click(a,'simPlay');const result=await checked(a);assert.equal(result.status,'INCONCLUSIVE','one live source cannot prove the synthetic coordinated scenario');
 assert.equal(a.c.simClock.active,true);assert.equal(a.c.S().simulatedFeeds,true);assert.equal(!!a.c.S().simulatorEnabled,false);
 assert.match(a.text('#journeyVerificationBadge'),/INCONCLUSIVE/);await finish(a);
});

test('Journey setup displays the British local time actually selected in Advanced',async()=>{
 const a=await createApp({settle:80});await openJourney(a);click(a,'journeyAdvancedButton');select(a,'simDate','2026-08-05T08:44');click(a,'journeyModeButton');
 assert.match(a.text('#journeyStartHint'),/5 Aug/);assert.match(a.text('#journeyStartHint'),/09:44/);assert.match(a.text('#journeyStartHint'),/BST/);
 click(a,'journeyStart');await until(()=>a.c.simulator.sim.active&&a.d.querySelector('#simPanel').hidden,'custom-time guided start completes');await checked(a);
 assert.equal(a.c.simClock.now(),Date.parse('2026-08-05T08:44:00Z'),'display is British local time while the same instant reaches the shared clock');assert.match(a.text('#journeyDockTime'),/09:44/);await finish(a);
});

test('Journey runtime verification observes the real provider outage and its recovered source',async()=>{
 const a=await createApp({settings:{provider:'rdm',rdmKey:'test'},settle:80});await startJourney(a,{scenario:'outage'});select(a,'simSpeed','20');
 while(view(a).elapsed<16)await next(a);
 const outage=await checked(a);assert.ok(a.c.state.errors.length,'provider failure reaches normal application state');assert.ok(outage.assertions.some(row=>row.id==='provider-outage'&&row.status==='PASS'));
 while(view(a).elapsed<40)await next(a);
 const recovery=await checked(a);assert.equal(a.c.state.railSource,'darwin');assert.ok(Object.values(a.c.state.boards||{}).some(board=>board?.services?.length));
 const assertion=recovery.assertions.find(row=>row.id==='provider-recovery');assert.ok(assertion,'recovery has an explicit runtime assertion');assert.equal(assertion.status,'PASS','observational snapshot includes the actual recovered provider source');await finish(a);
});

test('Journey simulation isolates real Follow state while actual synthetic Follow and Stop following remain usable',async()=>{
 const a=await createApp({settings:{provider:'tfl',followRoute:true},settle:200});
 await until(()=>a.d.querySelector('[data-follow]'),'real application offers a journey Follow button');
 a.d.querySelector('[data-follow]').click();
 assert.ok(a.c.state.saved.followRoute,'the real application selected a real journey before simulation');
 assert.match(a.text('#followPanel'),/Following/);
 const realFollow=JSON.stringify(a.c.state.saved.followRoute),realSaved=a.w.localStorage.getItem('cartrefCommute.v1');
 assert.equal(JSON.stringify(JSON.parse(realSaved).followRoute),realFollow,'ordinary Follow selection is persisted normally');
 await startJourney(a);
 assert.equal(a.c.state.saved.followRoute,undefined,'starting simulation clears the real followed journey from the simulated session');
 assert.equal(a.c.readSimulationActual().following,false);
 assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),realSaved,'starting cannot alter the saved real follow');
 const pick=[...a.d.querySelectorAll('[data-follow]')].find(button=>String(a.c.followChoices.get(button.dataset.follow)?.train?.serviceId||'').startsWith('SIM'));
 assert.ok(pick,'synthetic services are offered by the genuine app Follow controls');pick.click();
 const syntheticId=a.c.state.saved.followRoute?.lastTrain?.serviceId;
 assert.match(syntheticId,/^SIM/);assert.match(a.text('#followPanel'),/Following/);
 assert.equal(a.c.readSimulationActual().follow?.serviceId,syntheticId,'diagnostics observe the actual rendered Follow state');
 assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),realSaved,'synthetic Follow selection remains in memory');
 await until(()=>a.c.simulationReporter.getReport().events.some(event=>event.message.includes('followedServiceId changed')&&event.message.includes(syntheticId)),'report observes actual followed-service selection');
 const stop=a.d.querySelector('[data-follow-action=stop]');assert.ok(stop,'normal Stop following action remains available');stop.click();
 assert.equal(a.c.state.saved.followRoute,null);assert.equal(a.c.readSimulationActual().follow,null);assert.equal(a.d.querySelector('#followPanel').hidden,true);
 assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),realSaved,'synthetic Stop following cannot erase the real followed journey');
 await until(()=>a.c.simulationReporter.getReport().events.some(event=>event.message.includes('followedServiceId changed from '+syntheticId+' to unknown')),'report observes actual follow cancellation');
 click(a,'simExit');
 assert.equal(JSON.stringify(a.c.state.saved.followRoute),realFollow,'Stop restores the exact pre-simulation followed journey');
 assert.equal(JSON.stringify(JSON.parse(a.w.localStorage.getItem('cartrefCommute.v1')).followRoute),realFollow,'persistent real follow is retained after Stop');
 assert.equal(a.c.simClock.active,false);await finish(a);
});

test('Journey delayed services remain followable through genuine boarding and reported inference events',async()=>{
 const a=await createApp({settings:{provider:'rdm',rdmKey:'private-follow-delay-key',followRoute:true},settle:100});
 const saved=a.w.localStorage.getItem('cartrefCommute.v1');await startJourney(a,{scenario:'delay'});select(a,'simSpeed','20');
 const button=[...a.d.querySelectorAll('[data-follow]')].find(b=>a.c.followChoices.get(b.dataset.follow)?.train?.serviceId==='SIM-GN-0905');
 assert.ok(button,'the actual app offers the delayed train as a followable journey');
 const option=a.c.followChoices.get(button.dataset.follow);assert.equal(option.train.depLate,8,'real planner consumed the synthetic eight-minute delay');
 button.click();assert.match(a.text('#followPanel'),/Following/);
 while(view(a).checkpoints[view(a).index].point!=='north')await next(a);
 const actual=a.c.readSimulationActual();assert.equal(actual.train.serviceId,'SIM-GN-0905');assert.equal(actual.follow?.serviceId,'SIM-GN-0905');assert.match(a.text('#followPanel'),/On your train|On the/i,'genuine app Follow card recognises boarding the selected delayed train');
 const report=a.c.simulationReporter.getReport();assert.ok(report.events.some(event=>event.message.includes('followedServiceId changed')&&event.message.includes('SIM-GN-0905')));
 const json=a.c.simulationReporter.serialize();assert.doesNotMatch(json,/private-follow-delay-key/);assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),saved);await finish(a);
});
