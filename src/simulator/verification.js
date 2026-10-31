// Read-only simulator test oracles. This module observes the application's already rendered
// model; it never selects a service, writes journey state, calls providers or reads a clock.
function evaluateSimulationCheckpoint(context={}) {
 const c=context, app=c.app||{}, config=c.config||{}, point=c.point, label=c.label||point||'Unknown checkpoint';
 const assertions=[];
 const add=(id,expected,actual,condition,evidence={})=>assertions.push({id,expected,actual,status:condition==null?'INCONCLUSIVE':condition?'PASS':'FAIL',evidence});
 const unknown=(id,expected,actual)=>add(id,expected,actual,null);
 const bool=(id,expected,value,wanted=true)=>add(id,expected,typeof value==='boolean'?String(value):'Not observed',typeof value==='boolean'?value===wanted:null,{value:typeof value==='boolean'?value:null});
 const text=typeof app.heroText==='string'?app.heroText:'';
 const displayText=[app.heroText,app.bannersText,app.listText].flat().filter(x=>typeof x==='string').join(' ');
 const display=(id,expected,pattern)=>add(id,expected,displayText?(pattern.test(displayText)?'Expected wording observed in the real application':'Expected wording not observed in the real application'):'Application display not observed',displayText?pattern.test(displayText):null,{screenMatch:displayText?pattern.test(displayText):null});
 const screen=(id,expected,pattern)=>add(id,expected,text?(pattern.test(text)?'Expected wording observed on the main card':'Expected wording not observed on the main card'):'Main card not observed',text?pattern.test(text):null,{view:typeof app.view==='string'?app.view:null,screenMatch:text?pattern.test(text):null});
 const result=()=>({sessionId:c.sessionId??null,index:Number.isInteger(c.index)?c.index:null,point:typeof point==='string'?point:null,label,at:Number.isFinite(c.now)?c.now:null,
  status:assertions.some(a=>a.status==='FAIL')?'FAIL':assertions.length&&assertions.every(a=>a.status==='PASS')?'PASS':'INCONCLUSIVE',assertions});
 if(app.loading){unknown('pending-observation','Evaluate the settled application response','The application is still loading transport data');return result();}
 if(c.manualOverride){unknown('manual-observation','Verify a coherent scenario checkpoint','Advanced input changed the location or context; restart the scenario to restore checkpoint verification');return result();}
 if(!c.source?.gps){unknown('location-source','Observe scenario GPS through the real journey engine','GPS simulation is off; the real location is independent of this scenario');return result();}
 const scenarios=['normal','later-train','wrong-train','uncertain','delay','cancellation','platform-change','missed-connection','disruption','outage','gps-loss','low-accuracy','awaiting-location','permission-denied'];
 if(!['kgx','far'].includes(config.route)||!['outbound','return'].includes(config.direction)||!scenarios.includes(config.scenario)){
  unknown('undefined-expectation','A defined route, direction and scenario assertion','No supported assertion is defined for this configuration');return result();
 }
 if(['by','at'].includes(app.planMode)&&app.view===`plan-${app.planMode}`){
  unknown('planning-view','Observe the current journey rather than a different requested planning time','The passenger is inspecting an explicit planning view; current-trip checkpoint assertions are not applicable');return result();
 }
 if(config.scenario==='awaiting-location'||config.scenario==='permission-denied'){
  const expected=config.scenario==='permission-denied'?'denied':'pending';
  add('location-status',`Report location ${expected}`,app.locStatus||'Not observed',typeof app.locStatus==='string'?app.locStatus===expected:null,{locStatus:app.locStatus||null});
  screen('location-presentation','Show the normal location-needed or waiting screen',/Finding your location|Location needed|Waiting for your phone/i);
  return result();
 }
 const accurate=typeof app.locAcc==='number'&&Number.isFinite(app.locAcc)&&app.locAcc>=0;
 const coarse=accurate&&app.locAcc>250;
 if(config.scenario==='low-accuracy'&&coarse){
  add('coarse-station','Do not identify a station from a fix worse than ±250 m',app.atHub?`Station inferred: ${app.atHub}`:'No station confidently inferred',app.atHub==null,{locAcc:app.locAcc,atHub:app.atHub||null});
  unknown('coarse-inference','Use sufficient evidence before inferring boarding or arrival',`The current fix is ±${app.locAcc} m; prior movement or a user choice may legitimately be retained`);
  return result();
 }
 const ret=config.direction==='return', direction=ret?'home':'office', boards=Array.isArray(app.boards)?app.boards:[];
 const id=t=>t&&(t.serviceId||t.id)||null;
 const baseId=(config.route==='far'?'SIM-TL':'SIM-GN')+(ret?'-HOME':'')+(config.route==='far'?(ret?'-1620':'-0912'):(ret?'-1617':'-0905'));
 const later=['later-train','wrong-train','cancellation'].includes(config.scenario)||(ret&&['missed-connection','disruption'].includes(config.scenario));
 const expectedId=later?(config.route==='far'?(ret?'SIM-TL-HOME-LATER-1635':'SIM-TL-LATER-0927'):(ret?'SIM-GN-HOME-LATER-1627':'SIM-GN-LATER-0917')):baseId;
 const supported=['home','walk','let','north','approach','kgx','stp','far','farTube','kxTube','barbican','ald','officeWalk','office','nearHome'].includes(point);
 if(!supported){unknown('undefined-checkpoint','A defined application behaviour at this checkpoint','No assertion is defined for this checkpoint');return result();}
 // After office dwell the application deliberately turns to the homeward journey.
 const officeDwell=!ret&&point==='office'&&/Office dwell/i.test(label);
 const wantedDirection=officeDwell?'home':direction;
 add('journey-direction',`Infer the ${wantedDirection==='office'?'London / office':'Letchworth / home'} direction`,app.direction||'Not observed',typeof app.direction==='string'?app.direction===wantedDirection:null,{direction:app.direction||null});
 const elapsed=Number.isFinite(c.elapsed)?c.elapsed:Number.isFinite(config.startTime)&&Number.isFinite(c.now)?(c.now-config.startTime)/60000:null;
 if(config.scenario==='outage'&&elapsed!=null&&elapsed>=16&&elapsed<40){
  const errors=Array.isArray(app.errors)?app.errors:[];
  add('provider-outage','Surface the provider outage without inventing current transport data',errors.length?`${errors.length} application data error(s) observed`:'No application data error observed',errors.length>0,{errorCount:errors.length});
  return result();
 }
 if(config.scenario==='outage'&&elapsed!=null&&elapsed>=40){
  add('provider-recovery','Resume parsed transport data after the provider recovers',`${boards.length} service(s), source ${app.railSource||'unknown'}`,boards.length>0&&app.railSource==='darwin',{serviceCount:boards.length,railSource:app.railSource||null});
 }
 if(point==='north'){
  if(!accurate||app.locAcc>500){unknown('rail-position','Use sufficiently accurate rail movement evidence','Rail position accuracy is missing or worse than ±500 m');return result();}
  bool('rail-movement','Recognise that the passenger is on National Rail',app.onLine);
  screen('rail-presentation','Show the real On the train card',/On the train/i);
  const train=app.train;
  if(!c.source?.feeds){unknown('rail-identity','Compare actual inference with a synthetic service identity','Transport feeds are live; synthetic timetable identities are not applicable');return result();}
  if(config.scenario==='uncertain'){
   if(train?.picked){bool('manual-choice','Keep the explicitly selected train',train.picked);unknown('uncertainty-choice','Explain the original identification uncertainty','The passenger has made a choice; the earlier unpicked inference must be inspected in its recorded observation');}
   else {
    add('rail-uncertainty','Ask which train instead of asserting certainty',train?.none?'No matching service':train?`Certain: ${!!train.sure}`:'No inferred train',train&&!train.none?train.sure===false:null,{sure:typeof train?.sure==='boolean'?train.sure:null});
    screen('uncertainty-presentation','Ask the passenger which train they are on',/Which train are you on|couldn.?t tell which train/i);
    add('rail-choices','Keep competing trains available for the passenger to choose',`${Array.isArray(train?.others)?train.others.length:0} alternative(s) observed`,Array.isArray(train?.others)?train.others.length>0:null,{alternativeCount:Array.isArray(train?.others)?train.others.length:null});
   }
  } else {
   if(train?.picked&&train.conflict&&train.serviceId!==expectedId)unknown('rail-identity',`Infer ${expectedId} from GPS and provider evidence`,'The passenger explicitly selected a conflicting train; the app should retain the selection and explain the disagreement');
   else add('rail-identity',`Infer ${expectedId} from GPS and provider evidence`,train?.serviceId?`Inferred service: ${train.serviceId}`:'No service identified',train?train.serviceId===expectedId:false,{serviceId:train?.serviceId||null,confidence:train?.confidence||null});
   const competitors=new Set(boards.map(id).filter(Boolean));
   add('competing-services','Retain at least two distinct services in the actual departure data',`${competitors.size} distinct service(s) observed`,competitors.size>=2,{serviceCount:competitors.size});
  }
  if(train?.picked&&train.conflict){
   screen('selection-conflict','Explain fresh evidence conflicting with the selected train',/does not match|doesn't match|conflict|contradict/i);
  }
  if(config.scenario==='delay'){
   const t=boards.find(t=>id(t)===expectedId);
   add('rail-delay','Show the delayed train with an eight-minute expected delay',t?`Departure delay: ${t.depLate??'unknown'} min`:'Selected service absent',t?Number(t.depLate)>=8:false,{depLate:t?.depLate??null});
   screen('delay-presentation','Tell the passenger that the selected journey is late',/late|delay/i);
  }
 } else if(point==='let'&&!ret&&c.mode!=='rail'){
  screen('station-presentation','Show departures from Letchworth rather than a walk from home',/You're at Letchworth.*departures/i);
 } else if((point==='kgx'||point==='far'||ret&&(point==='kxTube'||point==='farTube'))&&c.mode!=='rail'){
  const hub=point==='kgx'||point==='kxTube'?'KGX':'ZFD';
  add('station-arrival',`Recognise ${hub==='KGX'?"King’s Cross":'Farringdon'} as the current station`,app.atHub?`Station inferred: ${app.atHub}`:'No station identified',typeof app.atHub==='string'?app.atHub===hub:app.atHub===null?false:null,{atHub:app.atHub||null});
  if(ret&&app.ride){unknown('alighting-confirmation','Confirm alighting if a through Underground ride remains plausible','The app still tracks a tube ride; use the real app’s alighting control if this is where you got off');}
  else if(ret)screen('return-platform','Show the station / National Rail connection after alighting',/King.?s Cross|Farringdon|train|departure|platform/i);
 } else if(point==='walk'&&!ret){
  bool('walking-to-station','Recognise the walk towards Letchworth station',app.onWay);
  screen('walk-presentation','Show the real On your way guidance',/On your way|At the station about/i);
 } else if(point==='let'&&ret&&c.mode!=='rail'){
  bool('rail-alighting','End National Rail travel at Letchworth',app.onLine,false);
  screen('home-station-presentation','Show the final journey home from Letchworth',/Nearly home|You.?re home/i);
 } else if(point==='home'&&ret){
  if(app.hasConfiguredHome===false){unknown('home-arrival','Recognise arrival at the configured home','A saved home is required to verify home arrival');}
  else {bool('home-arrival','Recognise arrival home',app.atHome);screen('home-presentation','Display that the passenger is home',/You.?re home/i);}
 } else if(point==='home'&&!ret){
  if(app.hasConfiguredHome)bool('home-start','Recognise the configured home as the starting point',app.atHome);
  screen('home-plan','Display the real journey plan for leaving home',/leave|Letchworth|train|office/i);
 } else if(point==='nearHome'&&ret){screen('nearly-home','Show the real Nearly home card',/Nearly home/i);
 } else if(point==='office'&&!ret){
  bool('office-arrival','Recognise that the passenger is near the office',app.nearOffice);
  if(officeDwell){
   bool('office-dwell-rail','End the completed outbound National Rail journey',app.onLine,false);
   add('office-dwell-ride','End any old Underground ride before offering a new homeward journey',app.ride?'An Underground ride is still active':app.ride===null?'No Underground ride is active':'Ride state not observed',app.ride===null?true:app.ride?false:null,{rideActive:app.ride===null?false:app.ride?true:null});
   const planViews=['plan-now','plan-by','plan-at'];
   add('office-dwell-plan','Offer a new homeward planning view after the office dwell',app.view?`Application view: ${app.view}`:'Application view not observed',typeof app.view==='string'?planViews.includes(app.view):null,{view:app.view||null});
   const planned=!!text&&/home|Aldgate|leave/i.test(text)&&!/^\s*On the (train|tube)\b/i.test(text);
   add('office-dwell-presentation','Display a genuine homeward plan rather than the completed outbound train or tube',text?(planned?'Homeward planning wording observed':'Homeward planning wording not observed'):'Main card not observed',text?planned:null,{screenMatch:text?planned:null});
  }else screen('office-presentation','Show arrival at the office rather than an old train or tube ride',/At the office|arrived/i);
 } else if(point==='office'&&ret){screen('return-plan','Offer a genuine homeward journey from the office',/home|Aldgate|leave|tube/i);
 } else if(point==='ald'&&!ret){
  bool('office-walk','Plan the remaining London walk towards the office',app.inLondonToOffice);
  add('tube-alighting','End the Underground ride on a precise Aldgate arrival',app.ride?'An Underground ride is still active':'No active Underground ride',app.ride==null,{rideActive:!!app.ride});
 } else if(point==='officeWalk'&&!ret){
  bool('walking-to-office','Plan from the passenger’s current London location',app.inLondonToOffice);
  screen('office-walk-presentation','Show the walk or onward journey to the office',/office|walk|arriv/i);
 } else if(point==='barbican'){
  add('underground-inference','Recognise Underground travel at Barbican',app.ride?'An Underground ride is active':'No Underground ride is active',!!app.ride,{rideActive:!!app.ride});
  screen('underground-presentation','Display the genuine On the tube card',/On the tube/i);
  if(c.previous?.ride?.vehicle){add('vehicle-continuity','Keep the previously observed Underground vehicle',app.ride?.vehicle?`Vehicle: ${app.ride.vehicle}`:'No vehicle observed',app.ride?.vehicle===c.previous.ride.vehicle,{vehicle:app.ride?.vehicle||null,previousVehicle:c.previous.ride.vehicle});}
  else if(!app.ride?.vehicle)unknown('vehicle-continuity','Track the actual Underground vehicle','No usable vehicle identity has been observed');
 } else if(c.mode==='tube'){
  if(config.scenario==='gps-loss')add('underground-gps','Report loss of usable location underground',app.locStatus||'Unknown location status',typeof app.locStatus==='string'?app.locStatus==='unavailable':null,{locStatus:app.locStatus||null});
  if(app.ride){screen('underground-boarding','Display the ride the application actually inferred or the passenger selected',/On the tube/i);}
  else unknown('underground-boarding','Recognise boarding once there is sufficient evidence or a passenger choice','No ride has been established at the departure instant; reaching this checkpoint does not prove boarding');
 } else if(c.mode==='rail'&&['approach','stp'].includes(point)){
  bool('rail-progress','Keep tracking the passenger on National Rail while the service continues',app.onLine);
  screen('rail-progress-presentation','Continue displaying the real On the train card before the alighting stop',/On the train/i);
 } else if(c.mode==='rail'){
  unknown('rail-boarding','Identify the train only after sufficient movement or an explicit passenger choice','Boarding or passing a station alone cannot establish a service identity');
 } else if(point==='kxTube'||point==='farTube'||(point==='ald'&&ret)){
  const count=Number.isInteger(app.tubeChoices)?app.tubeChoices:null;
  add('underground-options','Offer genuine Underground choices from the interchange',count==null?'Platform choices not observed':`${count} selectable departure(s) observed`,count==null?null:count>0,{choiceCount:count});
 } else {unknown('checkpoint-evidence','Inspect a defined application assertion for this transition','No additional assertion is defined for this transition yet');}
 if(config.scenario==='cancellation'&&c.source?.feeds&&((point==='let'&&!ret&&c.mode!=='rail')||(ret&&['kgx','far'].includes(point)&&c.mode!=='rail'))){
  const primary=boards.find(t=>id(t)===baseId);
  add('cancelled-service','Keep the cancelled departure visible in actual provider data',primary?`Cancelled: ${!!primary.cancelled}`:'Primary departure absent',primary?primary.cancelled===true:false,{serviceId:primary?id(primary):null,cancelled:primary?.cancelled??null});
  display('cancellation-presentation','Explain that a departure is cancelled in the real application',/cancelled|canceled/i);
  const usable=app.options?.usableCount;
  add('cancellation-replan','Offer a usable alternative through the real journey planner',Number.isInteger(usable)?`${usable} usable journey option(s)`:'Planner alternatives not observed',Number.isInteger(usable)?usable>0:null,{usableOptions:Number.isInteger(usable)?usable:null});
 }
 if(config.scenario==='platform-change'&&c.source?.feeds&&((point==='let'&&!ret&&c.mode!=='rail')||(ret&&['kgx','far'].includes(point)&&c.mode!=='rail'))){
  const selected=boards.find(t=>id(t)===baseId);
  add('platform-change','Show the changed platform for the selected departure',selected?`Platform: ${selected.platform??'unknown'}`:'Selected service absent',selected?String(selected.platform)==='4':null,{platform:selected?.platform??null});
  display('platform-presentation','Display the changed platform in the real application',/platform\s*4/i);
 }
 if(config.scenario==='disruption'&&c.source?.feeds){
  const statuses=Array.isArray(app.lineStatuses)?app.lineStatuses:[];
  const disrupted=statuses.some(l=>l.id==='metropolitan'&&Array.isArray(l.statuses)&&l.statuses.some(s=>s.sev===6));
  add('underground-disruption','Expose the Metropolitan line disruption in actual parsed status',disrupted?'Metropolitan severe delays observed':'Metropolitan severe delays not observed',statuses.length?disrupted:null,{disrupted});
  display('disruption-presentation','Display the Underground disruption warning',/severe delays|signal failure|underground disruption/i);
 }
 if(!c.source?.feeds)unknown('transport-source','Verify transport behaviour against the selected synthetic scenario','Transport feed simulation is off; live services cannot be compared with fixture expectations');
 return result();
}
