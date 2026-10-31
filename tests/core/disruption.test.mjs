import {test} from 'node:test';
import assert from 'node:assert/strict';
import {core,train,testville,at,MIN} from './helpers.mjs';

const NOW=at('2026-11-03','17:00');
const service=(extra={})=>train({from:'CEN',to:'RVS',std:'17:10',dep:NOW+10*MIN,arr:NOW+40*MIN,...extra});
const board=(services,msgs=[])=>({'CEN-RVS':{services,msgs}});
const warnings=(services,policy,msgs=[])=>core.railWarnings(board(services,msgs),['CEN-RVS'],NOW,{...testville,disruption:policy});
const line=(id,sev,desc='status '+sev,reason='reason '+sev)=>({id,name:id,statuses:[{sev,desc,reason}]});
const summary=(tiers,policy)=>core.statusLine({errors:[],notLoaded:[],stale:false,tubeFallback:false,tiers,tubeLines:[],operators:[],planLater:false,demo:false,timetableOnly:false,policy});

test('disruption policy: agreed defaults and legacy aliases have one immutable source',()=>{
 const p=core.resolveDisruptionPolicy();
 assert.deepEqual(p.rail,{warnMin:5,badMin:15,lookbackMin:5,affectedTrainCount:2});
 assert.equal(core.LATE_WARN_MIN,p.rail.warnMin);assert.equal(core.LATE_BAD_MIN,p.rail.badMin);
 assert.deepEqual([...core.BAD_SEV],p.tube.closedSeverities);
 assert.ok(Object.isFrozen(core.DEFAULT_DISRUPTION_POLICY));assert.ok(Object.isFrozen(p.rail));
 assert.deepEqual(core.resolveDisruptionPolicy({rail:{warnMin:20,badMin:2,lookbackMin:-1,affectedTrainCount:0}}).rail,p.rail);
 assert.deepEqual(core.resolveDisruptionPolicy({tube:{closedSeverities:[9,9],significantSeverities:[6,-1]}}).tube.closedSeverities,[9]);
 assert.deepEqual(core.resolveDisruptionPolicy({tube:{significantSeverities:[6,-1]}}).tube.significantSeverities,p.tube.significantSeverities);
});

test('disruption policy: train bands retain exact agreed boundaries and unknown/cancelled semantics',()=>{
 for(const [late,level]of [[4.999,'ok'],[5,'warn'],[14.999,'warn'],[15,'bad']]){
  assert.equal(core.delayLevel(late),level);
  assert.equal(core.trainStatus(service({arrLate:late})).level,level);
 }
 for(const extra of [{cancelled:true},{depUnknown:true},{arrUnknown:true}])assert.equal(core.trainStatus(service(extra)).level,'bad');
 assert.equal(core.trainStatus(service({timetable:true})),null);
});

test('disruption policy: profile bands flow through train flags, boards, arrivals, route warnings and status',()=>{
 const policy={rail:{warnMin:3,badMin:10}};
 for(const [late,level]of [[2,'ok'],[3,'warn'],[9,'warn'],[10,'bad']]){
  const t=service({depLate:late,arrLate:late}),w=warnings([t],policy);
  assert.equal(core.delayStatus(late,false,policy).level,level);
  assert.equal(core.trainStatus(t,policy).level,level);
  assert.equal(core.departureStatus(t,policy).level,level);
  assert.equal(core.arrivalStatus(NOW+late*MIN,NOW,policy).level,level);
  assert.equal(core.trainFlags(t,{...testville,disruption:policy}).find(f=>f.status).lvl,level);
  assert.equal(w.level,level==='ok'?'none':level==='warn'?'amber':'red');
  assert.equal(summary(w,policy).level,level);
 }
});

