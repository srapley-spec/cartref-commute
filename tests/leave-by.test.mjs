import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,hm} from './harness.mjs';
after(closeAll);

const NOW=Date.parse('2026-11-03T12:48:00Z'),MIN=60000;
const time=h=>Date.parse(`2026-11-03T${h}:00Z`);
const HERE=[51.969,-.22909],HOME=[51.96,-.22909];
const train=(std,arr,extra={})=>({from:'LET',to:'KGX',std,dep:time(std),arr:time(arr),
 operator:'Great Northern',serviceId:std,platform:'1',depLate:0,arrLate:0,
 cancelled:false,depUnknown:false,arrUnknown:false,reason:'',...extra});
async function fixture({appearance='light',home=HOME}={}){
 const a=await createApp({now:NOW,geo:{coords:{latitude:HERE[0],longitude:HERE[1],accuracy:4}},
  settings:{provider:'demo',appearance,walkHomeStationFast:1800,walkHomeStationAvg:2200,followRoute:true},
  saved:{dirMode:'office',pace:'fast',home}});
 Object.assign(a.c.state,{boards:{'LET-KGX':{services:[train('13:27','14:22'),train('13:52','14:39'),train('14:27','15:22')],msgs:[]},
  'LET-STP':{services:[],msgs:[]},'LET-ZFD':{services:[],msgs:[]}},railSource:'darwin',boardsAt:NOW,
  errors:[],loading:false,status:[],nrStatus:[]});
 a.c.render();return a;
}
function visible(a,node){
 if(!node)return false;
 for(let p=node;p;p=p.parentElement){
  if(p.hidden||a.w.getComputedStyle(p).display==='none'||a.w.getComputedStyle(p).visibility==='hidden')return false;
  if(p.tagName==='DETAILS'&&!p.open&&!p.querySelector(':scope>summary')?.contains(node))return false;
 }
 return true;
}
const pin=(a,mode)=>a.d.querySelector(`[data-journey-view="${mode}"]`).click();
const row=(a,std)=>[...a.d.querySelectorAll('#list .row')].find(r=>r.querySelector('[data-connection-time="scheduled"]')?.textContent===std||r.querySelector('.leave .t')?.textContent===std);
function deadline(a,container,option){
 const node=container?.querySelector('[data-fact="leave-by"]');
 assert.ok(visible(a,node),'Leave by must be visible without opening Journey steps or Next best');
 assert.equal(Number(node.dataset.ms),option.leave,'use this option’s canonical access deadline');
 assert.equal(node.querySelector('.t').textContent,hm(option.leave));
 assert.match(node.textContent,/Leave by/);
 assert.notEqual(hm(option.leave),option.train.std,'the fixture distinguishes leaving here from train departure');
 assert.equal(Number(node.querySelector('[data-cd]').dataset.cd),option.leave);
 return node;
}

test('Leave by: Auto near Letchworth exposes the deadline on the primary answer, Next best and every planning row',async()=>{
 const a=await fixture();assert.ok(a.c.onWay());
 const options=a.c.ranked(NOW),best=options.find(o=>o.recommended===1),next=options.find(o=>o.recommended===2);
 assert.equal(best.train.std,'13:27');assert.equal(hm(best.leave),'13:07');
 deadline(a,a.d.querySelector('#hero>.opt'),best);
 deadline(a,a.d.querySelector('#hero .signal-alternative'),next);
 for(const option of options)deadline(a,row(a,option.train.std),option);
 assert.equal(a.d.querySelector('#hero .steps').open,false);
 assert.equal(a.d.querySelector('#hero .signal-alternative').tagName,'SECTION');
 assert.deepEqual(a.errors,[]);a.close();
});

test('Leave by: pinning Plan and refreshing cannot turn a planning answer into only a departure board',async()=>{
 const a=await fixture({appearance:'dark'});pin(a,'plan');a.c.render();
 const best=a.c.ranked(NOW).find(o=>o.recommended===1);
 deadline(a,a.d.querySelector('#hero>.opt'),best);
 a.d.querySelector('#hero .signal-alternative .steps').open=true;
 a.c.render();assert.equal(a.d.querySelector('#hero .signal-alternative .steps').open,true);
 deadline(a,a.d.querySelector('#hero .signal-alternative'),a.c.ranked(NOW).find(o=>o.recommended===2));
 assert.deepEqual(a.errors,[]);a.close();
});

test('Leave by: a passed access deadline stays distinct from a train that has not departed',async()=>{
 const a=await fixture(),later=time('13:20');a.setNow(later);a.c.state.boardsAt=later;a.c.render();
 const options=a.c.ranked(later),old=options.find(o=>o.train.std==='13:27'),best=options.find(o=>o.recommended===1);
 assert.equal(old.effort,'none');assert.equal(best.train.std,'13:52');
 const passed=deadline(a,row(a,'13:27'),old);
 assert.equal(passed.querySelector('[data-cd]').textContent,'leave time passed');
 assert.match(row(a,'13:27').querySelector('[data-dep]').textContent,/train departs in/);
 deadline(a,a.d.querySelector('#hero>.opt'),best);
 assert.deepEqual(a.errors,[]);a.close();
});

