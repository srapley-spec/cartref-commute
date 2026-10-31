import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/simulator/report.js',import.meta.url),'utf8');
function create(options={}){
 const context=vm.createContext({Date});
 vm.runInContext(source+';globalThis.makeReporter=createJourneySimulationReporter;',context);
 return context.makeReporter({now:()=>Date.parse('2026-11-03T09:00:00Z'),...options});
}
const config={sessionId:1,direction:'outbound',route:'kgx',scenario:'normal',speed:20,startTime:Date.parse('2026-11-03T08:44:00Z'),totalCheckpoints:14,sources:{gps:true,feeds:true}};
const check=(index,status='PASS',extra={})=>({sessionId:1,index,point:'north',label:'On train at Stevenage',at:Date.parse('2026-11-03T09:16:00Z'),assertions:[{id:'rail-service',expected:'Identify the 09:05 Great Northern',actual:'The real engine identified SIM-GN-0905',status,evidence:{serviceId:'SIM-GN-0905',onLine:true,sure:true}}],...extra});

test('simulator reports count actual assertions separately from completed checkpoints',()=>{
 const r=create();assert.equal(r.getReport(),null);assert.equal(r.serialize(),'null');
 r.start(config);
 r.recordCheckpoint(check(0,'PASS',{assertions:[]}));
 assert.equal(r.getReport().checkpoints[0].status,'INCONCLUSIVE','arriving is not an assertion');
 r.recordCheckpoint(check(1));r.recordCheckpoint(check(2,'FAIL'));r.recordCheckpoint(check(3,'INCONCLUSIVE'));
 const s=r.summary();
 assert.equal(s.completedCheckpoints,4);assert.equal(s.totalCheckpoints,14);
 assert.equal(s.passedAssertions,1);assert.equal(s.failedAssertions,1);assert.equal(s.inconclusiveAssertions,1);
 assert.equal(s.passedCheckpoints,1);assert.equal(s.failedCheckpoints,1);assert.equal(s.inconclusiveCheckpoints,2);
 assert.equal(r.getReport().config.route,'kgx');assert.equal(r.getReport().config.sources.gps,true);
});

test('simulator reports preserve failures and record later observations without erasing evidence',()=>{
 const r=create();r.start(config);
 r.recordCheckpoint(check(4,'FAIL',{assertions:[{id:'rail-service',expected:'GN 09:05',actual:'TL 09:12',status:'FAIL',evidence:{serviceId:'SIM-TL-0912'}}]}));
 r.recordCheckpoint(check(4));
 const row=r.getReport().checkpoints[0];
 assert.equal(row.status,'FAIL');assert.equal(row.assertions[0].actual,'TL 09:12');
 assert.equal(row.assertions[0].evidence.serviceId,'SIM-TL-0912');
 assert.ok(row.revisions.some(value=>value.status==='PASS'),'recovery remains inspectable');
 assert.equal(r.summary().completedCheckpoints,1);assert.equal(r.summary().failedAssertions,1);assert.equal(r.summary().passedAssertions,0);
});

test('malformed or undefined assertions cannot turn completed playback into a pass',()=>{
 const r=create();r.start(config);
 r.recordCheckpoint(check(0,'PASS',{assertions:new Array(2)}));
 r.recordCheckpoint(check(1,'PASS',{assertions:[null,undefined,{id:'missing',status:'PASS'}]}));
 assert.equal(r.getReport().checkpoints[0].status,'INCONCLUSIVE');assert.equal(r.getReport().checkpoints[1].status,'INCONCLUSIVE');
 assert.equal(r.summary().passedAssertions,0);assert.equal(r.summary().passedCheckpoints,0);
 assert.equal(r.recordCheckpoint(null),null);assert.equal(r.recordEvent(null),null);
});

