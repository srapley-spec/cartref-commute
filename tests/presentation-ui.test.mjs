import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, closeAll } from './harness.mjs';
after(closeAll);
const NOW=Date.parse('2026-11-03T10:00:00Z'), MIN=60000;
const app=()=>createApp({now:NOW,settings:{provider:'demo'},saved:{dirMode:'office'}});
const blocks=a=>[...a.d.querySelector('#hero').children].map(n=>n.dataset.block).filter(Boolean);
function assertCanonical(a,view){
 const order=a.w.CommuteCore.BLOCKS[view], emitted=blocks(a).filter(block=>order.includes(block));
 assert.ok(emitted.includes('headline'),`${view}: actual hero emits its headline`);
 for(let i=1;i<emitted.length;i++)assert.ok(order.indexOf(emitted[i-1])<=order.indexOf(emitted[i]),`${view}: ${emitted.join(',')}`);
}
function canonical(a,view){a.c.renderCanonicalBlocks(a.d.querySelector('#hero'),{view,blocks:a.w.CommuteCore.BLOCKS[view]});assertCanonical(a,view);}

test('live block rendering consumes the engine order and retains every real train-card node',async()=>{
 const a=await app(),c=a.c;
 const train=c.state.boards['LET-KGX'].services.find(t=>!t.cancelled&&!t.depUnknown&&t.arr!=null);
 c.renderOnTrain(NOW,{t:train,hub:'KGX',projected:train.arr,sure:true,picked:true,others:[],conflict:true});
 const hero=a.d.querySelector('#hero'),before=[...hero.childNodes],content=hero.textContent;
 canonical(a,'on-train');
 assert.equal(hero.textContent.replace(/\s+/g,' ').trim(),content.replace(/\s+/g,' ').trim());
 assert.ok(before.every(n=>n.parentNode===hero),'reordering retains every node');
 assert.match(hero.textContent,/Your selected train does not match/,'identity conflict warning survives');
 // A deliberate model-order change must change the real DOM, not just pass a second copy of its specification.
 const model=a.w.CommuteCore.BLOCKS['on-train'];
 const which=model.indexOf('which'),progress=model.indexOf('progress');
 [model[which],model[progress]]=[model[progress],model[which]];
 canonical(a,'on-train');
 assert.ok(blocks(a).indexOf('progress')<blocks(a).indexOf('which'));
 [model[which],model[progress]]=[model[progress],model[which]];
 assert.deepEqual(a.errors,[]);a.close();
});

