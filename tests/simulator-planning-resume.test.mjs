// The same normal location dispatcher restores a real Leave-around question after simulation.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createApp, closeAll, sleep} from './harness.mjs';
after(closeAll);

test('Leave around plans the actual requested time when the first location arrives after initial loading',async()=>{
 const a=await createApp({settings:{provider:'tfl'},saved:{view:'at',atTime:'17:40'},geoDelay:'manual',settle:120});
 assert.equal(a.c.state.autoDir,null);assert.ok(!a.c.state.at,'location is genuinely pending');
 const expected=new Date(`${a.d.querySelector('#byDate').value}T${a.d.querySelector('#byTime').value}:00`).getTime();
 a.giveLocation();const deadline=performance.now()+6000;
 while(!(a.c.state.at?.T===expected&&!a.c.state.at.loading&&!a.c.state.loading)){
  assert.ok(performance.now()<deadline,'normal location delivery resumes the selected Leave-around planner');await sleep(10);
 }
 assert.equal(a.c.state.saved.view,'at');assert.equal(a.c.state.at.T,expected);
 assert.match(a.text('#hero'),/Leaving around 17:40/);assert.deepEqual(a.errors,[]);
});
