import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as C from '../dist/core.mjs';
const make=vm.runInNewContext(readFileSync(new URL('../src/simulator/feeds.js',import.meta.url),'utf8')+'\ncreateSimulatedTransportFeeds',{Date});
const minute=60000,start=Date.parse('2026-11-03T08:44:00Z');
function fixture(config={}){let time=config.startTime??start;const c={route:'kgx',direction:'outbound',scenario:'normal',startTime:time,...config};const feeds=make({now:()=>time,scenario:()=>c});return {feeds,c,at:n=>time=c.startTime+n*minute,now:()=>time};}
const parse=(f,from,to)=>C.parseDarwinBoard(f.feeds.board(from,to),from,to,f.now(),String);
for(const [route,hub,outDep,outArr,returnDep,returnArr] of [['kgx','KGX',21,57,33,69],['far','ZFD',28,76,36,84]]){
 test(`synthetic ${route} outbound and return boards use real adapters and consistent service progress`,()=>{
  for(const direction of ['outbound','return']){
   const f=fixture({route,direction,startTime:start+(direction==='return'?420:0)*minute}),ret=direction==='return',from=ret?hub:'LET',to=ret?'LET':hub;
   const b=parse(f,from,to);assert.ok(b.services.length>=2);assert.notEqual(b.services[0].serviceId,b.services[1].serviceId);
   const t=b.services[0];assert.equal(t.dep,f.now()+(ret?returnDep:outDep)*minute);assert.equal(t.arr,f.now()+(ret?returnArr:outArr)*minute);
   f.at(ret?(route==='far'?72:57):(route==='far'?40:32));
   const progress=C.parseServiceDetails(f.feeds.details(t.serviceId),f.now());assert.equal(progress.last.code,'SVG');assert.ok(progress.next);assert.equal(progress.at(to),t.arr);
   f.at(ret?returnArr:outArr);assert.equal(C.parseServiceDetails(f.feeds.details(t.serviceId),f.now()).last.code,to);
  }
 });
}
test('synthetic delay cancellation and platform changes preserve competing services',()=>{
 for(const scenario of ['delay','cancellation','platform-change']){
  const f=fixture({scenario});const b=parse(f,'LET','KGX');assert.equal(b.services.length,2);
  assert.equal(b.services[1].cancelled,false);assert.equal(b.services[1].depLate,scenario==='delay'?8:0);
  if(scenario==='delay'){assert.equal(b.services[0].depLate,8);assert.equal(b.services[0].arrLate,8);f.at(32);assert.equal(C.parseServiceDetails(f.feeds.details(b.services[0].serviceId),f.now()).last.code,'LET');}
  if(scenario==='cancellation'){assert.equal(b.services[0].cancelled,true);f.at(90);assert.equal(C.parseServiceDetails(f.feeds.details(b.services[0].serviceId),f.now()).last,null);}
  if(scenario==='platform-change')assert.equal(b.services[0].platform,'4');
 }
});
test('TfL predictions progress by stable vehicle across stations and freeze while paused',()=>{
 const f=fixture();f.at(60);const k=f.feeds.tube('StopPoint/940GZZLUKSX/Arrivals');const train=k.find(x=>x.timeToStation===240);assert.ok(train);
 f.at(61);const again=f.feeds.tube('StopPoint/940GZZLUKSX/Arrivals').find(x=>x.vehicleId===train.vehicleId);assert.equal(again.timeToStation,180);assert.equal(again.expectedArrival,train.expectedArrival);
 assert.deepEqual(f.feeds.tube('StopPoint/940GZZLUKSX/Arrivals'),f.feeds.tube('StopPoint/940GZZLUKSX/Arrivals'));
 f.at(72);const ald=f.feeds.tube('StopPoint/940GZZLUALD/Arrivals').find(x=>x.vehicleId===train.vehicleId);assert.equal(ald.timeToStation,360);assert.equal(Date.parse(ald.expectedArrival)-Date.parse(train.expectedArrival),14*minute);
 f.at(65);assert.ok(!f.feeds.tube('StopPoint/940GZZLUKSX/Arrivals').some(x=>x.vehicleId===train.vehicleId));
});
test('return Underground services travel west with coherent Farringdon and Kings Cross timing',()=>{
 const f=fixture({direction:'return',startTime:start+420*minute});f.at(7);const ald=f.feeds.tube('StopPoint/940GZZLUALD/Arrivals').find(x=>x.timeToStation===180);assert.match(ald.platformName,/Westbound/);assert.match(ald.destinationName,/Uxbridge/);
 const far=f.feeds.tube('StopPoint/940GZZLUFCN/Arrivals').find(x=>x.vehicleId===ald.vehicleId),kgx=f.feeds.tube('StopPoint/940GZZLUKSX/Arrivals').find(x=>x.vehicleId===ald.vehicleId);
 assert.equal(Date.parse(far.expectedArrival)-Date.parse(ald.expectedArrival),10*minute);assert.equal(Date.parse(kgx.expectedArrival)-Date.parse(ald.expectedArrival),14*minute);
});
test('scenario epoch survives midnight without moving rail or TfL fixture identities',()=>{
 const f=fixture({startTime:Date.parse('2026-11-03T23:44:00Z')});const t=f.feeds.services()[0];f.at(32);assert.equal(f.feeds.services()[0].dep,t.dep);assert.equal(f.feeds.services()[0].id,t.id);
 assert.equal(C.parseServiceDetails(f.feeds.details(t.id),f.now()).last.code,'SVG');
});
test('provider URL variants and unknown URLs remain entirely synthetic and outages recover',async()=>{
 const f=fixture();for(const url of ['/GetDepBoardWithDetails/LET?filterCrs=KGX','/board/LET/KGX','/departures/LET/to/KGX/10'])assert.equal((await f.feeds.respond(url).json()).trainServices.length,2);
 assert.equal(f.feeds.respond('/unknown-provider-url').status,501);assert.equal(f.feeds.respond('/GetServiceDetails/missing').status,404);
 f.c.scenario='outage';f.at(16);assert.equal(f.feeds.respond('/board/LET/KGX').status,503);f.at(40);assert.equal(f.feeds.respond('/board/LET/KGX').status,200);
});
test('TfL timetable returns only trains for requested endpoints and passes production adapter',async()=>{
 const f=fixture();const r=f.feeds.respond('https://api.tfl.gov.uk/Journey/JourneyResults/51.98002,-0.22909/to/51.52036,-0.10514?mode=national-rail');
 const j=(await r.json()).journeys;assert.equal(j.length,2);for(const trip of j){const t=C.trainFromTflJourney(trip,C.profiles.samCommute,String);assert.ok(t);assert.equal(t.key,'LET-ZFD');assert.equal(t.svc.operator,'Thameslink');}
});
test('uncertain scenario retains competing services with indistinguishable nearby reports',()=>{
 const f=fixture({scenario:'uncertain'});f.at(32);const b=parse(f,'LET','KGX');assert.equal(b.services.length,2);assert.equal(b.services[1].dep-b.services[0].dep,2*minute);
 const a=C.parseServiceDetails(f.feeds.details(b.services[0].serviceId),f.now()),other=C.parseServiceDetails(f.feeds.details(b.services[1].serviceId),f.now());
 assert.equal(a.next.code,'FPK');assert.equal(other.next.code,'SVG');assert.equal(a.at('SVG')-other.at('SVG'),-2*minute);
});
test('local Journey Planner supports office walking and alternative London starts without rail legs',async()=>{
 const f=fixture();f.at(78);
 const office=await f.feeds.respond('https://api.tfl.gov.uk/Journey/JourneyResults/51.51420,-0.07550/to/51.5139,-0.071?journeyPreference=leasttime').json();
 const walk=office.journeys[0];assert.equal(walk.legs.length,1);assert.equal(walk.legs[0].mode.id,'walking');assert.ok(walk.duration>=5&&walk.duration<=8);assert.equal(Date.parse(walk.arrivalDateTime)-f.now(),walk.duration*minute);
 const museum=await f.feeds.respond('https://api.tfl.gov.uk/Journey/JourneyResults/Science%20Museum/to/940GZZLUKSX').json();
 const trip=museum.journeys[0];assert.deepEqual(Array.from(trip.legs,l=>l.mode.id),['walking','tube','walking']);assert.ok(trip.duration>15);assert.equal(trip.legs.reduce((n,l)=>n+l.duration,0),trip.duration);
 assert.equal(f.feeds.respond('/Journey/JourneyResults/unknown%20place/to/940GZZLUFCN').status,422);
});
test('missed connection preserves departure times and changes the vehicle still available to board',()=>{
 const normal=fixture(),missed=fixture({scenario:'missed-connection'});normal.at(64);missed.at(64);
 const url='StopPoint/940GZZLUKSX/Arrivals';assert.deepEqual(missed.feeds.tube(url),normal.feeds.tube(url));
 const original=missed.feeds.tube(url).find(a=>a.timeToStation===0);missed.at(70);
 assert.ok(!missed.feeds.tube(url).some(a=>a.vehicleId===original.vehicleId));assert.ok(missed.feeds.tube(url).some(a=>a.timeToStation===0));
});
test('return Circle destinations are valid for the line while Metropolitan services continue to Uxbridge',()=>{
 const f=fixture({direction:'return',startTime:start+420*minute});f.at(7);const departures=f.feeds.tube('StopPoint/940GZZLUALD/Arrivals');
 assert.ok(departures.some(a=>a.lineId==='circle'));for(const a of departures)assert.match(a.destinationName,a.lineId==='circle'?/Edgware Road/:/Uxbridge/);
});