test('disruption policy: lookback and line-wide affected count are configurable, including arrival unknown',()=>{
 const unknown=service({arrUnknown:true}),other=service({std:'17:20',dep:NOW+20*MIN,arrUnknown:true});
 const both=warnings([unknown,other]);assert.equal(both.uncertain.length,2);assert.equal(both.affected,2);assert.equal(both.hit,true);
 const edge=warnings([service({dep:NOW-5*MIN,cancelled:true}),service({dep:NOW-5*MIN-1,cancelled:true})]);
 assert.equal(edge.total,1);assert.equal(edge.cancelled.length,1);
 const p={rail:{lookbackMin:2,affectedTrainCount:3}};
 const limited=warnings([unknown,other,service({dep:NOW-3*MIN,cancelled:true})],p);
 assert.equal(limited.affected,2);assert.equal(limited.hit,false);assert.equal(limited.cancelled.length,0);
});

test('disruption policy: an observed active train survives the board lookback without being counted twice',()=>{
 const current=service({dep:NOW-30*MIN,arr:NOW+10*MIN,arrLate:17});
 const b=board([current]);
 assert.equal(core.railWarnings(b,['CEN-RVS'],NOW,testville).total,0);
 const active=core.railWarnings(b,['CEN-RVS'],NOW,testville,{activeTrains:[current,current]});
 assert.equal(active.total,1);assert.equal(active.affected,1);assert.equal(active.level,'red');
 const independent=core.railWarnings({},[],NOW,testville,{activeTrains:[current]});assert.equal(independent.total,1);assert.equal(independent.level,'red');
});

test('disruption policy: a newer active clone replaces a recovered board service without mutating that board',()=>{
 const cached=service({serviceId:'same',cancelled:true,reason:'Old cancellation'});
 const current={...cached,cancelled:false,arrLate:17,reason:'Fresh arrival report'};
 const result=core.railWarnings(board([cached]),['CEN-RVS'],NOW,testville,{activeTrains:[current]});
 assert.equal(result.total,1);assert.equal(result.affected,1);assert.equal(result.hit,false);
 assert.deepEqual(result.cancelled,[]);assert.equal(result.delayed[0],current);assert.equal(result.delayed[0].reason,'Fresh arrival report');
 assert.equal(cached.cancelled,true);assert.equal(cached.reason,'Old cancellation');
});

test('disruption policy: active overlays never merge different IDs, boarding points or reused service days',()=>{
 const first=service({serviceId:'one',arrLate:17}),other=service({serviceId:'two',arrLate:17});
 assert.equal(core.railWarnings(board([first,other]),['CEN-RVS'],NOW,testville,{activeTrains:[{...first}]}).total,2);
 const laterDay={...first,dep:first.dep+24*60*MIN,arr:first.arr+24*60*MIN,cancelled:true};
 const differentDay=core.railWarnings(board([laterDay]),['CEN-RVS'],NOW,testville,{activeTrains:[{...first}]});
 assert.equal(differentDay.total,2);assert.equal(differentDay.cancelled[0],laterDay);
 const otherStop={...first,from:'MKT'};
 assert.equal(core.railWarnings(board([otherStop]),['CEN-RVS'],NOW,testville,{activeTrains:[{...first}]}).total,2);
});

test('disruption policy: no-ID active clones match exact operator and scheduled service context across delay',()=>{
 const cached=service({cancelled:true,operator:'City Rail'});
 const current={...cached,dep:cached.dep+20*MIN,depLate:20,arr:cached.arr+20*MIN,arrLate:20,cancelled:false,reason:'Reported running'};
 const result=core.railWarnings(board([cached]),['CEN-RVS'],NOW,testville,{activeTrains:[current]});
 assert.equal(result.total,1);assert.equal(result.cancelled.length,0);assert.equal(result.delayed[0],current);
 const anotherOperator={...current,operator:'Other Rail'};
 assert.equal(core.railWarnings(board([cached]),['CEN-RVS'],NOW,testville,{activeTrains:[anotherOperator]}).total,2);
});

