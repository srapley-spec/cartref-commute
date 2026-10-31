// Preserve the seven released-main Follow scenarios (be1e58e) against the shared pure engine.
// No compatibility planner or old engine runs here. Each option includes the actual saved itinerary.
// Deliberate corrections: canonical status bands are 5/15 minutes, completion needs observation,
// departure grace asks for confirmation, and changing a known boarding point requires one explicit choice.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {core,at,MIN,train} from './helpers.mjs';
const D='2026-10-30',T=h=>at(D,h);
function trip(std,leave,dep,arr,o={}){
 const service=train({from:o.from||'KGX',to:'LET',std,dep:T(dep),arr:T(arr),operator:o.op||'Great Northern',serviceId:o.sid||std,...o.t});
 return {hub:o.from||'KGX',train:service,leave:T(leave),arrive:service.arr+25*MIN,flags:[],effort:o.effort||'walk',
  legs:[{t:T(leave),d:'Walk to the connection'},{t:service.dep,d:`${std} ${service.operator} from ${service.from}`,train:true},
   {t:service.arr,d:'Arrive local station'},{t:service.arr+25*MIN,d:'Arrive home'}],...o.o};
}
const start=(o,now=T('18:19'))=>{const r=core.startFollowRoute(o,{now,direction:'home',mode:'commute'});assert.ok(r);return r;};
const run=(route,now,options,more={})=>core.updateFollowRoute(route,{now,options,dataFresh:true,hasReliableLocation:true,...more});
const same=(route,o)=>core.followMatchesService(route,o);

test('released-main follow evening:18:48 cancellation offers18:54 home19:52 eighteen minutes later, without moving the chosen arrival',()=>{
 const o48=trip('18:48','18:22','18:48','19:09'),o54=trip('18:54','18:28','18:54','19:27'),f=start(o48);
 assert.equal(f.expectedArrival,T('19:34'));assert.equal(f.plannedArrival,T('19:34'));
 let s=run(f,T('18:21'),[o48,o54]);
 assert.equal(s.status,'on-track');assert.equal(s.route.expectedArrival,T('19:34'));assert.match(s.text,/1 min to spare/);assert.equal(s.notice,null);
 const cancelled=trip('18:48','18:22','18:48','19:09',{t:{cancelled:true}});
 s=run(s.route,T('18:32'),[cancelled,o54]);
 assert.equal(s.status,'cancelled');assert.match(s.notice.text,/18:48.*cancelled/);assert.equal(s.level,'bad');
 assert.equal(s.alternative.train.std,'18:54');assert.equal(s.alternative.arrive,T('19:52'));assert.equal(s.deltaMin,18);
 assert.equal(s.route.expectedArrival,T('19:34'));assert.equal(s.route.id,f.id);
 const again=run(s.route,T('18:33'),[cancelled,o54]);assert.equal(again.notice.at,T('18:32'),'refresh does not re-date the same incident');
 const acknowledged=run(core.acknowledgeFollowNotice(again.route),T('18:34'),[cancelled,o54]);
 assert.equal(acknowledged.status,'cancelled');assert.equal(acknowledged.notice,null);
 const reinstated=run(again.route,T('18:35'),[o48,o54]);
 assert.equal(reinstated.status,'on-track');assert.equal(reinstated.notice.kind,'recovered');assert.match(reinstated.notice.text,/18:48.*running again/);assert.equal(reinstated.level,'ok');
});

test('released-main follow loading: no data never proves missed; a vanished train is missed only after departure grace',()=>{
 const o=trip('18:48','18:22','18:48','19:09'),f=start(o);
 const loading=run(f,T('18:20'),[],{dataFresh:false});
 assert.equal(loading.status,'on-track');assert.equal(loading.notice,null);assert.equal(loading.route.expectedArrival,f.expectedArrival);
 assert.equal(loading.alternative,null);assert.match(loading.text,/waiting for fresh data/);
 const empty=run(f,T('18:30'),[]);assert.equal(empty.status,'on-track');assert.equal(empty.notice,null);
 assert.equal(run(f,T('18:49'),[]).status,'missed');
 assert.notEqual(run(f,T('18:49'),[],{dataFresh:false}).status,'missed','reopening after the scheduled departure still needs actual loaded evidence');
 assert.notEqual(run(f,T('18:49'),[],{hasReliableLocation:false}).status,'missed','a missing fix is not missed-boarding evidence');
});

