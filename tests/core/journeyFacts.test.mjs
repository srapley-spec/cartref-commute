import {test} from 'node:test';
import assert from 'node:assert/strict';
import {core,train,at,MIN} from './helpers.mjs';

const START=at('2026-11-03','08:00');
const service=extra=>train({from:'RVS',to:'CEN',std:'08:10',dep:START+10*MIN,arr:START+50*MIN,...extra});
const journey=extra=>({leave:START,arrive:START+65*MIN,train:service({}),...extra});

test('journey facts: every view receives train and total durations from the same canonical option',()=>{
 const option=journey({});
 assert.deepEqual(core.journeyFacts(option),{trainDurationMs:40*MIN,totalDurationMs:65*MIN});
 const fast=journey({leave:START+3*MIN});
 assert.deepEqual(core.journeyFacts(fast),{trainDurationMs:40*MIN,totalDurationMs:62*MIN},
  'a retimed fast-walk option keeps its actual canonical leave time');
 assert.equal(core.journeyFacts(option).totalDurationMs,65*MIN,'other options remain independent');
});

test('journey facts: Follow updates its endpoint without replacing the saved journey start',()=>{
 const original=Object.freeze(journey({train:Object.freeze(service({}))}));
 const current=Object.freeze(service({arr:START+57*MIN,arrLate:7}));
 const result=core.journeyFacts(original,{train:current,arrival:START+72*MIN});
 assert.deepEqual(result,{trainDurationMs:47*MIN,totalDurationMs:72*MIN});
 assert.equal(original.leave,START);assert.equal(original.arrive,START+65*MIN);
 assert.equal(original.train.arr,START+50*MIN,'current facts cannot mutate the original plan');
});

test('journey facts: explicit unknown arrival never falls back to a retained planned ETA',()=>{
 assert.deepEqual(core.journeyFacts(journey({}),{arrival:null}),{trainDurationMs:40*MIN,totalDurationMs:null});
 assert.deepEqual(core.journeyFacts(journey({}),{unavailable:true}),{trainDurationMs:40*MIN,totalDurationMs:null});
 for(const incident of [{cancelled:true},{depUnknown:true},{arrUnknown:true}]){
  const option=journey({train:service(incident)});
  assert.deepEqual(core.journeyFacts(option),{trainDurationMs:null,totalDurationMs:null});
 }
});

test('journey facts: completed rail uncertainty cannot erase an independently known onward arrival',()=>{
 const option=journey({train:service({cancelled:true})});
 assert.deepEqual(core.journeyFacts(option,{arrival:START+70*MIN,unavailable:false}),
  {trainDurationMs:null,totalDurationMs:70*MIN});
 assert.equal(core.journeyFacts(option,{arrival:null,unavailable:false}).totalDurationMs,null);
});

test('journey facts: a missing current train endpoint cannot reuse the original option total',()=>{
 const original=Object.freeze(journey({train:Object.freeze(service({}))}));
 for(const arrival of [null,undefined,NaN,Infinity,START]){
  const observed=Object.freeze(service({arr:arrival}));
  assert.deepEqual(core.journeyFacts(original,{train:observed}),{trainDurationMs:null,totalDurationMs:null},
   'retained plan timing is not evidence that this current service has an arrival');
  assert.deepEqual(core.journeyFacts(original,{train:observed,arrival:START+70*MIN,unavailable:false}),
   {trainDurationMs:null,totalDurationMs:70*MIN},'an independently known onward endpoint remains usable');
 }
 assert.equal(original.arrive,START+65*MIN);
});

test('journey facts: a board service without a full route has no invented door-to-door total',()=>{
 assert.deepEqual(core.journeyFacts(null,{train:service({})}),{trainDurationMs:40*MIN,totalDurationMs:null});
 assert.deepEqual(core.journeyFacts(null),{trainDurationMs:null,totalDurationMs:null});
 assert.deepEqual(core.journeyFacts(journey({}),{train:null}),{trainDurationMs:null,totalDurationMs:65*MIN});
});

test('journey facts: invalid or reversed intervals stay unknown, while midnight uses actual instants',()=>{
 for(const arrival of [null,undefined,NaN,Infinity,START-1])assert.equal(core.journeyFacts(journey({}),{arrival}).totalDurationMs,null);
 assert.equal(core.journeyFacts(journey({leave:NaN})).totalDurationMs,null);
 for(const arrival of [null,NaN,Infinity,START])assert.equal(core.journeyFacts(null,{train:service({arr:arrival})}).trainDurationMs,null);
 const midnight=at('2026-11-03','23:40');
 assert.deepEqual(core.journeyFacts({leave:midnight,arrive:midnight+80*MIN,
  train:service({dep:midnight+10*MIN,arr:midnight+60*MIN})}),{trainDurationMs:50*MIN,totalDurationMs:80*MIN});
});

test('connection journey facts: selected Tube timing replaces a rail option access start that is already too late',()=>{
 const atTime=time=>at('2026-11-03',time);
 const rail=Object.freeze(service({std:'18:15',dep:atTime('18:15'),arr:atTime('18:55')}));
 const original=Object.freeze(journey({leave:atTime('17:40')+30e3,arrive:atTime('19:13'),train:rail}));
 const first=core.connectionJourneyFacts(original,{leaveBy:atTime('17:30')+30e3,arrive:atTime('19:13')});
 const later=core.connectionJourneyFacts(original,{leaveBy:atTime('17:36')+30e3,arrive:atTime('19:13')});
 assert.equal(first.trainDurationMs,40*MIN);assert.equal(first.totalDurationMs,102.5*MIN);
 assert.equal(core.dur(first.totalDurationMs),'1h 43m');assert.equal(core.dur(later.totalDurationMs),'1h 37m');
 assert.equal(core.dur(core.journeyFacts(original).totalDurationMs),'1h 33m','the unrelated rebuilt access start remains distinct');
 assert.equal(original.leave,atTime('17:40')+30e3,'displaying a connection never edits the retained rail option');
});

test('connection journey facts: conditional early departures and missing or invalid instants cannot invent a start',()=>{
 const original=journey({});
 for(const leaveBy of [null,undefined,NaN,Infinity,START+70*MIN]){
  assert.deepEqual(core.connectionJourneyFacts(original,{leaveBy,arrive:START+65*MIN}),
   {trainDurationMs:40*MIN,totalDurationMs:null});
 }
 for(const arrive of [null,undefined,NaN,Infinity,START-1])assert.equal(
  core.connectionJourneyFacts(original,{leaveBy:START,arrive}).totalDurationMs,null);
 assert.deepEqual(core.connectionJourneyFacts(null,{leaveBy:START,arrive:START+65*MIN}),
  {trainDurationMs:null,totalDurationMs:null});
});

test('connection journey facts: cancellation and no-estimate train incidents do not expose retained connection totals',()=>{
 for(const incident of [{cancelled:true},{depUnknown:true},{arrUnknown:true},{arr:null}]){
  assert.deepEqual(core.connectionJourneyFacts(journey({train:service(incident)}),
   {leaveBy:START,arrive:START+65*MIN}),{trainDurationMs:null,totalDurationMs:null});
 }
});