test('disruption policy: a departure delay crossing midnight keeps its original service day for overlays',()=>{
 const evening=at('2026-11-03','23:50');
 const cached=service({std:'23:55',serviceId:'midnight-service',dep:at('2026-11-03','23:55'),arr:at('2026-11-04','00:35'),cancelled:true});
 const current={...cached,dep:at('2026-11-04','00:15'),depLate:20,arr:at('2026-11-04','00:55'),arrLate:20,cancelled:false};
 const result=core.railWarnings(board([cached]),['CEN-RVS'],evening,testville,{activeTrains:[current]});
 assert.equal(result.total,1);assert.equal(result.cancelled.length,0);assert.equal(result.delayed[0],current);
});

test('disruption policy: a current delay projection near midnight does not change boarding-service identity',()=>{
 const midnight=at('2026-11-04','00:00');
 const cached=service({std:'00:10',serviceId:'after-midnight',dep:at('2026-11-04','00:10'),arr:at('2026-11-04','00:50')});
 const current={...cached,depLate:17,arrLate:17,reason:'Current projected delay'};
 const result=core.railWarnings(board([cached]),['CEN-RVS'],midnight,testville,{activeTrains:[current]});
 assert.equal(result.total,1);assert.equal(result.affected,1);assert.equal(result.hit,false);assert.equal(result.delayed[0],current);
});

test('disruption policy: closure wins over good/minor entries in every line-status consumer',()=>{
 const mixed={id:'blue',name:'Blue',statuses:[{sev:10,desc:'Good Service'},{sev:9,desc:'Minor Delays'},{sev:20,desc:'Service Closed',reason:'The Blue line is closed.'}]};
 assert.equal(core.worstStatus(mixed).sev,20);assert.equal(core.lineOk(mixed),false);assert.equal(core.lineLevel(mixed),'bad');
 assert.equal(core.tubeFallbackNeeded([mixed],['blue']),true);
 assert.deepEqual(core.tubeFlags({},[mixed],{main:['blue'],fallback:['green'],fallbackNote:'fallback'}),[{lvl:'bad',txt:'Blue: Service Closed'}]);
 assert.match(summary(null).text,/Good service/);
 const alert=core.visibleDisruptions({tubeLines:[mixed]});assert.equal(alert[0].title,'Blue: Service Closed');assert.equal(alert[0].level,'bad');
});

test('disruption policy: severity and global visibility stay separate for minor versus significant Tube service',()=>{
 assert.equal(core.lineLevel(line('minor',9)),'warn');
 assert.deepEqual(core.visibleDisruptions({tubeLines:[line('minor',9),line('good',10),line('info',19)]}),[]);
 for(const sev of [6,7,8]){
  const alerts=core.visibleDisruptions({tubeLines:[line('custom-line',sev)]});assert.equal(alerts.length,1);assert.equal(alerts[0].level,'warn');
 }
 for(const sev of [1,2,3,4,5,16,20])assert.equal(core.visibleDisruptions({tubeLines:[line('custom-line',sev)]})[0].level,'bad');
 assert.deepEqual(core.visibleDisruptions({tubeLines:[{id:'unknown',name:'Unknown',statuses:[]}]}),[]);
});

test('disruption policy: partial severity overrides flow through line summaries, fallback and visibility',()=>{
 const minor=line('blue',9,'Minor Delays'),closedPolicy={tube:{closedSeverities:[9],significantSeverities:[9]}};
 assert.equal(core.lineLevel(minor,closedPolicy),'bad');assert.equal(core.lineOk(minor,closedPolicy),false);
 assert.equal(core.tubeFallbackNeeded([minor],['blue'],closedPolicy),true);
 assert.equal(core.visibleDisruptions({tubeLines:[minor],policy:closedPolicy})[0].level,'bad');
 const promoteMinor={tube:{significantSeverities:[9]}};
 assert.equal(core.visibleDisruptions({tubeLines:[minor],policy:promoteMinor})[0].level,'warn');
 assert.equal(core.lineLevel(minor),'warn');assert.deepEqual(core.visibleDisruptions({tubeLines:[minor]}),[],'an override does not mutate global defaults');
});

