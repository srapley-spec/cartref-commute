// Independent compact Signal review: preserve real controls, warnings and saved values.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp, closeAll} from './harness.mjs';
after(closeAll);
const NOW=Date.parse('2026-11-03T07:00:00Z');
const app=()=>createApp({now:NOW,settings:{provider:'demo',followRoute:true},saved:{dirMode:'office'}});
const closed=(id,name)=>({id,name,statuses:[{sev:20,desc:'Service Closed',reason:'Overnight closure. Service will resume later.'}]});
function allClosed(a){
 const s=a.c.state;
 s.status=[closed('circle','Circle'),closed('metropolitan','Metropolitan'),closed('hammersmith-city','Hammersmith & City')];
 s.nrStatus=[{id:'great-northern',name:'Great Northern',statuses:[{sev:10,desc:'Good Service'}]}];
 s.errors=[];s.boardsAt=NOW;s.railSource='darwin';s.boardsDir='office';s.saved.settings.provider='rdm';
 for(const b of Object.values(s.boards||{}))for(const t of b.services||[]){t.cancelled=false;t.depUnknown=false;t.arrUnknown=false;t.depLate=0;t.arrLate=0;}
 a.c.render();
}

test('compact review: repeated refresh keeps planning focus and defers navigation until editing ends',async()=>{
 const a=await app(),input=a.d.querySelector('#byTime');input.value='12:34';input.focus();
 a.c.state.onLine=true;
 for(let n=0;n<3;n++){
  a.c.render();
  assert.equal(a.d.activeElement,input,'refresh keeps the same focused planning input');
  assert.equal(input.value,'12:34');assert.equal(a.c.state.presentation.pending,true,'typing must defer automatic navigation');
  assert.equal(a.c.state.presentation.view,'plan-now');
 }
 input.blur();a.c.render();assert.equal(a.c.state.presentation.view,'on-train');assert.deepEqual(a.errors,[]);a.close();
});

test('compact review: appearance changes retain the original controls handlers and input values',async()=>{
 const a=await app();
 const inputs=['#byTime','#byDate','#originInput','#destInput'].map(s=>a.d.querySelector(s));
 const pace=a.d.querySelector('[data-pace="fast"]');
 inputs[0].value='12:34';inputs[1].value='2026-11-04';inputs[2].value='AB1 2CD';inputs[3].value='Museum';
 const values=inputs.map(i=>i.value),follow=JSON.stringify(a.c.state.saved.followRoute||null);
 for(const appearance of ['dark','light','system']){
  a.c.state.saved.settings.appearance=appearance;a.c.render();
  assert.equal(a.d.documentElement.dataset.design,'signal');
  assert.equal(a.d.querySelector('[data-pace="fast"]'),pace);
  assert.deepEqual(inputs.map(n=>n.value),values);assert.equal(JSON.stringify(a.c.state.saved.followRoute||null),follow);
 }
 pace.click();assert.equal(a.c.state.saved.pace,'fast');assert.equal(pace.getAttribute('aria-pressed'),'true');
 assert.deepEqual(a.errors,[]);a.close();
});

test('compact review: expanded visible alerts defer Auto and collapsing their parent releases hidden inner alerts',async()=>{
 const a=await app();allClosed(a);
 const outer=a.d.querySelector('#signalNotices'),inner=a.d.querySelector('#banners details');assert.ok(outer&&inner,'real closure notice exists');
 outer.open=true;inner.open=true;a.c.state.onLine=true;a.c.render();
 assert.equal(a.c.state.presentation.pending,true,'an expanded alert being read defers navigation');
 assert.equal(a.c.state.presentation.view,'plan-now');
 assert.equal(a.d.querySelector('#banners details').open,true,'the detailed notice remains expanded after refresh');
 outer.open=false;a.c.render();
 assert.equal(a.c.state.presentation.pending,false,'an inner alert hidden by its parent cannot defer forever');
 assert.equal(a.c.state.presentation.view,'on-train');assert.deepEqual(a.errors,[]);a.close();
});

test('compact review: an open nested alert under a hidden or collapsed ancestor never pins Auto',async()=>{
 for(const hide of ['collapsed','hidden']){
  const a=await app();allClosed(a);
  const outer=a.d.querySelector('#signalNotices'),inner=a.d.querySelector('#banners details'),middle=a.d.createElement('details');
  middle.open=true;inner.before(middle);middle.append(inner);inner.open=true;outer.open=true;
  if(hide==='collapsed')outer.open=false;
  else{
   // A real refresh resolves every notice while its disclosure remains open.
   a.c.state.status=a.c.state.status.map(l=>({...l,statuses:[{sev:10,desc:'Good Service'}]}));
   for(const board of Object.values(a.c.state.boards))board.msgs=[];
   a.c.render();assert.equal(outer.hidden,true,'resolved alerts hide the now-empty disclosure');
  }
  a.c.state.onLine=true;a.c.render();
  assert.equal(a.c.state.presentation.pending,false,hide+' ancestor makes the nested notice unavailable for reading');
  assert.equal(a.c.state.presentation.view,'on-train');assert.deepEqual(a.errors,[]);a.close();
 }
});

