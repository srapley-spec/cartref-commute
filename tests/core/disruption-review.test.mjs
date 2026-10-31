// Independent policy probes: exercise public consumers using a different corridor and
// non-default thresholds so duplicated production constants cannot accidentally pass.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {core,at,MIN,testville,train} from './helpers.mjs';

const NOW=at('2026-11-03','10:00');
const policy={rail:{warnMin:3,badMin:8,lookbackMin:2,affectedTrainCount:3}};
const profile={...testville,disruption:policy};
const service=(late=0,extra={})=>train({from:'RVS',to:'CEN',std:'10:10',
 dep:NOW+(10+late)*MIN,arr:NOW+(40+late)*MIN,depLate:late,arrLate:late,...extra});
const boards=(services,msgs=[])=>({'RVS-CEN':{services,msgs}});
const route={hub:'CEN',board:'RVS-CEN',fromName:'Riverside',
 before:[{kind:'walk',secs:300}],after:[{kind:'walk',secs:300}],arriveLabel:'Arrive Central'};
const statusInput=(tiers,extra={})=>({errors:[],notLoaded:[],stale:false,tubeFallback:false,
 tiers,tubeLines:[],operators:[],planLater:false,demo:false,timetableOnly:false,...extra});
const line=(...severities)=>({id:'city-line',name:'City line',statuses:severities.map(sev=>({sev,desc:'severity '+sev,reason:'Reason for '+sev}))});

test('independent disruption policy: one override reaches train, option, warnings, summary, prominence and Follow',()=>{
 for(const [minutes,level] of [[2,'ok'],[3,'warn'],[7,'warn'],[8,'bad'],[9,'bad']]){
  const t=service(minutes),b=boards([t]);
  assert.equal(core.delayLevel(minutes,policy),level,'direct delay colour');
  assert.equal(core.delayStatus(minutes,false,policy).level,level,'worded train delay');
  assert.equal(core.trainStatus(t,policy).level,level,'train status');
  assert.equal(core.departureStatus(t,policy).level,level,'Expected column');
  assert.equal(core.arrivalStatus(t.arr,t.arr-minutes*MIN,policy).level,level,'arrival status');
  assert.equal(core.trainFlags(t,profile).find(f=>f.status).lvl,level,'option train flag');
  const tiers=core.railWarnings(b,['RVS-CEN'],NOW,profile);
  assert.equal(tiers.level,level==='bad'?'red':level==='warn'?'amber':'none','route warning');
  const summary=core.statusLine(statusInput(tiers,{policy}));
  assert.equal(summary.level,level,'presentation summary');
  const visible=core.visibleDisruptions({tiers,policy});
  assert.equal(visible.length,level==='ok'?0:1,'prominent warning');
  if(visible.length)assert.equal(visible[0].level,level);
 }
 const original=core.buildOptions([route],boards([service()]),profile)[0];
 const chosen=core.startFollowRoute(original,{now:NOW,direction:'office',mode:'commute'});
 assert.ok(chosen,'a real generic itinerary can be followed');
 const delayed=core.buildOptions([route],boards([service(9)]),profile)[0];
 const followed=core.updateFollowRoute(chosen,{now:NOW+12*MIN,options:[delayed],dataFresh:true,phase:'on-train',policy});
 assert.equal(followed.trainStatus.level,'bad','Follow must use the configured band too');
 assert.equal(chosen.plannedArrival,original.arrive,'presentation policy cannot rewrite the original journey');
});

test('independent disruption policy: arrival no-estimate counts and configurable lookback/count remain coherent',()=>{
 const current=[service(0,{arrUnknown:true}),service(0,{serviceId:'second',arrUnknown:true})];
 const defaults=core.railWarnings(boards(current),['RVS-CEN'],NOW,testville);
 assert.equal(defaults.uncertain.length,2);assert.equal(defaults.affected,2);assert.equal(defaults.hit,true);
 const old=service(0,{dep:NOW-2*MIN-1,depUnknown:true});
 const two=core.railWarnings(boards([...current,old]),['RVS-CEN'],NOW,profile);
 assert.equal(two.total,2,'a service just outside the configured lookback is excluded');
 assert.equal(two.hit,false,'two affected services do not satisfy a configured count of three');
 const edge=service(0,{dep:NOW-2*MIN,arrUnknown:true});
 const three=core.railWarnings(boards([...current,edge,old]),['RVS-CEN'],NOW,profile);
 assert.equal(three.total,3);assert.equal(three.affected,3);assert.equal(three.hit,true);
 assert.equal(three.level,'red','no-estimate remains serious independently of the line-wide count');
});

