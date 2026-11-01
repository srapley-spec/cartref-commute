// Independent probes for the Trip controls hosted in Signal's existing disclosure.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,sleep} from './harness.mjs';
import {TRIP_SETTINGS,TRIP_PLACES,stubGoogle,tripRoute,planBrightonCanterbury,until} from './trip-fixtures.mjs';
after(closeAll);
const NOW=Date.parse('2026-11-03T10:00:00Z');

test('Trip controls review: theme redraw preserves the original field, typed query, caret and keyboard suggestions',async()=>{
 const a=await createApp({now:NOW,settings:TRIP_SETTINGS,route:tripRoute});
 await planBrightonCanterbury(a);
 const form=a.d.querySelector('#tripForm'),field=a.d.querySelector('#tripInput-to');
 field.focus();field.value='canterbury';field.setSelectionRange(3,6);
 field.dispatchEvent(new a.w.Event('input',{bubbles:true}));
 a.c.state.saved.settings.appearance='dark';a.c.render();
 assert.equal(a.d.querySelector('#tripForm'),form,'the shared host contains the original form');
 assert.equal(a.d.querySelector('#tripInput-to'),field);
 assert.equal(a.d.activeElement,field,'redraw cannot blur the field being edited');
 assert.equal(field.value,'canterbury');
 assert.deepEqual([field.selectionStart,field.selectionEnd],[3,6]);
 await sleep(320);
 const list=a.d.querySelector('#tripList-to');assert.equal(list.hidden,false);
 assert.match(list.textContent,/Canterbury Cathedral/);
 for(const key of ['ArrowDown','Enter'])field.dispatchEvent(new a.w.KeyboardEvent('keydown',{key,bubbles:true}));
 await until(()=>field.value==='Canterbury Cathedral');
 assert.equal(field.value,'Canterbury Cathedral','the same keyboard handlers still select a place');
 await sleep(200);
 assert.deepEqual(a.errors,[]);a.close();
});

test('Trip controls review: a late place reply cannot replace commute context after leaving Trip',async()=>{
 let release;let entered=false;
 const gate=new Promise(resolve=>{release=resolve;});
 const a=await createApp({now:NOW,settings:TRIP_SETTINGS,route:tripRoute});
 const label=a.text('#routeLabel'),context=a.text('#signalContextSummary');
 stubGoogle(a.w);
 const importLibrary=a.w.google.maps.importLibrary;
 a.w.google.maps.importLibrary=async name=>{
  const lib=await importLibrary(name);
  if(name!=='places')return lib;
  const Place=lib.Place;
  return {...lib,Place:class extends Place {async fetchFields(...args){if(this.id==='G-CAT'){entered=true;await gate;}return super.fetchFields(...args);}}};
 };
 a.d.querySelector('#tripModeBtn').click();await sleep(50);
 const input=a.d.querySelector('#tripInput-to');input.value='canterbury';input.dispatchEvent(new a.w.Event('input',{bubbles:true}));
 await sleep(320);
 for(const key of ['ArrowDown','Enter'])input.dispatchEvent(new a.w.KeyboardEvent('keydown',{key,bubbles:true}));
 await until(()=>entered);assert.ok(entered,'the Google place reply is still pending');
 a.d.querySelector('[data-mode="commute"]').click();await sleep(450);
 assert.equal(a.text('#routeLabel'),label);
 assert.equal(a.text('#signalContextSummary'),context);
 release();
 await until(()=>a.d.querySelector('#tripResults [role="alert"]'));
 assert.ok(a.d.querySelector('#tripResults [role="alert"]'),'the obsolete place reply reaches the hidden Trip error renderer');
 await sleep(100);
 assert.equal(a.text('#routeLabel'),label,'the late Trip renderer cannot rename the commute');
 assert.equal(a.text('#signalContextSummary'),context);
 assert.equal(a.d.querySelector('#signalAdjustments #tripForm'),null);
 assert.equal(a.d.querySelector('#tripRoot').hidden,true);
 assert.deepEqual(a.errors,[]);a.close();
});

test('Trip controls review: a saved active Trip mounts in the shared host before its first refresh',async()=>{
 for(const simulatedFeeds of [false,true]){
  const saved={tripMode:{active:true,from:{...TRIP_PLACES.brighton,name:'Brighton Station',kind:'address'},to:{...TRIP_PLACES.cathedral,name:'Canterbury Cathedral',kind:'address'},modes:{from:'walk',to:'walk'},question:{kind:'now',t:0},recent:[],follow:null}};
  const a=await createApp({now:NOW,settings:{...TRIP_SETTINGS,googleKey:'',simulatedFeeds},saved,route:tripRoute});
  assert.ok(a.d.querySelector('#signalAdjustments #tripForm'),'host must exist when the saved Trip first constructs its UI');
  assert.equal(a.d.querySelector('#tripInput-from').value,'Brighton Station');
  assert.equal(a.d.querySelector('[aria-label="Trip question"]').closest('details'),null);
  assert.deepEqual(a.errors,[]);a.close();
 }
});

test('Trip controls review: disabling Trip removes its controls and re-enabling keeps the same field handlers and places',async()=>{
 const a=await createApp({now:NOW,settings:TRIP_SETTINGS,route:tripRoute});
 const label=a.text('#routeLabel'),context=a.text('#signalContextSummary');
 await planBrightonCanterbury(a);
 const form=a.d.querySelector('#tripForm'),from=a.d.querySelector('#tripInput-from'),to=a.d.querySelector('#tripInput-to');
 a.c.state.saved.settings.trip=false;a.c.render();await sleep(400);
 assert.equal(a.d.documentElement.dataset.trip,'off');
 assert.equal(a.d.querySelector('#signalAdjustments #tripForm'),null);
 assert.equal(form.parentElement.id,'tripRoot');
 assert.equal(a.d.querySelector('#tripRoot').hidden,true);
 assert.equal(a.text('#routeLabel'),label);assert.equal(a.text('#signalContextSummary'),context);
 a.c.state.saved.settings.trip=true;a.c.render();
 assert.equal(a.d.querySelector('#signalAdjustments #tripForm'),form);
 assert.equal(a.d.querySelector('#tripInput-from'),from);assert.equal(a.d.querySelector('#tripInput-to'),to);
 assert.equal(from.value,'Brighton Station');assert.equal(to.value,'Canterbury Cathedral');
 const mode=a.d.querySelector('[data-trip-mode="from:cycle"]');mode.click();
 assert.equal(mode.getAttribute('aria-pressed'),'true','original mode handlers remain attached');
 await sleep(250);
 assert.deepEqual(a.errors,[]);a.close();
});
