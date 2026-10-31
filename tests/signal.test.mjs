import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, closeAll } from './harness.mjs';
after(closeAll);
const NOW=Date.parse('2026-11-03T10:00:00Z');
const app=(settings={},saved={})=>createApp({now:NOW,settings:{provider:'demo',...settings},saved});
const click=(a,mode)=>a.d.querySelector(`[data-journey-view="${mode}"]`).click();

test('Signal off preserves the default design and keeps new controls hidden',async()=>{
  const a=await app();
  assert.equal(a.d.documentElement.dataset.design,'panda');
  assert.equal(a.d.querySelector('#journeyViewControl').hidden,true);
  assert.equal(a.d.querySelector('#signalStatus').hidden,true);
  assert.equal(a.d.querySelectorAll('[data-follow]').length,0);
  assert.deepEqual(a.errors,[]);a.close();
});
test('Signal preserves every journey field and request while compacting Panda content',async()=>{
  const a=await app(),b=await app({signal:true});
  for(const id of ['#list','#banners','#dirNote','#diagBody'])assert.equal(a.text(id),b.text(id),id);
  // Geometry changes, but every original text node survives: fallback timing moves
  // into its summary and the line strip moves into the full network disclosure.
  const fields=(page,selectors)=>selectors.flatMap(selector=>{
    const node=page.d.querySelector(selector);if(!node)return [];
    const walker=page.d.createTreeWalker(node,4),out=[];
    while(walker.nextNode())if(!walker.currentNode.parentElement.closest('.signal-alt-label,.signal-alt-service')){
      const text=walker.currentNode.textContent.replace(/\s+/g,' ').trim();if(text)out.push(text);
    }
    return out;
  }).sort();
  assert.deepEqual(fields(a,['#hero']),fields(b,['#hero','#signalCurrentLines']));
  assert.deepEqual(a.calls,b.calls);
  assert.equal(b.d.documentElement.dataset.design,'signal');
  assert.equal(b.d.querySelector('#journeyViewControl').hidden,false);
  assert.deepEqual(b.errors,[]);a.close();b.close();
});
test('Signal status summary follows actual engine warning precedence and handles loading',async()=>{
  const a=await app({signal:true});
  assert.match(a.text('#signalStatus'),/cancelled/);
  a.c.state.errors=['Feed key refused'];a.c.render();
  assert.equal(a.text('#signalStatus'),'Feed key refused');
  a.c.state.errors=[];a.c.state.boards=null;a.c.state.loading=true;a.c.render();
  assert.match(a.text('#signalStatus'),/Loading journey data/);
  assert.deepEqual(a.errors,[]);a.close();
});
test('manual Plan retains tracking, selection and deadline; Return to Auto uses latest situation',async()=>{
  const a=await app({signal:true,followRoute:true});
  a.c.state.onLine=true;a.c.render();
  assert.equal(a.c.state.presentation.view,'on-train');
  const selected={hub:'KGX',t:NOW+300000,line:'Circle',vehicle:'v1'};
  a.c.state.saved.tubePick=selected;
  a.d.querySelector('#byTime').value='12:34';
  click(a,'plan');
  assert.equal(a.c.state.presentation.view,'plan-now');
  assert.equal(a.c.state.onLine,true);
  assert.equal(a.c.state.saved.tubePick,selected);
  assert.equal(a.d.querySelector('#byTime').value,'12:34');
  click(a,'auto');
  assert.equal(a.c.state.presentation.view,'on-train');
  assert.equal(a.c.state.saved.viewOverride,null);
  assert.deepEqual(a.errors,[]);a.close();
});
test('manual Live with no active journey is explicit and does not invent a train',async()=>{
  const a=await app({signal:true});click(a,'live');
  assert.equal(a.c.state.presentation.noActiveJourney,true);
  assert.match(a.text('#hero'),/No active journey yet/);
  assert.equal(a.c.state.trainLock||null,null);
  assert.deepEqual(a.errors,[]);a.close();
});
test('planning override expires exactly at twenty minutes and on a reliable situation change',async()=>{
  const a=await app({signal:true});click(a,'plan');
  a.setNow(NOW+20*60000-1);a.c.render();assert.equal(a.c.state.presentation.mode,'plan');
  a.setNow(NOW+20*60000);a.c.render();assert.equal(a.c.state.presentation.mode,'auto');
  a.setNow(NOW);click(a,'plan');a.c.state.onLine=true;a.c.render();
  assert.equal(a.c.state.presentation.mode,'auto');
  assert.equal(a.c.state.presentation.view,'on-train');
  assert.deepEqual(a.errors,[]);a.close();
});
test('GPS loss does not expire a planning pin or clear a confirmed train',async()=>{
  const a=await app({signal:true});a.c.state.onLine=true;a.c.render();click(a,'plan');
  const key=a.c.state.saved.viewOverride.situationKey;
  a.c.state.locStatus='unavailable';a.c.state.onLine=false;a.c.render();
  assert.equal(a.c.state.saved.viewOverride.situationKey,key);
  assert.equal(a.c.state.presentation.mode,'plan');a.close();
});
test('automatic navigation waits while editing and then uses the newest situation',async()=>{
  const a=await app({signal:true});
  const input=a.d.querySelector('#byTime');input.focus();input.value='12:34';
  a.c.state.onLine=true;a.c.render();
  assert.equal(a.c.state.presentation.view,'plan-now');
  assert.equal(a.c.state.presentation.pending,true);
  assert.equal(a.d.activeElement,input);
  assert.equal(input.value,'12:34');
  input.blur();a.c.render();assert.equal(a.c.state.presentation.view,'on-train');
  assert.deepEqual(a.errors,[]);a.close();
});
test('expanded journey steps defer navigation and keep disclosure and focus through refresh',async()=>{
  const a=await app({signal:true});
  const detail=a.d.querySelector('#hero details.steps');detail.open=true;
  const summary=detail.querySelector('summary');summary.focus();
  a.c.state.onLine=true;a.c.render();
  assert.equal(a.c.state.presentation.pending,true);
  assert.equal(a.c.state.presentation.view,'plan-now');
  assert.equal(a.d.querySelector('#hero details.steps').open,true);
  assert.equal(a.d.activeElement.tagName,'SUMMARY');
  a.d.querySelector('#hero details.steps').open=false;a.d.activeElement.blur();a.c.render();
  assert.equal(a.c.state.presentation.view,'on-train');a.close();
});
test('appearance and design settings persist independently of journey state',async()=>{
  const a=await app({signal:true,appearance:'dark'});
  assert.equal(a.d.documentElement.dataset.theme,'dark');
  click(a,'plan');const pin=JSON.stringify(a.c.state.saved.viewOverride);
  a.c.state.saved.settings.appearance='light';a.c.render();
  assert.equal(a.d.documentElement.dataset.theme,'light');assert.equal(JSON.stringify(a.c.state.saved.viewOverride),pin);
  a.c.state.saved.settings.signal=false;a.c.state.saved.settings.followRoute=true;a.c.render();
  assert.equal(a.d.documentElement.dataset.design,'panda');assert.equal(JSON.stringify(a.c.state.saved.viewOverride),pin);
  a.c.state.saved.settings.appearance='system';a.c.render();assert.equal(a.d.documentElement.hasAttribute('data-theme'),false);
  assert.deepEqual(a.errors,[]);a.close();
});
test('corrupt view persistence is ignored without changing existing saved preferences',async()=>{
  const a=await app({signal:true},{viewOverride:{mode:'live',at:'yesterday'},pace:'fast'});
  assert.equal(a.c.state.presentation.mode,'auto');assert.equal(a.c.state.saved.pace,'fast');
  assert.deepEqual(a.errors,[]);a.close();
});

test('unchanged followed-route refresh preserves the existing disclosure and action nodes',async()=>{
  const a=await app({signal:true,followRoute:true});
  a.d.querySelector('[data-follow]:not([disabled])').click();
  const action=a.d.querySelector('[data-follow-action="stop"]'),detail=a.d.querySelector('#followPanel details');
  detail.open=true;a.c.render();
  assert.equal(a.d.querySelector('[data-follow-action="stop"]'),action);
  assert.equal(a.d.querySelector('#followPanel details'),detail);assert.equal(detail.open,true);
  assert.deepEqual(a.errors,[]);a.close();
});
