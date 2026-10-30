import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,sleep} from './harness.mjs';
after(closeAll);
const submit=(app)=>app.d.querySelector('#settingsForm').dispatchEvent(new app.w.Event('submit',{bubbles:true,cancelable:true}));
async function enabled(){const app=await createApp({settle:100});app.d.querySelector('#settingsBtn').click();app.d.querySelector('#s_simulator').checked=true;submit(app);return app;}
test('manual GPS accuracy reaches the real location inference and rejects invalid accuracy',async()=>{
 const app=await enabled(),d=app.d;
 d.querySelector('#simLat').value='51.53197';d.querySelector('#simLon').value='-0.12341';
 d.querySelector('#simAccuracy').value='1200';d.querySelector('#simApply').click();
 assert.equal(app.c.state.locAcc,1200);assert.equal(app.c.state.atHub,null,'rough fix must not assert station arrival');
 assert.match(app.c.state.autoSrc,/1.2 km/);
 d.querySelector('#simAccuracy').value='12';d.querySelector('#simApply').click();
 assert.equal(app.c.state.locAcc,12);assert.equal(app.c.state.atHub,'KGX','precise recovery must be processed by normal hub inference');
 d.querySelector('#simAccuracy').value='-1';d.querySelector('#simApply').click();
 assert.equal(app.c.state.locAcc,12);assert.match(d.querySelector('#simStatus').textContent,/Invalid/);await sleep(400);
});
test('poor indoor and train accuracy can be selected without persisting synthetic context',async()=>{
 const app=await enabled(),d=app.d,before=app.w.localStorage.getItem('cartrefCommute.v1');
 d.querySelector('#simScenario').value='low-accuracy';d.querySelector('#simPlay').click();
 assert.equal(app.c.state.locAcc,650);assert.match(d.querySelector('#simFixStatus').textContent,/650 m/);
 d.querySelector('#simExit').click();assert.equal(app.w.localStorage.getItem('cartrefCommute.v1'),before);await sleep(400);
});
test('reset before playback and Continue after selection changes keep the selected calendar date',async()=>{
 const app=await enabled(),d=app.d;
 d.querySelector('#settingsBtn').click();d.querySelector('#s_simulatedFeeds').checked=true;submit(app);
 d.querySelector('#simDate').value='2026-12-31T23:44';
 d.querySelector('#simClear').click();
 assert.equal(new Date(app.c.simClock.now()).toISOString(),'2026-12-31T23:44:00.000Z');
 d.querySelector('#simDate').value='2027-01-02T08:44';
 d.querySelector('#simDate').dispatchEvent(new app.w.Event('change'));
 d.querySelector('#simContinue').click();
 assert.equal(new Date(app.c.simClock.now()).toISOString(),'2027-01-02T08:44:00.000Z');
 assert.match(d.querySelector('#simStatus').textContent,/Paused at Home/);
 d.querySelector('#simExit').click();assert.equal(app.c.simClock.active,false);await sleep(400);assert.deepEqual(app.errors,[]);
});
