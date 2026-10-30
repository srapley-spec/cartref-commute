import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createApp, closeAll } from "./harness.mjs";
after(closeAll);

test("developer simulator defaults off and toggles from Settings", async () => {
  const app = await createApp({ settle: 120 });
  const d = app.d, w = app.w;
  assert.equal(d.querySelector("#simPanel").hidden, true);
  assert.equal(d.querySelector("#s_simulator").checked, false);
  d.querySelector("#settingsBtn").click();
  d.querySelector("#s_simulator").checked = true;
  d.querySelector("#settingsForm").dispatchEvent(new w.Event("submit", {bubbles:true,cancelable:true}));
  assert.equal(d.querySelector("#simPanel").hidden, false);
  assert.equal(app.c.S().simulatorEnabled, true);
  d.querySelector("#simPreset").value = "far";
  d.querySelector("#simJump").click();
  assert.equal(d.querySelector("#simBar").hidden, false);
  assert.ok(app.c.state.here && Math.abs(app.c.state.here[0]-51.52036)<0.0001);
  d.querySelector("#settingsBtn").click();
  d.querySelector("#s_simulator").checked = false;
  d.querySelector("#settingsForm").dispatchEvent(new w.Event("submit", {bubbles:true,cancelable:true}));
  assert.equal(d.querySelector("#simPanel").hidden, true);
  assert.equal(d.querySelector("#simBar").hidden, true);
  assert.equal(app.c.S().simulatorEnabled, false);
  assert.equal(app.c.state.here, null);
});
test("simulated fixes do not overwrite persisted journey context",async ()=>{
  const app=await createApp({settle:120});
  const d=app.d,w=app.w;
  d.querySelector("#settingsBtn").click();
  d.querySelector("#s_simulator").checked=true;
  d.querySelector("#settingsForm").dispatchEvent(new w.Event("submit",{bubbles:true,cancelable:true}));
  const baseline=w.localStorage.getItem("cartrefCommute.v1");
  d.querySelector("#simPreset").value="far";
  d.querySelector("#simJump").click();
  assert.equal(w.localStorage.getItem("cartrefCommute.v1"),baseline);
  d.querySelector("#simExit").click();
  assert.equal(w.localStorage.getItem("cartrefCommute.v1"),baseline);
});


test("playback starts at the selected end and supports multiple speeds", async () => {
  const app=await createApp({settle:120});
  const d=app.d,w=app.w;
  d.querySelector("#settingsBtn").click();
  d.querySelector("#s_simulator").checked=true;
  d.querySelector("#settingsForm").dispatchEvent(new w.Event("submit",{bubbles:true,cancelable:true}));
  const direction=d.querySelector("#simDirection");
  const speed=d.querySelector("#simSpeed");
  const play=d.querySelector("#simPlay");
  const pause=d.querySelector("#simPause");
  for(const [mode,lat] of [["outbound",51.975],["return",51.5151]]){
    direction.value=mode;
    for(const value of ["1","5","20"]){
      speed.value=value;
      play.click();
      assert.ok(Math.abs(app.c.state.here[0]-lat)<0.0001,mode+" start at "+value+"x");
      assert.equal(d.querySelector("#simBar").hidden,false);
      pause.click();
    }
  }
  d.querySelector("#simExit").click();
  assert.equal(d.querySelector("#simBar").hidden,true);
});

test("each route and direction starts paused at first checkpoint",async()=>{
 const app=await createApp({settle:120});
 const d=app.d,w=app.w;
 d.querySelector("#settingsBtn").click();
 d.querySelector("#s_simulator").checked=true;
 d.querySelector("#settingsForm").dispatchEvent(new w.Event("submit",{bubbles:true,cancelable:true}));
 for(const route of ["kgx","far"])for(const direction of ["outbound","return"]){
   d.querySelector("#simPath").value=route;
   d.querySelector("#simDirection").value=direction;
   d.querySelector("#simPlay").click();
   assert.match(d.querySelector("#simStatus").textContent,/Paused at/);
   assert.equal(d.querySelector("#simCheckpoint").textContent.includes("1/"),true);
   const expected=direction==="return"?51.5139:51.975;
   assert.ok(Math.abs(app.c.state.here[0]-expected)<0.0001);
   d.querySelector("#simPause").click();
 }
 d.querySelector("#simExit").click();
});
