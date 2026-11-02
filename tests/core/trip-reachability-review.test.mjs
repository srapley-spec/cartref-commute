// Independent journey review: eligibility is the existing selected access
// deadline; ranking among eligible journeys remains topPicks' responsibility.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {core,MIN,train} from './helpers.mjs';
const NOW=Date.parse('2026-11-03T10:00:00Z'),cfg=core.tripConfig();
const station=crs=>({crs,name:crs,geo:[51,0],carPark:'unknown',servicePerHour:2,ids:{}});
function journey(leave,arrival,id){
 const departure=leave+10*MIN;
 const j=core.buildJourney({rides:[{kind:'rail',from:station('AAA'),to:station('BBB'),
  dep:departure,arr:arrival,schedDep:departure,schedArr:arrival,live:{dep:false,arr:false},label:'Train'}],source:'fixture',notes:[]},
 null,null,{from:'walk',to:'walk'},[{kind:'walk',secs:7*60},{kind:'station',secs:3*60}],[],cfg,NOW);
 j.id=id;return j;
}
const observed=(j,extra)=>train({from:'AAA',to:'BBB',std:core.hhmm(j.rides[0].schedDep),dep:j.rides[0].dep,arr:j.rides[0].arr,...extra});

test('Trip reachability review: Arrive by keeps a passed access journey listed and picks the reachable least-late option',()=>{
 const impossible=journey(NOW-5*MIN,NOW+20*MIN,'past-access'),reachable=journey(NOW+5*MIN,NOW+40*MIN,'reachable');
 const rows=core.rankTrips([impossible,reachable],{kind:'by',t:NOW+30*MIN},NOW,cfg);
 assert.deepEqual(rows.map(j=>j.id),['past-access','reachable'],'every returned departure stays in leaving order');
 assert.equal(core.tripCanFollow(impossible,NOW),false,'its train is future but its full walking/platform deadline passed');
 assert.equal(impossible.recommended,undefined,'an unreachable service is not an ordinary recommendation');
 assert.ok(!impossible.flags.some(f=>/^(Arrives first|Latest for|Least late)/.test(f.txt)));
 assert.equal(reachable.recommended,1);
 assert.ok(reachable.flags.some(f=>f.txt==='Least late for 10:30'));
});

test('Trip reachability review: all questions use the same exact access cutoff as Follow and preserve fixed platform time',()=>{
 for(const kind of ['now','at','by'])for(const offset of [-30000,-1,0,1]){
  const candidate=journey(NOW+offset,NOW+30*MIN,`${kind}:${offset}`),later=journey(NOW+2*MIN,NOW+60*MIN,'later');
  const rows=core.rankTrips([candidate,later],{kind,t:kind==='by'?NOW+45*MIN:NOW},NOW,cfg);
  assert.equal(rows.length,2,'a passed option remains in the full list');
  assert.equal(core.tripCanFollow(candidate,NOW),offset>=0,`${kind}: exact millisecond access cutoff`);
  if(offset<0){
   assert.equal(candidate.recommended,undefined,`${kind}: no past-deadline recommendation, including the old thirty-second grace`);
   assert.ok(!candidate.flags.some(f=>/^(Arrives first|Latest for|Least late)/.test(f.txt)));
   assert.equal(later.recommended,1);
  }else assert.equal(candidate.recommended,1,`${kind}: a deadline at or after now remains eligible`);
 }
});

test('Trip reachability review: stale summary flags cannot make cancelled, unknown or invalid endpoints recommendable',()=>{
 const problems=[
  ['bare cancellation',j=>{j.rides[0].cancelled=true;}],
  ['train cancellation',j=>{j.rides[0].train=observed(j,{cancelled:true});}],
  ['unknown departure',j=>{j.rides[0].train=observed(j,{depUnknown:true});}],
  ['unknown arrival',j=>{j.rides[0].train=observed(j,{arrUnknown:true});}],
  ['missing train arrival',j=>{j.rides[0].train=observed(j,{arr:null});}],
  ['nonfinite ride arrival',j=>{j.rides[0].arr=NaN;}],
  ['reversed ride',j=>{j.rides[0].arr=j.rides[0].dep-1;}],
  ['nonfinite final arrival',j=>{j.arrive=Infinity;}],
  ['reversed final interval',j=>{j.arrive=j.leave-1;}],
 ];
 for(const [name,breakEndpoint] of problems){
  const invalid=journey(NOW+MIN,NOW+30*MIN,name),valid=journey(NOW+2*MIN,NOW+40*MIN,'valid');
  breakEndpoint(invalid);invalid.uncertain=false;invalid.missed=false;
  assert.equal(core.tripCanFollow(invalid,NOW),false,name+': endpoint evidence outranks retained aggregate flags');
  const rows=core.rankTrips([invalid,valid],{kind:'by',t:NOW+45*MIN},NOW,cfg);
  assert.equal(rows.length,2,name+': never remove the service');
  assert.equal(invalid.recommended,undefined,name+': never recommend an unusable journey');
  assert.ok(!invalid.flags.some(f=>/^(Arrives first|Latest for|Least late)/.test(f.txt)),name+': no stale comparison badge');
  assert.equal(valid.recommended,1);
 }
});

test('Trip reachability review: current Train evidence withdraws an active final ETA despite retained Ride timing',()=>{
 for(const confirmed of [false,true])for(const issue of ['missing train arrival','train cancellation']){
  const j=journey(NOW+MIN,NOW+30*MIN,'active'),base=core.startFollowTrip(j,NOW);
  const route=confirmed?core.confirmTripRide(base,0):base,current=structuredClone(j);
  current.rides[0].train=observed(current,issue==='missing train arrival'?{arr:null}:{cancelled:true});
  current.uncertain=false;current.missed=false;current.rides[0].cancelled=false;
  const u=core.updateFollowTrip(route,{now:NOW,current});
  assert.equal(u.arrival,null,`${issue}, confirmed=${confirmed}: current final ETA is unavailable`);
  assert.equal(u.route.expectedArrival,route.expectedArrival,'the old expected number remains history, not a renewed promise');
  assert.equal(core.tripJourneyFacts(current).totalDurationMs,null,'headline and duration availability agree');
  assert.ok(!u.route.notices.some(n=>/Now arriving/.test(n.text)),'invalid current evidence never announces a promised arrival');
 }
});
