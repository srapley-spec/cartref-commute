import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp,closeAll,IN_LONDON,sleep,json} from './harness.mjs';
after(closeAll);
const NOW=Date.parse('2026-10-30T22:43:00Z'),MIN=60000;
const recorded=JSON.parse(readFileSync(new URL('./fixtures/tfl-2026-10-30T2243Z/KSX.json',import.meta.url),'utf8'));
const plain=x=>JSON.parse(JSON.stringify(x));
async function app(route){return createApp({now:NOW,geo:IN_LONDON,settings:{provider:'demo',followRoute:true,signal:true},saved:{dirMode:'home'},route});}
function chosenRide(a){
 const entry=[...a.c.followChoices].find(([,o])=>o.hub==='KGX'&&o.effort==='walk'&&o.train.dep>NOW+20*MIN);
 assert.ok(entry,'a complete homeward option exists');
 const button=[...a.d.querySelectorAll('[data-follow]:not([disabled])')].find(b=>b.dataset.follow===entry[0]);assert.ok(button);button.click();
 a.c.state.saved.tubeRide={hub:'ALD',from:'ALD',vehicle:'441',line:'Met',t:NOW-2*MIN,rideMs:14*MIN,picked:true,confirmed:true,stop:"King's Cross",stopGeo:null};
 Object.assign(a.c.state,{here:[51.5186,-.0886],lastFixAt:NOW,lastFixRecvAt:NOW,locAcc:12,locStatus:'ok',atHub:null,onLine:false,boardsAt:NOW});
 return plain(a.c.state.saved.followRoute);
}
const isTarget=u=>/940GZZLUKSX\/Arrivals/.test(u);

test('follow transport: only an enabled followed homeward Tube requests the existing target-stop feed',async()=>{
 const a=await app(u=>isTarget(u)?{ok:true,status:200,json:async()=>recorded}:undefined);
 const start=a.calls.length;await a.c.refreshFollowTransport(NOW);assert.equal(a.calls.length,start,'no selected route makes no extra request');
 const route=chosenRide(a);await a.c.refreshFollowTransport(NOW);
 assert.equal(a.calls.filter(isTarget).length,1);
 const observation=a.c.followedTubeArrival(route,NOW);
 assert.equal(observation.arrival,Date.parse('2026-10-30T22:52:41Z'));
 const allowance=a.w.CommuteCore.tubeHomeConnections(NOW-2*MIN,a.c.S(),'avg').ready.KGX;
 assert.equal(observation.readyAt,observation.arrival+allowance,'existing route profile supplies the interchange allowance');
 assert.equal(a.c.state.saved.followRoute.id,route.id,'fetching predictions does not change the chosen service');
 a.c.state.saved.settings.followRoute=false;
 const count=a.calls.length;await a.c.refreshFollowTransport(NOW);assert.equal(a.calls.length,count);assert.equal(a.c.state.followTransport,null);
 assert.deepEqual(a.errors,[]);a.close();
});

test('follow transport: stale predictions and a different vehicle never replace the route-duration fallback',async()=>{
 const a=await app(u=>isTarget(u)?{ok:true,status:200,json:async()=>recorded}:undefined),route=chosenRide(a);
 await a.c.refreshFollowTransport(NOW);assert.ok(a.c.followedTubeArrival(route,NOW));
 assert.equal(a.c.followedTubeArrival(route,NOW+3*MIN),null,'cached prediction expires at three minutes');
 a.c.state.saved.tubeRide.vehicle='other';assert.equal(a.c.followedTubeArrival(route,NOW),null);
 a.c.state.saved.tubeRide.vehicle='441';a.c.state.followTransport.predictions=[];
 assert.equal(a.c.followedTubeArrival(route,NOW),null,'missing matching prediction remains unknown');
 assert.deepEqual(a.errors,[]);a.close();
});

test('follow transport: concurrent refreshes share one request and a source switch discards its delayed body',async()=>{
 let release=null;
 const a=await app(u=>isTarget(u)?{ok:true,status:200,json:()=>new Promise(resolve=>{release=resolve;})}:undefined);
 const route=chosenRide(a),first=a.c.refreshFollowTransport(NOW),second=a.c.refreshFollowTransport(NOW);
 for(let i=0;i<20&&!release;i++)await sleep(5);
 assert.equal(a.calls.filter(isTarget).length,1,'one in-flight target request');assert.ok(release);
 a.w.dispatchEvent(new a.w.Event('pagehide'));
 release(recorded);await Promise.all([first,second]);
 assert.equal(a.c.state.followTransport,null);assert.equal(a.c.followedTubeArrival(route,NOW),null);
 assert.deepEqual(a.errors,[]);a.close();
});

