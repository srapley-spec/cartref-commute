// Simulator orchestration. GPS enters the normal browser-position handler; no train identity is injected.
function createJourneySimulator({state,S,onPosition,onPositionError,locate,render,refresh,navigator,document,clock,invalidateSources=()=>{},onStop=()=>{}}) {
const $=id=>document.getElementById(id);
const sim={active:false,timer:null,baseline:null,index:0,elapsed:0,watchGeneration:0,startTime:null};
const {points,routes,railLine}=createJourneySimulationScenarioDefinitions();
const gps=createSimulatedGPSProvider({now:()=>clock.now(),onPosition});
function getScenario(){return {route:$("simPath").value,direction:$("simDirection").value,scenario:$("simScenario").value,startTime:sim.startTime??startTime()};}
function startTime(){return Date.parse($("simDate").value+'Z');}
function route(){const c=getScenario(),raw=routes[c.direction+'-'+c.route];let boarded=false;
 const shift=['later-train','wrong-train','cancellation'].includes(c.scenario)?(c.route==='far'?15:c.direction==='return'?10:12):c.scenario==='delay'?8:0;
 let tubeBoarded=false;
 return raw.map(([point,label,at,mode])=>{if(mode==='rail')boarded=true;if(mode==='tube')tubeBoarded=true;
 const tubeShift=c.scenario==='missed-connection'?6:c.scenario==='disruption'?5:0;
 let adjustment=boarded?shift:0;
 if(tubeShift&&tubeBoarded){if(c.direction==='return'&&boarded)adjustment=c.route==='far'?15:10;else adjustment+=tubeShift;}
 return {point,label,at:at+adjustment,mode};});}
function status(message){$("simStatus").textContent=message;updateTime();}
function setPanelVisible(visible){
 $("simPanel").hidden=!visible;$("simToggle").textContent=visible?'Hide controls':'Show controls';$("simToggle").setAttribute('aria-expanded',String(visible));
}
function updateTime(){
 const enabled=!!(S().simulatorEnabled||S().simulatedFeeds);
 document.body.classList.toggle('simControlsVisible',enabled);
 const activity=sim.active||S().simulatedFeeds?'Simulation active':'Simulator ready';
 if($("simActivity").textContent!==activity)$("simActivity").textContent=activity;
 $("simPlay").textContent=sim.startTime===null?'Start':'Restart';
 $("simAdvance").textContent=sim.timer!==null?'Pause':sim.startTime===null?'Start':sim.index>=route().length-1?'Restart':'Continue';
 const c=getScenario();$("simTime").textContent=(S().simulatedFeeds?new Date(clock.now()).toISOString():'Device clock (GPS only)')+' · '+c.scenario;$("simClockMode").textContent=S().simulatedFeeds?'Virtual clock: frozen when paused. Real GPS remains real when GPS Simulation is off.':'Live feeds: device time is used. Playback speeds move GPS only; service timing stays live.';}
function stopTimer(){if(sim.timer!==null)clearInterval(sim.timer);sim.timer=null;}
function resetContext(preserveLiveLocation=!S().simulatorEnabled){
 invalidateSources();
 const liveFix=preserveLiveLocation?{here:state.here,lastFixAt:state.lastFixAt,lastFixRecvAt:state.lastFixRecvAt,autoDir:state.autoDir,autoSrc:state.autoSrc,atHub:state.atHub}:null;
 for(const key of ['autoDir','atHub','hubSince','lastAwayAt','lastHub','lineTrack','trainLock','tube','lastFixAt','lastFixRecvAt','here','boards','boardsDir','fetchedAt','london'])state[key]=null;
 state.autoSrc='';if(!liveFix)state.locStatus='pending';state.inLondon=false;state.onLine=false;state.byCache={};state.atCache={};if(liveFix)Object.assign(state,liveFix);
}
function clearJourneyMemory(){for(const key of ['trip','officeVisit','officeSince','officeNearSince','tubeRide','tubePick','hubSince','aldHome','lastHub'])delete state.saved[key];}
function start(){if(!S().simulatorEnabled&&!S().simulatedFeeds)return false;if(sim.active)return true;
 sim.baseline=JSON.parse(JSON.stringify(state.saved));
 const home=sim.baseline.home;
 if(Array.isArray(home)&&home.length===2&&home.every(Number.isFinite)&&Math.abs(home[0])<=90&&Math.abs(home[1])<=180){
  points.home=home.slice();points.walk=[(home[0]+points.let[0])/2,(home[1]+points.let[1])/2];
  points.nearHome=[home[0]+(points.let[0]-home[0])*.25,home[1]+(points.let[1]-home[1])*.25];
 }sim.active=true;if(S().simulatorEnabled)sim.watchGeneration++;
 if(S().simulatorEnabled&&state.watchId!=null){try{navigator.geolocation.clearWatch(state.watchId);}catch(e){}state.watchId=null;}
 clearJourneyMemory();resetContext();$("simBar").hidden=false;return true;
}
function syncClock(){if(S().simulatedFeeds){if(!clock.active)clock.start(new Date(sim.startTime).toISOString());clock.set(sim.startTime+sim.elapsed*60000);}updateTime();}
function accuracy(p){const mode=$("simAccuracyMode").value;if(mode==='manual')return Number($("simAccuracy").value);
 if(mode==='poor'||getScenario().scenario==='low-accuracy')return p.mode==='rail'?([180,800,1400][sim.index%3]):['home','office'].includes(p.point)?650:350;
 return p.mode==='rail'?45:12;}
function fix(lat,lon,speed=0,acc=Number($("simAccuracy").value)){
 if(!S().simulatorEnabled)return;
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||!Number.isFinite(acc)||acc<0){status('Invalid coordinates or accuracy');return;}
 if(!start())return;
 $("simLat").value=String(lat);$("simLon").value=String(lon);
 gps.emit(lat,lon,acc,speed);
 $("simFixStatus").textContent=`GPS ${lat.toFixed(5)}, ${lon.toFixed(5)} ±${acc} m`;
}
function emit(p,speed=0){const scenario=getScenario().scenario;
 if(scenario==='uncertain'&&p.mode==='rail'&&p.point!=='north'&&!route().slice(0,sim.index).some(x=>x.point==='north')){$("simFixStatus").textContent='Train: GPS unavailable until Stevenage';return;}
 if(scenario==='awaiting-location'||scenario==='permission-denied'){
 if(S().simulatorEnabled){state.here=null;state.autoDir=null;if(scenario==='permission-denied'&&onPositionError)onPositionError({code:1});else {state.locStatus='pending';state.autoSrc='finding your location…';render();}}
 $("simFixStatus").textContent=scenario==='permission-denied'?'Location permission denied':'Awaiting location';return;}
 if(p.mode==='tube'&&p.point!=='barbican'&&(scenario==='gps-loss'||scenario==='normal'||scenario==='low-accuracy')){
 if(S().simulatorEnabled&&onPositionError)onPositionError({code:2});$("simFixStatus").textContent='Underground: no usable GPS fix';return;}
 fix(...points[p.point],speed,accuracy(p));
}
function checkpoint(){const r=route(),p=r[sim.index];$("simCheckpoint").textContent=`${p.label} · ${sim.index+1}/${r.length}`;$("simNext").textContent=r[sim.index+1]?.label||'Journey complete';status('Paused at '+p.label+'. Press Continue to next waypoint.');}
function restart(){stopTimer();if(!start())return;const t=startTime();if(!Number.isFinite(t)){status('Invalid start date/time');return;}sim.startTime=t;sim.elapsed=0;sim.index=0;clearJourneyMemory();resetContext();syncClock();emit(route()[0]);checkpoint();refresh({force:true});}
// Follow the same approximate corridor as the profile rather than cutting across the bends.
function tick(){const r=route(),p=r[sim.index],next=r[sim.index+1];if(!next){stopTimer();return;}
 const speed=Number($("simSpeed").value)||1;sim.elapsed=Math.min(next.at,sim.elapsed+speed/60);syncClock();
 const a=points[p.point],b=points[next.point],f=(sim.elapsed-p.at)/Math.max(.001,next.at-p.at);
 // Rail travel uses explicit speed evidence. Tube travel withholds GPS except at exposed sections.
 if(getScenario().scenario==='uncertain'&&next.mode==='rail'&&!route().slice(0,sim.index+1).some(x=>x.point==='north')&&f<1){$("simFixStatus").textContent='Train: GPS unavailable until Stevenage';}
 else if((next.mode==='tube'||p.mode==='tube')&&f<1&&!(getScenario().scenario==='missed-connection'&&next.label.startsWith('Board')&&p.mode!=='tube')){if(S().simulatorEnabled&&onPositionError)onPositionError({code:2});$("simFixStatus").textContent='Underground: no usable GPS fix';}
 else if(!['awaiting-location','permission-denied'].includes(getScenario().scenario))fix(...interpolateSimulatedPosition(a,b,f,next.mode==='rail',railLine),next.mode==='rail'?25:1.4,accuracy(next));
 if(sim.elapsed>=next.at){stopTimer();sim.index++;emit(next,next.mode==='rail'?25:0);checkpoint();refresh({force:true});}
}
function continuePlayback(){if(!sim.active||sim.startTime===null){restart();return;}if(sim.index>=route().length-1){status('Journey complete. Press Restart.');return;}stopTimer();sim.timer=setInterval(tick,1000);status('Moving towards '+route()[sim.index+1].label+' at '+$("simSpeed").value+'×');}
function simStop({resume=true}={}){stopTimer();if(!sim.active&&!S().simulatedFeeds)return;sim.active=false;sim.watchGeneration++;if(sim.baseline)state.saved=sim.baseline;sim.baseline=null;sim.startTime=null;clock.stop();onStop();resetContext(false);$("simBar").hidden=true;state.locStatus='pending';if(resume){locate();render();refresh({force:true});}status('Stopped; real GPS resumed, saved context restored.');}
function simSetup(){
 setPanelVisible(!!(S().simulatorEnabled||S().simulatedFeeds));
 $("simBar").hidden=!S().simulatorEnabled&&!S().simulatedFeeds;
 $("simToggle").addEventListener('click',()=>setPanelVisible($("simPanel").hidden));
 $("simAdvance").addEventListener('click',()=>{if(sim.timer!==null){stopTimer();status('Paused');}else if(sim.startTime!==null&&sim.index>=route().length-1){restart();}else continuePlayback();});
 $("simPlay").addEventListener('click',restart);$("simContinue").addEventListener('click',continuePlayback);$("simPause").addEventListener('click',()=>{stopTimer();status('Paused');});$("simExit").addEventListener('click',simStop);
 $("simJump").addEventListener('click',()=>{stopTimer();const p=points[$("simPreset").value];if(p)fix(...p);status('Manual GPS fix applied');});
 $("simApply").addEventListener('click',()=>{stopTimer();fix(Number($("simLat").value),Number($("simLon").value));});
 $("simClear").addEventListener('click',()=>{stopTimer();if(start()){const t=startTime();if(!Number.isFinite(t)){status('Invalid start date/time');return;}sim.startTime=t;clearJourneyMemory();resetContext();sim.index=0;sim.elapsed=0;syncClock();render();status('Journey context cleared');}});
 for(const id of ['simDirection','simPath','simScenario','simDate'])$(id).addEventListener('change',()=>{stopTimer();if(id==='simDirection')$("simDate").value=$("simDirection").value==='return'?'2026-11-03T15:44':'2026-11-03T08:44';sim.startTime=null;sim.index=0;sim.elapsed=0;status('Selection changed. Press Restart.');});
 updateTime();
}
return {sim,simSetup,simStop,getScenario,route,tick,restart,resetContext,updateTime,setPanelVisible};
}
