// Independent user-facing journey facts probes. Deliberately compare reached pages,
// rather than accepting a fact retained in a closed disclosure or hidden design.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,json} from './harness.mjs';
after(closeAll);

const MIN=60000,NOW=Date.parse('2026-11-03T07:00:00Z');
const station={coords:{latitude:51.98002,longitude:-.22909,accuracy:8}};
const train=(std,departure,arrival,id,extra={})=>({from:'LET',to:'KGX',std,serviceId:id,
 dep:NOW+departure*MIN,arr:NOW+arrival*MIN,operator:'Great Northern',platform:'1',
 depLate:0,arrLate:0,depUnknown:false,arrUnknown:false,cancelled:false,reason:'',...extra});
const services=()=>[
 train('07:00',.5,28,'cannot-catch'),
 train('07:04',4,29,'cancelled',{cancelled:true}),
 train('07:35',35,85,'arrives-first'),
 train('07:50',50,90,'unknown',{arrUnknown:true}),
 train('07:59',59,95,'shorter-later'),
];
function visible(a,node){
 if(!node)return false;
 for(let n=node;n;n=n.parentElement){
  if(n.hidden||a.w.getComputedStyle(n).display==='none'||a.w.getComputedStyle(n).visibility==='hidden')return false;
  if(n.parentElement?.tagName==='DETAILS'&&!n.parentElement.open&&n!==n.parentElement.querySelector(':scope > summary'))return false;
 }
 return true;
}
function visibleText(a,node){
 assert.ok(node,'the reached UI exists');
 const walker=a.d.createTreeWalker(node,4),parts=[];
 while(walker.nextNode())if(visible(a,walker.currentNode.parentElement))parts.push(walker.currentNode.textContent);
 return parts.join(' ').replace(/\s+/g,' ').trim();
}
const duration=ms=>{const m=Math.round(ms/MIN);return m>=60?`${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`:`${m} min`;};
const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const row=(a,std)=>[...a.d.querySelectorAll('#list .row')].find(node=>node.dataset.journeyService?.split('|')[2]===std||node.querySelector('[data-follow]')?.getAttribute('aria-label')?.includes('the '+std+' '));
const pin=(a,mode)=>a.d.querySelector(`[data-journey-view="${mode}"]`).click();
function facts(a,node,option){
 const text=visibleText(a,node);
 assert.match(text,new RegExp(escape(duration(option.arrive-option.leave))),`${option.train.std}: total journey duration stays visible`);
 assert.match(text,new RegExp(escape(duration(option.train.arr-option.train.dep))+' (?:train|on (?:the )?train)'),`${option.train.std}: distinguish train time from total`);
 return text;
}
async function fixture(appearance,atStation=false){
 const a=await createApp({now:NOW,...(atStation?{geo:station}:{}),
  settings:{provider:'demo',appearance,followRoute:true},saved:{dirMode:'office',pace:'avg'}});
 const s=a.c.state;
 Object.assign(s,{boards:{'LET-KGX':{services:services(),msgs:[]},'LET-STP':{services:[],msgs:[]},'LET-ZFD':{services:[],msgs:[]}},
  railSource:'darwin',boardsDir:'office',boardsAt:NOW,loading:false,routeFailed:{},errors:[],
  status:['circle','metropolitan','hammersmith-city'].map(id=>({id,name:id,statuses:[{sev:10,desc:'Good Service'}]})),
  nrStatus:[{id:'great-northern',name:'Great Northern',statuses:[{sev:10,desc:'Good Service'}]}]});
 s.saved.settings.provider='rdm';s.saved.settings.rdmKey='fixture-only';a.c.render();
 return a;
}

for(const appearance of ['light','dark'])for(const atStation of [false,true]){
 const label=`${appearance} ${atStation?'at station':'from home'}`;
 test(`journey facts review: ${label} keeps canonical duration and earliest-arrival ownership in Auto, Plan and Live`,async()=>{
  const a=await fixture(appearance,atStation),list=a.c.ranked(NOW);
  const first=list.find(o=>o.train.serviceId==='arrives-first'),short=list.find(o=>o.train.serviceId==='shorter-later');
  assert.ok(first&&short);assert.ok(first.arrive<short.arrive);
  assert.ok(first.arrive-first.leave>short.arrive-short.leave,'the later route is deliberately shorter, not first to arrive');
  assert.equal(first.firstAt,'walk');assert.equal(short.firstAt,undefined);
  const requests=a.calls.slice();
  for(const mode of ['auto','plan','live']){
   pin(a,mode);
   const fastest=facts(a,row(a,'07:35'),first);
   assert.match(fastest,/Arrives first(?: · walking)?/,'earliest reachable arrival is visible in every mode');
   assert.doesNotMatch(facts(a,row(a,'07:59'),short),/Arrives first|Fastest/,'a shorter but later trip cannot steal the existing earliest-arrival marker');
   assert.doesNotMatch(visibleText(a,row(a,'07:04')),/Arrives first|Fastest/,'cancelled services cannot win');
   assert.doesNotMatch(visibleText(a,row(a,'07:50')),/Arrives first|Fastest/,'no-estimate services cannot win');
   assert.doesNotMatch(visibleText(a,row(a,'07:00')),/Arrives first|Fastest/,'uncatchable earliest arrival cannot win');
  }
  assert.deepEqual(a.calls,requests,'switching views adds no feed requests');
  assert.deepEqual(a.errors,[]);a.close();
 });
}

