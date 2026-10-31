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