test('Leave by: delayed trains use the updated canonical deadline without changing the timetable identity',async()=>{
 const a=await fixture(),service=a.c.state.boards['LET-KGX'].services[0];
 service.dep+=5*MIN;service.arr+=5*MIN;service.depLate=5;service.arrLate=5;a.c.render();
 const best=a.c.ranked(NOW).find(o=>o.recommended===1);
 assert.equal(best.train.std,'13:27');assert.equal(hm(best.leave),'13:12');
 deadline(a,a.d.querySelector('#hero>.opt'),best);
 assert.match(a.text('#hero .journey-connection'),/13:27.*13:32/);
 assert.deepEqual(a.errors,[]);a.close();
});

test('Leave by: cancelled and unknown departure services cannot advertise a usable access deadline',async()=>{
 const a=await fixture(),services=a.c.state.boards['LET-KGX'].services;
 services.push(train('13:10','14:00',{cancelled:true}),train('13:15','14:05',{depUnknown:true}));a.c.render();
 for(const std of ['13:10','13:15']){
  const unavailable=row(a,std);assert.ok(unavailable,'unusable trains remain listed');
  assert.equal(unavailable.querySelector('[data-fact="leave-by"]'),null);
 }
 assert.deepEqual(a.errors,[]);a.close();
});

test('Leave by: home, Arrive by and Leave around retain their visible canonical leave clock',async()=>{
 const a=await fixture({home:HERE}),s=a.c.state;
 for(const view of ['now','by','at']){
  s.saved.view=view;
  if(view==='by')s.by={T:time('16:00'),boards:s.boards,failed:{},live:true};
  if(view==='at')s.at={T:time('13:20'),boards:s.boards,failed:{},live:true};
  a.c.render();
  const options=view==='by'?a.c.byOptions():view==='at'?a.c.atOptions():a.c.ranked(NOW);
  const best=options.find(o=>o.recommended===1),clock=a.d.querySelector('#hero>.opt .optrow>div:first-child');
  assert.ok(best);assert.ok(visible(a,clock));assert.match(clock.textContent,/Leave/);
  assert.equal(clock.querySelector('.t').textContent,hm(best.leave));
  assert.equal(a.d.querySelector('#hero>.opt .optrow').classList.contains('board'),false);
 }
 assert.deepEqual(a.errors,[]);a.close();
});

test('Leave by: reaching the station retains the train panel and choosing Live retains departure-first timetable behavior',async()=>{
 const a=await fixture();Object.assign(a.c.state,{here:[51.98002,-.22909],locAcc:4});a.c.render();
 assert.equal(a.c.onWay(),null);assert.equal(a.c.atHome(),false);
 assert.match(a.text('#hero>.opt .journey-connection'),/Train from Letchworth.*13:27.*On time/);
 deadline(a,a.d.querySelector('#hero>.opt'),a.c.ranked(NOW).find(o=>o.recommended===1));
 assert.ok(a.d.querySelector('#hero [data-dep]'));
 pin(a,'live');assert.equal(a.d.querySelector('[data-fact="leave-by"]'),null);
 assert.equal(a.c.state.presentation.mode,'live');assert.match(a.text('#hero'),/departures/);
 assert.deepEqual(a.errors,[]);a.close();
});

test('Leave by: following a route keeps the current access deadline exposed before boarding',async()=>{
 const a=await fixture(),best=a.c.ranked(NOW).find(o=>o.recommended===1);
 a.d.querySelector('#hero>.opt [data-follow]').click();
 assert.equal(a.d.querySelector('#followPanel').hidden,false);
 deadline(a,a.d.querySelector('#followPanel'),best);
 pin(a,'plan');deadline(a,a.d.querySelector('#hero>.opt'),a.c.ranked(NOW).find(o=>o.recommended===1));
 assert.deepEqual(a.errors,[]);a.close();
});

test('Leave by: a running alternative qualifies its passed walking deadline instead of inventing a new leave time',async()=>{
 const a=await fixture(),base=a.c.ranked(NOW)[0];
 const need=a.w.CommuteCore.effortNeeds(base.access,a.c.effortProfile());
 const dep=NOW+30000+(need.fast+need.run)/2,std=hm(dep);
 a.c.state.boards['LET-KGX'].services.push(train(std,'13:40',{dep}));a.c.render();
 const option=a.c.ranked(NOW).find(o=>o.train.std===std);assert.equal(option.effort,'run');
 const node=deadline(a,row(a,std),option);assert.match(node.textContent,/at walking pace/);
 assert.equal(node.querySelector('[data-cd]').textContent,'leave time passed');
 assert.match(row(a,std).textContent,/run/);
 assert.deepEqual(a.errors,[]);a.close();
});
