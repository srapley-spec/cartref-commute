import {test,after} from 'node:test';import assert from 'node:assert/strict';import {createApp,closeAll,sleep} from './harness.mjs';after(closeAll);
const NOW=Date.parse('2026-11-03T09:20:00Z');
test('independent access: a hidden followed journey from the other direction cannot seed the new browse scope',async()=>{
 const a=await createApp({now:NOW,geo:'denied',settings:{provider:'demo',signal:true,alongLine:true,followRoute:true},saved:{dirMode:'office'}});
 const pair=[...a.c.followChoices].find(([key,o])=>o.hub==='ZFD'&&[...a.d.querySelectorAll('[data-follow]')].some(b=>b.dataset.follow===key&&!b.disabled));assert.ok(pair,'a real loaded Farringdon option exists');
 const button=[...a.d.querySelectorAll('[data-follow]')].find(el=>el.dataset.follow===pair[0]);assert.ok(button);button.click();
 assert.equal(a.c.state.followUpdate.route.direction,'office');assert.equal(a.c.state.followUpdate.route.option.hub,'ZFD');
 a.d.querySelector('#alongEntry').click();assert.match(a.text('#alongJourney'),/Farringdon/);a.d.querySelector('#alongClose').click();
 a.c.state.saved.dirMode='home';a.c.render();
 assert.equal(a.d.querySelector('#followPanel').hidden,true,'old office journey is hidden in home mode');
 a.d.querySelector('#alongEntry').click();console.log('new direction browse heading:',a.text('#alongJourney'));
 assert.match(a.text('#alongJourney'),/^Browse King's Cross → Letchworth/);
 assert.equal(a.d.querySelector('[data-point="canal-tunnels"]'),null,'old outbound Thameslink route must not seed a new direction scope');
 assert.deepEqual(a.errors,[]);a.close();
});
test('independent access: another mode cannot reuse a hidden commute followed route',async()=>{
 const a=await createApp({now:NOW,geo:'denied',settings:{provider:'demo',signal:true,alongLine:true,followRoute:true},saved:{dirMode:'office'}});
 const pair=[...a.c.followChoices].find(([key,o])=>o.hub==='ZFD'&&[...a.d.querySelectorAll('[data-follow]')].some(b=>b.dataset.follow===key&&!b.disabled));assert.ok(pair);
 [...a.d.querySelectorAll('[data-follow]')].find(b=>b.dataset.follow===pair[0]).click();
 a.d.querySelector('#alongEntry').click();assert.match(a.text('#alongJourney'),/Farringdon/);a.d.querySelector('#alongClose').click();
 a.c.state.saved.mode='leisure';a.c.render();assert.equal(a.d.querySelector('#followPanel').hidden,true);
 a.d.querySelector('#alongEntry').click();assert.match(a.text('#alongJourney'),/^Browse Letchworth → King's Cross/);
 assert.equal(a.d.querySelector('[data-point="canal-tunnels"]'),null);assert.deepEqual(a.errors,[]);a.close();
});
test('independent access: stopped or arrived cached Follow results cannot seed a new scope',async()=>{
 for(const status of ['stopped','arrived']){
  const a=await createApp({now:NOW,geo:'denied',settings:{provider:'demo',signal:true,alongLine:true,followRoute:true},saved:{dirMode:'office'}});
  const pair=[...a.c.followChoices].find(([key,o])=>o.hub==='ZFD'&&[...a.d.querySelectorAll('[data-follow]')].some(b=>b.dataset.follow===key&&!b.disabled));assert.ok(pair);
  [...a.d.querySelectorAll('[data-follow]')].find(b=>b.dataset.follow===pair[0]).click();
  const old=JSON.parse(JSON.stringify(a.c.state.followUpdate));
  // A caller's cached result is not authority once the saved route has ended or been removed.
  if(status==='stopped')a.c.state.saved.followRoute=null;
  else{a.c.state.saved.followRoute.phase='arrived';old.route.phase='arrived';}
  a.c.state.saved.mode='leisure';a.c.render();a.c.state.saved.mode='commute';a.c.state.followUpdate=old;a.c.render();
  a.d.querySelector('#alongEntry').click();assert.match(a.text('#alongJourney'),/^Browse Letchworth → King's Cross/);
  assert.deepEqual(a.errors,[]);a.close();
 }
});
test('independent access: a source switch discards remembered route and article identity',async()=>{
 const a=await createApp({now:NOW,geo:'denied',settings:{provider:'demo',signal:true,alongLine:true,followRoute:false},saved:{dirMode:'office'}}),s=a.c.state;
 const t={from:'LET',to:'ZFD',std:'09:05',dep:NOW-15*60000,arr:NOW+20*60000,operator:'Thameslink',serviceId:'source-guard',depLate:0,arrLate:0,depUnknown:false,arrUnknown:false,cancelled:false,platform:'2',calls:[{code:'LET',t:NOW-15*60000},{code:'ZFD',t:NOW+20*60000}]};
 Object.assign(s,{boards:{'LET-ZFD':{services:[t],msgs:[]}},boardsAt:NOW,railSource:'darwin',boardsDir:'office',here:[51.8158,-.1972],locAcc:10,locStatus:'ok',lastFixAt:NOW,onLine:true,atHub:null,inLondon:false,trainLock:{from:'LET',std:t.std,operator:t.operator,serviceId:t.serviceId,picked:true}});a.c.render();
 a.d.querySelector('#alongEntry').click();assert.match(a.text('#alongJourney'),/Farringdon/);const old=a.d.querySelector('[data-point="hitchin"] details');old.open=true;a.d.querySelector('#alongClose').click();
 a.d.querySelector('#settingsBtn').click();a.d.querySelector('#s_simulatedFeeds').checked=true;a.d.querySelector('#settingsForm').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));
 a.d.querySelector('#alongEntry').click();assert.match(a.text('#alongJourney'),/^Browse Letchworth → King's Cross/);
 assert.equal(a.d.querySelector('[data-point="canal-tunnels"]'),null);assert.notEqual(a.d.querySelector('[data-point="hitchin"] details'),old);
 assert.equal(a.d.querySelector('[data-point="hitchin"] details').open,false);await a.c.refresh({force:true});await sleep(350);assert.deepEqual(a.errors,[]);a.close();
});
