// The release gate executes every registered design/surface pair. These fixtures
// reach real controller views; they never substitute markup or force a view result.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll} from './harness.mjs';
import {loadParityRegistry,parityTestName} from '../tools/check-ui-parity.mjs';
after(closeAll);

const NOW=Date.parse('2026-11-03T10:00:00Z'),MIN=60000;
const registry=loadParityRegistry();
const norm=value=>String(value||'').replace(/\s+/g,' ').trim();
function visible(a,node){
 if(!node)return false;
 for(let parent=node;parent;parent=parent.parentElement){
  const style=a.w.getComputedStyle(parent);
  if(parent.hidden||style.display==='none'||style.visibility==='hidden')return false;
  if(parent!==node&&parent.tagName==='DETAILS'&&!parent.open&&parent.querySelector('summary')?.contains(node)!==true)return false;
 }
 return true;
}
const shown=(a,selector)=>[...a.d.querySelectorAll(selector)].filter(node=>visible(a,node));
const serviceKey=t=>[t.from,t.to,t.std,t.operator].join('|');
function assertHealthy(a,design,surface){
 assert.equal(a.d.documentElement.dataset.design,design.id);
 assert.equal(a.c.state.presentation.view,surface.view,'the real presentation model reaches the registered surface');
 const answer=a.d.querySelector(surface.id==='following'?'#followPanel':'#hero');
 assert.ok(visible(a,answer),'the active answer is exposed');
 assert.ok(visible(a,a.d.querySelector('#settingsBtn')),'settings stay reachable');
 assert.ok(visible(a,a.d.querySelector('#journeyViewControl')),'Auto, Plan and Live are available in every supported design');
 for(const mode of ['auto','plan','live'])assert.ok(shown(a,`[data-journey-view="${mode}"]`).length,mode+' remains reachable');
 for(const row of shown(a,'#list .row[data-journey-service]')){
  const flags=[...row.querySelectorAll('.pill')].filter(node=>visible(a,node)).map(node=>norm(node.textContent));
  if(flags.some(text=>/Cancelled|no estimate/i.test(text))){
   assert.ok(!flags.some(text=>/^Arrives first\b/.test(text)),'an unusable service cannot become arrival-first');
   assert.equal(row.querySelector('[data-fact][data-ms]'),null,'an unusable service does not advertise an invented current duration');
  }
 }
 assert.deepEqual(a.errors,[]);
}
function assertDuration(a,container,option,context={}){
 const expected=a.w.CommuteCore.journeyFacts(option,context);
 for(const [fact,ms] of [['train-duration',expected.trainDurationMs],['total-duration',expected.totalDurationMs]]){
  const nodes=[...container.querySelectorAll(`[data-fact="${fact}"]`)].filter(node=>visible(a,node));
  if(ms==null){
   for(const node of nodes)assert.equal(node.hasAttribute('data-ms'),false,`${fact}: unavailable time is not made up`);
  }else{
   assert.ok(nodes.length,`${fact}: the canonical value is visible, not just present inside a disclosure`);
   assert.ok(nodes.some(node=>Number(node.dataset.ms)===ms&&norm(node.textContent).includes(a.w.CommuteCore.dur(ms))),`${fact}: visible wording and value use the canonical itinerary`);
  }
 }
}
function canonicalRows(a,options){
 let checked=0;
 for(const container of shown(a,'#hero .opt,#list .row[data-journey-service]')){
  const key=container.dataset.journeyService;
  const option=options.flatMap(o=>[o,...(o.alts||[])]).find(o=>serviceKey(o.train)===key);
  if(!option)continue;
  assertDuration(a,container,option);checked++;
  const first=(option.flags||[]).find(flag=>/^Arrives first\b/.test(flag.txt));
  if(first)assert.ok(shown(a,'.pill').some(node=>container.contains(node)&&norm(node.textContent)===first.txt),'the same canonical arrival-first qualification remains visible');
 }
 assert.ok(checked,'at least one actual visible journey is checked against the engine');
}
function locate(s,here,extra={}){
 Object.assign(s,{here,locStatus:'ok',locAcc:12,lastFixAt:NOW,lastFixRecvAt:NOW,onLine:false,atHub:null,inLondon:false,...extra});
 s.saved.view='now';s.saved.viewOverride=null;s.saved.tubeRide=null;s.saved.tubePick=null;
}
async function open(design,surface){
 const waiting=surface.id==='awaiting-location';
 return createApp({now:NOW,geo:waiting?'denied':undefined,
  settings:{provider:'demo',followRoute:true,...design.settings},saved:{dirMode:waiting?'auto':'office'}});
}
const factories={
 'awaiting-location':async a=>{
  a.c.render();
  assert.match(a.text('#hero'),/Location needed|Finding your location/);
  assert.equal(shown(a,'[data-fact][data-ms]').length,0,'unknown direction cannot invent journey durations');
  assert.equal(shown(a,'[data-follow]').length,0);
 },
 'plan-now':async a=>{
  a.c.render();const options=a.c.ranked(NOW);
  canonicalRows(a,options);
  assert.ok(shown(a,'#hero .opt').length,'the primary recommendation remains visible');
  assert.ok(shown(a,'#list .row').length>=options.length,'the complete train list is retained');
  assert.ok(shown(a,'[data-follow]:not([disabled])').length,'journeys can be followed');
 },
 'plan-by':async a=>{
  const s=a.c.state,T=NOW+90*MIN;s.saved.view='by';
  a.d.querySelector('#byDate').value='2026-11-03';a.d.querySelector('#byTime').value='11:30';
  s.by={T,boards:s.boards,failed:{},live:true};a.c.render();
  canonicalRows(a,a.c.byOptions());
  assert.match(a.text('#hero'),/To arrive by 11:30/);
  assert.equal(a.d.querySelector('#byTime').value,'11:30');
 },
 'plan-at':async a=>{
  const s=a.c.state,T=NOW+40*MIN;s.saved.view='at';
  a.d.querySelector('#byDate').value='2026-11-03';a.d.querySelector('#byTime').value='10:40';
  s.at={T,boards:s.boards,failed:{},live:true};a.c.render();
  canonicalRows(a,a.c.atOptions());
  assert.match(a.text('#hero'),/Leaving around 10:40/);
  assert.equal(a.d.querySelector('#byTime').value,'10:40');
 },
 'following':async a=>{
  const button=shown(a,'#hero [data-follow]:not([disabled])')[0];assert.ok(button);button.click();
  const route=a.c.state.followUpdate.route,panel=a.d.querySelector('#followPanel');
  assert.ok(visible(a,panel));assert.match(norm(panel.textContent),/Following your route/);
  assertDuration(a,panel,route.option,{train:route.lastTrain,arrival:route.expectedArrival});
  assert.ok(shown(a,'[data-follow-action="stop"]').length,'the chosen route can be stopped');
  assert.equal(a.c.state.saved.followRoute.id,route.id);
 },
 'on-train':async a=>{
  const s=a.c.state,t=s.boards['LET-KGX'].services.find(t=>!t.cancelled&&!t.depUnknown&&t.arr!=null);
  const now=t.dep+MIN;a.setNow(now);
  Object.assign(s,{here:[51.956,-.26],locAcc:12,locStatus:'ok',lastFixAt:now,lastFixRecvAt:now,onLine:true,atHub:null,boardsAt:now,
   trainLock:{operator:t.operator,std:t.std,from:t.from,picked:true,...(t.serviceId?{serviceId:t.serviceId}:{})}});
  a.c.render();
  assert.match(a.text('#hero'),new RegExp(t.std));
  assert.ok(shown(a,'#hero [data-block="headline"]').length,'the current arrival is visible');
  const context=s.rendered.progress;assert.ok(context?.option,'the real train has an existing itinerary');
  assertDuration(a,a.d.querySelector('#hero'),context.option,{train:t,arrival:context.option.arrive+(context.expectedArrival-t.arr)});
 },
 'at-hub':async a=>{
  const s=a.c.state;locate(s,[51.5308,-.1238],{atHub:'KGX',hubSince:{hub:'KGX',at:NOW-8*MIN}});
  s.tube={hub:'KGX',at:NOW,arrivals:[{t:NOW+2*MIN,line:'Circle',lineId:'circle',platform:'Eastbound - Platform 2',dest:'Aldgate',vehicle:'parity-circle'}]};
  a.c.render();
  assert.match(a.text('#hero'),/Get on|You're getting/);assert.match(a.text('#hero'),/Circle/);
  assert.ok(shown(a,'#hero [data-tubepick]').length,'the live Tube can be selected');
  assert.ok(shown(a,'#hero [data-block="headline"]').length);
  assert.match(a.text('#hero'),/office/);
 },
 'on-tube':async a=>{
  const s=a.c.state;locate(s,[51.5201,-.0973]);
  s.saved.tubeRide={hub:'KGX',from:'KGX',t:NOW-2*MIN,line:'Met',vehicle:'parity-met',picked:true,rideMs:10*MIN,stop:'Aldgate',stopGeo:[51.5142,-.0755]};
  a.c.render();assert.match(a.text('#hero'),/You're on.*Met/);assert.match(a.text('#hero'),/Aldgate/);
  assert.ok(shown(a,'#hero [data-block="headline"]').length);
  assert.equal(s.saved.tubeRide.vehicle,'parity-met','drawing keeps the selected vehicle');
 },
 'in-london':async a=>{
  const s=a.c.state;locate(s,[51.5139,-.071]);a.c.render();
  assert.match(a.text('#hero'),/arrived|Walking to the office/);
  assert.ok(shown(a,'#hero [data-block="headline"]').length);
  assert.equal(s.trainLock||null,null,'arriving does not invent a train');
 },
 'on-tube-home':async a=>{
  const s=a.c.state;s.saved.dirMode='home';locate(s,[51.519,-.099]);
  s.saved.tubeRide={hub:'ALD',from:'ALD',t:NOW-2*MIN,line:'Circle',vehicle:'parity-home',picked:true,rideMs:10*MIN,stop:"King's Cross",stopGeo:[51.5308,-.1238]};
  a.c.render();assert.match(a.text('#hero'),/Get off at/);assert.match(a.text('#hero'),/home/);
  assert.ok(shown(a,'#hero [data-block="headline"]').length);
  assert.ok(shown(a,'#list .row').length,'onward trains stay available');
  assert.equal(s.saved.tubeRide.vehicle,'parity-home');
 },
 'nearly-home':async a=>{
  const s=a.c.state;s.saved.dirMode='home';locate(s,[51.9799,-.229]);a.c.render();
  assert.match(a.text('#hero'),/Nearly home/);assert.match(a.text('#hero'),/walk|home/);
  assert.ok(shown(a,'#hero [data-block="headline"]').length);
  assert.equal(s.trainLock||null,null,'the walk home does not invent rail identity');
 },
 'live-departures':async a=>{
  a.d.querySelector('[data-journey-view="live"]').click();
  assert.equal(a.c.state.presentation.noActiveJourney,true);
  assert.match(a.text('#hero'),/Live.*departures from Letchworth/);
  const help=a.d.querySelector('.live-note');assert.ok(visible(a,help),'short departure-board help stays exposed');
  assert.ok(norm(help.textContent).split(/\s+/).length<=10,'departure-board help is glanceable');
  assert.match(norm(help.textContent),/Auto.*leave/i,'the short help still explains how to get leave-time advice');
  const options=a.c.ranked(NOW);canonicalRows(a,options);
  assert.ok(shown(a,'#list .live-board .row.board').length,'every live departure is in the exposed board');
  assert.equal(a.c.state.trainLock||null,null,'opening Live never invents a journey');
 }
};

assert.deepEqual(new Set(registry.surfaces.map(surface=>surface.id)),new Set(Object.keys(factories)),
 'Every registered surface needs a real scenario factory, including newly added views');
for(const design of registry.designs)for(const surface of registry.surfaces){
 test(parityTestName(design.id,surface.id),async()=>{
  const a=await open(design,surface);
  try{await factories[surface.id](a);assertHealthy(a,design,surface);}
  finally{a.close();}
 });
}
