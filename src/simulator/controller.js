// Developer-only journey simulator. Shared engine remains unaware of simulation.
// Dependency injection keeps this module independent from the web shell's lexical state.
function createJourneySimulator({state,S,onPosition,locate,render,refresh,navigator,document}) {
// ---------- Developer journey simulator (real clock and feeds) ----------
const sim = { active:false, timer:null, baseline:null, index:0, elapsed:0, watchGeneration:0 };
// These are illustrative route waypoints, NOT a claimed track-level alignment.
const SIM_POINTS = {
  home:[51.975,-0.23],let:[51.98002,-0.22909],kgx:[51.53197,-0.12341],
  far:[51.52036,-0.10514],ald:[51.5153,-0.0727],office:[51.5151,-0.072]
};
const SIM_ROUTE = [
  {at:0,point:"home"}, {at:16,point:"let"}, {at:38,point:"kgx"},
  {at:46,point:"far"}, {at:56,point:"ald"}, {at:64,point:"office"}
]; // Minutes are example timings, not a validated service itinerary.
function simRoute(){ const forward=document.getElementById("simDirection").value!=="return"; return forward?SIM_ROUTE:SIM_ROUTE.slice().reverse().map(p=>({at:64-p.at,point:p.point})); }
function simStopTimer(){ if(sim.timer!=null) clearInterval(sim.timer); sim.timer=null; }
function simStatus(message){ const e=document.getElementById("simStatus"); if(e)e.textContent=message; }
function simResetContext(){
  state.autoDir=null;state.autoSrc="";state.atHub=null;state.hubSince=null;state.lastAwayAt=null;
  state.lastHub=null;state.inLondon=false;state.onLine=false;state.lineTrack=null;state.trainLock=null;
  state.tube=null;state.lastFixAt=null;state.lastFixRecvAt=null;state.here=null;
  state.boards=null;state.boardsDir=null;state.fetchedAt=null;state.london=null;
  state.byCache={};state.atCache={};
}
function simStart(){
  if(!S().simulatorEnabled)return;
  if(sim.active)return;
  sim.baseline=JSON.parse(JSON.stringify(state.saved));
  sim.active=true;sim.watchGeneration++;
  if(state.watchId!=null){try{navigator.geolocation.clearWatch(state.watchId);}catch(e){}state.watchId=null;}
  simResetContext();
  document.getElementById("simBar").hidden=false;
  simStatus("Simulation active. Nothing is saved to your normal journey context.");
}
function simFix(lat,lon,speed=0){
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){simStatus("Invalid coordinates");return;}
  simStart();
  const p={coords:{latitude:lat,longitude:lon,accuracy:12,speed},timestamp:Date.now()};
  document.getElementById("simLat").value=String(lat);
  document.getElementById("simLon").value=String(lon);
  onPosition(p); // Always enter via the app's real GPS handler and engine.
  simStatus(lat.toFixed(5)+", "+lon.toFixed(5)+" · real clock / live feeds");
}
function simStop(){
  simStopTimer();if(!sim.active)return;
  sim.active=false;sim.watchGeneration++;
  state.saved=sim.baseline;sim.baseline=null;
  simResetContext();
  document.getElementById("simBar").hidden=true;
  state.locStatus="pending";
  locate();render();refresh({force:true});
  simStatus("Stopped; real GPS resumed, saved context restored.");
}
function simTick(){
  const speed=Number(document.getElementById("simSpeed").value)||1;
  const route=simRoute(), end=route[route.length-1].at;
  sim.elapsed=Math.min(end,sim.elapsed+speed/60);
  let a=route[0],b=route[1];
  for(let i=1;i<route.length;i++){
    if(sim.elapsed<=route[i].at){a=route[i-1];b=route[i];break;}
  }
  if(sim.elapsed>=end){a=route[route.length-2];b=route[route.length-1];}
  const frac=Math.max(0,Math.min(1,(sim.elapsed-a.at)/(b.at-a.at)));
  const p=SIM_POINTS[a.point],q=SIM_POINTS[b.point];
  // Speed is null: interpolation is only approximate and must not claim measured velocity.
  simFix(p[0]+(q[0]-p[0])*frac,p[1]+(q[1]-p[1])*frac,null);
  if(sim.elapsed>=end){simStopTimer();simStatus("Playback finished. Simulation remains active.");}
}
function simSetup(){
  // Intentional opt-in on a development preview. This is a UI gate, not authentication.
  document.getElementById("simPanel").hidden=!S().simulatorEnabled;
  document.getElementById("simJump").addEventListener("click",()=>{
    simStopTimer();const p=SIM_POINTS[document.getElementById("simPreset").value];if(p)simFix(...p);
  });
  document.getElementById("simApply").addEventListener("click",()=>{
    simStopTimer();simFix(Number(document.getElementById("simLat").value),Number(document.getElementById("simLon").value));
  });
  document.getElementById("simPlay").addEventListener("click",()=>{
    simStopTimer();simStart();simResetContext();sim.elapsed=0;const p=SIM_POINTS[simRoute()[0].point];simFix(...p);
    sim.timer=setInterval(simTick,1000);
  });
  document.getElementById("simDirection").addEventListener("change",()=>{simStopTimer();sim.elapsed=0;simStatus("Direction changed. Press Play journey.");});
  document.getElementById("simPause").addEventListener("click",()=>{simStopTimer();simStatus("Paused");});
  document.getElementById("simClear").addEventListener("click",()=>{simStopTimer();simStart();simResetContext();render();simStatus("Journey context cleared");});
  document.getElementById("simExit").addEventListener("click",simStop);
}


return {sim,simSetup,simStop};
}