test('released-main follow arrival boundary:59 seconds stays stable,60 changes with reason; canonical5/15 status bands replace legacy5-red4-amber',()=>{
 const o=trip('18:54','18:28','18:54','19:27'),f=start(o,T('18:20'));
 const changed=(arrival,late=0)=>trip('18:54','18:28','18:54','19:27',{t:{arr:arrival,arrLate:late}});
 const small=run(f,T('18:21'),[changed(T('19:27')+59000)]);
 assert.equal(small.notice,null);assert.equal(small.route.expectedArrival,T('19:52'));
 const sixty=run(f,T('18:21'),[changed(T('19:28'),1)]);
 assert.equal(sixty.route.expectedArrival,T('19:53'));assert.equal(sixty.notice.kind,'arrival');assert.match(sixty.notice.text,/1 min late/);
 let s=run(f,T('18:22'),[changed(T('19:32'),5)]);
 assert.equal(s.trainStatus.level,'warn','five minutes is amber under the current shared rule');
 assert.equal(run(f,T('18:22'),[changed(T('19:31'),4)]).trainStatus.level,'ok','four minutes is green under the current shared rule');
 assert.equal(run(f,T('18:22'),[changed(T('19:42'),15)]).trainStatus.level,'bad','red starts at fifteen');
 s=run(s.route,T('18:23'),[changed(T('19:30'),3)]);
 assert.match(s.notice.text,/earlier/);assert.equal(s.trainStatus.level,'ok');assert.equal(s.route.expectedArrival,T('19:55'));
 s=run(s.route,T('18:25'),[changed(T('19:27'))]);
 assert.match(s.notice.text,/earlier/);assert.equal(s.trainStatus.text,'On time');assert.equal(s.route.expectedArrival,T('19:52'));
 const early=run(f,T('18:25'),[changed(T('19:25'))]);assert.match(early.notice.text,/earlier/);assert.equal(early.route.expectedArrival,T('19:50'));
 const alreadyLate=start(trip('18:54','18:28','18:54','19:30',{t:{arrLate:3}}),T('18:20'));
 assert.equal(alreadyLate.lastTrain.arrLate,3);
 const later=run(alreadyLate,T('18:21'),[changed(T('19:32'),5)]);
 assert.match(later.notice.text,/5 min late/);assert.equal(later.route.expectedArrival,T('19:57'));assert.equal(later.notice.deltaMin,2);
});

test('released-main follow effort: run-behind is not missed, impossible and departed are missed, recovery ranks by arrival then later leave',()=>{
 const o=trip('18:48','18:22','18:48','19:09'),f=start(o,T('18:10'));
 const o54=trip('18:54','18:28','18:54','19:27'),o56=trip('18:56','18:34','18:56','19:34');
 assert.match(run(f,T('18:15'),[o,o54]).text,/7 min to spare/);
 const running=trip('18:48','18:22','18:48','19:09',{effort:'run'});
 const behind=run(f,T('18:24'),[running,o54]);assert.equal(behind.status,'hurry');assert.match(behind.text,/2 min behind.*run needed/);
 const passed=run(f,T('18:24'),[{...running,missed:true},o54]);assert.equal(passed.status,'hurry','walking leave time passed, but explicit run remains possible');
 const none=run(f,T('18:30'),[trip('18:48','18:22','18:48','19:09',{effort:'none'}),o54,o56]);
 assert.equal(none.status,'missed');assert.match(none.notice.text,/no longer make.*18:48/);assert.equal(none.alternative.train.std,'18:54');assert.equal(same(f,none.alternative),false);
 const left=run(f,T('18:49'),[o,o54]);assert.equal(left.status,'missed');assert.match(left.notice.text,/18:48/);
 // The grace boundary is preserved, but the newer UI correctly asks whether you boarded instead of claiming catchability.
 for(const seconds of [25,30]){const grace=run(f,T('18:48')+seconds*1000,[o,o54]);assert.equal(grace.status,'hurry');assert.equal(grace.level,'info');assert.match(grace.text,/confirm/);}
 assert.equal(run(f,T('18:48')+30001,[o,o54]).status,'missed');
 const bad=[trip('18:50','18:24','18:50','19:20',{o:{uncertain:true}}),trip('18:51','18:25','18:51','19:20',{t:{depUnknown:true}}),
  trip('18:52','18:26','18:52','19:20',{o:{missed:true}}),trip('18:58','18:31','18:58','19:30'),trip('18:59','18:33','18:59','19:30')];
 const way=run(f,T('18:49'),[o,...bad]);assert.equal(way.alternative.train.std,'18:59','bad choices excluded; equal arrival prefers later leave');
});

test('released-main follow boarding and Tube: onboard ignores origin effort; actual platform readiness controls missed and recovered connections',()=>{
 const o=trip('18:54','18:28','18:54','19:27'),f=start(o,T('18:20'));
 const onboard=run(f,T('19:00'),[],{phase:'on-train'});assert.equal(onboard.status,'on-track');assert.equal(onboard.route.phase,'on-train');assert.equal(onboard.alternative,null);
 const gone=trip('18:54','18:28','18:54','19:27',{effort:'none',o:{missed:true}});
 assert.equal(run(f,T('18:50'),[gone],{phase:'on-train'}).status,'on-track');
 const sooner=trip('19:00','18:40','19:00','19:15');
 assert.equal(run(f,T('18:58'),[o,sooner],{phase:'on-train'}).alternative,null,'no replacement proposals while on the train');
 const tube=(reach,route=f,now=T('18:40'))=>run(route,now,[o],{activeConnection:true,
  readyAt:core.readyAtFromConnection({KGX:T(reach)},{KGX:7*MIN})});
 assert.match(tube('18:44').text,/3 min at your connection/);
 const tight=tube('18:47');assert.equal(tight.status,'on-track');assert.match(tight.text,/connection is tight/);assert.equal(tight.alternative,null);
 const short=tube('18:48');assert.equal(short.status,'missed','one minute short after interchange loses the connection');
 const recovered=tube('18:45',short.route,T('18:41'));
 assert.equal(recovered.status,'on-track');assert.equal(recovered.notice.kind,'recovered');assert.match(recovered.notice.text,/make.*18:54.*again/);
 const withBetter=run(f,T('18:40'),[o,sooner],{activeConnection:true,readyAt:{KGX:T('18:51')}});
 assert.equal(withBetter.alternative,null,'ordinary better suggestions remain quiet while already on the approach Tube');
});