test('disruption policy: explicit good codes do not mask another warning or trigger its promotion',()=>{
 const policy={tube:{goodSeverities:[6,10]}};
 const mixed={id:'blue',name:'Blue',statuses:[{sev:6,desc:'Configured good'},{sev:9,desc:'Minor Delays'}]};
 assert.equal(core.worstStatus(mixed,policy).sev,9);assert.equal(core.lineLevel(mixed,policy),'warn');
 assert.deepEqual(core.visibleDisruptions({tubeLines:[mixed],policy}),[]);
 const closed={tube:{goodSeverities:[20,10]}};
 assert.equal(core.lineLevel(line('blue',20),closed),'bad','closed-service definitions win over overlapping good codes');
 assert.equal(core.visibleDisruptions({tubeLines:[line('blue',20)],policy:closed}).length,1);
});

test('visible disruptions: all relevant significant impacts survive a higher-priority feed failure',()=>{
 const tiers=warnings([service({cancelled:true,reason:'Crew unavailable'}),service({std:'17:20',arrUnknown:true,reason:'Signal fault'}),service({std:'17:30',arrLate:17})],undefined,['Trains disrupted at Central.']);
 const alerts=core.visibleDisruptions({errors:['Feed refused','Feed refused'],notLoaded:['Market Street'],stale:true,tiers,tubeLines:[line('Blue',6,'Severe Delays','Signalling fault.'),line('Green',20,'Service Closed','Track repairs.')]});
 assert.deepEqual(alerts.map(a=>a.id),['data-error-Feed%20refused','data-missing','data-stale','rail-impact','tube-Blue','tube-Green']);
 const rail=alerts.find(a=>a.scope==='rail');assert.equal(rail.level,'bad');
 for(const text of ['Trains disrupted at Central.','Crew unavailable','Signal fault','Worst train delay: 17 min'])assert.ok(rail.detail.some(d=>d.includes(text)),text);
 assert.equal(alerts.find(a=>a.id==='tube-Blue').detail[0],'Signalling fault.');
});

test('visible disruptions: data-error identity survives reorder and malformed Unicode without dropping messages',()=>{
 const errors=['Feed A refused','Feed B refused','Bad response '+String.fromCharCode(0xD800)];
 const first=core.visibleDisruptions({errors}),second=core.visibleDisruptions({errors:[errors[2],errors[0],errors[1]]});
 for(const item of first)assert.equal(second.find(other=>other.title===item.title).id,item.id);
 assert.equal(core.visibleDisruptions({errors:[errors[1]]})[0].id,first[1].id);
 assert.equal(new Set(first.map(a=>a.id)).size,3);
});

test('visible disruptions: known delayed train reasons precede broad notices and follow configured bands',()=>{
 const delayed=service({arrLate:17,reason:'A fault on this train.'});
 const cancelled=service({std:'17:20',cancelled:true,depLate:20,reason:'Crew unavailable.'});
 const unknown=service({std:'17:30',arrUnknown:true,arrLate:18,reason:'Awaiting an estimate.'});
 const tiers=warnings([delayed,cancelled,unknown],undefined,['Route notice at Central: signalling work.']);
 assert.deepEqual(tiers.delayed,[delayed],'cancelled and unknown estimates retain their own categories');
 const alert=core.visibleDisruptions({tiers})[0];
 assert.ok(alert.detail.indexOf('17 min late: 17:10 Express Rail: A fault on this train.')<alert.detail.indexOf(tiers.onRoute[0]));
 assert.ok(alert.detail[0].includes('Crew unavailable.'));
 const custom={rail:{warnMin:3,badMin:10}},three=service({depLate:3,reason:'Late departure from the depot.'});
 assert.deepEqual(warnings([three]).delayed,[]);
 const configured=warnings([three],custom);assert.deepEqual(configured.delayed,[three]);
 assert.match(core.visibleDisruptions({tiers:configured,policy:custom})[0].detail[0],/3 min late.*Late departure from the depot/);
});

