import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,hm,sleep} from './harness.mjs';
import {TRIP_SETTINGS,tripRoute,planBrightonCanterbury,until} from './trip-fixtures.mjs';
after(closeAll);

const NOW=Date.parse('2026-11-03T12:48:00Z'),MIN=60000;
const T=h=>Date.parse(`2026-11-03T${h}:00Z`);
const train=(from,to,std,arr,extra={})=>({from,to,std,dep:T(std),arr:T(arr),operator:'Great Northern',
 platform:'1',serviceId:from+to+std,depLate:0,arrLate:0,depUnknown:false,arrUnknown:false,cancelled:false,reason:'',...extra});
const shown=(a,node)=>{
 if(!node)return false;
 for(let p=node;p;p=p.parentElement){
  if(p.hidden||a.w.getComputedStyle(p).display==='none')return false;
  if(p.tagName==='DETAILS'&&!p.open&&!p.querySelector(':scope>summary')?.contains(node))return false;
 }
 return true;
};
async function fixture(direction='office'){
 const a=await createApp({now:NOW,geo:null,settings:{provider:'demo',followRoute:true},saved:{dirMode:direction}});
 const boards=direction==='office'?{
  'LET-KGX':{services:[train('LET','KGX','13:27','14:22'),train('LET','KGX','13:52','14:25'),train('LET','KGX','14:07','14:40')],msgs:[]},
  'LET-STP':{services:[],msgs:[]},'LET-ZFD':{services:[],msgs:[]}
 }:{
  'KGX-LET':{services:[train('KGX','LET','13:27','14:22'),train('KGX','LET','13:52','14:25'),train('KGX','LET','14:07','14:40')],msgs:[]},
  'STP-LET':{services:[],msgs:[]},'ZFD-LET':{services:[],msgs:[]}
 };
 Object.assign(a.c.state,{boards,railSource:'darwin',boardsAt:NOW,loading:false,errors:[],status:[],nrStatus:[]});
 a.c.render();return a;
}
function checkOption(a,node,o){
 assert.ok(shown(a,node));
 const heading=node.querySelector('.journey-heading'),panel=node.querySelector('.journey-connection');
 assert.ok(shown(a,heading));assert.ok(shown(a,panel));
 assert.equal(Number(heading.dataset.ms),o.leave);
 assert.equal(Number(heading.querySelector('[data-cd]').dataset.cd),o.leave);
 assert.equal(heading.querySelector('.optbig').textContent,hm(o.leave));
 assert.equal(heading.querySelector('div:nth-child(3)>.optbig').textContent,hm(o.arrive));
 assert.equal(panel.querySelector('[data-connection-time="scheduled"]').textContent,o.train.std);
 assert.equal(panel.querySelector('.connection-operator').textContent,o.train.operator);
 assert.match(panel.querySelector('.plat').textContent,new RegExp(o.train.platform));
 assert.ok(heading.compareDocumentPosition(panel)&a.w.Node.DOCUMENT_POSITION_FOLLOWING);
 assert.equal(node.querySelectorAll('.journey-connection').length,1);
 assert.notEqual(hm(o.leave),o.train.std,'the access clock and connection clock are different facts');
}

test('connection panels: Auto and Plan keep journey and train clocks on both recommendations and every row in all three questions and directions',async()=>{
 for(const direction of ['office','home'])for(const mode of ['auto','plan']){
  const a=await fixture(direction),s=a.c.state;
  for(const question of ['now','by','at']){
   s.saved.view=question;
   if(question==='by')s.by={T:T('16:00'),boards:s.boards,failed:{},live:true};
   if(question==='at')s.at={T:T('13:00'),boards:s.boards,failed:{},live:true};
   a.c.pinJourneyView(mode);a.c.render();
   const options=question==='by'?a.c.byOptions():question==='at'?a.c.atOptions():a.c.ranked(NOW);
   const picks=options.filter(o=>o.recommended).sort((x,y)=>x.recommended-y.recommended);
   const cards=[...a.d.querySelectorAll('#hero>.opt')];assert.equal(cards.length,2,`${direction} ${mode} ${question}: fixture offers two eligible recommendations`);
   cards.forEach((card,index)=>checkOption(a,card,picks[index]));
   for(const o of options){
    const key=[o.train.from,o.train.to,o.train.std,o.train.operator].join('|');
    const row=[...a.d.querySelectorAll('#list>.row')].find(r=>r.dataset.journeyService===key);
    checkOption(a,row,o);
   }
   assert.equal(a.d.querySelectorAll('#hero .steps[open]').length,0);
  }
  assert.deepEqual(a.errors,[]);a.close();
 }
});

