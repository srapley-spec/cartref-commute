import {test} from 'node:test';
import assert from 'node:assert/strict';
import {core,at,MIN,train,testville} from './helpers.mjs';
const time=h=>at('2026-11-03',h),now=time('09:20');
const legs=[{id:'walk',kind:'walk',label:'Walk',start:time('08:50'),end:time('09:00')},
 {id:'rail',kind:'rail',label:'Train',start:time('09:00'),end:time('10:00')},
 {id:'tube',kind:'tube',label:'Tube',start:time('10:00'),end:time('10:15')},
 {id:'home',kind:'walk',label:'Walk',start:time('10:15'),end:time('10:25')}];
const calls=[{code:'RVS',name:'Riverside',scheduledAt:time('09:00'),actualAt:time('09:00')},
 {code:'MID',name:'Middle',scheduledAt:time('09:15'),actualAt:time('09:15')},
 {code:'CEN',name:'Central',scheduledAt:time('10:00'),expectedAt:time('10:00')}];
const input=(extra={})=>({now,legs,activeLeg:'rail',calls,evidence:{source:'reported',observedAt:now,identityMatched:true,expectedAt:time('10:00'),scheduledAt:time('10:00')},...extra});

test('journey progress shows the complete itinerary and only the last reported calling point as confirmed progress',()=>{
 const p=core.journeyProgress(input());
 assert.deepEqual(p.legs.map(l=>l.state),['complete','current','upcoming','upcoming']);
 assert.equal(p.fraction,.5,'report milestone is not an invented moving position');
 assert.equal(p.source,'reported');assert.equal(p.calls[2].state,'expected');
 assert.match(p.evidenceLabel,/no passing-point position/);
});

test('journey progress uses signed live baselines and the shared configurable rail delay colours',()=>{
 const early=core.journeyProgress(input({evidence:{source:'reported',observedAt:now,identityMatched:true,expectedAt:time('09:57'),scheduledAt:time('10:00')}}));
 assert.match(early.status.text,/3 min ahead/);assert.equal(early.status.deltaMin,-3);
 const late=core.journeyProgress(input({evidence:{source:'reported',observedAt:now,identityMatched:true,expectedAt:time('10:07'),scheduledAt:time('10:00')}}));
 assert.match(late.status.text,/7 min behind/);assert.equal(late.status.level,'warn');
 const configured=core.journeyProgress(input({policy:{rail:{warnMin:2,badMin:6}},evidence:{source:'reported',observedAt:now,identityMatched:true,expectedAt:time('10:07'),scheduledAt:time('10:00')}}));
 assert.equal(configured.status.level,'bad');
});

test('journey progress freezes stale reports and never promotes a future cached actual into a report',()=>{
 const stale=core.journeyProgress(input({now:now+3*MIN}));
 assert.equal(stale.source,'stale');assert.equal(stale.fraction,.5);assert.equal(stale.status.deltaMin,null);
 const future=[...calls,{code:'FUT',name:'Future',scheduledAt:now+MIN,actualAt:now+MIN}];
 const p=core.journeyProgress(input({now:now+2*MIN,calls:future}));
 assert.equal(p.calls[3].state,'unknown','time advancing cannot validate a report later than capture');
});

test('journey progress labels Tube prediction positions estimated and does not confuse plan variance with connection risk',()=>{
 const tube=[{id:'tube',kind:'tube',label:'Tube',start:time('09:10'),end:time('09:30')}];
 const p=core.journeyProgress(input({legs:tube,activeLeg:'tube',calls:[{name:'Start',actualAt:time('09:10')},{name:'Stop',scheduledAt:time('09:28'),expectedAt:time('09:30')}],
  evidence:{source:'prediction',observedAt:now,identityMatched:true,expectedAt:time('09:30'),scheduledAt:time('09:28')}}));
 assert.equal(p.source,'prediction');assert.equal(p.fraction,.5);
 assert.equal(p.calls[0].state,'unknown','a prediction cannot create an actual station report');
 assert.match(p.progressLabel,/Estimated/);assert.equal(p.status.level,'info');
 assert.equal(p.calls[1].level,'info','a Tube plan variance does not use rail service-delay colour thresholds');
 const unmatched=core.journeyProgress(input({legs:tube,activeLeg:'tube',evidence:{source:'prediction',observedAt:now,identityMatched:false,expectedAt:time('09:30'),scheduledAt:time('09:28')}}));
 assert.equal(unmatched.source,'modelled');assert.equal(unmatched.status.deltaMin,null);
});

test('journey progress retains history but makes cancellation and unknown arrival explicit without future promises',()=>{
 for(const extra of [{cancelled:true},{noEstimate:true}]){
  const p=core.journeyProgress(input(extra));assert.equal(p.status.level,'bad');
  assert.equal(p.calls[0].state,'reported');assert.equal(p.calls[2].state,'unknown');assert.equal(p.calls[2].deltaMin,null);
 }
});

test('progress itinerary reuses canonical fast-walk steps and does not overlap a departed rail leg',()=>{
 const dep=time('09:00'),t=train({from:'RVS',to:'CEN',dep,arr:time('09:40')});
 const route={hub:'CEN',board:'RVS-CEN',fromName:'Riverside',before:[{kind:'walk',secs:600,fast:300,step:{at:'start',d:'Walk'}},{kind:'station',secs:60}],after:[],arriveLabel:'Arrive Central'};
 const [o]=core.buildOptions([route],{'RVS-CEN':{services:[t],msgs:[]}},testville);
 core.gradeEffort([o],dep-400000,testville.effort||{runFactor:1.8,runKm:2,walkKmh:5,carFromHomeSecs:600,cabWaitSecs:300,cabKmh:30,stickMs:0},null,()=> 'RVS',()=>true);
 assert.equal(o.effort,'fast');
 const original=JSON.stringify(o),p=core.progressLegsFromSteps({option:o,route,names:testville.stationNames});
 assert.equal(p[0].start,o.leave);assert.equal(p[0].end,t.dep);assert.equal(p[1].start,t.dep);
 assert.equal(JSON.stringify(o),original);
});

test('progress itinerary preserves saved onward leg identities when current rail arrival becomes unknown',()=>{
 const t=train({from:'RVS',to:'CEN',dep:time('09:00'),arr:time('09:40')});
 const option={hub:'CEN',train:t,leave:time('08:50'),arrive:time('10:00'),flags:[],before:[],legs:[{t:t.dep,d:'Train',train:true},{t:time('09:45'),d:'Tube',tube:true},{t:time('10:00'),d:'Arrive'}]};
 const p=core.progressLegsFromSteps({option,train:{...t,arr:null},tubeRideSecs:300});
 assert.equal(p.find(l=>l.kind==='rail').end,null);assert.ok(p.some(l=>l.kind==='tube'));assert.ok(p.some(l=>l.kind==='walk'));
});

test('remembered progress context expires at its known journey window and never retimes supplied legs',()=>{
 assert.equal(core.progressContextCurrent(legs,time('09:10'),time('10:10')),true);
 assert.equal(core.progressContextCurrent(legs,time('09:10'),time('11:00')),false);
 assert.equal(core.progressContextCurrent(legs,time('09:10'),time('09:00')),false);
 const before=JSON.stringify(legs);const changed=core.retimeProgressLeg({legs,legId:'tube',start:time('10:03'),expectedEnd:time('10:18'),tailEnd:time('10:28')});
 assert.equal(JSON.stringify(legs),before);assert.equal(changed.find(l=>l.id==='tube').start,time('10:03'));
});
