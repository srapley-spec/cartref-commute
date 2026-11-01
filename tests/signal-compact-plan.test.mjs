// Independent compact-Signal capability probes: explicit planning and live Tube selection.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,json} from './harness.mjs';
after(closeAll);
const NOW=Date.parse('2026-11-03T18:00:00Z'),MIN=60000;
function visibleThroughAncestors(node){
 for(let current=node;current;current=current.parentElement){
  if(current.hidden)return false;
  if(current.tagName==='DETAILS'&&!current.open&&current!==node)return false;
 }
 return true;
}
async function app(home=false){
 return createApp({now:NOW,geo:home?{coords:{latitude:51.5139,longitude:-.071,accuracy:10}}:undefined,
  settings:{provider:'demo',followRoute:true},saved:{dirMode:home?'home':'office'},
  route:u=>/940GZZLUALD\/Arrivals/.test(u)?json([4,10,16].map((minutes,index)=>({vehicleId:`circle-${index}`,lineId:'circle',platformName:'Westbound - Platform 1',destinationName:'Edgware Road (Circle Line) Underground Station',expectedArrival:new Date(NOW+minutes*MIN).toISOString(),timeToStation:minutes*60}))):undefined});
}
function follow(a){
 const button=a.d.querySelector('[data-follow]:not([disabled])');assert.ok(button,'a real catchable journey is available');button.click();
 return JSON.parse(JSON.stringify(a.c.state.saved.followRoute));
}

test('compact Plan: explicitly choosing Plan keeps its primary answer visible while following continues',async()=>{
 const a=await app(),chosen=follow(a),other=a.d.querySelector('#signalOtherJourneys');
 assert.equal(a.c.state.presentation.mode,'auto');
 assert.equal(other.open,false,'ordinary recommendations may start folded while following in Auto');
 a.d.querySelector('[data-journey-view="plan"]').click();
 assert.equal(a.c.state.presentation.mode,'plan');
 const hero=a.d.querySelector('#hero'),answer=hero.querySelector('.optrow');assert.ok(answer,'the actual planning answer exists');
 assert.equal(visibleThroughAncestors(answer),true,'an explicit Plan request must not leave its answer under a closed Other recommendations disclosure');
 assert.equal(hero.parentElement,other.parentElement,'the planning answer is in the primary column');
 assert.equal(a.d.querySelector('#followPanel').hidden,false,'the active journey and its important alerts remain available while planning');
 assert.equal(a.c.state.saved.followRoute.id,chosen.id);assert.equal(a.c.state.saved.followRoute.expectedArrival,chosen.expectedArrival);
 a.c.render();assert.equal(visibleThroughAncestors(a.d.querySelector('#hero .optrow')),true,'ordinary refresh cannot fold the requested answer away');
 assert.deepEqual(a.errors,[]);a.close();
});

test('compact Plan: live Tube choices remain outside folded recommendations and keep working while following',async()=>{
 const a=await app(true),chosen=follow(a),other=a.d.querySelector('#signalOtherJourneys');
 assert.equal(other.open,false,'the test exercises the genuinely folded following layout');
 const button=a.d.querySelector('#signalConnections [data-tubepick]');assert.ok(button,'live Tube choices are exposed independently of other recommendations');
 assert.equal(visibleThroughAncestors(button),true);
 assert.equal(other.contains(button),false,'a live boarding control cannot be concealed by the secondary-plan fold');
 const vehicle=button.dataset.tubepick.split('|')[3];button.click();
 assert.equal(a.c.state.saved.tubePick.vehicle,vehicle,'the existing live Tube handler remains attached to the moved control');
 assert.equal(a.c.state.saved.followRoute.id,chosen.id);
 a.d.querySelector('[data-journey-view="plan"]').click();
 assert.equal(a.c.state.presentation.mode,'plan');
 assert.equal(a.c.state.saved.tubePick.vehicle,vehicle,'manual planning preserves the current live selection');
 assert.equal(visibleThroughAncestors(a.d.querySelector('#hero .optrow')),true);
 assert.equal(a.d.querySelector('#followPanel').hidden,false);
 assert.deepEqual(a.errors,[]);a.close();
});