test('actual station, Tube, final-walk and London templates expose semantic blocks in model order',async()=>{
 const a=await app(),c=a.c;
 c.state.atHub='KGX';c.state.hubSince={hub:'KGX',at:NOW-8*MIN};
 c.state.tube={hub:'KGX',at:NOW,arrivals:[{t:NOW+2*MIN,line:'Circle',lineId:'circle',platform:'Eastbound - Platform 2',dest:'Aldgate'}]};
 c.renderAtHub(NOW);canonical(a,'at-hub');
 assert.ok(blocks(a).includes('which'));assert.ok(blocks(a).includes('then'));
 c.state.atHub=null;c.state.here=null;
 c.state.saved.tubeRide={hub:'KGX',t:NOW-2*MIN,line:'Circle',picked:true,rideMs:10*MIN,stop:'Aldgate',stopGeo:null};
 c.renderOnTube(NOW);canonical(a,'on-tube');
 assert.match(a.text('#hero'),/You're on/);assert.ok(blocks(a).includes('then'));
 c.state.saved.dirMode='home';
 c.state.saved.tubeRide={hub:'ALD',from:'ALD',t:NOW-2*MIN,line:'Circle',picked:true,rideMs:10*MIN,stop:"King's Cross",stopGeo:null};
 c.renderOnTubeHome(NOW);canonical(a,'on-tube-home');
 assert.match(a.text('#hero'),/Get off at/);assert.ok(blocks(a).includes('which'));assert.ok(blocks(a).includes('then'));
 c.state.saved.tubeRide=null;c.state.saved.dirMode='home';c.state.here=[51.975,-.23];c.state.saved.home=null;
 c.renderNearlyHome(NOW);canonical(a,'nearly-home');
 c.state.saved.dirMode='office';c.state.here=[51.5139,-.071];c.state.locAcc=12;c.state.lastFixAt=NOW;
 c.renderInLondon(NOW);canonical(a,'in-london');
 assert.match(a.text('#hero'),/arrived/);
 assert.deepEqual(a.errors,[]);a.close();
});

test('canonical rendering preserves unknown content, untagged context, listeners, disclosure and focus',async()=>{
 const a=await app(),hero=a.d.querySelector('#hero');
 hero.innerHTML='<div data-block="then">Later</div><span id="context">Unlabelled context</span><div data-block="headline">Arrival</div><div data-block="which"><input id="choice" value="selected"><button id="action">Correct</button><details open><summary>Details</summary>Expanded</details></div><aside data-block="future">New information</aside>';
 const action=hero.querySelector('#action'),choice=hero.querySelector('#choice'),details=hero.querySelector('details'),unknown=hero.querySelector('aside');
 let clicked=0;action.addEventListener('click',()=>clicked++);choice.focus();choice.setSelectionRange(1,4);
 a.c.renderCanonicalBlocks(hero,{blocks:['headline','which','then']});
 assert.deepEqual([...hero.children].map(n=>n.dataset.block||n.id),['headline','which','then','context','future']);
 assert.equal(a.d.activeElement,choice);assert.equal(choice.selectionStart,1);assert.equal(choice.selectionEnd,4);
 assert.equal(details.open,true);assert.equal(hero.querySelector('aside'),unknown);action.click();assert.equal(clicked,1);
 a.close();
});

test('Signal dispatch enforces the canonical order on the actual live hero',async()=>{
 const a=await app(),c=a.c;
 const train=c.state.boards['LET-KGX'].services.find(t=>!t.cancelled&&!t.depUnknown&&t.arr!=null);
 assert.ok(train,'the dispatched card uses a real departure from the fixture');
 const now=train.dep+MIN;a.setNow(now);
 Object.assign(c.state,{onLine:true,here:[51.956,-.26],locAcc:12,locStatus:'ok',lastFixAt:now,boardsAt:now,
  trainLock:{operator:train.operator,std:train.std,from:train.from,picked:true,...(train.serviceId?{serviceId:train.serviceId}:{})}});
 c.render();assert.equal(c.state.presentation.view,'on-train');assertCanonical(a,'on-train');
 assert.ok(blocks(a).includes('which'),'confirmed/inferred identity is actually present');
 assert.ok(blocks(a).includes('headline'),'the real card has an arrival headline');
 const model=a.w.CommuteCore.BLOCKS['on-train'];
 const headline=model.indexOf('headline'),which=model.indexOf('which');
 try{
  [model[headline],model[which]]=[model[which],model[headline]];
  c.render();
  const actual=blocks(a);assert.ok(actual.indexOf('which')<actual.indexOf('headline'),
   'dispatch must consume changed engine priority rather than relying on template order');
  assertCanonical(a,'on-train');
 }finally{[model[headline],model[which]]=[model[which],model[headline]];}
 assert.deepEqual(a.errors,[]);a.close();
});

test('Signal planning keeps the primary answer ahead of the accessible line-status strip',async()=>{
 const a=await app(),hero=a.d.querySelector('#hero');
 assert.equal(a.c.state.presentation.view,'plan-now');
 assert.ok(hero.firstElementChild.classList.contains('lbl'),'planning context remains first');
 const option=hero.querySelector('.opt'),strip=a.d.querySelector('#signalCurrentLines .strip');
 assert.ok(option&&strip);assert.ok(option.compareDocumentPosition(strip)&4,'the journey answer precedes line status');
 assert.equal(strip.closest('details').id,'signalNetwork','full line status remains available through the labelled disclosure');
 assert.deepEqual(a.errors,[]);a.close();
});
