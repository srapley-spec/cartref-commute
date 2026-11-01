import {test} from 'node:test';
import assert from 'node:assert/strict';
import {core,MIN,train} from './helpers.mjs';

const start=Date.parse('2026-11-03T23:30:00Z');
const ride=(kind,dep,arr,extra={})=>({kind,dep:start+dep*MIN,arr:start+arr*MIN,...extra});
const journey=()=>({leave:start-10*MIN,arrive:start+110*MIN,rides:[
 ride('rail',0,30),ride('walk',32,37),ride('tube',40,50),ride('bus',55,65),ride('rail',75,100),
]});

test('Trip facts: sum time aboard trains across midnight and keep access, changes and other modes in the total',()=>{
 assert.deepEqual(core.tripJourneyFacts(journey()),{trainDurationMs:55*MIN,totalDurationMs:120*MIN});
});
test('Trip facts: unknown access keeps known rail duration without inventing a door-to-door total',()=>{
 assert.deepEqual(core.tripJourneyFacts({...journey(),uncertain:true}),{trainDurationMs:55*MIN,totalDurationMs:null});
});
test('Trip facts: cancellation or an unknown rail time withdraws the rail sum and the total',()=>{
 for(const incident of [{cancelled:true},{train:train({dep:start,arr:start+30*MIN,depUnknown:true})},
   {train:train({dep:start,arr:start+30*MIN,arrUnknown:true})},{dep:NaN},{arr:start-MIN}]){
  const j=journey();Object.assign(j.rides[0],incident);
  assert.deepEqual(core.tripJourneyFacts(j),{trainDurationMs:null,totalDurationMs:null});
 }
});
test('Trip facts: a missing transfer time cannot become a claimed total; no rail cannot become zero minutes on trains',()=>{
 const j=journey();j.rides[2].arr=NaN;
 assert.deepEqual(core.tripJourneyFacts(j),{trainDurationMs:55*MIN,totalDurationMs:null});
 assert.deepEqual(core.tripJourneyFacts({...journey(),rides:[ride('bus',0,100)]}),{trainDurationMs:null,totalDurationMs:120*MIN});
 assert.deepEqual(core.tripJourneyFacts({...journey(),rides:[]}),{trainDurationMs:null,totalDurationMs:null});
 assert.equal(core.tripJourneyFacts({...journey(),arrive:start-11*MIN}).totalDurationMs,null);
});
