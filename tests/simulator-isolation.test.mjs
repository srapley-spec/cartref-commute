import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,sleep} from './harness.mjs';
after(closeAll);
function switches(a,gps,feeds){a.d.querySelector('#settingsBtn').click();a.d.querySelector('#s_simulator').checked=gps;a.d.querySelector('#s_simulatedFeeds').checked=feeds;a.d.querySelector('#settingsForm').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));}

test('source sessions discard stale live response bodies and stale failures after synthetic activation',async()=>{
 const release=[];
 const a=await createApp({settings:{provider:'rdm',rdmKey:'test'},settle:80,route:(u)=>{
  if(u.includes('GetDepBoardWithDetails'))return {ok:true,status:200,json:()=>new Promise(resolve=>release.push(()=>resolve({locationName:'STALE',trainServices:[{std:'09:05',etd:'On time',serviceID:'STALE-LIVE',subsequentCallingPoints:[]}]})))};
 }});
 assert.ok(release.length,'actual app is waiting for live JSON');
 switches(a,true,true);a.d.querySelector('#simPlay').click();await sleep(50);
 const calls=a.calls.length;release.forEach(done=>done());await sleep(100);
 await a.c.refresh({force:true});
 const services=Object.values(a.c.state.boards||{}).flatMap(b=>b.services||[]);
 assert.ok(services.length);assert.ok(services.every(t=>t.serviceId?.startsWith('SIM-')));
 assert.equal(a.calls.length,calls,'old retries do not escape synthetic mode');
 assert.ok(!a.c.state.errors.some(e=>String(e).includes('Transport source changed')));
 a.d.querySelector('#simExit').click();await sleep(350);a.close();
});

test('feed-only simulation suppresses saved journey mutations and Stop restores clock sources and state',async()=>{
 const a=await createApp({saved:{dest:'Science Museum'},settle:100});
 const saved=a.w.localStorage.getItem('cartrefCommute.v1');
 switches(a,false,true);await sleep(50);
 // Exercise a real UI mutation while only feeds are synthetic.
 a.d.querySelector('[data-pace="fast"]').click();
 assert.equal(a.w.localStorage.getItem('cartrefCommute.v1'),saved);
 assert.equal(a.c.simClock.active,true);
 a.d.querySelector('#simExit').click();await sleep(100);
 assert.equal(a.c.simClock.active,false);assert.equal(a.c.S().simulatedFeeds,false);assert.equal(a.c.S().simulatorEnabled,false);
 assert.equal(a.c.state.saved.pace,'avg');assert.equal(a.c.state.saved.dest,'Science Museum');
 assert.ok(!a.c.state.trainLock);assert.equal(a.c.state.tflBackoffUntil,null);
 const before=a.calls.length;await a.c.fetchT('https://api.tfl.gov.uk/Line/metropolitan/Status');assert.equal(a.calls.length,before+1);
 await sleep(350);a.close();
});

test('reload ignores saved simulation switches and restores normal device operation',async()=>{
 const a=await createApp({settings:{provider:'tfl',simulatorEnabled:true,simulatedFeeds:true},settle:150});
 assert.equal(a.c.S().simulatorEnabled,false);assert.equal(a.c.S().simulatedFeeds,false);assert.equal(a.c.simClock.active,false);
 assert.equal(a.d.querySelector('#simPanel').hidden,true);assert.equal(a.c.simulator.sim.active,false);assert.ok(a.calls.length);
 await sleep(350);a.close();
});

test('scenario restart clears real and previous simulated journey memory while Stop restores it',async()=>{
 const trip={dir:'office',at:Date.parse('2026-11-04T10:00:00Z')};
 const a=await createApp({geoDelay:'manual',saved:{trip,officeVisit:'future',tubeRide:{vehicle:'REAL',lineId:'circle',dep:Date.parse('2026-11-04T10:00:00Z')},tubePick:{vehicle:'REAL-PICK'}},settle:80});
 const original=JSON.parse(JSON.stringify(a.c.state.saved));switches(a,true,true);
 a.d.querySelector('#simDirection').value='return';a.d.querySelector('#simDirection').dispatchEvent(new a.w.Event('change'));a.d.querySelector('#simPlay').click();
 assert.equal(a.c.state.saved.tubeRide,undefined);assert.equal(a.c.state.saved.tubePick,undefined);assert.equal(a.c.direction(),'home');
 a.d.querySelector('#simExit').click();await sleep(50);
 assert.deepEqual(JSON.parse(JSON.stringify(a.c.state.saved.trip)),original.trip);assert.deepEqual(JSON.parse(JSON.stringify(a.c.state.saved.tubeRide)),original.tubeRide);
 await sleep(350);a.close();
});

test('feed-only switch immediately displays active synthetic data and its frozen clock',async()=>{
 const a=await createApp({settle:80});switches(a,false,true);
 assert.equal(a.d.querySelector('#simBar').hidden,false);
 assert.match(a.text('#simClockMode'),/Virtual clock: frozen/);
 assert.match(a.text('#simTime'),/2026-11-03T08:44/);
 a.d.querySelector('#simExit').click();assert.equal(a.d.querySelector('#simBar').hidden,true);assert.equal(a.c.simClock.active,false);
 await sleep(350);a.close();
});
