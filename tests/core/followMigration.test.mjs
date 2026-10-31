import {test} from 'node:test';
import assert from 'node:assert/strict';
import {core,train,at,MIN} from './helpers.mjs';
const t=at('2026-11-03','18:00');
function option(extra={},trainExtra={}){
 return {hub:'CEN',leave:t+10*MIN,arrive:t+70*MIN,flags:[],effort:'walk',
  train:train({from:'CEN',to:'RVS',operator:'Express',std:'18:30',dep:t+30*MIN,arr:t+60*MIN,serviceId:'chosen',...trainExtra}),
  legs:[{t:t+10*MIN,d:'Walk to Central'},{t:t+30*MIN,d:'18:30 Express from Central',train:true},{t:t+60*MIN,d:'Arrive Riverside'},{t:t+70*MIN,d:'Arrive home'}],...extra};
}
const legacy=(extra={})=>({dir:'home',train:{operator:'Express',std:'18:30',from:'CEN',serviceId:'chosen'},calls:[{operator:'Express',std:'18:30',from:'CEN',serviceId:'chosen'}],hub:'CEN',lastDep:t+30*MIN,afterMs:10*MIN,planned:t+70*MIN,arrive:t+70*MIN,lateMin:0,followedAt:t,reason:null,dismissed:null,declined:[],...extra});
const migrate=(old=legacy(),options=[option()],now=t)=>core.migrateFollowRoute(old,options,{now,mode:'commute'});

test('follow migration: restores released user selection from a real itinerary, preserves ETA and leaves old state untouched',()=>{
 const old=legacy(),before=JSON.stringify(old),o=option(),r=migrate(old,[o]);assert.ok(r);assert.equal(r.direction,'home');assert.equal(r.option.train.serviceId,'chosen');assert.equal(r.option.hub,'CEN');assert.equal(r.startedAt,old.followedAt);assert.equal(r.plannedArrival,old.planned);assert.equal(r.expectedArrival,old.arrive);assert.equal(r.option.arrive-r.option.train.arr,old.afterMs);assert.equal(JSON.stringify(old),before);assert.notEqual(r.option,o);assert.ok(core.restoreFollowRoute(r));
});

test('follow migration: preserves historical planned tail when current approach or timing settings differ',()=>{
 const old=legacy({arrive:t+76*MIN,lateMin:6});const o=option({arrive:t+90*MIN},{arr:t+66*MIN,arrLate:6});
 const r=migrate(old,[o]);assert.ok(r);assert.equal(r.plannedArrival,t+70*MIN);assert.equal(r.expectedArrival,t+76*MIN);assert.equal(r.option.train.arr,t+60*MIN);assert.equal(r.option.arrive-r.option.train.arr,10*MIN);assert.equal(r.lastTrain.arr,t+66*MIN);
 assert.equal(core.updateFollowRoute(r,{now:t,options:[o]}).route.expectedArrival,t+76*MIN);
});

test('follow migration: cancelled and already departed choices migrate without starting a different journey',()=>{
 const old=legacy({reason:{kind:'cancelled',text:'Your 18:30 Express is cancelled',at:t+5*MIN,level:'bad'}});
 const cancelled=migrate(old,[option({}, {cancelled:true})]);assert.ok(cancelled);assert.equal(cancelled.lastTrain.cancelled,true);assert.equal(cancelled.notices[0].text,old.reason.text);assert.equal(cancelled.incident,'cancelled');
 const departed=migrate(legacy(),[option()],t+40*MIN);assert.ok(departed);assert.equal(departed.phase,'before-train','migration does not infer boarding from clock alone');const observed=core.updateFollowRoute(departed,{now:t+40*MIN,options:[option()],phase:'on-train'});assert.notEqual(observed.status,'missed');
});

test('follow migration: missing boards, wrong train, wrong boarding point or reused daily ID never substitutes a journey',()=>{
 assert.equal(migrate(legacy(),[]),null);assert.equal(migrate(legacy(),[option({}, {serviceId:'other'})]),null);assert.equal(migrate(legacy(),[option({hub:'MKT'},{from:'MKT'})]),null);
 const tomorrow=option({}, {dep:t+30*MIN+864e5,arr:t+60*MIN+864e5});assert.equal(migrate(legacy(),[tomorrow]),null);
 assert.equal(migrate(legacy(),[option({}, {arr:null,depUnknown:true})]),null,'keep old storage when no complete real itinerary exists');
});

