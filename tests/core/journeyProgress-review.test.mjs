// Independent progress evidence probes. Provider observations and the selected
// itinerary are facts; advancing a clock must not manufacture station reports.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {core,at,MIN,testville,train,fixture} from './helpers.mjs';

const START=at('2026-11-03','10:00');
const legs=()=>[
 {id:'walk',kind:'walk',label:'Walk',start:START-10*MIN,end:START},
 {id:'rail',kind:'rail',label:'Train',start:START,end:START+30*MIN,fromCode:'A',toCode:'C'},
 {id:'tube',kind:'tube',label:'Tube',start:START+30*MIN,end:START+40*MIN},
 {id:'last-walk',kind:'walk',label:'Walk',start:START+40*MIN,end:START+45*MIN},
];
const calls=()=>[
 {code:'A',name:'Alpha',scheduledAt:START,actualAt:START},
 {code:'B',name:'Bravo',scheduledAt:START+10*MIN,actualAt:START+8*MIN},
 {code:'C',name:'Charlie',scheduledAt:START+30*MIN,expectedAt:START+28*MIN},
];
const input=(extra={})=>({now:START+15*MIN,legs:legs(),activeLeg:'rail',calls:calls(),
 evidence:{source:'reported',observedAt:START+15*MIN,identityMatched:true,expectedAt:START+28*MIN,scheduledAt:START+30*MIN},...extra});
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

test('independent progress: future actual data in a cached observation never turns into a report as time passes',()=>{
 const observation=START+5*MIN;
 const invalidCalls=[calls()[0],{code:'B',name:'Bravo',scheduledAt:START+10*MIN,actualAt:START+12*MIN},calls()[2]];
 const evidence={source:'reported',observedAt:observation,identityMatched:true,maxAgeMs:60*MIN};
 const before=core.journeyProgress(input({now:START+10*MIN,calls:invalidCalls,evidence}));
 const later=core.journeyProgress(input({now:START+20*MIN,calls:invalidCalls,evidence}));
 assert.notEqual(before.calls[1].state,'reported');assert.notEqual(later.calls[1].state,'reported');
 assert.equal(before.fraction,0);assert.equal(later.fraction,0,'only the first genuine report can fill the bar');
});

test('independent progress: stale calling-point progress is frozen and cannot produce fresh ahead or behind claims',()=>{
 const evidence={source:'reported',observedAt:START+14*MIN,identityMatched:true,expectedAt:START+28*MIN,scheduledAt:START+30*MIN};
 const first=core.journeyProgress(input({now:START+19*MIN,evidence}));
 const later=core.journeyProgress(input({now:START+25*MIN,evidence}));
 assert.equal(first.source,'stale');assert.equal(later.source,'stale');
 assert.equal(first.fraction,.5);assert.equal(later.fraction,.5);
 assert.equal(first.status.deltaMin,null);assert.equal(later.status.deltaMin,null);
 assert.doesNotMatch(later.status.text,/ahead|behind/);assert.match(later.evidenceLabel,/stale|historical/i);
 assert.equal(later.calls[1].state,'reported','historical actual reports remain facts, with the stale qualifier');
});

test('independent progress: an explicit service or vehicle match is required before a prediction becomes live evidence',()=>{
 const e={source:'prediction',observedAt:START+15*MIN,expectedAt:START+28*MIN,scheduledAt:START+30*MIN};
 const tubeLegs=[{id:'tube',kind:'tube',label:'Tube',start:START,end:START+30*MIN}];
 for(const identityMatched of [undefined,false]){
  const p=core.journeyProgress(input({legs:tubeLegs,activeLeg:'tube',evidence:{...e,identityMatched}}));
  assert.notEqual(p.source,'prediction');assert.equal(p.status.deltaMin,null);
  assert.doesNotMatch(p.status.text,/ahead|behind/);
  assert.ok(p.calls.every(c=>c.state!=='reported'),'a Tube prediction is never a station report');
 }
 const matched=core.journeyProgress(input({legs:tubeLegs,activeLeg:'tube',evidence:{...e,identityMatched:true}}));
 assert.equal(matched.source,'prediction');assert.equal(matched.status.deltaMin,-2);
 assert.ok(matched.calls.every(c=>c.state!=='reported'));
 assert.match(matched.evidenceLabel,/estimate/i,'position remains estimated even with a live arrival');
});

