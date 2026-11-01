import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll} from './harness.mjs';
after(closeAll);
const NOW=Date.parse('2026-11-03T09:16:00Z');
const T=h=>Date.parse('2026-11-03T'+h+':00Z');
const raw=(end='09:41')=>({locationName:'Letchworth Garden City',crs:'LET',std:'09:05',atd:'09:05',
 subsequentCallingPoints:[{callingPoint:[{locationName:'Stevenage',crs:'SVG',st:'09:16',at:'09:16'},
 {locationName:'Finsbury Park',crs:'FPK',st:'09:34',et:'09:34'},
 {locationName:'London Kings Cross',crs:'KGX',st:'09:41',et:end}]}]});
async function rail(end='09:41'){
 const a=await createApp({now:NOW,settings:{provider:'demo',signal:true,followRoute:false},saved:{dirMode:'office'}});
 const t={from:'LET',to:'KGX',std:'09:05',dep:T('09:05'),arr:T('09:41'),operator:'Great Northern',serviceId:'progress-train',
  depLate:0,arrLate:0,depUnknown:false,arrUnknown:false,cancelled:false,platform:'2',reason:'',
  calls:[{name:'Letchworth Garden City',code:'LET',t:T('09:05')},{name:'Stevenage',code:'SVG',t:T('09:16')},
   {name:'Finsbury Park',code:'FPK',t:T('09:34')},{name:'London Kings Cross',code:'KGX',t:T('09:41')}]};
 const s=a.c.state;Object.assign(s,{boards:{'LET-KGX':{services:[t],msgs:[]}},boardsAt:NOW,railSource:'darwin',boardsDir:'office',
  here:[51.9017,-.2071],locAcc:10,locStatus:'ok',lastFixAt:NOW,lastFixRecvAt:NOW,onLine:true,atHub:null,inLondon:false,
  trainLock:{from:'LET',std:t.std,operator:t.operator,serviceId:t.serviceId,picked:true},
  progressById:{[t.serviceId]:{id:t.serviceId,at:NOW,data:a.w.CommuteCore.parseServiceDetails(raw(end),NOW)}}});
 a.c.render();return a;
}

test('Signal progress: an inferred train without Follow shows complete stages, factual calling points and no additional requests',async()=>{
 const a=await rail(),section=a.d.querySelector('#hero .journey-progress');assert.ok(section);
 assert.equal(a.c.state.saved.settings.followRoute,false);
 assert.equal(section.dataset.source,'reported');
 assert.deepEqual([...section.querySelectorAll('.jp-leg-name')].map(n=>n.textContent),['Walk','Train','Tube','Walk']);
 assert.match(section.textContent,/Stevenage/);assert.match(section.textContent,/Finsbury Park/);
 assert.equal(section.querySelectorAll('.jp-current-track[role="progressbar"]').length,1);
 assert.equal(section.querySelectorAll('.jp-stop[data-state="reported"]').length,2);
 const before=a.calls.slice();a.c.render();assert.deepEqual(a.calls,before);
 assert.equal(a.c.state.saved.followRoute??null,null);assert.deepEqual(a.errors,[]);a.close();
});

test('Signal progress: live expected arrival changes show behind and ahead against the original timetable',async()=>{
 const a=await rail('09:48');assert.match(a.text('.journey-progress .jp-status'),/7 min behind/);
 assert.equal(a.d.querySelector('.journey-progress .jp-status').classList.contains('warn'),true);
 a.c.state.progressById['progress-train'].data=a.w.CommuteCore.parseServiceDetails(raw('09:38'),NOW);a.c.render();
 assert.match(a.text('.journey-progress .jp-status'),/3 min ahead/);
 assert.match(a.text('.journey-progress'),/Timetable 09:41/);
 assert.deepEqual(a.errors,[]);a.close();
});

test('Signal progress: stale reports freeze the confirmed bar and keep report details accessible',async()=>{
 const a=await rail(),before=a.c.state.rendered.progressModel.fraction;
 const source=a.d.querySelector('.jp-source-details');assert.ok(source);source.open=true;
 a.setNow(NOW+3*60000);a.c.render();
 const model=a.c.state.rendered.progressModel;
 assert.equal(model.source,'stale');assert.equal(model.fraction,before);assert.equal(model.status.deltaMin,null);
 assert.equal(a.d.querySelector('.jp-source-details').open,true);
 assert.match(a.text('.jp-source-details'),/timetable/);
 assert.deepEqual(a.errors,[]);a.close();
});

