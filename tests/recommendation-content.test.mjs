import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,hm} from './harness.mjs';
after(closeAll);

const MIN=60000,NOW=Date.parse('2026-11-03T13:59:00Z');
const time=h=>Date.parse(`2026-11-04T${h}:00Z`);
const train=(to,std,arr,operator,id)=>({from:'LET',to,std,dep:time(std),arr:time(arr),operator,
 serviceId:id,platform:'',timetable:true,depLate:0,arrLate:0,cancelled:false,depUnknown:false,arrUnknown:false,reason:''});
const visible=(a,node)=>{
 if(!node)return false;
 for(let p=node;p;p=p.parentElement){
  if(p.hidden||a.w.getComputedStyle(p).display==='none'||a.w.getComputedStyle(p).visibility==='hidden')return false;
  if(p.tagName==='DETAILS'&&!p.open&&!p.querySelector(':scope>summary')?.contains(node))return false;
 }
 return true;
};
async function tomorrow(){
 const a=await createApp({now:NOW,settings:{provider:'demo',followRoute:true},saved:{dirMode:'office',pace:'fast',view:'by'}});
 const boards={'LET-KGX':{services:[train('KGX','07:30','08:03','Great Northern','gn0730')],msgs:[]},
  'LET-STP':{services:[train('STP','07:20','07:59','Thameslink','tl0720')],msgs:[]},
  'LET-ZFD':{services:[train('ZFD','07:20','08:04','Thameslink','tl0720')],msgs:[]}};
 a.c.state.by={T:time('08:30'),boards,failed:{},live:false};
 a.d.querySelector('#byDate').value='2026-11-04';a.d.querySelector('#byTime').value='08:30';
 a.c.render();return a;
}
function fullOption(a,node,option){
 assert.ok(node,'the recommended option exists');
 for(const selector of ['.optrow','.journey-facts','.optroute','.journey-service','.journey-countdown','.steps>summary','[data-follow]'])
  assert.ok(visible(a,node.querySelector(selector)),`${option.train.std}: ${selector} is exposed on the card`);
 assert.equal(node.closest('details'),null,'a complete recommendation is not inside an option-level disclosure');
 const times=node.querySelector('.optrow');
 assert.equal(times.querySelector('div:first-child .t').textContent,hm(option.leave));
 assert.equal(times.querySelector('div:nth-child(3) .t').textContent,hm(option.arrive));
 assert.equal(Number(node.querySelector('[data-fact="total-duration"]').dataset.ms),option.arrive-option.leave);
 assert.equal(Number(node.querySelector('[data-fact="train-duration"]').dataset.ms),option.train.arr-option.train.dep);
 assert.equal(Number(node.querySelector('[data-cd]').dataset.cd),option.leave);
 assert.match(node.querySelector('.journey-service').textContent,new RegExp(option.train.std+' '+option.train.operator));
 assert.equal(node.querySelectorAll('.journey-facts').length,1,'facts are not copied into a separate summary');
 for(const flag of option.flags){
  if(flag.network)continue;
  const pill=[...node.querySelectorAll('.pill')].find(p=>p.textContent===flag.txt);
  assert.ok(visible(a,pill),`${option.train.std}: its own ${flag.txt} remains exposed`);
 }
}

test('recommendations: Arrive by tomorrow exposes the same fields and actions on the earlier train',async()=>{
 const a=await tomorrow(),options=a.c.byOptions(),picks=options.filter(o=>o.recommended).sort((x,y)=>x.recommended-y.recommended);
 assert.equal(picks.length,2);assert.equal(picks[0].train.std,'07:30');assert.equal(picks[1].train.std,'07:20');
 assert.ok(picks[1].leave<picks[0].leave);assert.ok(picks[1].arrive<picks[0].arrive,'the earlier train has more arrival margin');
 const cards=[...a.d.querySelectorAll('#hero .opt')];assert.equal(cards.length,2);
 cards.forEach((card,index)=>fullOption(a,card,picks[index]));
 const sizes=cards.map(card=>[...card.querySelectorAll('.optrow .optbig')].map(node=>a.w.getComputedStyle(node).fontSize));
 assert.deepEqual(sizes[1],sizes[0],'both cards use the same time sizes');
 assert.match(cards[1].querySelector('.optroute').textContent,/Farringdon or St Pancras/);
 assert.match(cards[1].querySelector('.journey-countdown').textContent,/min early/);
 assert.doesNotMatch(cards[1].textContent,/Latest for/,'the earlier option cannot borrow the latest train’s rank');
 assert.equal(a.d.querySelector('#hero details.signal-alternative'),null);
 assert.deepEqual(a.errors,[]);a.close();
});

test('recommendations: the second card keeps its steps and Follow action through refresh',async()=>{
 const a=await tomorrow(),second=a.c.byOptions().find(o=>o.recommended===2);
 let card=a.d.querySelectorAll('#hero .opt')[1];
 assert.ok(visible(a,card.querySelector('.steps>summary')));card.querySelector('.steps').open=true;
 a.c.render();card=a.d.querySelectorAll('#hero .opt')[1];
 assert.equal(card.querySelector('.steps').open,true);assert.ok(visible(a,card.querySelector('.legs')));
 fullOption(a,card,second);
 card.querySelector('[data-follow]').click();
 const chosen=a.c.state.saved.followRoute;
 assert.equal(chosen.option.train.serviceId,second.train.serviceId);
 assert.equal(chosen.option.train.from,second.train.from);
 assert.equal(chosen.option.train.std,'07:20');
 assert.equal(chosen.option.leave,second.leave);
 assert.deepEqual(a.errors,[]);a.close();
});

test('recommendations: Auto and Plan expose complete alternatives for Leave now and Leave around',async()=>{
 const now=Date.parse('2026-11-03T07:00:00Z'),a=await createApp({now,settings:{provider:'demo',followRoute:true},saved:{dirMode:'office'}});
 const service=offset=>({from:'LET',to:'KGX',std:hm(now+offset*MIN),dep:now+offset*MIN,arr:now+(offset+30)*MIN,
  operator:'Great Northern',serviceId:'later-'+offset,platform:'1',depLate:0,arrLate:0,cancelled:false,depUnknown:false,arrUnknown:false,reason:''});
 Object.assign(a.c.state,{boards:{'LET-KGX':{services:[service(50),service(65)],msgs:[]},'LET-STP':{services:[],msgs:[]},'LET-ZFD':{services:[],msgs:[]}},
  railSource:'darwin',boardsAt:now,loading:false,errors:[]});
 for(const mode of ['auto','plan'])for(const view of ['now','at']){
  a.c.state.saved.view=view;
  if(view==='at')a.c.state.at={T:now+30*MIN,boards:a.c.state.boards,failed:{},live:true};
  a.d.querySelector(`[data-journey-view="${mode}"]`).click();a.c.render();
  const options=view==='at'?a.c.atOptions():a.c.ranked(now),picks=options.filter(o=>o.recommended).sort((x,y)=>x.recommended-y.recommended);
  assert.equal(picks.length,2,`${mode} ${view} fixture includes two recommendations`);
  const cards=[...a.d.querySelectorAll('#hero .opt')];assert.equal(cards.length,2);
  cards.forEach((card,index)=>fullOption(a,card,picks[index]));
 }
 assert.deepEqual(a.errors,[]);a.close();
});
