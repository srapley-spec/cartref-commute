import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context=vm.createContext({});
vm.runInContext(readFileSync(new URL('../src/simulator/verification.js',import.meta.url),'utf8')+';globalThis.evaluate=evaluateSimulationCheckpoint;',context);
const evaluate=input=>JSON.parse(JSON.stringify(context.evaluate(input)));
const base=(extra={})=>({sessionId:7,index:4,point:'north',label:'On train at Stevenage',mode:'rail',now:Date.parse('2026-11-03T09:16:00Z'),source:{gps:true,feeds:true},config:{route:'kgx',direction:'outbound',scenario:'normal',startTime:Date.parse('2026-11-03T08:44:00Z')},app:{loading:false,direction:'office',locStatus:'ok',locAcc:45,onLine:true,atHub:null,view:'on-train',heroText:'On the train · You are on the 09:05 Great Northern',train:{serviceId:'SIM-GN-0905',sure:true,others:[{serviceId:'SIM-GN-LATER-0917'}]},boards:[{id:'SIM-GN-0905',depLate:0},{id:'SIM-GN-LATER-0917',depLate:0}]},...extra});
const row=(result,id)=>result.assertions.find(a=>a.id===id);

test('checkpoint verification reads actual rail inference and detects real output mismatches',()=>{
 const good=base();assert.equal(evaluate(good).status,'PASS');
 const wrong=base();wrong.app.train.serviceId='SIM-TL-0912';const r=evaluate(wrong);assert.equal(r.status,'FAIL');assert.equal(row(r,'rail-identity').status,'FAIL');
 const movement=base();movement.app.onLine=false;movement.app.heroText='If you leave now';const m=evaluate(movement);assert.equal(row(m,'rail-movement').status,'FAIL');assert.equal(row(m,'rail-presentation').status,'FAIL');
});

for(const [route,direction,id] of [['kgx','outbound','SIM-GN-0905'],['far','outbound','SIM-TL-0912'],['kgx','return','SIM-GN-HOME-1617'],['far','return','SIM-TL-HOME-1620']]){
 test(`checkpoint verification fixture identity is an oracle only for ${route} ${direction}`,()=>{
  const c=base();c.config.route=route;c.config.direction=direction;c.app.direction=direction==='return'?'home':'office';c.app.train.serviceId=id;
  const before=JSON.stringify(c);assert.equal(evaluate(c).status,'PASS');assert.equal(JSON.stringify(c),before,'evaluation never assigns expected service or changes input');
 });
}

test('reaching unsupported or manually changed checkpoints never counts as passing',()=>{
 const unsupported=evaluate(base({point:'invented'}));assert.equal(unsupported.status,'INCONCLUSIVE');assert.equal(unsupported.assertions.length,1);
 const manual=evaluate(base({manualOverride:true}));assert.equal(manual.status,'INCONCLUSIVE');assert.equal(row(manual,'manual-observation').status,'INCONCLUSIVE');
 const loading=base();loading.app.loading=true;assert.equal(evaluate(loading).status,'INCONCLUSIVE');
 assert.equal(evaluate({}).status,'INCONCLUSIVE');
});

test('live or missing sources cannot prove synthetic fixture expectations',()=>{
 const gps=evaluate(base({source:{gps:false,feeds:true}}));assert.equal(gps.status,'INCONCLUSIVE');
 const live=evaluate(base({source:{gps:true,feeds:false}}));assert.equal(live.status,'INCONCLUSIVE');assert.equal(row(live,'rail-identity').status,'INCONCLUSIVE');
 const missing=base();delete missing.app.onLine;missing.app.heroText='';missing.app.train=null;assert.equal(evaluate(missing).status,'FAIL','settled missing service is an explicit identity failure, not playback success');
});

