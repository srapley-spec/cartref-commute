// The leg as a strip and a full diagram (#71; docs/stories/journey-progress.md, "Strip and diagram"): which stations
// are passed, where the marker goes and whether it is reported or estimated, and which times are estimates.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {core,at,MIN} from './helpers.mjs';
const time=h=>at('2026-11-03',h);
const names=["King's Cross St Pancras",'Farringdon','Barbican','Moorgate','Liverpool Street','Aldgate'];
const tube=[{id:'tube',kind:'tube',label:'Tube',start:time('08:13'),end:time('08:22')}];
const calls=names.map((name,k)=>({code:`S${k}`,name,scheduledAt:null,expectedAt:k===5?time('08:22'):null,actualAt:null}));
const tubeAt=(now,where,extra={})=>core.journeyProgress({now,legs:tube,activeLeg:'tube',calls,
  evidence:{source:'prediction',observedAt:now,identityMatched:true,expectedAt:time('08:22'),scheduledAt:time('08:21'),where},...extra});

test("Leg strip: TfL's 'Between' text puts a reported marker halfway between the two stations; Last and Next named, your stop ringed", () => {
  const s=tubeAt(time('08:16'),"Between King's Cross St Pancras and Farringdon").strip;
  assert.deepEqual(s.marker,{at:0.5,kind:'reported'});
  assert.equal(s.last,0);assert.equal(s.next,1);assert.equal(s.yours,5);
  assert.deepEqual(s.stations.map(x=>x.state),['passed','next','upcoming','upcoming','upcoming','yours']);
  assert.equal(s.stations[5].time,time('08:22'));assert.equal(s.stations[5].timeKind,'expected');
});

test("Leg strip: 'At X' puts the marker on the station; 'Approaching Y' just short of it", () => {
  assert.equal(tubeAt(time('08:18'),'At Barbican').strip.marker.at,2);
  assert.equal(tubeAt(time('08:18'),'Approaching Moorgate').strip.marker.at,2.75);
  assert.equal(tubeAt(time('08:18'),'Approaching Moorgate').strip.marker.kind,'reported');
});

test("Leg strip: with no location text the marker is an estimate from the clock, and no station is called Last or Next", () => {
  const s=tubeAt(time('08:17'),null).strip;
  assert.equal(s.marker.kind,'estimate');
  assert.ok(Math.abs(s.marker.at-5*(4/9))<1e-9,String(s.marker.at));
  assert.equal(s.last,null);assert.equal(s.next,null);
  assert.ok(s.stations.slice(0,5).every(x=>x.state==='upcoming'));
});

test("Leg strip: times no feed gives are estimates spread evenly between the leg's start and the arrival, and labelled so", () => {
  const s=tubeAt(time('08:16'),null).strip;
  assert.deepEqual(s.stations.map(x=>x.timeKind),['estimate','estimate','estimate','estimate','estimate','expected']);
  assert.equal(s.stations[0].time,time('08:13'),'the first station is the leg start');
  assert.equal(s.stations[3].time,time('08:13')+3*(9*MIN)/5);
  assert.equal(s.stations[5].timeKind,'expected');
});

test("Leg strip: a rail leg's reported calling points keep their reported times; the gap to the next known time is estimated", () => {
  const rail=[{id:'rail',kind:'rail',label:'Train',start:time('09:00'),end:time('10:00')}];
  const c=[{code:'A',name:'A',scheduledAt:time('09:00'),actualAt:time('09:01')},{code:'B',name:'B',scheduledAt:null},
    {code:'C',name:'C',scheduledAt:time('09:40'),expectedAt:time('09:41')}];
  const now=time('09:10');
  const s=core.journeyProgress({now,legs:rail,activeLeg:'rail',calls:c,evidence:{source:'reported',observedAt:now,identityMatched:true,expectedAt:time('09:41'),scheduledAt:time('09:40')}}).strip;
  assert.equal(s.stations[0].timeKind,'reported');assert.equal(s.stations[0].time,time('09:01'));
  assert.equal(s.stations[1].timeKind,'estimate');assert.equal(s.stations[1].time,time('09:21'));
  assert.deepEqual(s.marker,{at:0.5,kind:'reported'},'past the last reported station, halfway to the next');
});

test("Leg strip: none when the train isn't confirmed, and no estimated marker or times for a cancelled train", () => {
  assert.equal(tubeAt(time('08:16'),null,{contradictedIdentity:true}).strip,null);
  const x=tubeAt(time('08:16'),null,{cancelled:true}).strip;
  assert.equal(x.marker,null);
  assert.ok(x.stations.every(st=>st.timeKind!=='estimate'));
});

test("Leg strip: an unmatched tube (modelled) still gets an estimated marker, never a reported one", () => {
  const s=tubeAt(time('08:17'),'At Barbican',{evidence:{source:'prediction',observedAt:time('08:17'),identityMatched:false,where:'At Barbican'}}).strip;
  assert.equal(s.marker.kind,'estimate');assert.equal(s.last,null);
});
