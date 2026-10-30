import {test} from 'node:test';
import assert from 'node:assert/strict';
import {core,fixture,MIN} from './helpers.mjs';
const NOW=Date.parse('2026-10-30T22:43:00Z');
const fcn=fixture('tfl-2026-10-30T2243Z/FCN.json'),ksx=fixture('tfl-2026-10-30T2243Z/KSX.json');
const request=(o={})=>({vehicle:'441',hub:'MKT',stopId:'940GZZLUFCN',lineId:'metropolitan',direction:'westbound',now:NOW,fetchedAt:NOW,readyMs:4*MIN,...o});

test('follow Tube: recorded441 westbound Met gives exact Farringdon and Kings Cross predictions',()=>{
 const market=core.followTubeArrival(fcn,request());
 assert.equal(market.arrival,Date.parse('2026-10-30T22:49:42Z'));
 assert.equal(market.readyAt,Date.parse('2026-10-30T22:53:42Z'));
 assert.equal(market.hub,'MKT','caller corridor supplies hub and transfer allowance');assert.equal(market.live,true);
 const central=core.followTubeArrival(ksx,request({hub:'CEN',stopId:'940GZZLUKSX',readyMs:7*MIN}));
 assert.equal(central.arrival,Date.parse('2026-10-30T22:52:41Z'));assert.equal(central.readyAt,Date.parse('2026-10-30T22:59:41Z'));
 assert.equal(central.vehicle,'441');
});

test('follow Tube: vehicle, direction, line and target station must all match',()=>{
 assert.equal(core.followTubeArrival(fcn,request({vehicle:'999'})),null);
 assert.equal(core.followTubeArrival(fcn,request({lineId:'circle'})),null);
 assert.equal(core.followTubeArrival(fcn,request({stopId:'940GZZLUKSX'})),null);
 const actual=fcn.find(x=>x.vehicleId==='441');
 assert.equal(core.followTubeArrival([{...actual,platformName:'Eastbound - Platform 1'}],request()),null);
 assert.equal(core.followTubeArrival([{...actual,platformName:''}],request()),null);
 assert.equal(core.followTubeArrival([{...actual,naptanId:'wrong-stop'}],request()),null);
 assert.equal(core.followTubeArrival([{...actual,vehicleId:''}],request()),null);
});

test('follow Tube: cache and provider timestamp expire at exactly three minutes',()=>{
 const actual=fcn.find(x=>x.vehicleId==='441');
 const row={...actual,timestamp:new Date(NOW).toISOString()};
 assert.ok(core.followTubeArrival([row],request({now:NOW+3*MIN-1})));
 assert.equal(core.followTubeArrival([row],request({now:NOW+3*MIN})),null);
 assert.equal(core.followTubeArrival([{...row,timestamp:new Date(NOW-3*MIN).toISOString()}],request()),null);
 assert.equal(core.followTubeArrival([{...row,timestamp:new Date(NOW+31000).toISOString()}],request()),null);
 assert.equal(core.followTubeArrival([row],request({fetchedAt:NOW+1})),null);
 assert.equal(core.followTubeArrival([row],request({fetchedAt:NaN})),null);
});

test('follow Tube: malformed, missing and already passed predictions fall back without invented ETAs',()=>{
 const actual=fcn.find(x=>x.vehicleId==='441');
 for(const data of [null,{},[],[{...actual,expectedArrival:'invalid'}],[{...actual,expectedArrival:new Date(NOW-31000).toISOString()}],
  [{...actual,expectedArrival:undefined,timeToStation:undefined}],[{...actual,timestamp:'invalid'}]])
  assert.equal(core.followTubeArrival(data,request()),null);
 assert.equal(core.followTubeArrival(fcn,request({readyMs:-1})),null);
 assert.equal(core.followTubeArrival(fcn,request({readyMs:Infinity})),null);
 assert.equal(core.followTubeArrival(fcn,request({now:NaN})),null);
});

test('follow Tube: normalized guarded adapter records retain provider timestamp and exact prediction',()=>{
 const raw=fcn.find(x=>x.vehicleId==='441');
 const normalized={vehicle:raw.vehicleId,lineId:raw.lineId,platform:raw.platformName,stopId:raw.naptanId,
  observedAt:Date.parse(raw.timestamp),t:Date.parse(raw.expectedArrival)};
 const before=JSON.stringify(normalized),expected=core.followTubeArrival([raw],request());
 assert.deepEqual(core.followTubeArrival([normalized],request()),expected);assert.equal(JSON.stringify(normalized),before);
 assert.equal(core.followTubeArrival([{...normalized,observedAt:NOW-3*MIN}],request()),null);
});

test('follow Tube: a timestamp-less prediction uses guarded endpoint provenance and never another explicit stop',()=>{
 const normalized={vehicle:'v1',lineId:'circle',platform:'Westbound - Platform 2',t:NOW+MIN};
 const req=request({vehicle:'v1',lineId:'circle'});
 assert.equal(core.followTubeArrival([normalized],req).arrival,NOW+MIN);
 assert.equal(core.followTubeArrival([{...normalized,stopId:'other'}],req),null);
 assert.equal(core.followTubeArrival([{vehicle:'v1',lineId:'circle',platform:'Westbound',timeToStation:30}],req).arrival,NOW+30000);
});


test('follow Tube: another corridor supplies its own travel direction',()=>{
 const actual=fcn.find(x=>x.vehicleId==='441');
 const east={...actual,platformName:'Eastbound - Platform 1'};
 assert.equal(core.followTubeArrival([east],request()),null);
 assert.ok(core.followTubeArrival([east],request({direction:'eastbound'})));
 assert.equal(core.followTubeArrival([east],request({direction:'unknown'})),null);
});
