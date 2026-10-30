import { test } from 'node:test';
import assert from 'node:assert/strict';
import { core, train, MIN, at } from './helpers.mjs';
const t = at('2026-11-03', '18:00');
function option(extra = {}, trainExtra = {}) {
 const dep = t + 30 * MIN, arr = t + 60 * MIN;
 return {hub:'CEN',leave:t+10*MIN,arrive:t+70*MIN,flags:[],effort:'walk',
  train:train({from:'CEN',to:'RVS',std:'18:30',dep,arr,serviceId:'chosen',...trainExtra}),
  legs:[{t:t+10*MIN,d:'Walk to city tube'},{t:t+15*MIN,d:'Blue line',tube:true},{t:dep,d:'Train from Central',train:true},{t:arr,d:'Arrive Riverside'},{t:t+70*MIN,d:'Arrive home'}],...extra};
}
const start = (o=option()) => core.startFollowRoute(o,{now:t,direction:'home',mode:'commute'});
const update = (r, options, extra={}) => core.updateFollowRoute(r,{now:t,options,...extra});

test('follow: snapshots the entire journey and never changes the selected route when rankings change',()=>{
 const chosen=option(),r=start(chosen); chosen.legs[0].d='mutated';
 assert.equal(r.option.legs[0].d,'Walk to city tube');
 const faster=option({arrive:t+60*MIN},{serviceId:'other'});
 const u=update(r,[faster,option()]);
 assert.equal(u.route.id,r.id);assert.equal(u.route.expectedArrival,t+70*MIN);assert.equal(u.alternative.train.serviceId,'other');
 assert.equal(u.deltaMin,-10);assert.equal(u.route.option.legs.length,5);
});

test('follow: refreshed approach routes cannot silently change arrival or the saved tube/walk',()=>{
 const r=start(),changed=option({arrive:t+90*MIN,legs:[{t:t,d:'Different walk'}]});
 const u=update(r,[changed]);assert.equal(u.route.expectedArrival,r.expectedArrival);assert.deepEqual(u.route.option.legs,r.option.legs);assert.equal(u.notice,null);
});

test('follow: real train delays change arrival with a retained reason until acknowledged',()=>{
 const r=start(),o=option({}, {dep:t+36*MIN,arr:t+66*MIN,depLate:6,arrLate:6});
 const u=update(r,[o]);assert.equal(u.route.expectedArrival,t+76*MIN);assert.match(u.notice.text,/6 min late/);assert.equal(u.notice.deltaMin,6);
 const again=update(u.route,[o]);assert.equal(again.route.notices.length,1);
 const acknowledged=core.acknowledgeFollowNotice(again.route,u.notice.id);
 assert.equal(update(acknowledged,[o]).notice,null);
 const legs=core.followedLegs(u.route);assert.equal(legs[1].t,r.option.legs[1].t);assert.equal(legs[2].t,t+36*MIN);assert.equal(legs.at(-1).t,t+76*MIN);
});

test('follow: platform changes preserve identity and acknowledgements survive refresh',()=>{
 const r=start(),o=option({}, {platform:'9'}),u=update(r,[o]);
 assert.equal(u.route.id,r.id);assert.match(u.notice.text,/platform 9/);
 const ack=core.acknowledgeFollowNotice(u.route);assert.equal(update(ack,[o]).notice,null);
});

test('follow: whole evening cancellation offers explicit replacement with later arrival, never swaps it',()=>{
 const r=start(),cancelled=option({}, {cancelled:true}),next=option({arrive:r.expectedArrival+18*MIN},{serviceId:'next',std:'18:36',dep:t+36*MIN});
 const u=update(r,[cancelled,next],{now:t+12*MIN});assert.equal(u.status,'cancelled');assert.match(u.notice.text,/18:30 is cancelled/);assert.equal(u.route.id,r.id);
 assert.equal(u.route.expectedArrival,r.expectedArrival);assert.equal(u.alternative.train.serviceId,'next');assert.equal(u.deltaMin,18);
 const acknowledged=core.acknowledgeFollowNotice(u.route);assert.equal(update(acknowledged,[cancelled,next]).notice,null);
 const replacement=core.startFollowRoute(u.alternative,{now:t+12*MIN,direction:'home',mode:'commute'});assert.notEqual(replacement.id,r.id);
});

