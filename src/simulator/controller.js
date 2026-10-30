// Developer-only journey simulator. Shared engine remains unaware of simulation.
// Dependency injection keeps this module independent from the web shell's lexical state.
function createJourneySimulator({state,S,onPosition,locate,render,refresh,navigator,document}) {
// ---------- Developer journey simulator (real clock and feeds) ----------
const sim = { active:false, timer:null, baseline:null, index:0, elapsed:0, watchGeneration:0 };
// Route templates are illustrative. Checkpoints are explicit test states, not live service timings.
const SIM_POINTS = {
 home:[51.975,-0.23],let:[51.98002,-0.22909],north:[51.9017,-0.2071],
 approach:[51.5646,-0.1063],kgx:[51.53197,-0.12341],stp:[51.53062,-0.12594],
 far:[51.52036,-0.10514], farTube:[51.5205,-0.1053], kxTube:[51.5307,-0.1237],
 barbican:[51.5201,-0.0973],ald:[51.5142,-0.0755],officeWalk:[51.5140,-0.0733],office:[51.5139,-0.071]
};
const SIM_ROUTES = {
 kgx:[
  ["home","Home",0],["let","Letchworth Garden City station",16],
  ["north","On Great Northern train (Stevenage)",27],["approach","Approaching King's Cross",43],
  ["kgx","Alight at King's Cross",49],["kxTube","Walk to King's Cross St Pancras Underground",55],
  ["barbican","Metropolitan line — Barbican (GPS-visible section)",64],
  ["ald","Alight at Aldgate",70],["officeWalk","Walking from Aldgate",74],["office","Office",78]
 ],
 far:[
  ["home","Home",0],["let","Letchworth Garden City station",16],
  ["north","On Thameslink train (Stevenage)",27],["approach","Approaching London / St Pancras",43],
  ["stp","On train at St Pancras",49],["far","Alight at Farringdon",54],
  ["farTube","Walk to Circle/H&C/Met platforms",58],
  ["barbican","Underground — Barbican (GPS-visible section)",64],
  ["ald","Alight at Aldgate",70],["officeWalk","Walking from Aldgate",74],["office","Office",78]
 ]
};
function simRoute(){
 const key=document.getElementById("simPath").value==="far"?"far":"kgx";
 const raw=SIM_ROUTES[key].map(([point,label,at])=>({point,label,at}));
 if(document.getElementById("simDirection").value!=="return")return raw;
 const end=raw[raw.length-1].at;
 return raw.reverse().map(p=>({...p,at:end-p.at,label:p.label}));
}
function simWaypoint(){
 const route=simRoute(),index=Math.min(sim.index,route.length-1),p=route[index];
 simStatus("Paused at "+p.label+" ("+(index+1)+"/"+route.length+"). Press Continue to next waypoint.");
 const label=document.getElementById("simCheckpoint");if(label)label.textContent=p.label+" · "+(index+1)+"/"+route.length;
}
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
 const route=simRoute(),speed=Number(document.getElementById("simSpeed").value)||1;
 const next=route[Math.min(sim.index+1,route.length-1)];
 sim.elapsed=Math.min(next.at,sim.elapsed+speed/60);
 const current=route[sim.index], start=SIM_POINTS[current.point],end=SIM_POINTS[next.point];
 const duration=Math.max(0.001,next.at-current.at), f=Math.min(1,Math.max(0,(sim.elapsed-current.at)/duration));
 simFix(start[0]+(end[0]-start[0])*f,start[1]+(end[1]-start[1])*f,null);
 if(sim.elapsed>=next.at){
   simStopTimer();sim.index++;
   simFix(...SIM_POINTS[next.point]);
   simWaypoint();
 }
}
function simContinue(){
 const route=simRoute();
 if(!sim.active || !sim.index && !state.here){
   simStopTimer();simStart();simResetContext();sim.elapsed=0;sim.index=0;
   simFix(...SIM_POINTS[route[0].point]);simWaypoint();return;
 }
 if(sim.index>=route.length-1){simStatus("Journey complete. Press Restart to repeat.");return;}
 simStopTimer();sim.timer=setInterval(simTick,1000);
 simStatus("Moving towards "+route[sim.index+1].label+" at "+document.getElementById("simSpeed").value+"×");
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
    simStopTimer();simStart();simResetContext();sim.elapsed=0;sim.index=0;simFix(...SIM_POINTS[simRoute()[0].point]);simWaypoint();
  });
  for(const id of ["simDirection","simPath"])document.getElementById(id).addEventListener("change",()=>{simStopTimer();sim.elapsed=0;sim.index=0;if(sim.active)simResetContext();simStatus("Route changed. Press Restart.");});
  document.getElementById("simContinue").addEventListener("click",simContinue);
  document.getElementById("simPause").addEventListener("click",()=>{simStopTimer();simStatus("Paused");});
  document.getElementById("simClear").addEventListener("click",()=>{simStopTimer();simStart();simResetContext();sim.index=0;sim.elapsed=0;render();simStatus("Journey context cleared");});
  document.getElementById("simExit").addEventListener("click",simStop);
}


return {sim,simSetup,simStop};
}