test('simulator report snapshots and finished sessions cannot be mutated by callers or late callbacks',()=>{
 const r=create();r.start(config);const input=check(4);r.recordCheckpoint(input);
 input.assertions[0].evidence.serviceId='INJECTED';
 const snapshot=r.getReport();snapshot.checkpoints[0].assertions[0].evidence.serviceId='MODIFIED';snapshot.config.route='far';
 assert.equal(r.getReport().checkpoints[0].assertions[0].evidence.serviceId,'SIM-GN-0905');assert.equal(r.getReport().config.route,'kgx');
 assert.equal(r.recordCheckpoint(check(5,'FAIL',{sessionId:2})),null);
 assert.equal(r.recordEvent({sessionId:2,type:'stale',message:'old session'}),null);
 const ended=Date.parse('2026-11-03T10:10:00Z');r.finish('stopped',ended);r.finish('completed',ended+60000);
 assert.equal(r.getReport().finishedAt,ended);assert.equal(r.summary().reason,'stopped');
 assert.equal(r.recordCheckpoint(check(6,'FAIL')),null);assert.equal(r.summary().completedCheckpoints,1);
 assert.equal(r.recordEvent({type:'late',message:'discard'}),null);
 r.start({...config,sessionId:2,route:'far'});assert.equal(r.summary().completedCheckpoints,0);assert.equal(r.summary().finished,false);assert.equal(r.getReport().config.route,'far');
});

test('simulator exports allow only diagnostic facts and redact credentials and personal locations',()=>{
 const key='test-secret-Key-9aBcDef',homeAddress='42 Private Crescent',person='Private Persona';
 const r=create({privateValues:[key,homeAddress,person]});
 r.start({...config,apiKey:key,settings:{rdmKey:key},home:[51.975123,-.230456],saved:{name:person},url:'https://example.invalid?api_key='+key});
 r.recordCheckpoint(check(4,'FAIL',{label:person+' at '+homeAddress,assertions:[{id:'location',expected:'Home',actual:'Found '+person+' at '+homeAddress+' SG6 3AA (51.975123, -0.230456) via https://example.invalid?token='+key,status:'FAIL',evidence:{onLine:false,locAcc:1400,serviceId:'SIM-GN-0905',heroText:'RAW HERO '+person,here:[51.975123,-.230456],latitude:51.975123,settings:{tflKey:key},requestURL:'https://example.invalid?key='+key,secret:key}}]}));
 r.recordEvent({sessionId:1,type:'source',message:'Bearer abc987consumer x-apikey="quoted secret value" tflKey=unquotedsecret token='+key,evidence:{direction:'office',onLine:false,errors:[key],coords:{latitude:51.975123,longitude:-.230456}}});
 const json=r.serialize(),out=JSON.parse(json);
 for(const value of [key,homeAddress,person,'SG6 3AA','51.975123','0.230456','quoted secret value','unquotedsecret','abc987consumer','https://','RAW HERO','requestURL','latitude','settings','coords'])assert.ok(!json.includes(value),'export excludes '+value);
 assert.equal(out.checkpoints[0].assertions[0].evidence.locAcc,1400);assert.equal(out.checkpoints[0].assertions[0].evidence.serviceId,'SIM-GN-0905');
 assert.equal(out.checkpoints[0].assertions[0].evidence.onLine,false);assert.equal(out.events[0].evidence.direction,'office');
 assert.ok(json.includes('[redacted]'));assert.ok(json.includes('[coordinates omitted]'));assert.equal(out.config.scenario,'normal');
});

test('new private-value redactions also protect already-recorded diagnostic text',()=>{
 const r=create();r.start(config);r.recordEvent({type:'observation',message:'Personal Landmark'});r.finish('Personal Landmark');
 r.setPrivateValues(['Personal Landmark']);
 assert.ok(!r.serialize().includes('Personal Landmark'));assert.equal(r.summary().reason,'[redacted]');
 assert.equal(r.getReport().events[0].message,'[redacted]');
});