test('uncertain trains need uncertainty and alternatives rather than an automatic sure match',()=>{
 const c=base();c.config.scenario='uncertain';c.app.train.sure=false;c.app.heroText+=' Which train are you on?';assert.equal(evaluate(c).status,'PASS');
 c.app.train.sure=true;assert.equal(row(evaluate(c),'rail-uncertainty').status,'FAIL');
 c.app.train.sure=false;c.app.train.others=[];assert.equal(row(evaluate(c),'rail-choices').status,'FAIL');
 c.app.train.picked=true;assert.equal(evaluate(c).status,'INCONCLUSIVE','a manual choice cannot retrospectively prove unpicked uncertainty');
});

test('delayed and later services are checked against actual board and displayed delay',()=>{
 const delayed=base();delayed.config.scenario='delay';delayed.app.boards[0].depLate=8;delayed.app.heroText+=' · 8 min late';assert.equal(evaluate(delayed).status,'PASS');
 delayed.app.boards[0].depLate=0;assert.equal(row(evaluate(delayed),'rail-delay').status,'FAIL');
 const later=base();later.config.scenario='wrong-train';later.app.train.serviceId='SIM-GN-LATER-0917';assert.equal(evaluate(later).status,'PASS');
 later.app.train.picked=true;later.app.train.conflict=true;assert.equal(row(evaluate(later),'selection-conflict').status,'FAIL');later.app.heroText+=' Your selection does not match its reported position';assert.equal(row(evaluate(later),'selection-conflict').status,'PASS');
});

test('location errors and coarse accuracy cannot be mistaken for successful arrival',()=>{
 const denied=base({point:'home',mode:undefined});denied.config.scenario='permission-denied';denied.app.locStatus='denied';denied.app.heroText='Location needed';assert.equal(evaluate(denied).status,'PASS');denied.app.locStatus='ok';assert.equal(evaluate(denied).status,'FAIL');
 const rough=base();rough.config.scenario='low-accuracy';rough.app.locAcc=800;rough.app.atHub=null;assert.equal(evaluate(rough).status,'INCONCLUSIVE');rough.app.atHub='KGX';assert.equal(evaluate(rough).status,'FAIL');
});

test('Underground verification checks actual ride and retained vehicle identity',()=>{
 const c=base({point:'barbican',mode:'tube',previous:{ride:{vehicle:'SIM-TUBE-EAST-kgx-1'}}});c.app.heroText='On the tube';c.app.ride={vehicle:'SIM-TUBE-EAST-kgx-1'};assert.equal(evaluate(c).status,'PASS');
 c.app.ride.vehicle='SIM-TUBE-EAST-kgx-2';assert.equal(row(evaluate(c),'vehicle-continuity').status,'FAIL');
 c.app.ride=null;assert.equal(row(evaluate(c),'underground-inference').status,'FAIL');
 const boarding=base({point:'kxTube',mode:'tube'});boarding.app.heroText='Which one are you getting?';assert.equal(evaluate(boarding).status,'INCONCLUSIVE');
});

test('cancellation requires actual planner alternatives and retains cancelled departure',()=>{
 const c=base({point:'let',mode:undefined});c.config.scenario='cancellation';c.app.heroText="You're at Letchworth · departures";c.app.boards[0].cancelled=true;c.app.bannersText='1 train cancelled';c.app.options={usableCount:2};assert.equal(evaluate(c).status,'PASS');
 c.app.options.usableCount=0;assert.equal(row(evaluate(c),'cancellation-replan').status,'FAIL');c.app.options=undefined;assert.equal(row(evaluate(c),'cancellation-replan').status,'INCONCLUSIVE');
});

test('outages and recovery are established by application errors and parsed source state',()=>{
 const c=base({point:'let',mode:undefined,elapsed:16});c.config.scenario='outage';c.app.errors=['Provider unavailable'];assert.equal(evaluate(c).status,'PASS');c.app.errors=[];assert.equal(evaluate(c).status,'FAIL');
 c.point='approach';c.mode='rail';c.elapsed=50;c.app.railSource='darwin';assert.equal(row(evaluate(c),'provider-recovery').status,'PASS');c.app.boards=[];assert.equal(row(evaluate(c),'provider-recovery').status,'FAIL');
});

