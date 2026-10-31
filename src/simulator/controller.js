// Simulator orchestration. GPS enters the normal browser-position handler; no train identity is injected.
function createJourneySimulator({state,S,onPosition,onPositionError,locate,render,refresh,navigator,document,clock,invalidateSources=()=>{},onStop=()=>{}}) {
const $=id=>document.getElementById(id);
const sim={active:false,timer:null,baseline:null,index:0,elapsed:0,watchGeneration:0,startTime:null,config:null,pendingRestart:false,manualOverride:false,stepping:false,sessionId:0,verification:{current:null,results:[],pending:false}};
const listeners=new Set();let playbackGeneration=0;
const subscribe=fn=>{listeners.add(fn);return ()=>listeners.delete(fn);};
function notify(type,extra={}){for(const fn of [...listeners])fn({type,...extra});}
function getView(){const checkpoints=route(),config=getScenario(),summary=api.reporter?.summary()||null;
 const report=!sim.active&&summary?.finished?api.reporter.getReport():null;
 const historicalTimeline=report?{config:report.config,startTime:report.config.startTime,checkpoints:route(report.config),index:Math.max(-1,...report.checkpoints.map(item=>item.index)),results:report.checkpoints,reason:report.reason,finished:true}:null;
 return {historicalTimeline,diagnostics:api.diagnostics?.()||{},enabled:!!(S().simulatorEnabled||S().simulatedFeeds),active:sim.active,playing:sim.timer!==null||sim.stepping,stepping:sim.stepping,index:sim.index,elapsed:sim.elapsed,startTime:sim.startTime,clockNow:clock.now(),config,draftConfig:getDraftScenario(),sources:{gps:!!S().simulatorEnabled,feeds:!!S().simulatedFeeds},checkpoints,location:sim.manualOverride?'Manual location':(sim.timer!==null||sim.stepping)&&checkpoints[sim.index+1]?'Towards '+checkpoints[sim.index+1].label:checkpoints[Math.min(sim.index,checkpoints.length-1)]?.label,pendingRestart:sim.pendingRestart,manualOverride:sim.manualOverride,verification:sim.verification,summary,panelVisible:!$("simPanel").hidden};}

const {points,routes,railLine}=createJourneySimulationScenarioDefinitions();
const gps=createSimulatedGPSProvider({now:()=>clock.now(),onPosition});
function getDraftScenario(){return {route:$("simPath").value,direction:$("simDirection").value,scenario:$("simScenario").value,startTime:startTime()};}
function getScenario(){return sim.config?{...sim.config}:getDraftScenario();}
function startTime(){return Date.parse($("simDate").value+'Z');}
function route(configuration=getScenario()){const c=configuration,raw=routes[c.direction+'-'+c.route];let boarded=false;
 const shift=['later-train','wrong-train','cancellation'].includes(c.scenario)?(c.route==='far'?15:c.direction==='return'?10:12):c.scenario==='delay'?8:0;
 let tubeBoarded=false;
 return raw.map(([point,label,at,mode])=>{if(mode==='rail')boarded=true;if(mode==='tube')tubeBoarded=true;
 const tubeShift=c.scenario==='missed-connection'?6:c.scenario==='disruption'?5:0;
 let adjustment=boarded?shift:0;
 if(tubeShift&&tubeBoarded){if(c.direction==='return'&&boarded)adjustment=c.route==='far'?15:10;else adjustment+=tubeShift;}
 return {point,label,at:at+adjustment,mode};});}
function status(message){$("simStatus").textContent=message;updateTime();}
function setPanelVisible(visible){
 $("simPanel").hidden=!visible;$("simBar").hidden=!(visible||S().simulatorEnabled||S().simulatedFeeds);$("simToggle").textContent=visible?'Hide controls':'Show controls';$("simToggle").setAttribute('aria-expanded',String(visible));
 document.body.classList.toggle('simControlsVisible',visible||!!(S().simulatorEnabled||S().simulatedFeeds));notify('panel');
}
function updateTime(){
 const enabled=!!(S().simulatorEnabled||S().simulatedFeeds);
 document.body.classList.toggle('simControlsVisible',enabled||!$("simPanel").hidden);
 const activity=sim.active||S().simulatedFeeds?'Simulation active':'Simulator ready';
 if($("simActivity").textContent!==activity)$("simActivity").textContent=activity;
 $("simPlay").textContent=sim.startTime===null?'Start':'Restart';
 $("simAdvance").textContent=sim.timer!==null||sim.stepping?'Pause':sim.startTime===null?'Start':sim.index>=route().length-1?'Restart':'Continue';
 const c=getScenario();$("simTime").textContent=(S().simulatedFeeds?new Date(clock.now()).toISOString():'Device clock (GPS only)')+' · '+c.scenario;$("simClockMode").textContent=S().simulatedFeeds?'Virtual clock: frozen when paused. Real GPS remains real when GPS Simulation is off.':'Live feeds: device time is used. Playback speeds move GPS only; service timing stays live.';notify('frame');}
function stopTimer(){if(sim.timer!==null)clearInterval(sim.timer);sim.timer=null;sim.stepping=false;playbackGeneration++;}
function pause(){stopTimer();status('Paused');notify('pause');}
function resetContext(preserveLiveLocation=!S().simulatorEnabled){
 invalidateSources();
 const liveFix=preserveLiveLocation?{here:state.here,lastFixAt:state.lastFixAt,lastFixRecvAt:state.lastFixRecvAt,autoDir:state.autoDir,autoSrc:state.autoSrc,atHub:state.atHub}:null;
 for(const key of ['autoDir','atHub','hubSince','lastAwayAt','stopWatch','lastHub','lineTrack','trainLock','tube','lastFixAt','lastFixRecvAt','here','boards','boardsDir','fetchedAt','london','presentation','followUpdate','journeySituationKey','followTransport'])state[key]=null;
 state.autoSrc='';if(!liveFix)state.locStatus='pending';state.inLondon=false;state.onLine=false;state.byCache={};state.atCache={};if(liveFix)Object.assign(state,liveFix);
}
function clearJourneyMemory(){for(const key of ['trip','officeVisit','officeSince','officeNearSince','tubeRide','tubePick','hubSince','aldHome','lastHub','followRoute','viewOverride','planInputs','follow','viewAt','viewKey'])delete state.saved[key];}
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
function checkpoint(){const r=route(),p=r[sim.index];$("simCheckpoint").textContent=`${p.label} · ${sim.index+1}/${r.length}`;$("simNext").textContent=r[sim.index+1]?.label||'Journey complete';status('Paused at '+p.label+'. Press Continue to next waypoint.');notify('checkpoint');}
function restart(){
 stopTimer();const draft=getDraftScenario(),t=startTime();if(!Number.isFinite(t)){status('Invalid start date/time');return false;}
 if(!start())return false;
 sim.config={...draft,startTime:t};sim.startTime=t;sim.pendingRestart=false;sim.manualOverride=false;sim.elapsed=0;sim.index=0;sim.sessionId++;sim.verification={current:null,results:[],pending:false};
 clearJourneyMemory();resetContext();syncClock();notify('start');emit(route()[0]);checkpoint();refresh({force:true});return true;
}
// Follow the same approximate corridor as the profile rather than cutting across the bends.
function tick(stepSeconds){const r=route(),p=r[sim.index],next=r[sim.index+1];if(!next){stopTimer();return;}
 const speed=typeof stepSeconds==='number'&&Number.isFinite(stepSeconds)?stepSeconds:Number($("simSpeed").value)||1;sim.elapsed=Math.min(next.at,sim.elapsed+speed/60);syncClock();
 const a=points[p.point],b=points[next.point],f=(sim.elapsed-p.at)/Math.max(.001,next.at-p.at);
 const stationary=a[0]===b[0]&&a[1]===b[1];
 const travellingRail=p.mode==='rail'&&!stationary&&(f<1||next.mode==='rail');
 // Rail travel uses explicit speed evidence. Tube travel withholds GPS except at exposed sections.
 if(getScenario().scenario==='uncertain'&&next.mode==='rail'&&!route().slice(0,sim.index+1).some(x=>x.point==='north')&&f<1){$("simFixStatus").textContent='Train: GPS unavailable until Stevenage';}
 else if((next.mode==='tube'||p.mode==='tube')&&f<1&&!(getScenario().scenario==='missed-connection'&&next.label.startsWith('Board')&&p.mode!=='tube')){if(S().simulatorEnabled&&onPositionError)onPositionError({code:2});$("simFixStatus").textContent='Underground: no usable GPS fix';}
 else if(!['awaiting-location','permission-denied'].includes(getScenario().scenario))fix(...interpolateSimulatedPosition(a,b,f,travellingRail,railLine),travellingRail?25:stationary?0:1.4,accuracy(next));
 if(sim.elapsed>=next.at){stopTimer();sim.index++;emit(next,next.mode==='rail'?25:0);checkpoint();refresh({force:true});}
}
function continuePlayback(){if(!sim.active||sim.startTime===null||sim.pendingRestart){restart();return;}if(sim.index>=route().length-1){status('Journey complete. Press Restart.');return;}stopTimer();sim.timer=setInterval(tick,1000);status('Moving towards '+route()[sim.index+1].label+' at '+$("simSpeed").value+'×');}
async function nextCheckpoint(){
 if(!sim.active||sim.startTime===null||sim.pendingRestart){restart();return;}
 if(sim.index>=route().length-1)return;
 if(!S().simulatorEnabled||!S().simulatedFeeds){continuePlayback();return;}
 stopTimer();const generation=playbackGeneration,target=sim.index+1;sim.stepping=true;notify('playback');
 // Sequential normal observations and normal refreshes reconstruct history; never teleport a checkpoint.
 for(let frame=0;frame<10000&&sim.active&&generation===playbackGeneration&&sim.index<target;frame++){
  tick(20);
  if(frame%3===0)await refresh();
  if(frame%9===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 if(generation===playbackGeneration){sim.stepping=false;notify('playback');}
}
function simStop({resume=true,reason='stopped'}={}){stopTimer();if(!sim.active&&!S().simulatedFeeds&&!S().simulatorEnabled){setPanelVisible(false);notify('stop');return;}notify('stopping',{reason});sim.active=false;sim.sessionId++;sim.watchGeneration++;if(sim.baseline)state.saved=sim.baseline;sim.baseline=null;sim.startTime=null;sim.config=null;sim.pendingRestart=false;clock.stop();resetContext(false);onStop();$("simBar").hidden=true;state.locStatus='pending';if(resume){locate();render();refresh({force:true});}status('Stopped; real GPS resumed, saved context restored.');notify('stop');}
function simSetup(){
 setPanelVisible(!!(S().simulatorEnabled||S().simulatedFeeds));
 $("simBar").hidden=!S().simulatorEnabled&&!S().simulatedFeeds;
 $("simPlay").addEventListener('click',restart);$("simContinue").addEventListener('click',continuePlayback);$("simPause").addEventListener('click',pause);$("simExit").addEventListener('click',simStop);
 $("simJump").addEventListener('click',()=>{stopTimer();sim.manualOverride=true;const p=points[$("simPreset").value];if(p)fix(...p);notify('manual');status('Manual GPS fix applied');});
 $("simApply").addEventListener('click',()=>{stopTimer();sim.manualOverride=true;fix(Number($("simLat").value),Number($("simLon").value));notify('manual');});
 $("simClear").addEventListener('click',()=>{stopTimer();if(start()){const t=startTime();if(!Number.isFinite(t)){status('Invalid start date/time');return;}sim.startTime=t;sim.config={...getDraftScenario(),startTime:t};sim.manualOverride=true;sim.sessionId++;clearJourneyMemory();resetContext();sim.index=0;sim.elapsed=0;syncClock();render();status('Journey context cleared');notify('manual');}});
 for(const id of ['simDirection','simPath','simScenario','simDate'])$(id).addEventListener('change',()=>{
  stopTimer();if(id==='simDirection')$("simDate").value=$("simDirection").value==='return'?'2026-11-03T15:44':'2026-11-03T08:44';
  sim.pendingRestart=!!sim.config;status('Selection changed. Press Restart.');notify('configuration');
 });
 $("simSpeed").addEventListener('change',()=>{notify('speed');updateTime();});
 updateTime();
}
const api={sim,simSetup,simStop,getScenario,getDraftScenario,route,tick,restart,pause,continuePlayback,nextCheckpoint,resetContext,updateTime,setPanelVisible,getView,subscribe,notify,reporter:null};
return api;
}