test('visible disruptions: older supplied rail summaries without delayed-service records remain supported',()=>{
 const tiers=warnings([service({arrLate:17})]);delete tiers.delayed;
 const alert=core.visibleDisruptions({tiers})[0];assert.equal(alert.level,'bad');
 assert.ok(alert.detail.includes('Worst train delay: 17 min'));
});

test('visible disruptions: only supplied route evidence is promoted; notices without train impact fold',()=>{
 const tiers=warnings([service()],undefined,['A new timetable at Central.','Delay at Elsewhere.','Lift unavailable at Central.']);
 assert.equal(tiers.level,'none');assert.ok(tiers.onRoute.length);assert.ok(tiers.other.length);assert.ok(tiers.facilities.length);
 assert.deepEqual(core.visibleDisruptions({tiers,tubeLines:[line('my-remaining-line',10)]}),[]);
 const relevant=core.visibleDisruptions({tubeLines:[line('my-remaining-line',6)]});
 assert.deepEqual(relevant.map(a=>a.id),['tube-my-remaining-line']);
});

test('visible disruptions: later plans qualify current observations without qualifying their own missing data as current',()=>{
 const alerts=core.visibleDisruptions({notLoaded:['Central'],tiers:warnings([service({depLate:5})]),tubeLines:[line('Blue',6)],planLater:true});
 assert.equal(alerts[0].scope,'data');assert.equal(alerts[0].currentOnly,false);assert.equal(alerts[0].qualifier,undefined);
 assert.equal(alerts[1].currentOnly,true);assert.match(alerts[1].qualifier,/now, not your later plan/);
 assert.equal(alerts[2].currentOnly,true);assert.match(alerts[2].qualifier,/not a forecast/);
});

test('visible disruptions: cached train impacts are explicitly last known while current Tube status stays distinct',()=>{
 for(const planLater of [false,true]){
  const alerts=core.visibleDisruptions({tiers:warnings([service({cancelled:true})]),tubeLines:[line('Blue',6)],stale:true,planLater});
  assert.equal(alerts[0].id,'data-stale');
  const rail=alerts.find(a=>a.scope==='rail');assert.match(rail.qualifier,/^Last known train information/);
  if(planLater)assert.match(rail.qualifier,/not a forecast/);
  assert.doesNotMatch(alerts.find(a=>a.scope==='tube').qualifier||'',/Last known/,'independent current Tube evidence is not aged by an old rail board');
 }
});

test('disruption policy: Follow recovery and its train status use the same configured red threshold',()=>{
 const option=(hub,id,arrive,extra={})=>({hub,leave:NOW,arrive,flags:[],effort:'walk',train:service({serviceId:id,...extra}),legs:[{t:NOW,d:'Tube',tube:true},{t:NOW+10*MIN,d:'Train',train:true},{t:arrive,d:'Home'}]});
 const original=option('CEN','chosen',NOW+50*MIN),route=core.startFollowRoute(original,{now:NOW,direction:'home',mode:'commute'});
 assert.ok(route);
 const delayed=option('CEN','chosen',NOW+60*MIN,{arr:NOW+50*MIN,arrLate:10});
 const alternate=option('MKT','other',NOW+70*MIN);
 const input={now:NOW,options:[delayed],availableOptions:[alternate],activeConnection:true,readyAt:{CEN:NOW,MKT:NOW},dataFresh:true};
 const normal=core.updateFollowRoute(route,input);assert.equal(normal.alternative,null);assert.equal(normal.trainStatus.level,'warn');
 const configured=core.updateFollowRoute(route,{...input,policy:{rail:{warnMin:3,badMin:10}}});
 assert.equal(configured.alternative.train.serviceId,'other');assert.equal(configured.trainStatus.level,'bad');
});