test('home arrival needs configured home evidence and actual arrival wording',()=>{
 const c=base({point:'home',mode:undefined});c.config.direction='return';c.app.direction='home';c.app.hasConfiguredHome=true;c.app.atHome=true;c.app.heroText="Nearly home · You're home";assert.equal(evaluate(c).status,'PASS');c.app.atHome=false;assert.equal(evaluate(c).status,'FAIL');c.app.hasConfiguredHome=false;assert.equal(evaluate(c).status,'INCONCLUSIVE');
});

test('station alighting does not silently override an active through ride',()=>{
 const c=base({point:'far',mode:undefined});c.config.direction='return';c.config.route='far';c.app.direction='home';c.app.atHub='ZFD';c.app.ride={vehicle:'SIM-TUBE-WEST-far-1'};assert.equal(evaluate(c).status,'INCONCLUSIVE');c.app.ride=null;c.app.heroText='Farringdon departure platform';assert.equal(evaluate(c).status,'PASS');
});

test('platform and disruption assertions use actual parsed provider output',()=>{
 const c=base({point:'let',mode:undefined});c.config.scenario='platform-change';c.app.heroText="You're at Letchworth · departures";c.app.boards[0].platform='4';c.app.listText='Platform 4';assert.equal(evaluate(c).status,'PASS');c.app.boards[0].platform='2';assert.equal(row(evaluate(c),'platform-change').status,'FAIL');
 c.config.scenario='disruption';c.app.bannersText='Metropolitan severe delays';c.app.lineStatuses=[{id:'metropolitan',statuses:[{sev:6}]}];assert.equal(row(evaluate(c),'underground-disruption').status,'PASS');c.app.lineStatuses=[{id:'metropolitan',statuses:[{sev:10}]}];assert.equal(row(evaluate(c),'underground-disruption').status,'FAIL');
});

test('verification evidence is selected observations and never a private state dump',()=>{
 const c=base();c.app.settings={rdmKey:'SECRET'};c.app.here=[51.975,-.23];c.app.heroText+=' private password=SECRET address';const result=evaluate(c);const serialized=JSON.stringify(result);assert.ok(!serialized.includes('SECRET'));assert.ok(!serialized.includes('51.975'));assert.ok(!serialized.includes('private password'));
});

test('passing a railway interchange is explicitly verified rather than masked by successful GPS playback',()=>{
 const c=base({point:'stp',label:'Passing St Pancras',mode:'rail'});c.config.route='far';c.app.train.serviceId='SIM-TL-0912';assert.equal(evaluate(c).status,'PASS');
 c.app.onLine=false;c.app.view='at-hub';c.app.heroText="At King's Cross · Which Underground?";const bad=evaluate(c);assert.equal(bad.status,'FAIL');assert.equal(row(bad,'rail-progress').status,'FAIL');
});

test('a changed platform hidden by the renderer produces a visible verification failure',()=>{
 const c=base({point:'let',mode:undefined});c.config.scenario='platform-change';c.app.heroText="You're at Letchworth · departures";c.app.boards[0].platform='4';c.app.listText='Platform 2';assert.equal(row(evaluate(c),'platform-presentation').status,'FAIL');
});

test('return Kings Cross Underground checkpoint uses the matching station in its explanation',()=>{
 const c=base({point:'kxTube',mode:undefined});c.config.direction='return';c.app.direction='home';c.app.atHub='KGX';c.app.heroText="King's Cross departures";const a=row(evaluate(c),'station-arrival');assert.equal(a.status,'PASS');assert.match(a.expected,/King’s Cross/);assert.doesNotMatch(a.expected,/Farringdon/);
});