test('released-main follow better options:four minutes never,exactly five yes,walk or fast only,declines persist,cancellation excluded',()=>{
 const mine=trip('18:56','18:34','18:56','19:34'),f=start(mine,T('18:20'));
 const four=trip('18:50','18:30','18:50','19:30'),five=trip('18:51','18:31','18:51','19:29'),ran=trip('18:45','18:21','18:45','19:20',{effort:'run'});
 assert.equal(run(f,T('18:25'),[mine,four]).alternative,null);
 assert.equal(run(f,T('18:25'),[mine,four,five]).alternative.train.std,'18:51');
 assert.equal(run(f,T('18:20'),[mine,ran]).alternative,null);
 const fast=trip('18:51','18:31','18:51','19:29',{effort:'fast'});
 assert.equal(run(f,T('18:25'),[mine,fast]).alternative.train.std,'18:51');
 const declined=core.dismissFollowAlternative(f,five);
 assert.equal(run(declined,T('18:25'),[mine,five]).alternative,null);
 const reloaded=core.restoreFollowRoute(JSON.parse(JSON.stringify(declined)));assert.ok(reloaded);
 assert.equal(run(reloaded,T('18:25'),[mine,five]).alternative,null,'decline survives persisted journey reload');
 assert.equal(run(f,T('18:25'),[mine,{...five,train:{...five.train,cancelled:true}}]).alternative,null);
});

test('released-main follow known calls:shared or separate service IDs retain the same train option; explicit boarding choice and observed completion',()=>{
 for(const ids of [['TL1','TL1'],['TL1','TL2']]){
  const far=trip('18:56','18:34','18:56','19:37',{from:'ZFD',op:'Thameslink',sid:ids[0]});
  const stp=trip('19:01','18:39','19:01','19:37',{from:'STP',op:'Thameslink',sid:ids[1]});
  const f=start({...far,alts:[stp]},T('18:20'));
  assert.equal(f.option.alts.length,1);assert.equal(f.option.alts[0].train.dep,T('19:01'));
  assert.equal(core.followMatchesObservedTrain(f,stp),true,`known call IDs ${ids} identifies the observed same train`);
  const s=run(f,T('18:57'),[far,stp]);
  assert.equal(s.status,'hurry');assert.equal(s.notice.kind,'boarding');assert.equal(s.alternative.train.from,'STP');
  assert.equal(s.route.option.train.from,'ZFD','a known later stop is offered, never silently substituted for the chosen boarding point');
  assert.equal(s.route.id,f.id);
  const accepted=start(s.alternative,T('18:57'));
  assert.equal(accepted.option.train.from,'STP');assert.notEqual(accepted.id,f.id);assert.equal(accepted.expectedArrival,f.expectedArrival);
  assert.equal(run(f,T('19:02'),[far,stp]).status,'missed','both known calls have now gone');
  const unknown={...stp,hub:'OTHER',train:{...stp.train,from:'OTHER'}};
  assert.equal(core.followMatchesObservedTrain(f,unknown),false,'same ID alone cannot move a journey to an unknown station');
 }
 const stp=trip('19:01','18:39','19:01','19:37',{from:'STP',op:'Thameslink',sid:'TL1'}),f=start(stp,T('18:20'));
 // Released main inferred arrival from clock alone. Preserve the explicit completion capability,
 // but require actual arrival phase evidence so a late train or lost GPS cannot end following.
 const arrived=run(f,T('20:08'),[stp],{phase:'arrived'});assert.equal(arrived.status,'arrived');assert.equal(arrived.nextStep,null);
 assert.equal(run(f,T('20:06'),[stp],{phase:'on-train'}).status,'on-track');
 const late=trip('19:01','18:39','19:01','19:50',{from:'STP',op:'Thameslink',sid:'TL1'});
 assert.equal(run(f,T('20:08'),[late],{phase:'on-train'}).status,'on-track','remaining on the delayed train is not completion');
 assert.notEqual(run(f,T('20:08'),[],{dataFresh:false,hasReliableLocation:false}).status,'arrived','elapsed time alone never proves completion');
 assert.equal(core.FOLLOW_BETTER_MIN,5);assert.equal(core.FOLLOW_CHANGE_MS,60000);
});
