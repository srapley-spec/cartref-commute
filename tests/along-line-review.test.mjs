import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll} from './harness.mjs';
after(closeAll);
const NOW=Date.parse('2026-11-03T09:20:00Z');
async function onRail(signal=true){
 const a=await createApp({now:NOW,settings:{provider:'demo',signal,alongLine:true},saved:{dirMode:'office'}});
 const t={from:'LET',to:'KGX',std:'09:05',dep:NOW-15*60000,arr:NOW+20*60000,operator:'Great Northern',serviceId:'review-service',depLate:0,arrLate:20,depUnknown:false,arrUnknown:false,cancelled:false,platform:'2',reason:'Review significant delay',calls:[{code:'LET',name:'Letchworth',t:NOW-15*60000},{code:'KGX',name:'King’s Cross',t:NOW+20*60000}]};
 Object.assign(a.c.state,{boards:{'LET-KGX':{services:[t],msgs:[]}},boardsAt:NOW,railSource:'darwin',boardsDir:'office',here:[51.8158,-.1972],locAcc:10,locStatus:'ok',lastFixAt:NOW,lastFixRecvAt:NOW,onLine:true,atHub:null,inLondon:false,trainLock:{from:'LET',std:t.std,operator:t.operator,serviceId:t.serviceId,picked:true}});
 a.c.render();return a;
}
test('independent: Panda active train severe delay remains visible in commentary',async()=>{
 const a=await onRail(false);assert.ok(a.d.querySelector('#hero .slackst.bad'));a.d.querySelector('#alongEntry').click();

 assert.equal(a.d.querySelector('#alongImpact').hidden,false);assert.match(a.text('#alongImpact'),/late|delay/i);a.close();
});
test('independent: Back to now updates the frozen position when a story is open',async()=>{
 const a=await onRail();a.d.querySelector('#alongEntry').click();
 const marker=a.d.querySelector('#alongPosition');const initialNext=marker.nextElementSibling?.dataset.point;
 a.d.querySelector('[data-point="digswell"] details').open=true;
 Object.assign(a.c.state,{here:[51.7638,-.2156],lastFixAt:NOW});a.c.render();
 const current=a.text('#alongFeatured');assert.match(current,/Hatfield/);
 a.d.querySelector('#alongScroll').dispatchEvent(new a.w.Event('wheel'));
 a.d.querySelector('#alongNow').click();

 assert.notEqual(marker.nextElementSibling?.dataset.point,initialNext);a.close();
});
test('independent: route reference stations never invent midnight calling times',async()=>{
 const a=await onRail(false);a.d.querySelector('#alongEntry').click();
 const reference=a.text('[data-point="station-HAT"] .al-location');
 assert.equal(reference,'Station · route reference');a.close();
});
test('independent: one glance article can reveal the full story without changing global depth',async()=>{
 const a=await onRail();a.c.state.saved.alongLinePreferences={interests:['views'],depth:'glance'};a.c.render();
 a.d.querySelector('#alongEntry').click();const article=a.d.querySelector('[data-point="digswell"] details');article.open=true;
 article.querySelector('.al-more').click();a.c.render();
 assert.equal(article.dataset.full,'true');assert.equal(a.d.querySelector('#alongLine').dataset.depth,'glance');
 assert.equal(a.c.state.saved.alongLinePreferences.depth,'glance');a.close();
});
test('independent: a northbound journey reverses the strip and a corridor change resets tunnel content',async()=>{
 const a=await onRail();const state=a.c.state;state.saved.dirMode='home';const t=state.boards['LET-KGX'].services[0];
 t.from='KGX';t.to='LET';t.calls=[{code:'KGX',t:t.dep},{code:'LET',t:t.arr}];state.boards={'KGX-LET':{services:[t],msgs:[]}};state.boardsDir='home';state.trainLock.from='KGX';a.c.render();
 assert.equal(a.d.querySelector('#alongEntry').hidden,false);a.d.querySelector('#alongEntry').click();
 const stations=[...a.d.querySelectorAll('.al-station')].map(n=>n.dataset.point);
 assert.equal(stations[0],'station-KGX');assert.equal(stations.at(-1),'station-LET');
 assert.match(a.text('#alongJourney'),/towards Letchworth/);
 const old=a.d.querySelector('[data-point="digswell"] details');old.open=true;
 state.saved.dirMode='office';t.from='LET';t.to='ZFD';t.calls=[{code:'LET',t:t.dep},{code:'ZFD',t:t.arr}];state.boards={'LET-ZFD':{services:[t],msgs:[]}};state.boardsDir='office';state.trainLock.from='LET';a.c.render();
 assert.notEqual(a.d.querySelector('[data-point="digswell"] details'),old);
 assert.ok(a.d.querySelector('[data-point="canal-tunnels"]'));assert.equal(a.d.querySelector('[data-point="gasworks"]'),null);
 assert.deepEqual(a.errors,[]);a.close();
});
test('independent: Panda commentary promotes a fresh delayed Service Details report over its older on-time board',async()=>{
 const a=await onRail(false),s=a.c.state,t=s.boards['LET-KGX'].services[0];t.arrLate=0;
 const details={locationName:'Letchworth',crs:'LET',std:'09:05',atd:'09:05',subsequentCallingPoints:[{callingPoint:[{locationName:'London Kings Cross',crs:'KGX',st:'09:40',et:'10:00'}]}]};
 s.progressById={[t.serviceId]:{id:t.serviceId,at:NOW,data:a.w.CommuteCore.parseServiceDetails(details,NOW)}};
 a.c.render();assert.match(a.text('#hero .slackst.bad'),/20 min late/);a.d.querySelector('#alongEntry').click();

 assert.equal(a.d.querySelector('#alongImpact').hidden,false);assert.match(a.text('#alongImpact'),/20 min|late|delay/i);
 s.boardsAt=NOW-240000;a.c.render();
 assert.match(a.text('#alongJourney'),/expected arrival 10:00/,'a fresh validated report remains current even if its board is old');
 assert.doesNotMatch(a.text('#alongJourney'),/last known/);a.close();
});
test('independent: Panda commentary rejects stale and mismatched reports and preserves explicit current incidents',async()=>{
 for(const kind of ['stale','mismatched','no-estimate','cancelled']){
  const a=await onRail(false),s=a.c.state,t=s.boards['LET-KGX'].services[0];t.arrLate=0;
  const details={locationName:'Letchworth',crs:'LET',std:'09:05',atd:'09:05',subsequentCallingPoints:[{callingPoint:[{locationName:'London Kings Cross',crs:'KGX',st:'09:40',et:'10:00'}]}]};
  s.progressById={[t.serviceId]:{id:kind==='mismatched'?'wrong-service':t.serviceId,at:kind==='stale'?NOW-180001:NOW,data:a.w.CommuteCore.parseServiceDetails(details,NOW)}};
  if(kind==='no-estimate')t.arrUnknown=true;
  if(kind==='cancelled')t.cancelled=true;
  a.c.render();assert.equal(a.d.querySelector('.journey-progress'),null,'Panda must not draw a Signal diagram');
  // No-estimate/cancellation may stop normal inference, so browse through the retained Settings action.
  a.d.querySelector('#settingsBtn').click();a.d.querySelector('#alongBrowse').click();
  const impact=a.text('#alongImpact');
  if(kind==='stale'||kind==='mismatched')assert.doesNotMatch(impact,/20 min late/);
  if(kind==='no-estimate')assert.match(impact,/no estimate|no live arrival|unknown/i);
  if(kind==='cancelled')assert.match(impact,/cancel/i);
  assert.equal(t.arrLate,0,'view must not rewrite board timing');assert.deepEqual(a.errors,[]);a.close();
 }
});
