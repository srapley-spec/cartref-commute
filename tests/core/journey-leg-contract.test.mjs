import {test} from 'node:test';
import assert from 'node:assert/strict';
import {core,MIN,train} from './helpers.mjs';
const NOW=Date.parse('2026-11-03T23:40:00Z');
const station=crs=>({crs,name:crs,geo:[51,0],carPark:'unknown',servicePerHour:2,ids:{}});
const ride=(from,to,dep,arr)=>({kind:'rail',from:station(from),to:station(to),dep:NOW+dep*MIN,arr:NOW+arr*MIN,schedDep:NOW+dep*MIN,schedArr:NOW+arr*MIN,live:{dep:true,arr:true},label:'Train',operator:'Operator'});
const cfg=core.tripConfig();
const journey=()=>core.buildJourney({rides:[ride('AAA','BBB',5,25),ride('BBB','CCC',40,60)],source:'fixture',notes:[]},null,null,{from:'walk',to:'walk'},[{kind:'walk',secs:600}],[{kind:'walk',secs:600}],cfg,NOW);

test('journey remaining: full final instants include midnight, waiting and final access and tick independently of a feed',()=>{
 const j=journey();
 assert.equal(core.journeyRemainingMs(j.arrive,NOW),70*MIN);
 assert.equal(core.journeyRemainingMs(j.arrive,NOW+10*MIN),60*MIN);
 assert.equal(core.journeyRemainingMs(j.arrive,j.arrive),0);
 for(const arrival of [null,undefined,NaN,Infinity,NOW-1])assert.equal(core.journeyRemainingMs(arrival,NOW),null);
 assert.equal(core.journeyRemainingMs(j.arrive,NOW,false),null);
 assert.equal(core.journeyFacts({leave:NOW-5*MIN,arrive:j.arrive,train:train({dep:NOW+5*MIN,arr:NOW+25*MIN})}).totalDurationMs,75*MIN,'planning retains leave-to-final total');
});

test('Trip active journey: timetable progression suggests stages and never proves boarding or arrival',()=>{
 const j=journey(),f=core.startFollowTrip(j,NOW);
 assert.deepEqual(core.followedTripPhase(f,NOW+10*MIN),{phase:'ride',ride:0});
 assert.deepEqual(f.confirmed,[]);
 assert.equal(core.followedTripPhase(f,j.arrive+MIN).phase,'final');
 let confirmed=core.confirmTripRide(f,0);
 assert.deepEqual(core.followedTripPhase(confirmed,j.arrive+MIN),{phase:'ride',ride:0},'a direct answer lasts until corrected or alighting');
 confirmed=core.alightTripRide(confirmed);
 assert.deepEqual(core.followedTripPhase(confirmed,NOW+15*MIN),{phase:'change',ride:1},'early alighting moves to the next connection');
 confirmed=core.confirmTripRide(confirmed,1);
 assert.equal(core.restoreFollowTrip(JSON.parse(JSON.stringify(confirmed))).activeRide,1);
 confirmed=core.confirmTripRide(confirmed,0);
 assert.deepEqual(confirmed.confirmed,[0],'correcting to an earlier service removes later boarding assertions');
 const done=core.completeFollowTrip(confirmed,NOW+72*MIN),u=core.updateFollowTrip(done,{now:NOW+74*MIN,options:[{...j,id:'other',leave:NOW+80*MIN}]});
 assert.equal(u.phase,'arrived');assert.equal(u.arrival,NOW+72*MIN);assert.equal(u.alternative,null);
});

test('Trip active journey: broken connections withdraw the final ETA without replacing the selected itinerary',()=>{
 const j=journey(),f=core.startFollowTrip(j,NOW);
 for(const problem of ['missed','cancelled','unknown']){
  const cur=structuredClone(j);cur.arrive+=10*MIN;
  if(problem==='missed')cur.changes[0].missed=true;
  if(problem==='cancelled')cur.rides[1].cancelled=true;
  if(problem==='unknown')cur.rides[1].train=train({dep:cur.rides[1].dep,arr:cur.rides[1].arr,arrUnknown:true});
  const u=core.updateFollowTrip(f,{now:NOW,current:cur});
  assert.equal(u.arrival,null,problem);assert.equal(u.route.id,j.id);
  assert.equal(u.route.expectedArrival,j.arrive,'last usable arrival stays available as history');
  assert.ok(!u.route.notices.some(n=>/Now arriving/.test(n.text)),'an impossible new ETA is never announced');
 }
 assert.equal(core.tripJourneyFacts({...j,missed:true}).totalDurationMs,null);
});