test('follow: better option boundary is five minutes, only walking/fast reachable, once dismissed',()=>{
 const r=start();
 const alt=(gain,effort='walk')=>option({arrive:r.expectedArrival-gain*MIN,effort},{serviceId:'other'});
 assert.equal(update(r,[option(),alt(4.999)]).alternative,null);
 const o=alt(5),u=update(r,[option(),o]);assert.equal(u.alternative,o);
 assert.equal(update(r,[option(),alt(5,'fast')]).alternative.effort,'fast');
 for(const effort of ['run','car','none']) assert.equal(update(r,[option(),alt(20,effort)]).alternative,null);
 const dismissed=core.dismissFollowAlternative(r,o);assert.equal(update(dismissed,[option(),o]).alternative,null);
 assert.equal(update(r,[option(),alt(20)],{dataFresh:false}).alternative,null);
});

test('follow: cancelled, no-estimate, uncertain and missed alternatives never become recovery offers',()=>{
 const r=start();
 for(const o of [option({}, {serviceId:'other',cancelled:true}),option({}, {serviceId:'other',depUnknown:true}),option({uncertain:true},{serviceId:'other'}),option({missed:true},{serviceId:'other'})]){
  assert.equal(update(r,[option({}, {cancelled:true}),o]).alternative,null);
 }
});

test('follow: missing or stale feeds retain chosen arrival; missing location never proves missed',()=>{
 const r=start(),now=t+40*MIN;
 const u=update(r,[],{now,dataFresh:false});assert.equal(u.route.expectedArrival,r.expectedArrival);assert.equal(u.notice,null);assert.equal(u.level,'info');
 const noLocation=update(r,[],{now,hasReliableLocation:false});assert.notEqual(noLocation.status,'missed');assert.equal(noLocation.notice,null);
 const missed=update(r,[],{now,hasReliableLocation:true});assert.equal(missed.status,'missed');assert.match(missed.notice.text,/no longer make/);
});

test('follow: boarding and final walk prevent a departed train being declared missed; phase never regresses',()=>{
 const r=start(),now=t+45*MIN;
 const u=update(r,[],{now,phase:'on-train'});assert.equal(u.status,'on-track');assert.equal(u.route.phase,'on-train');assert.equal(u.nextStep.d,'Arrive Riverside');
 const after=update(u.route,[],{now:t+65*MIN,phase:'after-train'});assert.equal(after.nextStep.d,'Arrive home');
 const blip=update(after.route,[],{now:t+66*MIN,phase:'before-train'});assert.equal(blip.route.phase,'after-train');assert.notEqual(blip.status,'missed');
 const arrived=update(blip.route,[],{phase:'arrived'});assert.equal(arrived.status,'arrived');assert.equal(arrived.nextStep,null);assert.equal(arrived.alternative,null);
});

test('follow: live details update saved arrival without needing the departed board service',()=>{
 const r=start(),u=update(r,[],{phase:'on-train',currentArrival:r.expectedArrival+7*MIN});
 assert.equal(u.route.expectedArrival,r.expectedArrival+7*MIN);assert.match(u.notice.text,/live arrival changed/);
 const stale=update(r,[],{phase:'on-train',currentArrival:r.expectedArrival+7*MIN,dataFresh:false});assert.equal(stale.route.expectedArrival,r.expectedArrival);
});

test('follow: fast walking is amber; a run or unavailable connection is a missed route',()=>{
 const r=start();assert.equal(update(r,[option({effort:'fast'})]).status,'hurry');assert.equal(update(r,[option({effort:'fast'})]).level,'warn');
 for(const effort of ['run','car','none'])assert.equal(update(r,[option({effort})]).status,'missed');
});

test('follow: service ID survives delay and platform changes but cannot change boarding station or date',()=>{
 const r=start();
 const moved=option({}, {dep:t+40*MIN,arr:t+70*MIN,depLate:10,arrLate:10,platform:'4'});assert.equal(core.followServiceKey(moved),r.id);
 const otherHub=option({hub:'MKT'},{from:'MKT'});assert.notEqual(core.followServiceKey(otherHub),r.id);assert.equal(update(r,[otherHub]).route.expectedArrival,r.expectedArrival);
 const tomorrow=option({}, {dep:t+30*MIN+864e5,arr:t+60*MIN+864e5});assert.notEqual(core.followServiceKey(tomorrow),r.id);
 const timetable=start(option({}, {serviceId:undefined,timetable:true}));const live=update(timetable,[moved]);assert.equal(live.route.lastTrain.serviceId,'chosen');
 const different=option({}, {serviceId:'different',arr:t+90*MIN});assert.equal(update(r,[different]).route.expectedArrival,r.expectedArrival);
});

