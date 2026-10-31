import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,IN_LONDON,hang,sleep} from './harness.mjs';
after(closeAll);
const NOW=Date.parse('2026-11-03T10:00:00Z'),MIN=60000;
const plain=x=>JSON.parse(JSON.stringify(x));
const id=t=>({operator:t.operator,std:t.std,from:t.from,...(t.serviceId?{serviceId:t.serviceId}:{})});
async function oldSelection(provider='demo'){
 const a=await createApp({now:NOW,geo:IN_LONDON,settings:{provider,followRoute:true},saved:{dirMode:'home'}});
 const o=[...a.c.followChoices.values()].find(o=>o.recommended===1);
 assert.ok(o);const calls=[o.train,...(o.alts||[]).map(a=>a.train)];
 const legacy={dir:'home',train:id(o.train),calls:calls.map(id),hub:o.hub,lastDep:Math.max(...calls.map(t=>t.dep)),
  afterMs:o.arrive-o.train.arr,planned:o.arrive,arrive:o.arrive,lateMin:o.train.arrLate||0,followedAt:NOW,reason:null,dismissed:null,declined:[]};
 a.close();return plain(legacy);
}
test('released saved Follow switch and journey restore without deleting the old record',async()=>{
 const old=await oldSelection();
 const a=await createApp({now:NOW,geo:IN_LONDON,settings:{provider:'demo',follow:true},saved:{dirMode:'home',follow:old}});
 assert.equal(a.c.S().followRoute,true);assert.ok(a.c.state.saved.followRoute);
 assert.equal(a.c.state.saved.followRoute.option.train.std,old.train.std);
 assert.equal(a.c.state.saved.followRoute.plannedArrival,old.planned);assert.equal(a.c.state.saved.followRoute.expectedArrival,old.arrive);
 assert.deepEqual(plain(a.c.state.saved.follow),old);assert.equal(a.d.querySelector('#followPanel').hidden,false);
 assert.ok(a.d.querySelector('.followtag'),'selected row is inert rather than resetting the saved journey');
 const before=a.calls.length,board=a.c.state.boards,chosen=a.c.state.saved.followRoute.id;
 a.d.querySelector('#settingsBtn').click();a.d.querySelector('#s_signal').checked=true;
 a.d.querySelector('#settingsForm').dispatchEvent(new a.w.Event('submit',{cancelable:true,bubbles:true}));
 assert.equal(a.c.state.boards,board);assert.equal(a.calls.length,before);assert.equal(a.c.state.saved.followRoute.id,chosen);
 assert.deepEqual(a.errors,[]);a.close();
});
test('a released saved journey waits for real data; Stop cannot resurrect the legacy record',async()=>{
 const old=await oldSelection();
 const a=await createApp({now:NOW,geo:IN_LONDON,settle:40,timeoutMs:1000,settings:{provider:'rdm',rdmKey:'test',rdmBase:'https://legacy.test',follow:true},saved:{dirMode:'home',follow:old},route:(u,opts)=>/legacy.test/.test(u)?hang(opts):undefined});
 assert.equal(a.c.state.saved.followRoute,undefined);assert.deepEqual(plain(a.c.state.saved.follow),old);
 assert.match(a.text('#followPanel'),/Restoring your saved followed journey/);assert.doesNotMatch(a.text('#followPanel'),/missed/);
 a.d.querySelector('[data-follow-action="stop"]').click();a.c.render();
 assert.equal(a.c.state.saved.followRoute,null);assert.equal(a.c.state.saved.follow,null);assert.equal(a.d.querySelector('#followPanel').hidden,true);
 a.w.dispatchEvent(new a.w.Event('pagehide'));await sleep(30);assert.deepEqual(a.errors,[]);a.close();
});
test('an explicit new disabled setting wins over the released switch and saved route',async()=>{
 const old=await oldSelection();
 const a=await createApp({now:NOW,geo:IN_LONDON,settings:{provider:'demo',follow:true,followRoute:false},saved:{dirMode:'home',follow:old}});
 assert.equal(a.c.S().followRoute,false);assert.equal(a.c.state.saved.followRoute,undefined);
 assert.equal(a.d.querySelector('#followPanel').hidden,true);assert.equal(a.d.querySelectorAll('[data-follow]').length,0);
 assert.deepEqual(plain(a.c.state.saved.follow),old);assert.equal(a.c.state.saved.viewOverride,undefined);
 assert.deepEqual(a.errors,[]);a.close();
});
test('released planning pins keep their original age and deadline while restoring at the same station',async()=>{
 const a=await createApp({now:NOW,geo:{coords:{latitude:51.53197,longitude:-.12341,accuracy:12}},settings:{provider:'demo',follow:true},
  saved:{dirMode:'home',view:'by',byTime:'18:30',viewAt:NOW-10*MIN,viewKey:'home|KGX|false|false|false|false'}});
 assert.equal(a.c.state.presentation.mode,'plan');assert.equal(a.c.state.saved.viewOverride.at,NOW-10*MIN);
 assert.equal(a.d.querySelector('#byTime').value,'18:30');
 a.setNow(NOW+10*MIN);a.c.render();assert.equal(a.c.state.presentation.mode,'auto');
 assert.equal(a.c.state.presentation.view,'plan-now');assert.match(a.text('#hero'),/departures/);
 assert.equal(a.d.querySelector('#byTime').value,'18:30');assert.deepEqual(a.errors,[]);a.close();
});
test('a released planning pin expires on a reliably changed station instead of restarting its lifetime',async()=>{
 const a=await createApp({now:NOW,geo:{coords:{latitude:51.53197,longitude:-.12341,accuracy:12}},settings:{provider:'demo',follow:true},
  saved:{dirMode:'home',view:'by',byTime:'18:30',viewAt:NOW-5*MIN,viewKey:'home||false|false|false|false'}});
 assert.equal(a.c.state.presentation.mode,'auto');assert.equal(a.c.state.saved.viewOverride,null);
 assert.equal(a.d.querySelector('#byTime').value,'18:30');assert.deepEqual(a.errors,[]);a.close();
});