test('Signal progress: an inferred Tube without Follow shows route stops and honest modelled progress',async()=>{
 const a=await createApp({now:NOW,settings:{provider:'demo',signal:true,followRoute:false},saved:{dirMode:'office'}}),s=a.c.state;
 Object.assign(s,{here:[51.5201,-.0973],locAcc:30,locStatus:'ok',lastFixAt:NOW,lastFixRecvAt:NOW,onLine:false,atHub:null,inLondon:false,ald:null});
 s.saved.tubeRide={hub:'KGX',from:'KGX',t:NOW-3*60000,line:'Met',vehicle:'tube-progress',rideMs:10*60000,
  stop:'Aldgate',stopGeo:[51.5142,-.0755],picked:true};
 a.c.render();
 const section=a.d.querySelector('#hero .journey-progress');assert.ok(section);
 assert.equal(section.dataset.source,'modelled');assert.match(section.textContent,/Modelled/);
 assert.equal(section.querySelectorAll('.jp-stop[data-state="reported"]').length,0);
 assert.equal(a.c.state.rendered.progressModel.status.deltaMin,null);
 assert.ok(section.querySelectorAll('.jp-stop').length>=2);
 assert.equal(a.c.state.saved.settings.followRoute,false);assert.deepEqual(a.errors,[]);a.close();
});

test('Signal progress: a location projection without a live arrival stays modelled',async()=>{
 const a=await rail(),s=a.c.state,t=s.boards['LET-KGX'].services[0];
 t.timetable=true;s.progressById={};a.c.render();
 const model=s.rendered.progressModel;assert.ok(model);
 assert.equal(model.source,'modelled');assert.equal(model.status.deltaMin,null);
 assert.match(a.text('.journey-progress'),/Modelled timing/);
 assert.doesNotMatch(a.text('.journey-progress'),/Live arrival|live expected/);
 assert.deepEqual(a.errors,[]);a.close();
});

test('Signal progress: a report for a different service cannot become confirmed progress',async()=>{
 const a=await rail();a.c.state.progressById['progress-train'].id='different-service';a.c.render();
 assert.equal(a.c.state.rendered.progressModel.source,'modelled');
 assert.equal(a.d.querySelectorAll('.jp-stop[data-state="reported"]').length,0);
 assert.equal(a.c.state.rendered.progressModel.status.deltaMin,null);
 assert.deepEqual(a.errors,[]);a.close();
});

test('Signal progress: fresh endpoint unknown delay is explicit and residual predictions cannot clear board incidents',async()=>{
 const a=await rail('Delayed'),s=a.c.state,t=s.boards['LET-KGX'].services[0];
 assert.equal(s.rendered.progressModel.status.text,'No live arrival estimate');
 assert.equal(s.rendered.activeRailDisruption.arrUnknown,true);
 t.arrUnknown=true;t.depUnknown=true;
 s.progressById[t.serviceId].data=a.w.CommuteCore.parseServiceDetails(raw('09:41'),NOW);a.c.render();
 assert.equal(s.rendered.progressModel.status.deltaMin,null);
 assert.equal(s.rendered.activeRailDisruption.arrUnknown,true);
 assert.equal(t.arrUnknown,true,'the newer display observation must not rewrite its board');
 t.arrUnknown=false;t.depUnknown=false;a.c.render();
 assert.equal(s.rendered.progressModel.status.deltaMin,0,'normal fresh-board recovery clears the incident');
 assert.equal(s.rendered.activeRailDisruption.arrUnknown,false);
 assert.deepEqual(a.errors,[]);a.close();
});

test('Signal progress: an exact fresh Tube destination prediction estimates position without manufacturing stop reports',async()=>{
 const a=await createApp({now:NOW,settings:{provider:'demo',signal:true,followRoute:false},saved:{dirMode:'office'}}),s=a.c.state;
 Object.assign(s,{here:[51.5201,-.0973],locAcc:30,locStatus:'ok',lastFixAt:NOW,lastFixRecvAt:NOW,onLine:false,atHub:null,inLondon:false});
 s.saved.tubeRide={hub:'KGX',from:'KGX',t:NOW-3*60000,line:'Met',vehicle:'tube-progress',rideMs:10*60000,
  stop:'Aldgate',stopGeo:[51.5142,-.0755],picked:true};
 const prediction={vehicle:'tube-progress',lineId:'metropolitan',stopId:'940GZZLUALD',platform:'Northbound - Platform 2',observedAt:NOW,t:T('09:22')};
 s.ald={at:NOW,arrivals:[prediction]};a.c.render();
 assert.equal(s.rendered.progressModel.source,'prediction');
 assert.match(a.text('.journey-progress'),/Live arrival; position is a time-based estimate/);
 assert.equal(a.d.querySelectorAll('.jp-stop[data-state="reported"]').length,0);
 assert.equal(a.d.querySelector('.jp-stop:last-child .jp-stop-time').textContent,'09:22');
 for(const invalid of [{vehicle:'another-vehicle'},{platform:'Eastbound - Platform 1'},{observedAt:NOW-3*60000}]){
  s.ald={at:NOW,arrivals:[{...prediction,...invalid}]};a.c.render();
  assert.equal(s.rendered.progressModel.source,'modelled');
  assert.equal(s.rendered.progressModel.status.deltaMin,null);
  assert.doesNotMatch(a.text('.journey-progress'),/Live arrival|live expected/);
 }
 assert.deepEqual(a.errors,[]);a.close();
});