for(const appearance of ['light','dark'])test(`journey facts review: ${appearance} follows the same duration and arrival-first route across view and appearance changes`,async()=>{
 const a=await fixture(appearance),first=a.c.ranked(NOW).find(o=>o.train.serviceId==='arrives-first');
 pin(a,'live');row(a,'07:35').querySelector('[data-follow]').click();
 const selected=a.c.state.saved.followRoute.id,requests=a.calls.slice();
 for(const mode of ['auto','plan','live']){
  pin(a,mode);
  const panel=a.d.querySelector('#followPanel');assert.equal(visible(a,panel),true);
  assert.match(facts(a,panel,first),/Arrives first/,'Follow retains the same comparison semantics');
 }
 a.c.state.saved.settings.appearance=appearance==='light'?'dark':'light';a.c.render();
 assert.equal(a.c.state.saved.followRoute.id,selected,'appearance never changes the selected route');
 facts(a,a.d.querySelector('#followPanel'),first);
 const onTrain=first.train.dep+MIN,s=a.c.state;
 a.setNow(onTrain);Object.assign(s,{onLine:true,here:[51.9533,-.2635],locAcc:12,
  locStatus:'ok',lastFixAt:onTrain,boardsAt:onTrain,
  trainLock:{operator:first.train.operator,std:first.train.std,from:first.train.from,serviceId:first.train.serviceId,picked:true}});
 a.c.render();
 assert.equal(s.followUpdate.route.phase,'on-train','the duration is also checked after actual boarding');
 facts(a,a.d.querySelector('#followPanel'),first);
 assert.deepEqual(a.calls,requests);assert.deepEqual(a.errors,[]);a.close();
});

for(const appearance of ['light','dark'])test(`journey facts review: ${appearance} supports Auto Plan and Live without enabling Follow`,async()=>{
 const a=await fixture(appearance);a.c.state.saved.settings.followRoute=false;a.c.render();
 const first=a.c.ranked(NOW).find(o=>o.train.serviceId==='arrives-first');
 assert.equal(visible(a,a.d.querySelector('#journeyViewControl')),true,'view selection is independent of the Follow feature');
 for(const mode of ['auto','plan','live']){
  pin(a,mode);
  const match=[...a.d.querySelectorAll('#list .row')].find(node=>mode==='live'?node.querySelector('.leave .t')?.textContent==='07:35':/07:35 Great Northern/.test(node.textContent));
  assert.match(facts(a,match,first),/Arrives first/);
 }
 assert.deepEqual(a.errors,[]);a.close();
});

for(const appearance of ['light','dark'])test(`journey facts review: ${appearance} cannot present retained Follow durations or a winner when the current arrival disappears`,async()=>{
 const a=await fixture(appearance),first=a.c.ranked(NOW).find(o=>o.train.serviceId==='arrives-first');
 pin(a,'live');row(a,'07:35').querySelector('[data-follow]').click();
 a.c.state.boards['LET-KGX'].services.find(t=>t.serviceId==='arrives-first').arr=null;
 a.c.render();assert.equal(a.c.state.followUpdate.status,'unknown');
 const panel=a.d.querySelector('#followPanel'),text=visibleText(a,panel);
 assert.match(text,/no estimate|uncertain|unavailable/i);
 const selectedNode=panel.querySelector('.meta'),selected=visibleText(a,selectedNode);
 assert.doesNotMatch(selected,new RegExp(escape(duration(first.arrive-first.leave))),'the retained plan cannot become a current duration');
 assert.doesNotMatch(selected,/Arrives first|Fastest/,'unknown current arrival cannot retain an old comparative flag; a separate valid alternative may win');
 for(const node of selectedNode.querySelectorAll('[data-fact$="-duration"]'))
  assert.ok(!node.hasAttribute('data-ms')||node.dataset.ms==='','no fabricated numeric duration attribute');
 const alternative=a.c.state.followUpdate.alternative;assert.ok(alternative,'the reached recovery state offers a different usable journey');
 facts(a,panel.querySelector('.follow-alternative'),alternative);
 assert.deepEqual(a.errors,[]);a.close();
});

