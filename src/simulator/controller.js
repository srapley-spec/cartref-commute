// Simulator orchestration. GPS enters the normal browser-position handler; no train identity is injected.
function createJourneySimulator({state,S,onPosition,onPositionError,locate,render,refresh,navigator,document,clock,invalidateSources=()=>{},onStop=()=>{}}) {
const $=id=>document.getElementById(id);
const sim={active:false,timer:null,baseline:null,index:0,elapsed:0,watchGeneration:0,startTime:null};
const points={home:[51.975,-0.23],walk:[51.9775,-0.2295],let:[51.98002,-0.22909],
 north:[51.9017,-0.2071],approach:[51.5646,-0.1063],kgx:[51.53197,-0.12341],stp:[51.53062,-0.12594],
 far:[51.52036,-0.10514],farTube:[51.5205,-0.1053],kxTube:[51.5307,-0.1237],
 barbican:[51.5201,-0.0973],ald:[51.5142,-0.0755],officeWalk:[51.5140,-0.0733],office:[51.5139,-0.071],nearHome:[51.978,-0.2295]};
// Separate outbound/return schedules: minutes from 08:44 / 15:44 UTC by default.
const routes={
 'outbound-kgx':[['home','Home',0],['walk','Travelling to Letchworth',8],['let','Waiting at Letchworth',16],['let','Board Great Northern',21,'rail'],['north','On train at Stevenage',32,'rail'],['approach','Approaching King’s Cross',50,'rail'],['kgx','Alight at King’s Cross',57],['kxTube','Walk to Underground platforms',63],['kxTube','Board eastbound Underground',64,'tube'],['barbican','Barbican — GPS returns',72,'tube'],['ald','Alight at Aldgate',78],['officeWalk','Walking to office',82],['office','Arrive at office',86],['office','Office dwell',97]],
 'outbound-far':[['home','Home',0],['walk','Travelling to Letchworth',8],['let','Waiting at Letchworth',16],['let','Board Thameslink',28,'rail'],['north','On train at Stevenage',40,'rail'],['approach','Approaching St Pancras',65,'rail'],['stp','Passing St Pancras',71,'rail'],['far','Alight at Farringdon',76],['farTube','Walk to Underground platforms',80],['farTube','Board eastbound Underground',83,'tube'],['barbican','Barbican — GPS returns',86,'tube'],['ald','Alight at Aldgate',92],['officeWalk','Walking to office',96],['office','Arrive at office',100],['office','Office dwell',111]],
 'return-kgx':[['office','Office',0],['officeWalk','Walking to Aldgate',3],['ald','At Aldgate westbound platforms',7],['ald','Board westbound Underground',10,'tube'],['barbican','Barbican — GPS returns',18,'tube'],['kxTube','Alight at King’s Cross St Pancras',24],['kgx','Waiting at King’s Cross National Rail',28],['kgx','Board Great Northern for Letchworth',33,'rail'],['approach','Leaving London',40,'rail'],['north','On train at Stevenage',57,'rail'],['let','Alight at Letchworth',69],['nearHome','Nearly home',74],['home','Arrive home',80]],
 'return-far':[['office','Office',0],['officeWalk','Walking to Aldgate',3],['ald','At Aldgate westbound platforms',7],['ald','Board westbound Underground',10,'tube'],['barbican','Barbican — GPS returns',18,'tube'],['farTube','Alight at Farringdon',20],['far','Waiting on northbound Thameslink platform',28],['far','Board Thameslink for Letchworth',36,'rail'],['stp','Passing St Pancras northbound',41,'rail'],['approach','Leaving London',49,'rail'],['north','On train at Stevenage',72,'rail'],['let','Alight at Letchworth',84],['nearHome','Nearly home',89],['home','Arrive home',95]]
};
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
function updateTime(){const c=getScenario();$("simTime").textContent=(S().simulatedFeeds?new Date(clock.now()).toISOString():'Device clock (GPS only)')+' · '+c.scenario;$("simClockMode").textContent=S().simulatedFeeds?'Virtual clock: frozen when paused. Real GPS remains real when GPS Simulation is off.':'Live feeds: device time is used. Playback speeds move GPS only; service timing stays live.';}
function stopTimer(){if(sim.timer!==null)clearInterval(sim.timer);sim.timer=null;}
function resetContext(preserveLiveLocation=!S().simulatorEnabled){
 invalidateSources();
 const liveFix=preserveLiveLocation?{here:state.here,lastFixAt:state.lastFixAt,lastFixRecvAt:state.lastFixRecvAt,autoDir:state.autoDir,autoSrc:state.autoSrc,atHub:state.atHub}:null;
 for(const key of ['autoDir','atHub','hubSince','lastAwayAt','lastHub','lineTrack','trainLock','tube','lastFixAt','lastFixRecvAt','here','boards','boardsDir','fetchedAt','london'])state[key]=null;
 state.autoSrc='';if(!liveFix)state.locStatus='pending';state.inLondon=false;state.onLine=false;state.byCache={};state.atCache={};if(liveFix)Object.assign(state,liveFix);
}
function clearJourneyMemory(){for(const key of ['trip','officeVisit','officeSince','officeNearSince','tubeRide','tubePick','hubSince','aldHome','lastHub'])delete state.saved[key];}
function start(){if(!S().simulatorEnabled&&!S().simulatedFeeds)return false;if(sim.active)return true;
 sim.baseline=JSON.parse(JSON.stringify(state.saved));sim.active=true;if(S().simulatorEnabled)sim.watchGeneration++;
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
 onPosition({coords:{latitude:lat,longitude:lon,accuracy:acc,speed},timestamp:clock.now()});
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
const railLine=[points.let,[51.9533,-0.2635],points.north,[51.8667,-0.1876],[51.8233,-0.1920],[51.8010,-0.2040],[51.7638,-0.2156],[51.6973,-0.1925],[51.6141,-0.1431],[51.5983,-0.1201],points.approach,points.kgx];
function positionBetween(a,b,f,isRail){
 if(!isRail)return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
 const near=q=>railLine.reduce((best,p,i)=>Math.hypot(p[0]-q[0],(p[1]-q[1])*.62)<best.d?{i,d:Math.hypot(p[0]-q[0],(p[1]-q[1])*.62)}:best,{i:0,d:Infinity}).i;
 const ia=near(a),ib=near(b),middle=ia<ib?railLine.slice(ia+1,ib):railLine.slice(ib+1,ia).reverse(),path=[a,...middle,b];
 const ds=path.slice(1).map((q,i)=>Math.hypot(q[0]-path[i][0],(q[1]-path[i][1])*.62));let distance=ds.reduce((x,y)=>x+y,0)*f;
 for(let i=0;i<ds.length;i++){if(distance<=ds[i]||i===ds.length-1){const t=ds[i]?distance/ds[i]:0;return [path[i][0]+(path[i+1][0]-path[i][0])*t,path[i][1]+(path[i+1][1]-path[i][1])*t];}distance-=ds[i];}
 return b;
}
function tick(){const r=route(),p=r[sim.index],next=r[sim.index+1];if(!next){stopTimer();return;}
 const speed=Number($("simSpeed").value)||1;sim.elapsed=Math.min(next.at,sim.elapsed+speed/60);syncClock();
 const a=points[p.point],b=points[next.point],f=(sim.elapsed-p.at)/Math.max(.001,next.at-p.at);
 // Rail travel uses explicit speed evidence. Tube travel withholds GPS except at exposed sections.
 if(getScenario().scenario==='uncertain'&&next.mode==='rail'&&!route().slice(0,sim.index+1).some(x=>x.point==='north')&&f<1){$("simFixStatus").textContent='Train: GPS unavailable until Stevenage';}
 else if((next.mode==='tube'||p.mode==='tube')&&f<1&&!(getScenario().scenario==='missed-connection'&&next.label.startsWith('Board')&&p.mode!=='tube')){if(S().simulatorEnabled&&onPositionError)onPositionError({code:2});$("simFixStatus").textContent='Underground: no usable GPS fix';}
 else if(!['awaiting-location','permission-denied'].includes(getScenario().scenario))fix(...positionBetween(a,b,f,next.mode==='rail'),next.mode==='rail'?25:1.4,accuracy(next));
 if(sim.elapsed>=next.at){stopTimer();sim.index++;emit(next,next.mode==='rail'?25:0);checkpoint();refresh({force:true});}
}
function continuePlayback(){if(!sim.active||sim.startTime===null){restart();return;}if(sim.index>=route().length-1){status('Journey complete. Press Restart.');return;}stopTimer();sim.timer=setInterval(tick,1000);status('Moving towards '+route()[sim.index+1].label+' at '+$("simSpeed").value+'×');}
function simStop({resume=true}={}){stopTimer();if(!sim.active&&!S().simulatedFeeds)return;sim.active=false;sim.watchGeneration++;if(sim.baseline)state.saved=sim.baseline;sim.baseline=null;sim.startTime=null;clock.stop();onStop();resetContext(false);$("simBar").hidden=true;state.locStatus='pending';if(resume){locate();render();refresh({force:true});}status('Stopped; real GPS resumed, saved context restored.');}
function simSetup(){
 $("simPanel").hidden=!S().simulatorEnabled&&!S().simulatedFeeds;
 $("simPlay").addEventListener('click',restart);$("simContinue").addEventListener('click',continuePlayback);$("simPause").addEventListener('click',()=>{stopTimer();status('Paused');});$("simExit").addEventListener('click',simStop);
 $("simJump").addEventListener('click',()=>{stopTimer();const p=points[$("simPreset").value];if(p)fix(...p);status('Manual GPS fix applied');});
 $("simApply").addEventListener('click',()=>{stopTimer();fix(Number($("simLat").value),Number($("simLon").value));});
 $("simClear").addEventListener('click',()=>{stopTimer();if(start()){const t=startTime();if(!Number.isFinite(t)){status('Invalid start date/time');return;}sim.startTime=t;clearJourneyMemory();resetContext();sim.index=0;sim.elapsed=0;syncClock();render();status('Journey context cleared');}});
 for(const id of ['simDirection','simPath','simScenario','simDate'])$(id).addEventListener('change',()=>{stopTimer();if(id==='simDirection')$("simDate").value=$("simDirection").value==='return'?'2026-11-03T15:44':'2026-11-03T08:44';sim.startTime=null;sim.index=0;sim.elapsed=0;status('Selection changed. Press Restart.');});
 updateTime();
}
return {sim,simSetup,simStop,getScenario,route,tick,restart,resetContext,updateTime};
}