test('connection panels: scheduled and expected clocks retain engine status, early running, timetable confidence and unknown platforms',async()=>{
 const a=await fixture(),t=a.c.state.boards['LET-KGX'].services[0];
 for(const delta of [3,8,16,-2]){
  t.dep=T(t.std)+delta*MIN;t.arr=T('14:22')+delta*MIN;t.depLate=Math.max(0,delta);t.arrLate=Math.max(0,delta);a.c.render();
  const row=[...a.d.querySelectorAll('#list>.row')].find(r=>r.dataset.journeyService.includes(t.std));
  const panel=row.querySelector('.journey-connection'),status=a.w.CommuteCore.departureStatus(t);
  assert.equal(panel.querySelector('[data-connection-time="scheduled"]').textContent,'13:27');
  const expected=panel.querySelector('[data-connection-time="expected"]');assert.ok(shown(a,expected));
  assert.equal(expected.textContent,hm(t.dep));assert.ok(expected.classList.contains(status.level));
 }
 Object.assign(t,{dep:T(t.std),arr:T('14:22'),depLate:0,arrLate:0,timetable:true,platform:null});a.c.render();
 let panel=a.d.querySelector('#list .journey-connection');
 assert.match(panel.textContent,/Not live/);assert.doesNotMatch(panel.textContent,/On time/);
 assert.match(panel.textContent,/Platform unannounced/);assert.equal(panel.querySelector('[data-connection-time="expected"]'),null);
 t.timetable=false;t.derived=true;a.c.render();panel=a.d.querySelector('#list .journey-connection');
 assert.match(panel.textContent,/Estimated/);assert.doesNotMatch(panel.textContent,/On time/);
 assert.deepEqual(a.errors,[]);a.close();
});

test('connection panels: cancelled and no-estimate trains remain visible without usable journey clocks',async()=>{
 const a=await fixture(),t=a.c.state.boards['LET-KGX'].services[0];
 for(const incident of ['cancelled','depUnknown','arrUnknown']){
  Object.assign(t,{cancelled:false,depUnknown:false,arrUnknown:false,[incident]:true});a.c.render();
  const row=[...a.d.querySelectorAll('#list>.row')].find(r=>r.dataset.journeyService.includes(t.std));
  assert.ok(shown(a,row));assert.equal(row.querySelector('[data-fact="leave-by"]'),null);
  assert.equal(row.querySelector('[data-cd]'),null);assert.match(row.textContent,/Unavailable/);
  assert.equal(row.querySelector('[data-connection-time="scheduled"]').textContent,t.std);
  assert.match(row.querySelector('.connection-status').textContent,/Cancelled|No estimate/);
 }
 assert.deepEqual(a.errors,[]);a.close();
});

test('connection panels: following retains the chosen service and explicit Live retains its timetable layout',async()=>{
 const a=await fixture(),chosen=a.c.ranked(NOW).find(o=>o.recommended===2);
 a.d.querySelectorAll('#hero>.opt')[1].querySelector('[data-follow]').click();
 const saved=a.c.state.saved.followRoute.id,panel=a.d.querySelector('#followPanel');
 assert.ok(shown(a,panel.querySelector('.journey-connection')));
 assert.equal(panel.querySelector('[data-connection-time="scheduled"]').textContent,chosen.train.std);
 assert.match(panel.querySelector('[data-cd]').textContent,/leave in|leave time passed/,'the deadline countdown is filled on the first Follow render');
 for(const mode of ['live','plan','auto']){
  a.d.querySelector(`[data-journey-view="${mode}"]`).click();
  assert.equal(a.c.state.saved.followRoute.id,saved);
  if(mode==='live')assert.equal(a.d.querySelector('#followPanel .journey-connection'),null);
 }
 a.d.querySelector('[data-follow-action="stop"]').click();a.d.querySelector('[data-journey-view="live"]').click();
 assert.equal(a.d.querySelector('#hero .journey-connection,#list .journey-connection'),null);
 assert.ok(a.d.querySelector('#list .row.board .exp'));
 assert.deepEqual(a.errors,[]);a.close();
});