test('independent progress: cancellation and no-estimate retain history without promising future expected calls',()=>{
 for(const flag of ['cancelled','noEstimate']){
  const p=core.journeyProgress(input({[flag]:true}));
  assert.equal(p.status.level,'bad');assert.equal(p.status.deltaMin,null);
  assert.equal(p.calls[1].state,'reported');assert.equal(p.fraction,.5);
  assert.equal(p.calls[2].state,'unknown');assert.equal(p.calls[2].deltaMin,null);
 }
 const c=calls();c[1].cancelled=true;
 const skipped=core.journeyProgress(input({calls:c}));
 assert.notEqual(skipped.calls[1].state,'reported','a cancelled call is not a successful station report');
});

test('independent progress: early reports use the original timetable and shared configured delay colours',()=>{
 const early=core.journeyProgress(input());
 assert.equal(early.status.deltaMin,-2);assert.match(early.status.text,/2 min ahead/);
 assert.equal(early.calls[1].deltaMin,-2);
 const p=core.journeyProgress(input({policy:{rail:{warnMin:3,badMin:8}},
  evidence:{source:'reported',observedAt:START+15*MIN,identityMatched:true,expectedAt:START+39*MIN,scheduledAt:START+30*MIN}}));
 assert.equal(p.status.deltaMin,9);assert.equal(p.status.level,'bad');
 assert.match(p.status.text,/9 min behind/);
});

test('independent progress: a canonically fast-walking itinerary cannot overlap the train or rewrite the chosen option',()=>{
 const departure=START+10*MIN;
 const t=train({from:'RVS',to:'CEN',std:'10:10',dep:departure,arr:departure+20*MIN});
 const route={hub:'CEN',board:'RVS-CEN',fromName:'Riverside',
  before:[{kind:'walk',secs:600,avg:600,fast:300,step:{at:'start',d:'Leave Riverside'}},{kind:'station',secs:60}],
  after:[],arriveLabel:'Arrive Central'};
 const option=core.buildOptions([route],{'RVS-CEN':{services:[t],msgs:[]}},testville)[0];
 core.gradeEffort([option],departure-400000,{walkKmh:5,runKm:2,runFactor:2,carFromHomeSecs:120,cabWaitSecs:0,cabKmh:50,stickMs:0},null,()=>'',()=>true);
 assert.equal(option.effort,'fast');assert.equal(option.leave,departure-360000);
 const before=JSON.stringify(option);freeze(option);
 const result=core.progressLegsFromSteps({option,route});
 const rail=result.find(l=>l.kind==='rail');
 assert.ok(result.filter(l=>l.kind!=='rail').every(l=>l.end<=rail.start),'effective access is complete before boarding');
 assert.equal(result[0].start,option.leave,'use the chosen fast-walk start, not a new earlier route');
 assert.equal(JSON.stringify(option),before,'drawing progress cannot change the selected itinerary');
});

test('independent progress: model and time-overlay helpers accept frozen observations without mutating saved state',()=>{
 const supplied=freeze(input()),before=JSON.stringify(supplied);
 const model=core.journeyProgress(supplied);assert.ok(model);
 const overlaid=core.retimeProgressLeg({legs:supplied.legs,legId:'tube',start:START+31*MIN,expectedEnd:START+42*MIN,tailEnd:START+47*MIN});
 assert.equal(overlaid.find(l=>l.id==='tube').end,START+42*MIN);
 assert.equal(JSON.stringify(supplied),before);
 assert.deepEqual(supplied.legs[2],legs()[2]);
});

test('independent progress: the recorded Metropolitan terminus platform direction controls destination predictions',()=>{
 const captured=Date.parse('2026-10-30T22:43:00Z'),data=fixture('tfl-2026-10-30T2243Z/ALD.json');
 const north=data.find(p=>p.lineId==='metropolitan'&&/Northbound/.test(p.platformName));
 assert.ok(north,'use the recorded terminus platform, rather than inventing an eastbound Metropolitan prediction');
 const request={vehicle:north.vehicleId,hub:'ALD',stopId:'940GZZLUALD',lineId:'metropolitan',direction:'northbound',now:captured,fetchedAt:captured,readyMs:0};
 const accepted=core.followTubeArrival(data,request);assert.ok(accepted);
 assert.equal(accepted.arrival,Date.parse(north.expectedArrival));
 for(const invalid of [{direction:'eastbound'},{direction:undefined},{vehicle:'another-train'},{lineId:'circle'},{stopId:'another-stop'}])
  assert.equal(core.followTubeArrival([north],{...request,...invalid}),null,'unknown or mismatched identity/platform cannot become live');
 assert.equal(core.followTubeArrival([{...north,timestamp:new Date(captured-3*MIN).toISOString()}],request),null);
 assert.equal(core.followTubeArrival(data,{...request,now:captured+3*MIN}),null,'a matching direction cannot revive an expired cache');
});
