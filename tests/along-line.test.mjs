import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll} from './harness.mjs';
after(closeAll);
const NOW=Date.parse('2026-11-03T09:20:00Z');
async function rail(settings={}){
 const a=await createApp({now:NOW,settings:{provider:'demo',signal:true,alongLine:true,...settings},saved:{dirMode:'office'}});
 const t={from:'LET',to:'KGX',std:'09:05',dep:NOW-15*60000,arr:NOW+20*60000,operator:'Great Northern',serviceId:'along-train',depLate:0,arrLate:0,depUnknown:false,arrUnknown:false,cancelled:false,platform:'2',reason:'',calls:[{code:'LET',name:'Letchworth',t:NOW-15*60000},{code:'KGX',name:'King’s Cross',t:NOW+20*60000}]};
 Object.assign(a.c.state,{boards:{'LET-KGX':{services:[t],msgs:[]}},boardsAt:NOW,railSource:'darwin',boardsDir:'office',here:[51.8158,-.1972],locAcc:10,locStatus:'ok',lastFixAt:NOW,lastFixRecvAt:NOW,onLine:true,atHub:null,inLondon:false,trainLock:{from:'LET',std:t.std,operator:t.operator,serviceId:t.serviceId,picked:true}});
 a.c.render();return a;
}
test('Along UI: default off and enabled on-train entry work independently of Signal and Follow',async()=>{
 const off=await rail({alongLine:false});assert.equal(off.d.querySelector('#alongEntry').hidden,true);assert.ok(!off.d.querySelector('#alongLine').open);off.close();
 for(const signal of [false,true]){
  const a=await rail({signal,followRoute:false});assert.equal(a.d.querySelector('#alongEntry').hidden,false);
  a.d.querySelector('#alongEntry').click();assert.equal(a.d.querySelector('#alongLine').open,true);
  assert.match(a.text('#alongJourney'),/Great Northern/);assert.match(a.text('#alongEvidence'),/Approximate position/);
  assert.equal(a.d.querySelector('[data-point="digswell"]').dataset.featured,'true');
  assert.equal(a.d.querySelector('#alongPosition').hidden,false);assert.match(a.text('#alongPosition'),/approximate/);
  assert.equal(a.d.querySelector('[data-point="hitchin"]').hidden,true);
  assert.equal(a.c.state.saved.settings.followRoute,false);
  assert.ok(a.d.querySelector('.al-station'));assert.ok(a.d.querySelector('a[href="https://en.wikipedia.org/wiki/Digswell_Viaduct"]'));
  const before=a.calls.slice();a.c.render();assert.deepEqual(a.calls,before);assert.deepEqual(a.errors,[]);a.close();
 }
});
test('Along UI: reading depth interests and expanded articles survive updates without losing journey state',async()=>{
 const a=await rail();a.d.querySelector('#alongEntry').click();
 const story=a.d.querySelector('[data-point="digswell"] details');story.open=true;
 const depth=a.d.querySelector('#alongDepth');depth.value='explore';depth.dispatchEvent(new a.w.Event('change',{bubbles:true}));
 const operations=a.d.querySelector('[name="alongInterest"][value="operations"]');operations.checked=true;operations.dispatchEvent(new a.w.Event('change',{bubbles:true}));
 assert.equal(a.d.querySelector('[data-point="hitchin"]').hidden,false);
 assert.equal(a.d.querySelector('#alongLine').dataset.depth,'explore');
 a.c.state.lastFixAt=NOW-120000;a.c.render();
 assert.equal(a.d.querySelector('[data-point="digswell"] details'),story);assert.equal(story.open,true);
 assert.match(a.text('#alongEvidence'),/unavailable or uncertain/);
 assert.equal(a.d.querySelector('[data-point="digswell"]').dataset.state,'browse');
 const saved=JSON.parse(a.w.localStorage.getItem('cartrefCommute.v1'));
 assert.equal(saved.alongLinePreferences.depth,'explore');assert.ok(saved.alongLinePreferences.interests.includes('operations'));
 const lock=JSON.stringify(a.c.state.trainLock);a.d.querySelector('#alongClose').click();assert.ok(!a.d.querySelector('#alongLine').open);
 assert.equal(JSON.stringify(a.c.state.trainLock),lock);assert.deepEqual(a.errors,[]);a.close();
});
test('Along UI: manual scrolling pauses follow and back to now resumes it; all stories stay available',async()=>{
 const a=await rail();a.d.querySelector('#alongEntry').click();
 a.d.querySelector('#alongScroll').dispatchEvent(new a.w.Event('wheel'));
 assert.equal(a.d.querySelector('#alongNow').hidden,false);a.c.render();assert.equal(a.d.querySelector('#alongNow').hidden,false);
 a.d.querySelector('#alongNow').click();assert.equal(a.d.querySelector('#alongNow').hidden,true);
 const show=a.d.querySelector('#alongShowAll');show.checked=true;show.dispatchEvent(new a.w.Event('change',{bubbles:true}));
 assert.equal(a.d.querySelector('[data-point="hitchin"]').hidden,false);
 assert.deepEqual(a.errors,[]);a.close();
});
test('Along UI: toggle persists without feed requests and removes the entry immediately when disabled',async()=>{
 const a=await rail({alongLine:false});a.d.querySelector('#settingsBtn').click();
 const before=a.calls.slice(),selected=JSON.stringify(a.c.state.trainLock);
 a.d.querySelector('#s_alongLine').checked=true;
 a.d.querySelector('#settingsForm').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(a.c.state.saved.settings.alongLine,true);assert.deepEqual(a.calls,before);assert.equal(JSON.stringify(a.c.state.trainLock),selected);
 assert.equal(a.d.querySelector('#alongEntry').hidden,false);a.d.querySelector('#alongEntry').click();
 a.c.state.saved.settings.alongLine=false;a.c.render();assert.ok(!a.d.querySelector('#alongLine').open);assert.equal(a.d.querySelector('#alongEntry').hidden,true);
 assert.deepEqual(a.errors,[]);a.close();
});
test('Along UI: browse is available offline from Settings but station boards never gain a landmark prompt',async()=>{
 const a=await createApp({now:NOW,geo:'denied',settings:{provider:'demo',alongLine:true,signal:true}});
 a.d.querySelector('#settingsBtn').click();assert.equal(a.d.querySelector('#alongEntry').hidden,true);
 a.d.querySelector('#alongBrowse').click();assert.equal(a.d.querySelector('#alongLine').open,true);
 assert.match(a.text('#alongJourney'),/Browse/);assert.match(a.text('#alongEvidence'),/current position unavailable/);
 assert.ok(a.d.querySelector('[data-point="digswell"]'));assert.deepEqual(a.errors,[]);a.close();
});

test('Along UI: travel disruption remains visible, stale arrival is qualified and changed journeys reset the strip',async()=>{
 const a=await rail();a.d.querySelector('#alongEntry').click();
 const story=a.d.querySelector('[data-point="digswell"] details');story.open=true;
 a.c.state.boards['LET-KGX'].services[0].cancelled=true;a.c.render();
 assert.match(a.text('#alongImpact'),/cancel/i);assert.equal(a.d.querySelector('#alongImpact').hidden,false);
 assert.match(a.text('#alongJourney'),/Browse/);
 a.c.state.boards['LET-KGX'].services[0].cancelled=false;
 a.c.state.trainLock={from:'LET',std:'09:05',operator:'Great Northern',serviceId:'along-train',picked:true};
 a.c.state.boardsAt=NOW-240000;a.c.render();
 assert.match(a.text('#alongJourney'),/last known arrival/);
 a.c.state.boards['LET-KGX'].services[0].serviceId='another-service';
 a.c.state.trainLock.serviceId='another-service';a.c.render();
 assert.notEqual(a.d.querySelector('[data-point="digswell"] details'),story);
 assert.equal(a.d.querySelector('[data-point="digswell"] details').open,false);
 assert.deepEqual(a.errors,[]);a.close();
});