test('independent disruption policy: a cloned active observation overlays its board service rather than inventing a second train',()=>{
 const boarded=service(0,{serviceId:'same-physical-service',reason:'Board has an earlier on-time observation'});
 const current={...boarded,arr:boarded.arr+17*MIN,arrLate:17,reason:'Current train has a signalling delay'};
 const warnings=core.railWarnings(boards([boarded]),['RVS-CEN'],NOW,testville,{activeTrains:[current]});
 assert.equal(warnings.total,1,'the same train on the board and in Follow counts once');
 assert.equal(warnings.affected,1);assert.equal(warnings.hit,false,'one affected train cannot become a route-wide count of two');
 assert.equal(warnings.late,17,'the newer active observation supplies its current delay');
 assert.equal(warnings.delayed.length,1);assert.equal(warnings.delayed[0].reason,current.reason,'the live cause survives the overlay');
 const past={...current,dep:NOW-20*MIN};
 const beyondLookback=core.railWarnings(boards([past]),['RVS-CEN'],NOW,testville,{activeTrains:[{...past}]});
 assert.equal(beyondLookback.total,1,'the cloned current train remains relevant after its original departure');
 assert.equal(beyondLookback.affected,1);
});

test('independent disruption policy: Service Closed outranks simultaneous good service in every consumer',()=>{
 const mixed=line(10,20);
 assert.equal(core.worstStatus(mixed).sev,20);
 assert.equal(core.lineOk(mixed),false);assert.equal(core.lineLevel(mixed),'bad');
 assert.equal(core.tubeFallbackNeeded([mixed],['city-line']),true);
 const flags=core.tubeFlags({},[mixed],{main:['city-line'],fallback:[],fallbackNote:'Fallback'});
 assert.match(flags[0].txt,/severity 20/);assert.doesNotMatch(flags[0].txt,/severity 10/);
 assert.equal(core.statusLine(statusInput(null,{tubeLines:[mixed]})).level,'bad');
 const shown=core.visibleDisruptions({tubeLines:[mixed]});
 assert.equal(shown.length,1);assert.equal(shown[0].level,'bad');assert.match(shown[0].title,/severity 20/);
});

test('independent disruption policy: configurable Tube categories reach flags, fallback and visible impact',()=>{
 const changed={tube:{closedSeverities:[6]}},mixed=line(10,6);
 assert.equal(core.worstStatus(mixed,changed).sev,6);
 assert.equal(core.lineLevel(mixed,changed),'bad');assert.equal(core.lineOk(mixed,changed),false);
 assert.equal(core.tubeFallbackNeeded([mixed],['city-line'],changed),true);
 assert.equal(core.tubeFlags({},[mixed],{main:['city-line'],fallback:[],fallbackNote:'Fallback'},changed)[0].lvl,'bad');
 assert.equal(core.statusLine(statusInput(null,{tubeLines:[mixed],policy:changed})).level,'bad');
 assert.equal(core.visibleDisruptions({tubeLines:[mixed],policy:changed})[0].level,'bad');
 const minor=line(9);
 assert.equal(core.lineLevel(minor),'warn','minor information retains its semantic colour');
 assert.deepEqual(core.visibleDisruptions({tubeLines:[minor]}),[],'minor information can stay folded');
 assert.equal(core.visibleDisruptions({tubeLines:[minor],policy:{tube:{significantSeverities:[9]}}}).length,1,
  'changing prominence is configuration, not another hard-coded UI decision');
});

test('independent disruption policy: a partial good-status override cannot hide or promote an unrelated minor status',()=>{
 const changed={tube:{goodSeverities:[6,10]}},mixed=line(6,9);
 assert.equal(core.lineLevel(mixed,changed),'warn','the remaining minor problem is not silently good service');
 assert.equal(core.worstStatus(mixed,changed).sev,9,'configured good service is not the worst problem');
 assert.deepEqual(core.visibleDisruptions({tubeLines:[mixed],policy:changed}),[],
  'the configured-good severity must not promote the remaining minor problem');
});

test('independent disruption policy: simultaneous serious impacts survive precedence and later plans stay qualified',()=>{
 const t=service(20,{reason:'Signal failure between Riverside and Central'});
 const tiers=core.railWarnings(boards([t],['Train disruption between Riverside and Central.']),['RVS-CEN'],NOW,testville);
 const shown=core.visibleDisruptions({errors:['Provider refused the request'],tiers,tubeLines:[line(6)],planLater:true});
 assert.deepEqual(new Set(shown.map(item=>item.scope)),new Set(['data','rail','tube']));
 assert.match(shown.find(item=>item.scope==='rail').detail.join(' '),/Riverside and Central/);
 assert.match(shown.find(item=>item.scope==='tube').detail.join(' '),/Reason for 6/);
 for(const item of shown.filter(item=>item.currentOnly))assert.match(item.qualifier,/not.*(later|plan)/i);
 const quiet=core.railWarnings(boards([service()],['Lifts unavailable at Riverside.','Disruption in Faraway.']),['RVS-CEN'],NOW,testville);
 assert.deepEqual(core.visibleDisruptions({tiers:quiet}),[],'facilities and unrelated notices are not promoted');
});
