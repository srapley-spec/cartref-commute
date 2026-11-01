// Independent review: the shared journey facts survive the whole selected trip,
// while the engine's arrival/next-action priority replaces the origin deadline.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,closeAll,sleep} from './harness.mjs';
import {TRIP_SETTINGS,tripRoute,planBrightonCanterbury,until} from './trip-fixtures.mjs';
after(closeAll);

test('Trip shared UI review: Follow retains canonical duration facts through access, rides, changes and the final leg',async()=>{
 const a=await createApp({now:Date.parse('2026-11-03T10:00:00Z'),settings:TRIP_SETTINGS,route:tripRoute});
 await planBrightonCanterbury(a);
 a.d.querySelector('.trip-recommendations [data-trip-follow]').click();
 await until(()=>a.d.querySelector('[data-trip-stop]'));
 const original=a.c.state.saved.tripMode.follow,id=original.id;
 const total=original.journey.arrive-original.journey.leave;
 for(const [time,view] of [['10:00','trip-follow'],['10:03','trip-access'],['10:07','trip-ride'],['10:25','trip-change'],['12:40','trip-final']]){
  a.setNow(Date.parse(`2026-11-03T${time}:00Z`));
  a.d.querySelector('#refreshBtn').click();await sleep(350);
  assert.equal(a.d.querySelector('#tripResults').dataset.view,view);
  const card=a.d.querySelector('.trip-follow-card');assert.ok(card);
  assert.equal(card.querySelectorAll('.journey-facts').length,1,view+': same journey facts stay exposed');
  assert.equal(Number(card.querySelector('[data-fact="total-duration"]').dataset.ms),total,view+': total is the original journey, never time remaining');
  assert.equal(Number(card.querySelector('[data-fact="train-duration"]').dataset.ms),127*60000,view+': preserve the complete canonical rail duration');
  for(const fact of card.querySelectorAll('.journey-facts,.journey-total-time,.journey-train-time')){
   for(let n=fact;n;n=n.parentElement){
    assert.ok(!n.hidden&&a.w.getComputedStyle(n).display!=='none','facts are exposed');
    assert.ok(n.tagName!=='DETAILS'||n.open,'facts cannot require opening steps');
   }
  }
  if(view!=='trip-follow'){
   assert.equal(card.querySelector('.journey-heading'),null,'do not restart an access deadline once underway');
   const headline=card.querySelector('.trip-headline');
   assert.match(headline.querySelector('b').textContent,/Arriving 12:50/,'arrival remains the leading active answer');
   assert.ok(headline.textContent.indexOf('Arriving')<headline.textContent.indexOf('Total journey'),'facts follow the active answer');
  }
  assert.equal(a.c.state.saved.tripMode.follow.id,id,'phase changes preserve the selected itinerary');
  assert.ok(card.querySelector('[data-trip-stop]'));
 }
 assert.equal(a.d.querySelector('.trip-follow-connections'),null,'the final walk does not advertise completed trains');
 assert.deepEqual(a.errors,[]);a.close();
});