test('compact review: future Arrive by and Leave around missing routes stay visible above folded alerts',async()=>{
 for(const mode of ['by','at']){
  const a=await app(),s=a.c.state,T=Date.parse('2026-11-04T08:30:00Z');
  s.saved.view=mode;s[mode]={T,boards:s.boards,failed:{'LET-KGX':true},live:false};
  a.d.querySelector('#byDate').value='2026-11-04';a.d.querySelector('#byTime').value='08:30';a.c.render();
  assert.match(a.text('#signalStatus'),/King.s Cross trains not loaded/,'the displayed future plan supplies its own failed routes');
  assert.equal(a.d.querySelector('#signalStatus').hidden,false);
  assert.ok(a.d.querySelector('#banners .bad'),'the full missing-route explanation remains reachable');
  s.boards=null;s.loading=true;a.c.render();
  assert.match(a.text('#signalStatus'),/King.s Cross trains not loaded/,'a loaded future plan keeps its failure while Leave now boards reload');
  assert.deepEqual(a.errors,[]);a.close();
 }
});

test('compact review: a closed Hammersmith and City fallback is qualified before opening any alert',async()=>{
 const a=await app();allClosed(a);
 assert.match(a.text('#signalStatus'),/check onward travel/,'a closed fallback must not be advertised as an available solution');
 assert.doesNotMatch(a.text('#signalStatus'),/^Circle and Met closed: via Aldgate East$/);
 assert.equal(a.d.querySelector('#signalNotices').open,false,'the qualification is visible without expanding alert details');
 assert.deepEqual(a.errors,[]);a.close();
});

test('compact review: a cancellation summary cannot hide the currently closed onward fallback',async()=>{
 const a=await app();allClosed(a);
 const t=Object.values(a.c.state.boards).flatMap(b=>b.services).find(t=>t.dep>=NOW);assert.ok(t);t.cancelled=true;a.c.render();
 assert.match(a.text('#signalStatus'),/cancelled/,'the worse rail problem retains priority');
 assert.match(a.text('#signalStatus'),/check onward travel/,'onward closure still qualifies the visible recommendations');
 assert.equal(a.d.querySelector('#signalNotices').open,false);assert.deepEqual(a.errors,[]);a.close();
});

test('compact review: consolidated network status keeps disruption on the fallback and surviving main line visible',async()=>{
 for(const lineId of ['hammersmith-city','metropolitan']){
  const a=await app();allClosed(a);
  for(const line of a.c.state.status){
   if(line.id===lineId)line.statuses=[{sev:6,desc:'Severe Delays',reason:'A signal failure is causing severe delays.'}];
   else if(lineId==='metropolitan'&&line.id==='hammersmith-city')line.statuses=[{sev:10,desc:'Good Service'}];
  }
  a.c.render();
  const visible=e=>{for(let p=e;p;p=p.parentElement)if(p.hidden||a.w.getComputedStyle(p).display==='none'||a.w.getComputedStyle(p).visibility==='hidden'||p!==e&&p.tagName==='DETAILS'&&!p.open)return false;return true;};
  const name=lineId==='metropolitan'?'Metropolitan':'Hammersmith & City';
  // Significant impacts now have a dedicated visible region. The single-line
  // summary and route pills need not repeat every simultaneous network problem.
  const region=a.d.querySelector('[aria-label="Significant disruption on your journey"]');assert.ok(region);
  const impact=[...region.querySelectorAll('article')].find(e=>e.querySelector('h3')?.textContent.includes(name));assert.ok(impact);
  const title=impact.querySelector('h3');assert.match(title.textContent,new RegExp(name+'.*Severe Delays'));
  assert.equal(visible(title),true,'the relevant disrupted fallback or surviving main line is visible before opening alerts');
  const cause=[...impact.querySelectorAll('p')].find(e=>e.textContent==='A signal failure is causing severe delays');assert.ok(cause);
  assert.equal(visible(cause),true,'the actual cause is also visible without opening details');
  assert.equal(a.d.querySelector('#signalNotices').open,false);assert.deepEqual(a.errors,[]);a.close();
 }
});