test('follow migration: keeps original boarding call inside a merged actual option and only imports known same-train calls',()=>{
 const original=option(),alt=option({hub:'MKT',leave:t+15*MIN},{from:'MKT',std:'18:35',dep:t+35*MIN,serviceId:'second-call'});
 const old=legacy({calls:[legacy().train,{operator:'Express',std:'18:35',from:'MKT',serviceId:'second-call'}],lastDep:t+35*MIN});
 const unknown=option({hub:'OTHER'},{from:'OTHER',serviceId:'chosen'});
 const merged={...alt,alts:[original]};const r=migrate(old,[merged,unknown]);assert.ok(r);assert.equal(r.option.hub,'CEN');assert.equal(r.option.alts.length,1);assert.equal(r.option.alts[0].hub,'MKT');assert.equal(core.followMatchesObservedTrain(r,alt),true);assert.equal(core.followMatchesObservedTrain(r,unknown),false);
});

test('follow migration: prior cancelled and missed acknowledgements remain acknowledged on refresh',()=>{
 for(const kind of ['cancelled','missed']){
  const o=kind==='cancelled'?option({}, {cancelled:true}):option({effort:'none'});
  const r=migrate(legacy({dismissed:kind}),[o]);assert.ok(r);assert.equal(r.notices.length,0);const next=core.updateFollowRoute(r,{now:t,options:[o]});assert.equal(next.notice,null);assert.equal(next.status,kind);
 }
});

test('follow migration: imports existing explanation and declined actual alternatives without changing severity rules',()=>{
 const other=option({arrive:t+60*MIN},{std:'18:40',dep:t+40*MIN,serviceId:'other'}),old=legacy({arrive:t+76*MIN,lateMin:6,reason:{kind:'late',text:'Your train is now 6 min late',at:t+5*MIN,level:'bad'},declined:['Express|18:40|CEN']});
 const r=migrate(old,[option({}, {arr:t+66*MIN,arrLate:6}),other]);assert.ok(r);assert.equal(r.notices[0].text,old.reason.text);assert.ok(r.dismissedAlternatives.some(key=>key.includes('Express|18:40|CEN')));assert.equal(core.updateFollowRoute(r,{now:t,options:[option({}, {arr:t+66*MIN,arrLate:6}),other]}).alternative,null);assert.equal(core.delayLevel(6),'warn');
});

test('follow migration: validates every released field and rejects corrupt state without exceptions',()=>{
 const old=legacy();assert.equal(core.isLegacyFollowRoute(old),true);
 for(const invalid of [null,{}, {...old,dir:'elsewhere'},{...old,train:{}},{...old,calls:'bad'},{...old,calls:[null]},{...old,hub:4},{...old,lastDep:Infinity},{...old,afterMs:-1},{...old,planned:null},{...old,arrive:NaN},{...old,lateMin:'5'},{...old,followedAt:0},{...old,reason:{kind:'invented'}},{...old,dismissed:'invented'},{...old,declined:[{}]}]){
  assert.equal(core.isLegacyFollowRoute(invalid),false);assert.equal(migrate(invalid),null);
 }
 assert.equal(core.migrateFollowRoute(old,[option()],{now:t,mode:'invalid'}),null);
});

test('follow migration: declined options absent during restoration remain declined on a later same-day refresh',()=>{
 const old=legacy({declined:['Express|18:40|CEN']}),r=migrate(old,[option()]);assert.ok(r);assert.equal(r.dismissedAlternatives.length,1);
 const later=option({arrive:t+60*MIN},{std:'18:40',dep:t+40*MIN,serviceId:'later-loaded'});
 assert.equal(core.updateFollowRoute(r,{now:t,options:[option(),later]}).alternative,null);
 const tomorrow={...later,train:{...later.train,dep:later.train.dep+864e5,arr:later.train.arr+864e5},leave:later.leave+864e5};
 assert.ok(core.updateFollowRoute(r,{now:t,options:[option(),tomorrow]}).alternative,'a decline does not apply to the same timetable name tomorrow');
 assert.equal(core.isLegacyFollowRoute(legacy({declined:['broken-key']})),false);
});
