import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const source=readFileSync(new URL("../src/simulator/clock.js",import.meta.url),"utf8");
const context=vm.createContext({Date});
vm.runInContext(source+";globalThis.createClock=createJourneySimulationClock;",context);
test("simulated clock freezes at waypoint and moves only when explicitly advanced",()=>{
 const c=context.createClock({NativeDate:Date});
 c.start("2026-11-03T08:44:00Z");
 assert.equal(c.now(),Date.parse("2026-11-03T08:44:00Z"));
 assert.equal(new c.ClockDate().getTime(),c.now());
 c.advance(16);
 assert.equal(c.now(),Date.parse("2026-11-03T09:00:00Z"));
 c.advance(5);
 assert.equal(c.now(),Date.parse("2026-11-03T09:05:00Z"));
 c.stop();
 assert.equal(c.active,false);
 assert.ok(Math.abs(c.now()-Date.now())<2000);
});
test("clock rejects invalid timestamps and cannot advance while stopped",()=>{
 const c=context.createClock({NativeDate:Date});
 assert.throws(()=>c.start("bad"));
 assert.throws(()=>c.advance(5));
 c.start("2026-11-03T09:00:00Z");
 assert.throws(()=>c.set(NaN));
});