test('follow transport: normal refresh fetches the chosen vehicle and applies its live rail-connection readiness',async()=>{
 let lateArrival=null;
 const a=await app(u=>isTarget(u)?{ok:true,status:200,json:async()=>lateArrival==null?recorded:
  recorded.map(row=>row.vehicleId==='441'?{...row,expectedArrival:new Date(lateArrival).toISOString()}:row)}:undefined);
 const route=chosenRide(a);
 await a.c.refresh({force:true});
 assert.equal(a.calls.filter(isTarget).length,1,'the production refresh dispatch issues the target request');
 assert.ok(a.c.state.followTransport,'production refresh stores the guarded observation');
 const live=a.c.followedTubeArrival(route,NOW);
 assert.equal(live.arrival,Date.parse('2026-10-30T22:52:41Z'));
 const allowance=a.w.CommuteCore.tubeHomeConnections(NOW-2*MIN,a.c.S(),'avg').ready.KGX;
 assert.equal(live.readyAt,Date.parse('2026-10-30T22:52:41Z')+allowance);
 assert.match(a.text('#followPanel'),/Live arrival for your Tube vehicle/);
 assert.equal(a.c.state.followUpdate.status,'on-track');
 // A real vehicle delay changes connection feasibility through the normal refresh/render path.
 // Merely retaining a cache without wiring it into the follow engine cannot satisfy this assertion.
 lateArrival=route.option.train.dep-MIN;
 await a.c.refresh({force:true});
 assert.equal(a.calls.filter(isTarget).length,2,'one vehicle request per requested refresh');
 assert.equal(a.c.state.followUpdate.status,'missed','interchange time after the live arrival misses the selected train');
 assert.equal(a.c.state.saved.followRoute.id,route.id,'a missed connection does not silently replace the selected service');
 assert.match(a.text('#followPanel'),/no longer make|missed/i);
 assert.deepEqual(a.errors,[]);a.close();
});

test('follow transport: normal arrival parsing rejects a vehicle with neither expected time nor countdown',async()=>{
 const malformed={vehicleId:'441',lineId:'metropolitan',platformName:'Westbound - Platform 1',naptanId:'940GZZLUKSX',
  timestamp:new Date(NOW).toISOString(),destinationName:'Uxbridge Underground Station'};
 const a=await app(u=>isTarget(u)?{ok:true,status:200,json:async()=>[malformed]}:undefined),route=chosenRide(a);
 await a.c.refresh({force:true});
 assert.equal(a.calls.filter(isTarget).length,1);
 assert.equal(a.c.state.followTransport.predictions.length,0,'the real adapter cannot invent a zero-minute arrival');
 assert.equal(a.c.followedTubeArrival(route,NOW),null);
 assert.match(a.text('#followPanel'),/Estimated Tube ride to your rail connection/);
 assert.doesNotMatch(a.text('#followPanel'),/Live arrival for your Tube vehicle/);
 assert.deepEqual(a.errors,[]);a.close();
});

test('independent review: real Tube adapter retains explicit station and provider-age evidence',async()=>{
 for(const invalid of [{naptanId:'940GZZLUMGT'},{timestamp:new Date(NOW-3*MIN).toISOString()}]){
  const prediction={vehicleId:'review-tube',lineId:'metropolitan',platformName:'Westbound - Platform 1',naptanId:'940GZZLUKSX',
   timestamp:new Date(NOW).toISOString(),expectedArrival:new Date(NOW+5*MIN).toISOString(),destinationName:'Uxbridge Underground Station'};
  const a=await createApp({now:NOW,geo:IN_LONDON,settings:{provider:'demo',signal:true,followRoute:true},saved:{dirMode:'home'},
   route:u=>/940GZZLUKSX\/Arrivals/.test(u)?json([prediction]):undefined});
  const entry=[...a.c.followChoices].find(([,o])=>o.hub==='KGX'&&o.effort==='walk'&&o.train.dep>NOW+20*MIN);assert.ok(entry);
  const button=[...a.d.querySelectorAll('[data-follow]:not([disabled])')].find(b=>b.dataset.follow===entry[0]);assert.ok(button);button.click();
  const r=JSON.parse(JSON.stringify(a.c.state.saved.followRoute));
  a.c.state.saved.tubeRide={hub:'ALD',from:'ALD',vehicle:'review-tube',line:'Met',t:NOW-2*MIN,rideMs:14*MIN,picked:true,confirmed:true,stop:"King's Cross",stopGeo:null};
  Object.assign(a.c.state,{here:[51.5186,-.0886],lastFixAt:NOW,lastFixRecvAt:NOW,locAcc:12,locStatus:'ok',atHub:null,onLine:false,boardsAt:NOW});
  await a.c.refreshFollowTransport(NOW);
  assert.ok(a.c.followedTubeArrival(r,NOW),'the exact vehicle and station fixture supplies a live positive control');
  Object.assign(prediction,invalid);await a.c.refreshFollowTransport(NOW);
  assert.ok(a.calls.some(u=>/940GZZLUKSX\/Arrivals/.test(u)),'actual guarded network adapter was exercised');
  assert.equal(a.c.followedTubeArrival(r,NOW),null,'wrong-station or old-provider response cannot become a live connection');
  a.c.render();assert.match(a.text('#followPanel'),/Estimated Tube ride to your rail connection/);
  assert.doesNotMatch(a.text('#followPanel'),/Live arrival for your Tube vehicle/);assert.deepEqual(a.errors,[]);a.close();
 }
});