test('follow: persisted journey restores as independent data and rejects malformed browser state',()=>{
 const r=start(),saved=JSON.parse(JSON.stringify(r)),restored=core.restoreFollowRoute(saved);assert.deepEqual(restored,r);saved.option.legs[0].d='changed';assert.notEqual(restored.option.legs[0].d,'changed');
 for(const invalid of [null,{}, {...r,version:2},{...r,id:'wrong'},{...r,direction:'elsewhere'},{...r,mode:'other'},{...r,expectedArrival:null},{...r,lastTrain:{...r.lastTrain,dep:Infinity}},{...r,option:{...r.option,legs:[{t:'soon',d:'Walk'}]}},{...r,notices:[{}]},{...r,dismissedAlternatives:[null]}, {...r,seenEvents:[1]}]) assert.equal(core.restoreFollowRoute(invalid),null);
 for(const o of [option({}, {cancelled:true}),option({}, {depUnknown:true}),option({effort:'run'}),option({legs:[]})])assert.equal(start(o),null);
});

test('follow: Service Details rail-stop time gets the saved onward tail inside the engine',()=>{
 const r=start(),u=update(r,[],{phase:'on-train',currentTrainArrival:t+68*MIN});
 assert.equal(u.route.expectedArrival,t+78*MIN);assert.equal(u.notice.deltaMin,8);
 assert.equal(core.followMatchesService(r,option()),true);
 assert.equal(core.followMatchesService(r,option({hub:'MKT'})),false);
});

test('follow: separated graded alternatives preserve raw departed/cancelled service observations',()=>{
 const r=start(),cancelled=option({}, {cancelled:true}),next=option({arrive:t+90*MIN},{serviceId:'next'});
 const u=update(r,[cancelled],{availableOptions:[next]});assert.equal(u.status,'cancelled');assert.equal(u.alternative,next);
 const loc=update(r,[option()],{hasReliableLocation:false});assert.equal(loc.status,'unknown');assert.equal(loc.level,'info');assert.equal(loc.route.expectedArrival,r.expectedArrival);
});

test('follow: location uncertainty does not offer a worse replacement and corrupt route/train pairs are rejected',()=>{
 const r=start(),worse=option({arrive:t+90*MIN},{serviceId:'other'});
 const u=update(r,[option(),worse],{hasReliableLocation:false});assert.equal(u.alternative,null);
 assert.equal(core.restoreFollowRoute({...r,lastTrain:{...r.lastTrain,serviceId:'foreign'}}),null);
 assert.equal(start(option({arrive:t+40*MIN})),null);
 assert.equal(start(option({leave:t+40*MIN})),null);
});

test('follow: no-estimate live arrival can be null without losing a persisted chosen route',()=>{
 const r=start(),unavailable=option({}, {arr:null,arrUnknown:true});
 const u=update(r,[unavailable]);assert.equal(u.status,'unknown');assert.equal(u.level,'bad');assert.equal(u.route.expectedArrival,r.expectedArrival);
 assert.equal(u.route.lastTrain.arr,null);assert.deepEqual(core.restoreFollowRoute(JSON.parse(JSON.stringify(u.route))),u.route);
 const cancelled=update(r,[option({}, {cancelled:true,arr:null})]);assert.equal(cancelled.status,'cancelled');assert.ok(core.restoreFollowRoute(cancelled.route));
 assert.equal(start(option({}, {arr:null})),null);
 assert.equal(core.startFollowRoute(option(),{now:t+31*MIN,direction:'home',mode:'commute'}),null,'a past planned train is not a new journey to follow');
});

test('follow: an active approach leg uses actual connection readiness instead of redoing the original walk',()=>{
 const r=start(),o=option({missed:true,effort:'none'}),now=t+20*MIN;
 const u=update(r,[o],{now,activeConnection:true,readyAt:{CEN:t+29*MIN},hasReliableLocation:false});
 assert.equal(u.status,'on-track');assert.match(u.text,/1 min at your connection/);assert.equal(u.nextStep.train,true);assert.equal(u.route.expectedArrival,r.expectedArrival);
 const missed=update(r,[option()],{now,activeConnection:true,readyAt:{CEN:t+31*MIN},hasReliableLocation:false});assert.equal(missed.status,'missed');
 const exact=update(r,[option()],{now,activeConnection:true,readyAt:{CEN:t+30*MIN},hasReliableLocation:false});assert.equal(exact.status,'on-track');
 const unknown=update(r,[o],{now,activeConnection:true,readyAt:{},hasReliableLocation:true});assert.equal(unknown.status,'unknown');assert.equal(unknown.level,'info');
});

