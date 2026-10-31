import {test} from 'node:test';
import assert from 'node:assert/strict';
import {core,train,testville,at,MIN} from './helpers.mjs';

const NOW=at('2026-11-03','09:16');
const boarded=extra=>train({serviceId:'current-service',from:'RVS',to:'CEN',std:'09:05',
 dep:NOW-11*MIN,arr:NOW+25*MIN,...extra});
const warnings=(t,original=t,profile=testville)=>core.railWarnings({'RVS-CEN':{services:[original],msgs:[]}},['RVS-CEN'],NOW,profile,{activeTrains:[t]});

test('active disruption: validated current arrival evidence promotes its delay and actual reason without editing the board',()=>{
 const original=Object.freeze(boarded({reason:'Earlier board report'}));
 const current=core.disruptionTrainObservation(original,{source:'reported',delayMin:20,
  expectedArrival:original.arr+20*MIN,reason:'Signalling failure at Central'});
 assert.equal(current.arr,original.arr+20*MIN);assert.equal(current.arrLate,20);
 const impact=warnings(current,original);
 assert.equal(impact.total,1);assert.equal(impact.level,'red');
 assert.equal(core.visibleDisruptions({tiers:impact})[0].detail[0],'20 min late: 09:05 Express Rail: Signalling failure at Central');
 assert.equal(original.arrLate,0);assert.equal(original.reason,'Earlier board report');
});

test('active disruption: stale, modelled and unknown progress cannot manufacture a live rail incident',()=>{
 const original=boarded({});
 for(const source of ['stale','modelled','unknown'])assert.equal(core.disruptionTrainObservation(original,
  {source,delayMin:20,cancelled:true,noEstimate:true,reason:'Unverified'}),null);
 assert.equal(core.disruptionTrainObservation(original,{source:'prediction',delayMin:null}),null);
});

test('active disruption: residual current predictions preserve explicit board incidents until controller recovery',()=>{
 for(const incident of [{cancelled:true},{depUnknown:true},{arrUnknown:true}]){
  const original=boarded({...incident,reason:'Current incident from the board'});
  const residual=core.disruptionTrainObservation(original,{source:'prediction',delayMin:0,reason:'Residual target time'});
  for(const key of Object.keys(incident))assert.equal(residual[key],true);
  assert.equal(residual.reason,original.reason);assert.equal(warnings(residual).level,'red');
  const recovered=core.disruptionTrainObservation({...original,cancelled:false,depUnknown:false,arrUnknown:false,reason:''},
   {source:'reported',delayMin:0});
  assert.equal(warnings(recovered).level,'none');
 }
});

test('active disruption: fresh no-estimate evidence remains serious and signed early timing creates no delay',()=>{
 const original=boarded({arrLate:20});
 const unknown=core.disruptionTrainObservation(original,{source:'reported',delayMin:null,noEstimate:true,reason:'No estimate from the operator'});
 assert.equal(unknown.arrUnknown,true);assert.equal(warnings(unknown).level,'red');
 const early=core.disruptionTrainObservation(original,{source:'prediction',delayMin:-3,expectedArrival:original.arr-3*MIN});
 assert.equal(early.arrLate,0);assert.equal(early.arr,original.arr-3*MIN);
 assert.equal(warnings(early).level,'none');
 const changed={...testville,disruption:{rail:{warnMin:2,badMin:4}}};
 const small=core.disruptionTrainObservation(original,{source:'reported',delayMin:4});
 assert.equal(warnings(small,original,changed).level,'red');
});