for(const appearance of ['light','dark'])test(`journey facts review: ${appearance} Live introduction is concise and does not explain the app at paragraph length`,async()=>{
 const a=await fixture(appearance);pin(a,'live');
 const copy=a.text('#hero .live-note');
 assert.ok(copy.length<=80,'commuting copy is glanceable');
 assert.ok(copy.trim().split(/\s+/).length<=14,'no long explanatory paragraph');
 assert.doesNotMatch(copy,/No journey under way|what's leaving your next stop now|whether you can make it from here/);
 assert.deepEqual(a.errors,[]);a.close();
});

test('journey facts review: Signal Next best exposes its own durations and rank without an option-level disclosure',async()=>{
 const a=await fixture('light'),second=a.c.ranked(NOW).find(o=>o.train.serviceId==='shorter-later');
 for(const mode of ['auto','plan']){
  pin(a,mode);
  const alternative=a.d.querySelector('#hero .signal-alternative');assert.ok(alternative);
  assert.equal(alternative.tagName,'SECTION');
  const text=facts(a,alternative,second);
  assert.doesNotMatch(text,/Arrives first|Fastest/,'Next best cannot inherit the primary winner');
 }
 assert.deepEqual(a.errors,[]);a.close();
});

for(const appearance of ['light','dark'])test(`journey facts review: ${appearance} Tube connections share their actual start and winner across Auto Plan Live and a slower selection`,async()=>{
 const now=Date.parse('2026-11-03T17:30:00Z');
 const a=await createApp({now,geo:{coords:{latitude:51.5139,longitude:-.071,accuracy:10}},
  settings:{provider:'demo',appearance,followRoute:true},saved:{dirMode:'home',pace:'avg'},
  route:url=>/940GZZLUALD\/Arrivals/.test(url)?json([3,9,15].map((minutes,index)=>({vehicleId:'parity-circle-'+index,
   lineId:'circle',platformName:'Westbound - Platform 1',destinationName:'Edgware Road (Circle Line) Underground Station',
   expectedArrival:new Date(now+minutes*MIN).toISOString(),timeToStation:minutes*60}))):undefined});
 const s=a.c.state,settings=a.c.S(),walkMs=(settings.aldWalk+settings.aldPlatform)*1000;
 const plan=a.w.CommuteCore.planConnection({now,departures:s.aldDeps.list,arrivedAt:null,walkMs,
  leg:departure=>a.c.homeLegs(departure.t,now),max:Infinity});
 assert.equal(plan.best.t,now+9*MIN,'the existing connection model breaks equal-home-arrival ties by the earlier Tube');
 assert.equal(plan.next.length,2);
 assert.ok(plan.best.leg.o.leave>plan.best.t,'this counterexample catches using a generic rail plan that starts after the selected Tube');
 const requests=a.calls.slice();
 const check=mode=>{
  pin(a,mode);
  for(const timed of plan.next){
   const hhmm=new Date(timed.t).toISOString().slice(11,16);
   const container=mode==='live'?[...a.d.querySelectorAll('#list .row.board')].find(node=>node.querySelector('.leave .t')?.textContent===hhmm):
    [...a.d.querySelectorAll('.tuberow')].find(node=>new RegExp('Circle\\s*'+hhmm).test(node.textContent));
   assert.ok(container,mode+' reaches the actual '+hhmm+' Tube connection');
   const text=visibleText(a,container),total=timed.arrive-(timed.t-walkMs);
   assert.match(text,new RegExp(escape(duration(total))),hhmm+' total includes the selected Tube and its actual wait for the train');
   assert.match(text,new RegExp(escape(duration(timed.leg.o.train.arr-timed.leg.o.train.dep))+' train'));
   const numeric=[...container.querySelectorAll('[data-fact="total-duration"]')].filter(node=>visible(a,node));
   assert.ok(numeric.some(node=>Number(node.dataset.ms)===total),'the exposed total is the same canonical selected connection');
   if(timed.t===plan.best.t)assert.match(text,/Arrives first/);
   else assert.doesNotMatch(text,/Arrives first|Fastest/);
  }
  if(mode==='live'){
   const early=[...a.d.querySelectorAll('#list .row.board')].find(node=>node.querySelector('.leave .t')?.textContent==='17:33');
   assert.ok(early);assert.doesNotMatch(visibleText(a,early),/Arrives first|Fastest/,'one you cannot reach cannot inherit its onward train\'s winner');
  }
 };
 for(const mode of ['auto','plan','live'])check(mode);
 pin(a,'auto');
 const later=plan.next.at(-1),pick=[...a.d.querySelectorAll('[data-tubepick]')].find(node=>Number(node.dataset.tubepick.split('|')[1])===later.t);
 assert.ok(pick);pick.click();assert.equal(s.saved.tubePick.t,later.t);
 check('auto');check('live');
 assert.deepEqual(a.calls,requests,'comparison and duration do not require more feed requests');
 assert.deepEqual(a.errors,[]);a.close();
});

for(const appearance of ['light','dark'])test(`journey facts review: ${appearance} alternative boarding uses its own duration and cannot inherit the winning boarding point`,async()=>{
 const now=Date.parse('2026-11-03T17:30:00Z');
 const a=await createApp({now,geo:{coords:{latitude:51.5136,longitude:-.1365,accuracy:20}},
  settings:{provider:'demo',appearance,followRoute:true},saved:{dirMode:'home',mode:'leisure'}});
 const common={to:'LET',serviceId:'same-tl',operator:'Thameslink',arr:now+90*MIN,platform:'2',
  depLate:0,arrLate:0,depUnknown:false,arrUnknown:false,cancelled:false,reason:'',
  calls:[{code:'ZFD',name:'Farringdon',t:now+35*MIN},{code:'STP',name:'St Pancras',t:now+40*MIN},{code:'LET',name:'Letchworth',t:now+90*MIN}]};
 Object.assign(a.c.state,{boards:{'KGX-LET':{services:[],msgs:[]},
  'STP-LET':{services:[{...common,from:'STP',std:'18:10',dep:now+40*MIN}],msgs:[]},
  'ZFD-LET':{services:[{...common,from:'ZFD',std:'18:05',dep:now+35*MIN}],msgs:[]}},
  railSource:'darwin',boardsDir:'home',boardsAt:now,loading:false,routeFailed:{},errors:[]});
 a.c.render();
 const ranked=a.c.ranked(now);assert.equal(ranked.length,1,'one physical train remains one recommendation');
 const main=ranked[0],alternative=main.alts?.[0];assert.ok(alternative);
 assert.notEqual(main.leave,alternative.leave,'the two boarding points have different access budgets');
 assert.equal(main.firstAt,'walk');assert.equal(alternative.firstAt,undefined);
 pin(a,'live');
 assert.match(facts(a,row(a,main.train.std),main),/Arrives first/);
 assert.doesNotMatch(facts(a,row(a,alternative.train.std),alternative),/Arrives first|Fastest/);
 row(a,alternative.train.std).querySelector('[data-follow]').click();
 assert.equal(a.c.state.saved.followRoute.option.train.from,alternative.train.from,'Follow chooses the actual alternate boarding point');
 const selected=a.d.querySelector('#followPanel .meta');
 assert.doesNotMatch(facts(a,selected,alternative),/Arrives first|Fastest/,'following one boarding point cannot borrow another point\'s rank');
 assert.deepEqual(a.errors,[]);a.close();
});

for(const appearance of ['light','dark'])test(`journey facts review: ${appearance} Live preserves one qualified arrival-first lozenge for fast walk run and car`,async()=>{
 const a=await fixture(appearance),departure=short=>NOW+(30+1337+180-short*60)*1000;
 a.c.state.boards['LET-KGX'].services=[[-5,60,'walk'],[2,52,'fast'],[5,48,'run'],[10,45,'car'],[20,35,'none']].map(([short,arrival,id])=>{
  const dep=departure(short),std=new Date(dep).toISOString().slice(11,16);
  return {...train(std,0,arrival,'effort-'+id),dep};
 });a.c.render();
 const options=a.c.ranked(NOW);
 for(const mode of ['auto','plan','live']){
  pin(a,mode);
  for(const [effort,plain] of [['fast','Fast walk'],['run','Run'],['car','Car needed']]){
   const option=options.find(o=>o.firstAt===effort);assert.ok(option,'the fixture actually reaches '+effort+' as a better arrival');
   const container=row(a,option.train.std),flags=[...container.querySelectorAll('.pill')].filter(node=>visible(a,node)).map(node=>node.textContent.trim());
   assert.equal(flags.filter(text=>text.startsWith('Arrives first')).length,1);
   assert.equal(flags.filter(text=>text===plain).length,0,'the qualified arrival-first label replaces its plain effort label in '+mode);
   if(mode==='live')assert.equal(container.querySelector('[data-reach]')?.dataset.reach,effort,'the visible reach state must agree with its qualified arrival-first effort');
  }
 }
 assert.deepEqual(a.errors,[]);a.close();
});