test('follow: active connection alternatives can have passed original leave times but must meet actual readiness',()=>{
 const r=start(),now=t+20*MIN,alt=option({leave:t,missed:true,effort:'none',arrive:r.expectedArrival-5*MIN},{serviceId:'other'});
 const offered=update(r,[option(),alt],{now,activeConnection:true,readyAt:{CEN:t+29*MIN}}).alternative;
 assert.equal(offered.train.serviceId,alt.train.serviceId);assert.equal(offered.leave,now);assert.equal(offered.effort,'walk');assert.equal(offered.missed,false);assert.ok(core.startFollowRoute(offered,{now,direction:'home',mode:'commute'}));
 assert.equal(offered.legs[0].t,t+29*MIN);assert.doesNotMatch(offered.legs.map(l=>l.d).join(' '),/Walk to city tube|Blue line/);
 assert.equal(update(r,[option(),alt],{now,activeConnection:true,readyAt:{CEN:t+31*MIN}}).alternative,null);
 assert.equal(update(r,[option(),alt],{now,activeConnection:true,readyAt:{}}).alternative,null);
});

test('follow: once rail is complete its old disruption cannot overwrite onward ETA or offer another train',()=>{
 const r=start(),old=option({}, {cancelled:true,depUnknown:true,arr:null}),faster=option({arrive:r.expectedArrival-10*MIN},{serviceId:'other'});
 const u=update(r,[old,faster],{phase:'after-train',now:t+61*MIN,currentArrival:t+73*MIN,currentTrainArrival:t+95*MIN});
 assert.equal(u.status,'on-track');assert.equal(u.route.expectedArrival,t+73*MIN);assert.equal(u.alternative,null);assert.match(u.notice.text,/onward journey/);assert.doesNotMatch(u.notice.text,/train/);
 const stable=update(u.route,[option({}, {arr:t+100*MIN,arrLate:40})],{phase:'after-train',now:t+62*MIN});assert.equal(stable.route.expectedArrival,t+73*MIN);
 const arrived=update(u.route,[old,faster],{phase:'arrived'});assert.equal(arrived.status,'arrived');assert.equal(arrived.alternative,null);
});

test('follow: a moving passenger is never offered another departure from the station already left',()=>{
 const r=start(),alt=option({arrive:r.expectedArrival-10*MIN},{serviceId:'other'});
 assert.equal(update(r,[option(),alt],{phase:'on-train'}).alternative,null);
});

test('follow: onboard status measures arrival delay, never historical departure delay',()=>{
 const r=start(),o=option({}, {dep:t+45*MIN,depLate:15,arr:t+62*MIN,arrLate:2});
 const u=update(r,[o],{phase:'on-train',currentTrainArrival:t+62*MIN});
 assert.equal(u.trainStatus.level,'ok');assert.match(u.trainStatus.text,/2 min late/);assert.doesNotMatch(u.trainStatus.text,/15/);
 assert.equal(update(r,[o],{phase:'after-train'}).trainStatus,null);
 const tt=option({}, {timetable:true});assert.equal(update(start(tt),[tt],{phase:'on-train',currentTrainArrival:t+60*MIN}).trainStatus,null);
 const live=update(start(tt),[tt],{phase:'on-train',currentTrainArrival:t+68*MIN,trainArrivalLive:true});assert.equal(live.trainStatus.level,'warn');assert.match(live.trainStatus.text,/8 min late/);
});

test('follow: connection ready instants combine supplied route timings in the engine',()=>{
 assert.deepEqual(core.readyAtFromConnection({CEN:t+20*MIN,MKT:t+22*MIN,UNKNOWN:NaN},{CEN:5*MIN,MKT:3*MIN}),{CEN:t+25*MIN,MKT:t+25*MIN});
 assert.deepEqual(core.readyAtFromConnection({CEN:t},{CEN:-1}),{});assert.deepEqual(core.readyAtFromConnection({CEN:t},{}),{CEN:t});
});