test('Trip active journey: confirmed completed legs cannot create obsolete cancellation or missed-change alerts',()=>{
 const j=journey(),f=core.confirmTripRide(core.startFollowTrip(j,NOW),1),cur=structuredClone(j);
 cur.rides[0].cancelled=true;cur.changes[0].missed=true;
 const u=core.updateFollowTrip(f,{now:NOW+45*MIN,current:cur});
 assert.equal(u.arrival,j.arrive);assert.equal(u.status,'on-track');assert.equal(u.notice,null);
 cur.rides[1].train=train({dep:cur.rides[1].dep,arr:cur.rides[1].arr,depUnknown:true});
 assert.equal(core.updateFollowTrip(f,{now:NOW+45*MIN,current:cur}).arrival,j.arrive,'known current arrival is independent of the departure estimate after confirmed boarding');
});

test('Trip recovery: starts at the next alighting station when riding and the final station on final access',()=>{
 const j=journey(),f=core.confirmTripRide(core.startFollowTrip(j,NOW),0);
 assert.deepEqual(core.tripRecoveryStart(f,NOW+10*MIN),{station:j.rides[0].to,readyAt:NOW+25*MIN});
 assert.deepEqual(core.tripRecoveryStart(core.alightTripRide(f),NOW+10*MIN),{station:j.rides[1].from,readyAt:NOW+10*MIN});
 assert.equal(core.tripRecoveryStart(core.startFollowTrip(j,NOW),NOW+65*MIN).station.crs,'CCC');
});

test('Trip connections: distinguish the service gap, supplied transfer duration and spare without inventing a transfer',()=>{
 const first=ride('AAA','BBB',5,25),last=ride('DDD','CCC',40,60),via={...ride('BBB','DDD',27,35),kind:'tube'};
 const change=core.changeStatus(first,last,[via],cfg);
 assert.equal(change.betweenMs,15*MIN);assert.equal(change.transferMs,8*MIN);assert.equal(change.spare,7);
 const same=core.changeStatus(first,{...last,from:first.to},[],cfg);
 assert.equal(same.betweenMs,15*MIN);assert.equal(same.transferMs,null,'provider has not supplied a distinct station transfer');
});

test('Trip Live board: retains cancelled and unknown departures, deduplicates shared first services and keeps exact itinerary ownership',()=>{
 const j=journey(),later={...structuredClone(j),id:'later',arrive:j.arrive+10*MIN};
 const cancelled=structuredClone(j);cancelled.id='cancelled';cancelled.rides[0].schedDep-=MIN;cancelled.rides[0].cancelled=true;
 const unknown=structuredClone(j);unknown.id='unknown';unknown.rides[0].schedDep-=2*MIN;unknown.rides[0].train=train({depUnknown:true});
 const rows=core.tripDepartureBoard([later,j,cancelled,unknown],NOW+10*MIN);
 assert.deepEqual(rows.map(r=>r.journey.id),['unknown','cancelled']);
 assert.equal(core.tripDepartureBoard([later,j],NOW)[0].journey.id,j.id);
});

test('Trip recovery: rejects original-origin alternatives while aboard and preserves original target, completed legs and reason on explicit replacement',()=>{
 const j=journey(),f=core.confirmTripRide(core.startFollowTrip(j,NOW),0),broken=structuredClone(j);
 broken.rides[0].arr+=20*MIN;broken.changes=core.journeyChanges(broken.rides,cfg);broken.missed=true;
 const oldOrigin={...structuredClone(j),id:'origin-alt',leave:NOW+20*MIN};
 assert.equal(core.updateFollowTrip(f,{now:NOW+10*MIN,current:broken,options:[oldOrigin]}).alternative,null);
 const current=core.updateFollowTrip(f,{now:NOW+10*MIN,current:broken}).route;
 const next=core.buildJourney({rides:[ride('BBB','CCC',55,80)],source:'fixture',notes:[]},null,null,{from:'walk',to:'walk'},[],j.after,cfg,NOW+10*MIN);
 const switched=core.recoverFollowTrip(current,next,NOW+10*MIN,cfg);
 assert.ok(switched);assert.equal(switched.plannedArrival,j.arrive);assert.equal(switched.startedAt,f.startedAt);
 assert.equal(switched.journey.leave,j.leave);assert.equal(switched.journey.rides.length,2);
 assert.equal(switched.journey.rides[0].schedDep,j.rides[0].schedDep);assert.equal(switched.activeRide,0);
 assert.equal(switched.expectedArrival,next.arrive);assert.match(switched.notices.at(-1).text,/Original arrival.*now/);
 assert.equal(core.restoreFollowTrip(JSON.parse(JSON.stringify(switched))).id,next.id);
 assert.equal(core.updateFollowTrip(switched,{now:NOW+10*MIN}).arrival,next.arrive,'the missed old connection is replaced, not retained as an active incident');
 assert.equal(core.recoverFollowTrip(current,{...next,leave:NOW+30*MIN},NOW+10*MIN,cfg),null,'cannot leave the recovery station before the current train gets there');
 assert.equal(core.tripCanFollow({...j,leave:NOW-1},NOW),false);
});
