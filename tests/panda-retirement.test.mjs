// Upgrade from either retired design preference must preserve the person's real trip.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll} from './harness.mjs';
after(closeAll);
const NOW=Date.parse('2026-11-03T10:00:00Z');
const plain=value=>JSON.parse(JSON.stringify(value));

for(const legacy of [undefined,false,true])test(`Panda retirement: saved signal=${legacy} opens Signal without enabling Follow`,async()=>{
 const settings={provider:'demo',followRoute:false,appearance:'dark',walkHomeStationAvg:777,...(legacy===undefined?{}:{signal:legacy})};
 const a=await createApp({now:NOW,settings,saved:{dirMode:'office',pace:'fast',home:[51.975,-.23]}});
 assert.equal(a.d.documentElement.dataset.design,'signal');
 assert.equal(a.d.querySelector('#s_signal'),null);
 assert.equal(a.c.S().followRoute,false);
 assert.equal(a.d.querySelectorAll('[data-follow]').length,0);
 assert.equal('signal' in a.c.S(),false,'obsolete settings cannot select a second renderer');
 assert.equal(a.c.S().walkHomeStationAvg,777);
 assert.equal(a.d.documentElement.dataset.theme,'dark');
 assert.deepEqual(plain(a.c.state.saved.home),[51.975,-.23]);
 assert.ok(a.d.querySelector('#hero .opt'));
 a.d.querySelector('#settingsBtn').click();
 const calls=a.calls.slice(),boards=a.c.state.boards;
 a.d.querySelector('#settingsForm').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(a.c.state.boards,boards);assert.deepEqual(a.calls,calls,'saving the retired preference never restarts feeds');
 const persisted=JSON.parse(a.w.localStorage.getItem('cartrefCommute.v1'));
 assert.equal('signal' in persisted.settings,false);
 assert.equal(persisted.settings.walkHomeStationAvg,777);
 assert.deepEqual(persisted.home,[51.975,-.23]);assert.equal(persisted.pace,'fast');
 assert.equal(a.c.S().followRoute,false);assert.deepEqual(a.errors,[]);a.close();
});

test('Panda retirement: an existing followed trip and planning pin survive upgrade settings and reload',async()=>{
 const a=await createApp({now:NOW,settings:{provider:'demo',followRoute:true},saved:{dirMode:'office'}});
 a.d.querySelector('[data-follow]:not([disabled])').click();
 a.d.querySelector('[data-journey-view="plan"]').click();
 const saved=JSON.parse(a.w.localStorage.getItem('cartrefCommute.v1'));
 saved.settings.signal=false;saved.settings.appearance='light';saved.settings.walkHomeStationAvg=777;
 saved.planInputs={by:{date:'2026-11-04',time:'08:30'},at:{date:'2026-11-04',time:'07:40'}};
 saved.alongLinePreferences={depth:'explore',interests:['engineering']};
 const selected=plain(saved.followRoute),pin=plain(saved.viewOverride);a.close();
 const b=await createApp({now:NOW,saved});
 assert.equal(b.d.documentElement.dataset.design,'signal');
 assert.equal(b.c.state.saved.followRoute.id,selected.id);
 assert.deepEqual(plain(b.c.state.saved.followRoute.option.legs),selected.option.legs);
 assert.equal(b.c.state.saved.followRoute.plannedArrival,selected.plannedArrival);
 assert.deepEqual(plain(b.c.state.saved.viewOverride),pin);
 assert.deepEqual(plain(b.c.state.saved.planInputs),saved.planInputs);
 assert.deepEqual(plain(b.c.state.saved.alongLinePreferences),saved.alongLinePreferences);
 assert.equal(b.d.querySelector('#followPanel').hidden,false);
 const requests=b.calls.slice(),boards=b.c.state.boards;
 b.d.querySelector('#settingsBtn').click();b.d.querySelector('#s_appearance').value='dark';
 b.d.querySelector('#settingsForm').dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));
 assert.deepEqual(b.calls,requests);assert.equal(b.c.state.boards,boards);
 const restored=JSON.parse(b.w.localStorage.getItem('cartrefCommute.v1'));b.close();
 const c=await createApp({now:NOW,saved:restored});
 assert.equal(c.d.documentElement.dataset.design,'signal');assert.equal(c.d.documentElement.dataset.theme,'dark');
 assert.equal(c.c.state.saved.followRoute.id,selected.id);assert.equal(c.c.S().walkHomeStationAvg,777);
 assert.deepEqual(plain(c.c.state.saved.viewOverride),pin);assert.deepEqual(c.errors,[]);c.close();
});