test('independent migration review: feed-only opt-in isolates legacy and new saved routes before playback',async()=>{
 const old=await oldSelection();
 const a=await createApp({now:NOW,geo:IN_LONDON,settings:{provider:'demo',follow:true},saved:{dirMode:'home',follow:old}});
 assert.ok(a.c.state.saved.followRoute,'real itinerary has restored the released selection');
 const selected=a.c.state.saved.followRoute.id,storage=a.w.localStorage.getItem('cartrefCommute.v1');
 a.d.querySelector('#settingsBtn').click();a.d.querySelector('#s_simulatedFeeds').checked=true;
 a.d.querySelector('#settingsForm').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(a.c.simulator.sim.active,false,'assertions happen before pressing Start');
 assert.equal(a.c.state.saved.follow,undefined,'legacy selection cannot be migrated into a simulated feed session');
 assert.equal(a.c.state.saved.followRoute,undefined,'new selection is isolated too');
 assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),storage);
 a.d.querySelector('#simExit').click();await sleep(350);
 assert.deepEqual(plain(a.c.state.saved.follow),old);assert.equal(a.c.state.saved.followRoute.id,selected);
 assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),storage);assert.deepEqual(a.errors,[]);a.close();
});


test('released timetable selection restores while its planning question remains pinned',async()=>{
 const old=await oldSelection('tfl');
 const a=await createApp({now:NOW,geo:IN_LONDON,settle:700,settings:{provider:'tfl',follow:true},
  saved:{dirMode:'home',follow:old,view:'by',byTime:'18:30',viewAt:NOW-5*MIN,viewKey:'home||false|false|false|false'}});
 assert.ok(a.c.state.boards,'actual current timetable loads independently of Arrive by searches');
 assert.ok(a.c.state.saved.followRoute,'saved real selection can restore without manually returning to Leave now');
 assert.equal(a.c.state.saved.followRoute.option.train.std,old.train.std);
 assert.equal(a.d.querySelector('#byTime').value,'18:30');
 assert.deepEqual(a.errors,[]);a.close();
});