test('connection panels: Trip exposes every train in the recorded four-ride journey without opening steps',async()=>{
 const a=await createApp({now:Date.parse('2026-11-03T10:00:00Z'),settings:TRIP_SETTINGS,route:tripRoute});
 await planBrightonCanterbury(a);
 const row=[...a.d.querySelectorAll('#tripResults .trip-row')].find(r=>/3 changes/.test(r.textContent));assert.ok(row);
 const panels=[...row.querySelectorAll('.journey-connection')];assert.ok(panels.length>=4);
 assert.ok(panels.some(p=>/Brighton/.test(p.querySelector('.connection-heading').textContent)));
 assert.equal(panels.filter(p=>p.dataset.connectionKind==='train').length,4);
 assert.equal(row.querySelector('.trip-steps').open,false);
 for(const panel of panels){assert.ok(shown(a,panel));assert.match(panel.querySelector('[data-connection-time="scheduled"]').textContent,/^\d\d:\d\d$/);assert.doesNotMatch(panel.textContent,/On time/);}
 assert.ok(shown(a,row.querySelector('[data-fact="leave-by"]')));
 row.querySelector('[data-trip-follow]').click();await until(()=>a.d.querySelector('[data-trip-stop]'));
 assert.equal(a.d.querySelectorAll('.trip-follow-connections .journey-connection').length,4,'Follow exposes the whole chosen sequence too');
 const followed=a.c.state.saved.tripMode.follow,third=followed.journey.rides[2];
 a.setNow(third.dep+MIN);a.d.querySelector('#refreshBtn').click();await sleep(700);
 const current=a.c.state.saved.tripMode.follow;
 assert.equal(current.id,followed.id);
 const phase=a.w.CommuteCore.tripPhase(current.journey,third.dep+MIN,current.confirmed);
 const remaining=current.journey.rides.slice(phase.ride).filter(r=>r.kind!=='walk');
 assert.deepEqual([...a.d.querySelectorAll('.trip-follow-connections [data-connection-time="scheduled"]')].map(e=>e.textContent),Array.from(remaining,r=>hm(r.schedDep)),'completed rides are not presented as upcoming connections');
 assert.deepEqual(a.errors,[]);a.close();
});

test('connection panels: Auto on a homeward Tube exposes the next rail connections and Live preserves its existing journey view',async()=>{
 const a=await fixture('home'),s=a.c.state;
 Object.assign(s,{here:[51.519,-.099],locAcc:10,locStatus:'ok',lastFixAt:NOW,lastFixRecvAt:NOW,onLine:false,atHub:null});
 s.saved.tubeRide={hub:'ALD',from:'ALD',t:NOW-2*MIN,line:'Circle',vehicle:'connection-home',picked:true,rideMs:10*MIN,stop:"King's Cross",stopGeo:[51.5308,-.1238]};
 a.c.render();assert.equal(s.presentation.view,'on-tube-home');
 const connections=a.d.querySelectorAll('#hero .journey-next-connection .journey-connection');assert.ok(connections.length);
 for(const panel of connections){assert.ok(shown(a,panel));assert.match(panel.querySelector('[data-connection-time="scheduled"]').textContent,/^\d\d:\d\d$/);}
 const arrival=a.text('#hero [data-block="headline"]');assert.match(arrival,/at home/);
 a.d.querySelector('[data-journey-view="live"]').click();
 assert.equal(a.d.querySelector('#hero .journey-next-connection'),null);
 assert.equal(a.text('#hero [data-block="headline"]'),arrival);
 assert.equal(s.saved.tubeRide.vehicle,'connection-home');
 assert.deepEqual(a.errors,[]);a.close();
});