test('private place names cannot redact the report format or validated public metadata',()=>{
 const r=create({privateValues:['Cartref','kgx','outbound','PASS']});r.start(config);
 r.recordCheckpoint(check(4,'PASS',{actualDisplay:{view:'on-train',mainCard:'Cartref is a personal place. kgx outbound PASS',notices:[]}}));
 const out=JSON.parse(r.serialize());
 assert.equal(out.schemaVersion,1);assert.equal(out.kind,'cartref-commute-simulation');
 assert.equal(out.config.direction,'outbound');assert.equal(out.config.route,'kgx');assert.equal(out.checkpoints[0].status,'PASS');
 assert.equal(out.checkpoints[0].actualDisplay.mainCard,'[redacted] is a personal place. [redacted] [redacted] [redacted]');
 r.setPrivateValues(['Cartref','SIM-GN-0905']);
 assert.equal(JSON.parse(r.serialize()).checkpoints[0].assertions[0].evidence.serviceId,'[redacted]','untrusted IDs still receive exact private-value redaction');
});

test('exported actual main-card text preserves app wording while redacting private display details',()=>{
 const r=create({privateValues:['private-display-key','Personal Destination']});r.start(config);
 r.recordCheckpoint(check(4,'FAIL',{actualDisplay:{view:'on-train',mainCard:"Probably the 09:12 Thameslink. Personal Destination, 42 Hidden Road SG6 3AA; GPS 51.975,-0.23. tflKey=private-display-key",notices:['Train cancelled','See https://feed.invalid?token=private-display-key'],settings:{secret:'DO NOT COPY'},rawState:{here:[51.975,-.23]}}}));
 const out=JSON.parse(r.serialize()),display=out.checkpoints[0].actualDisplay;
 assert.equal(display.view,'on-train');assert.ok(display.mainCard.startsWith('Probably the 09:12 Thameslink.'));
 assert.equal(display.notices[0],'Train cancelled');
 for(const value of ['private-display-key','Personal Destination','42 Hidden Road','SG6 3AA','51.975','-0.23','https://','DO NOT COPY','rawState','settings'])assert.ok(!r.serialize().includes(value),'actual display excludes '+value);
 assert.ok(display.mainCard.includes('[redacted]'));assert.equal(display.notices[1],'See [URL omitted]');
});

test('report redaction happens before truncation and rejects short decimal coordinate pairs',()=>{
 const secret='private-value-crossing-the-text-limit';
 const r=create({privateValues:[secret]});r.start(config);
 r.recordEvent({type:'observation',message:'x'.repeat(1190)+' '+secret+' at 51.975,-0.23'});
 const serialized=r.serialize();assert.ok(!serialized.includes('private-value'));assert.ok(!serialized.includes('51.975'));assert.ok(!serialized.includes('-0.23'));
 r.recordEvent({type:'observation',message:'GPS 51.975,-0.23 and 51.975123,-.23'});
 assert.ok(!r.serialize().includes('0.23'));assert.ok(!r.serialize().includes('51.975'));
});

test('simulator report history is bounded and discloses truncated events',()=>{
 const r=create();r.start(config);
 for(let i=0;i<502;i++)r.recordEvent({type:'observation',message:'Train candidate changed',at:config.startTime+i});
 assert.equal(r.getReport().events.length,500);assert.equal(r.getReport().truncated.events,2);
 assert.equal(r.summary().events,500);
});

test('repeated assertion changes remain bounded while preserving recorded failures first',()=>{
 const r=create();r.start(config);
 const assertions=prefix=>Array.from({length:80},(_,i)=>({id:prefix+i,expected:'Correct train',actual:'Wrong train',status:'FAIL'}));
 r.recordCheckpoint(check(4,'FAIL',{assertions:assertions('first-')}));
 r.recordCheckpoint(check(4,'FAIL',{assertions:assertions('second-')}));
 const row=r.getReport().checkpoints[0];
 assert.equal(row.assertions.length,100);assert.equal(row.status,'FAIL');
 assert.ok(row.assertions.some(item=>item.id==='first-79'),'existing failure retained');
 assert.equal(r.getReport().truncated.assertions,60);
});