test('follow: onward arrival uses measured route segments from the supplied observation instant',()=>{
 const segments=[{kind:'walk',secs:112},{kind:'station',secs:283},{kind:'ride',secs:600},{kind:'walk',secs:420}];
 assert.equal(core.segmentArrival(t,segments),t+(112+283+600+420)*1000);
 assert.equal(core.segmentArrival(t,[]),t);assert.equal(core.segmentArrival(t,[{kind:'walk',secs:0}]),t);
 const r=start(),arrival=core.segmentArrival(t+61*MIN,[{kind:'walk',secs:7*60}]);
 const u=update(r,[],{phase:'after-train',currentArrival:arrival,dataFresh:false,onwardFresh:true});assert.equal(u.route.expectedArrival,arrival);assert.match(u.notice.text,/onward journey/);
 const stale=update(r,[],{phase:'after-train',currentArrival:arrival,dataFresh:true,onwardFresh:false});assert.equal(stale.route.expectedArrival,r.expectedArrival);
});

test('follow: fresh Service Details updates ETA and rail status while stale board changes stay ignored',()=>{
 const r=start(),stale=option({}, {cancelled:true,platform:'99',arr:null});
 const u=update(r,[stale],{phase:'on-train',dataFresh:false,trainArrivalLive:true,currentTrainArrival:t+66*MIN});
 assert.equal(u.route.expectedArrival,t+76*MIN);assert.equal(u.route.lastTrain.arr,t+66*MIN);assert.notEqual(u.route.lastTrain.platform,'99');assert.equal(u.status,'on-track');assert.match(u.notice.text,/live arrival changed/);assert.match(u.trainStatus.text,/6 min late/);assert.equal(u.alternative,null);
 const unverified=update(r,[],{phase:'on-train',dataFresh:false,currentTrainArrival:t+66*MIN});assert.equal(unverified.route.expectedArrival,r.expectedArrival);assert.equal(unverified.trainStatus,null);
});

test('follow: final-walk ETA updates never move completed rail arrival or onward interchange steps',()=>{
 const original=option();original.legs.splice(-1,0,{t:t+63*MIN,d:'Leave station'},{t:t+65*MIN,d:'Start final walk'});
 const r=start(original),rail=update(r,[option({}, {arr:t+62*MIN,arrLate:2})],{phase:'on-train'}).route;
 const onward=update(rail,[],{phase:'after-train',currentArrival:t+80*MIN,onwardFresh:true,dataFresh:false});
 const legs=core.followedLegs(onward.route);
 assert.equal(legs.find(l=>l.d==='Arrive Riverside').t,t+62*MIN);assert.equal(legs.find(l=>l.d==='Leave station').t,t+65*MIN);assert.equal(legs.find(l=>l.d==='Start final walk').t,t+67*MIN);assert.equal(legs.at(-1).t,t+80*MIN);
 assert.equal(legs.find(l=>l.train).t,t+30*MIN);
});

test('follow: factual platform and expected departure in journey steps update without losing transfer notes',()=>{
 const original=option({}, {platform:'1'});original.legs.find(l=>l.train).d='18:30 (exp 18:32) Express Rail from Central';original.legs.find(l=>l.train).note='allow 6 min to reach the platform, platform 1';
 const r=start(original),u=update(r,[option({}, {platform:'12',dep:t+36*MIN,depLate:6,arr:t+66*MIN,arrLate:6})]);
 const step=core.followedLegs(u.route).find(l=>l.train);assert.equal(step.t,t+36*MIN);assert.match(step.d,/18:30 \(exp 18:36\)/);assert.doesNotMatch(step.d,/18:32/);assert.equal(step.note,'allow 6 min to reach the platform, platform 12');
 const cleared=update(u.route,[option({}, {platform:null})]);const note=core.followedLegs(cleared.route).find(l=>l.train).note;assert.match(note,/platform unannounced/);assert.doesNotMatch(note,/platform 12|platform 1$/);
});

test('follow: sub-minute report changes do not announce an unchanged displayed arrival',()=>{
 const r=start(),small=update(r,[option({}, {arr:t+60*MIN+10000})]);
 assert.equal(small.route.expectedArrival,r.expectedArrival+10000);assert.equal(small.notice,null);
 const changed=update(small.route,[option({}, {arr:t+61*MIN})]);
 assert.ok(changed.notice);assert.match(changed.notice.text,/later/);
});
