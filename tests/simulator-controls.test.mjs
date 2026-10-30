import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,sleep} from './harness.mjs';
after(closeAll);

test('simulator dock starts hidden playback and preserves paused state while showing and hiding controls',async()=>{
 const a=await createApp({settle:80});const d=a.d;
 d.querySelector('#settingsBtn').click();d.querySelector('#s_simulator').checked=true;d.querySelector('#s_simulatedFeeds').checked=true;
 d.querySelector('#settingsForm').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));await sleep(40);
 assert.equal(d.querySelector('#simBar').hidden,false,'dock reachable before playback starts');
 assert.equal(d.querySelector('#simAdvance').textContent,'Start');
 d.querySelector('#simToggle').click();assert.equal(d.querySelector('#simPanel').hidden,true);
 assert.equal(d.querySelector('#simToggle').getAttribute('aria-expanded'),'false');
 assert.equal(d.querySelector('#simToggle').textContent,'Show controls');
 d.querySelector('#simAdvance').click();
 assert.equal(a.c.simulator.sim.active,true);assert.equal(a.c.simulator.sim.index,0);assert.equal(a.c.simulator.sim.timer,null);
 assert.equal(d.querySelector('#simPanel').hidden,true,'starting from dock does not cover the application');
 assert.equal(d.querySelector('#simAdvance').textContent,'Continue');
 const instant=a.c.simClock.now(),here=[...a.c.state.here],saved=a.w.localStorage.getItem('cartrefCommute.v1');
 for(let i=0;i<2;i++)d.querySelector('#simToggle').click();await sleep(30);
 assert.equal(a.c.simClock.now(),instant);assert.deepEqual([...a.c.state.here],here);assert.equal(a.c.simulator.sim.index,0);
 assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),saved);assert.equal(a.c.S().simulatedFeeds,true);
 d.querySelector('#simAdvance').click();assert.notEqual(a.c.simulator.sim.timer,null);assert.equal(d.querySelector('#simAdvance').textContent,'Pause');
 const timer=a.c.simulator.sim.timer;
 d.querySelector('#simToggle').click();d.querySelector('#simToggle').click();
 assert.equal(a.c.simulator.sim.timer,timer,'showing and hiding controls must preserve active playback too');
 d.querySelector('#simAdvance').click();assert.equal(a.c.simulator.sim.timer,null);assert.equal(d.querySelector('#simAdvance').textContent,'Continue');
 d.querySelector('#simToggle').click();assert.equal(d.querySelector('#simPanel').hidden,false);assert.equal(d.querySelector('#simToggle').getAttribute('aria-expanded'),'true');
 d.querySelector('#simExit').click();assert.equal(d.querySelector('#simPanel').hidden,true);assert.equal(d.querySelector('#simBar').hidden,true);
 assert.equal(d.querySelector('#simToggle').getAttribute('aria-expanded'),'false');assert.equal(a.c.simClock.active,false);
 assert.equal(d.body.classList.contains('simControlsVisible'),false);await sleep(350);assert.deepEqual(a.errors,[]);
});

test('GPS-only opt-in exposes the dock before Start and disabling hides both controls',async()=>{
 const a=await createApp({settle:80});const d=a.d;
 assert.equal(d.querySelector('#simBar').hidden,true);
 for(const enabled of [true,false]){
  d.querySelector('#settingsBtn').click();d.querySelector('#s_simulator').checked=enabled;
  d.querySelector('#settingsForm').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(d.querySelector('#simBar').hidden,!enabled);assert.equal(d.querySelector('#simPanel').hidden,!enabled);
  assert.equal(d.querySelector('#simToggle').getAttribute('aria-expanded'),String(enabled));
 }
 await sleep(350);assert.deepEqual(a.errors,[]);
});

test('Stop exits a ready GPS-only simulator before the journey has started',async()=>{
 const a=await createApp({settle:80});const d=a.d;
 d.querySelector('#settingsBtn').click();d.querySelector('#s_simulator').checked=true;
 d.querySelector('#settingsForm').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(a.c.simulator.sim.active,false);assert.equal(d.querySelector('#simBar').hidden,false);
 d.querySelector('#simExit').click();
 assert.equal(a.c.S().simulatorEnabled,false);assert.equal(d.querySelector('#simBar').hidden,true);assert.equal(d.querySelector('#simPanel').hidden,true);
 assert.equal(d.body.classList.contains('simControlsVisible'),false);await sleep(350);assert.deepEqual(a.errors,[]);
});