test('departure-platform assertions do not manufacture failures at unrelated arrival stops',()=>{
 const london=base({point:'kgx',mode:undefined});london.config.scenario='platform-change';london.app.atHub='KGX';london.app.heroText='Which Underground service?';const a=evaluate(london);assert.equal(row(a,'platform-change'),undefined);assert.equal(row(a,'platform-presentation'),undefined);
 const home=base({point:'let',mode:undefined});home.config.direction='return';home.config.scenario='platform-change';home.app.direction='home';home.app.onLine=false;home.app.heroText='Nearly home';const b=evaluate(home);assert.equal(b.status,'PASS');assert.equal(row(b,'platform-change'),undefined);
});

test('a correctly warned contradictory passenger pick is not reported as an application identity defect',()=>{
 const c=base();c.config.scenario='wrong-train';c.app.train.picked=true;c.app.train.conflict=true;c.app.heroText+=' Your selected train does not match your current location.';let result=evaluate(c);assert.equal(result.status,'INCONCLUSIVE');assert.equal(row(result,'rail-identity').status,'INCONCLUSIVE');assert.equal(row(result,'selection-conflict').status,'PASS');
 c.app.train.conflict=false;result=evaluate(c);assert.equal(result.status,'FAIL');assert.equal(row(result,'rail-identity').status,'FAIL');
});

test('uncertain model output requires the genuine passenger choice question on screen',()=>{
 const c=base();c.config.scenario='uncertain';c.app.train.sure=false;const result=evaluate(c);assert.equal(row(result,'uncertainty-presentation').status,'FAIL');
});

test('explicit planning views are inconclusive without hiding an unintended presentation change',()=>{
 const c=base();c.app.planMode='by';c.app.view='plan-by';c.app.heroText='Arrive by tomorrow';assert.equal(evaluate(c).status,'INCONCLUSIVE');
 c.app.planMode='now';assert.equal(row(evaluate(c),'rail-presentation').status,'FAIL','forcing the planner without a user request is still a presentation defect');
 c.app.planMode='at';c.app.view='on-train';c.app.heroText='On the train';assert.equal(evaluate(c).status,'PASS','live inference may legitimately win over leave-around');
});

test('office dwell verifies the legitimate homeward plan after the arrival acknowledgement',()=>{
 const c=base({point:'office',label:'Office dwell',mode:undefined});c.app.direction='home';c.app.nearOffice=true;c.app.onLine=false;c.app.ride=null;c.app.view='plan-now';c.app.heroText='If you leave now · Tubes from Aldgate · home at 17:20';const result=evaluate(c);assert.equal(result.status,'PASS');assert.equal(row(result,'office-presentation'),undefined,'the earlier arrival acknowledgement no longer applies');assert.equal(row(result,'office-dwell-plan').status,'PASS');
 for(const patch of [{direction:'office'},{onLine:true},{ride:{vehicle:'OLD-TUBE'},view:'on-tube-home',heroText:'On the tube towards home'},{view:'on-train',heroText:'On the train home'},{heroText:'On the tube · old arrival at home'}]){
  const wrong=base({point:'office',label:'Office dwell',mode:undefined});wrong.app={...c.app,...patch};assert.equal(evaluate(wrong).status,'FAIL',JSON.stringify(patch));
 }
});

test('initial office arrival still requires arrival wording and sufficient actual evidence',()=>{
 const c=base({point:'office',label:'Arrive at office',mode:undefined});c.app.nearOffice=true;c.app.heroText='At the office';assert.equal(evaluate(c).status,'PASS');c.app.heroText='If you leave now · home';assert.equal(row(evaluate(c),'office-presentation').status,'FAIL','homeward wording is not substituted for initial arrival');
 const dwell=base({point:'office',label:'Office dwell',mode:undefined});dwell.app.direction='home';dwell.app.nearOffice=true;dwell.app.onLine=false;dwell.app.view='plan-now';dwell.app.heroText='If you leave now · home';delete dwell.app.ride;assert.equal(evaluate(dwell).status,'INCONCLUSIVE','missing ride evidence does not prove completion');
});
