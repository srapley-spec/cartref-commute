// Signal's progress view is an adapter over existing selected itineraries/reports.
// No fetches, service selection, GPS inference or timing arithmetic belong here.
let signalProgressMemory=null;
function progressName(code){return STATIONS[code]||HUB_NAME[code]||code||'';}
function progressRoute(option){return routesFor(direction(),currentMode()).find(route=>route.hub===option.hub);}
function progressSavedRideSeconds(option){return option?.tube?.ride?.[option.hub]??null;}
function progressRailCalls(train,details){
  const raw=Array.isArray(details?.calls)?details.calls:[];
  const from=raw.findIndex(c=>c.code===train.from),to=raw.findIndex((c,index)=>index>=from&&c.code===train.to);
  if(from>=0&&to>from)return raw.slice(from,to+1);
  const known=Array.isArray(train.calls)?train.calls:[];
  const first=known.findIndex(c=>c.code===train.from),last=known.findIndex((c,index)=>index>=first&&c.code===train.to);
  const scoped=first>=0&&last>first?known.slice(first,last+1):[
    {code:train.from,name:progressName(train.from),t:train.dep},{code:train.to,name:progressName(train.to),t:train.arr}];
  // The board's best time is not a scheduled baseline or a reported observation.
  return scoped.map(c=>raw.find(item=>item.code===c.code)||{code:c.code,name:c.name,scheduledAt:null,expectedAt:c.t??null,actualAt:null});
}
function progressTubeCalls(ride,from,to,arrival,fromName,toName){
  const lineId=lineIdOf(ride.line);
  const corridor=(PROFILE.tubeCorridors||[]).find(c=>c.lineId===lineId&&c.from===from&&c.to===to);
  const stops=corridor?.stops||[{id:from,name:fromName||progressName(from)},{id:to,name:toName||progressName(to)}];
  return stops.map((stop,index)=>({code:stop.id,name:stop.name,scheduledAt:null,
    expectedAt:index===stops.length-1?arrival:null,actualAt:null}));
}
function progressHtml(model){
  const percentage=value=>`${Math.round(value*100)}%`;
  const current=model.current;
  const unknownPast=current.id==='tube-current';
  return `<div class="jp-heading"><b>Journey stages</b><span class="jp-status ${model.status.level}">${esc(model.status.text)}</span></div>
    <ol class="jp-overall" aria-label="Journey stages">${model.legs.map(leg=>`<li class="jp-leg" data-kind="${leg.kind}" data-state="${leg.state}"${leg.state==='current'?' aria-current="step"':''}><span class="jp-leg-bar" aria-hidden="true"><i style="--complete:${percentage(leg.fraction)}"></i></span><span class="jp-leg-caption"><span class="jp-leg-name">${esc(leg.label)}</span><span class="jp-leg-state">${leg.state==='complete'?'Done':leg.state==='current'?'Now':'Next'}</span></span></li>`).join('')}</ol>
    <div class="jp-current">
      <div class="jp-current-title"><b>Current leg · ${esc(current.label)}</b>${current.from||current.to?`<span>${esc(current.from||'')} → ${esc(current.to||'')}</span>`:''}</div>
      ${model.identityLabel?`<p class="jp-evidence">${esc(model.identityLabel)}</p>`:''}
      <div class="jp-current-track" role="progressbar" aria-label="${esc(model.progressLabel)}" aria-valuemin="0" aria-valuemax="100"${model.fraction===null?'':` aria-valuenow="${Math.round(model.fraction*100)}"`} aria-valuetext="${esc(model.progressLabel)}"><i style="--complete:${percentage(model.fraction??0)}"></i></div>
      ${model.calls.length?`<ol class="jp-stops" tabindex="0" aria-label="Calling points in route order; scroll for more">${model.calls.map(call=>`<li class="jp-stop" data-code="${esc(call.code||'')}" data-state="${call.state}"><span class="jp-stop-dot" aria-hidden="true"></span><span class="jp-stop-name">${esc(call.name)}</span><time class="jp-stop-time t">${call.time===null?'—':hhmm(call.time)}</time>${call.scheduledAt!=null&&call.scheduledAt!==call.time?`<span class="jp-stop-plan">Timetable ${hhmm(call.scheduledAt)}</span>`:''}<small class="jp-stop-status ${call.level}">${call.cancelled?'Cancelled':call.state==='reported'?(model.source==='stale'?'Last known report':'Reported'):call.state==='expected'?'Expected':call.scheduledAt!=null?'Timetable · no live report':'No live report'}${call.deltaMin===null?'':call.deltaMin<0?` · ${-call.deltaMin} min early`:call.deltaMin>0?` · ${call.deltaMin} min late`:' · on time'}</small></li>`).join('')}</ol>`:''}
      <p class="jp-evidence">${esc(model.evidenceLabel)}${unknownPast?' Earlier itinerary details are unavailable.':''}</p>
    </div>`;
}
function renderJourneyProgress(){
  document.querySelectorAll('.journey-progress').forEach(node=>node.remove());
  if(state.rendered){state.rendered.progressModel=null;state.rendered.activeRailDisruption=null;}
  const drawProgress=!!S().signal;
  if(!drawProgress&&S().alongLine!==true)return;
  const now=Date.now(),dir=direction(),mode=currentMode();
  if(signalProgressMemory&&(signalProgressMemory.epoch!==sourceEpoch||signalProgressMemory.dir!==dir||signalProgressMemory.mode!==mode))signalProgressMemory=null;
  let followed=!$('#followPanel').hidden&&state.followUpdate?.route;
  let context=state.rendered?.progress;
  let target=$('#hero');
  if(!context&&followed?.phase==='on-train'){
    context={kind:'rail',option:followed.option,train:followed.lastTrain,
      expectedArrival:followed.lastTrain.arr,details:state.progressById?.[followed.lastTrain.serviceId],uncertainIdentity:false};
    target=$('#followPanel');
  }
  if(!context&&state.rendered?.ride){
    const ride=state.rendered.ride;
    context={kind:'tube',ride,departure:ride.t,arrival:null,finalArrival:null,homeward:dir==='home',from:ride.from||ride.hub,to:ride.stop||'Stop not established'};
  }
  if(!context)return;
  // Saved history belongs only to the service displayed on this card. Keep a
  // different passenger Follow choice separate from the inferred train's reports.
  if(context.kind==='rail'&&followed){
    const savedId=followed.lastTrain.serviceId,currentId=context.train.serviceId;
    if((savedId&&currentId&&savedId!==currentId)||!C.followMatchesObservedTrain(followed,{
      train:context.train,hub:context.option?.hub||(dir==='office'?context.train.to:context.train.from)
    }))followed=null;
  }
  let legs,active,evidence,calls,railFacts,uncertain=false,cancelled=false,noEstimate=false;
  const option=followed?.option||context.option;
  if(context.kind==='rail'){
    const train=followed?.lastTrain||context.train;if(!train)return;
    const details=context.details;
    const ordered=progressRailCalls(train,details?.data),endpoint=ordered.find(call=>call.code===train.to);
    // A matched timetable Follow can retain history without ever having a provider
    // ID. The actual displayed train owns the identity of its fresh reports.
    const knownIdentity=!!context.train.serviceId&&(!details?.id||details.id===context.train.serviceId);
    const observedAt=details?.at??state.boardsAt;
    const factualEnd=endpoint?.actualAt!=null&&endpoint.actualAt<=observedAt?endpoint.actualAt:endpoint?.expectedAt;
    const expectedArrival=factualEnd??(details?.data?.calls?null:context.expectedArrival);
    const currentTrain={...train,arr:context.expectedArrival??train.arr};
    legs=option?C.progressLegsFromSteps({option,train:currentTrain,route:followed?undefined:progressRoute(option),
      steps:followed?C.followedLegs(followed):undefined,tubeRideSecs:progressSavedRideSeconds(option),names:STATIONS}):
      [{id:'rail',kind:'rail',label:'Train',start:train.dep,end:context.expectedArrival??train.arr,from:progressName(train.from),to:progressName(train.to),fromCode:train.from,toCode:train.to}];
    active='rail';calls=ordered;
    evidence={source:details?.data?'reported':context.arrivalLive?'prediction':'modelled',observedAt,
      expectedAt:expectedArrival,scheduledAt:endpoint?.scheduledAt??null,identityMatched:knownIdentity};
    uncertain=!!context.uncertainIdentity;cancelled=!!train.cancelled;noEstimate=!!(train.depUnknown||train.arrUnknown||train.arr===null);
    railFacts={train,endpoint,details,expectedArrival};
    if(!uncertain&&option&&legs.length)signalProgressMemory={epoch:sourceEpoch,dir,mode,observedAt:now,hub:option.hub,option,legs};
  }else{
    const ride=context.ride;if(!ride)return;
    const memory=signalProgressMemory;
    const sameHub=memory&&(memory.hub===ride.hub||(PROFILE.sharesTubeWith?.[memory.hub]||memory.hub)===(PROFILE.sharesTubeWith?.[ride.hub]||ride.hub));
    const remembered=!context.homeward&&sameHub&&C.progressContextCurrent(memory.legs,memory.observedAt,context.departure)?memory:null;
    const chosen=option||remembered?.option;
    if(chosen)legs=followed?C.progressLegsFromSteps({option:chosen,train:followed.lastTrain,steps:C.followedLegs(followed),tubeRideSecs:progressSavedRideSeconds(chosen),names:STATIONS}):remembered?.legs||C.progressLegsFromSteps({option:chosen,route:progressRoute(chosen),names:STATIONS});
    else legs=[];
    const railIndex=legs.findIndex(leg=>leg.kind==='rail');
    const tubeIndex=legs.findIndex((leg,index)=>leg.kind==='tube'&&(context.homeward?index<railIndex:index>railIndex));
    let arrival=context.arrival,fromCode=context.homeward?'ALD':ride.hub,toCode=context.homeward?(chosen?.hub||''):(PROFILE.places.officeStops||[]).find(stop=>stop.name===context.to)?.id||'';
    if(fromCode==='STP')fromCode=PROFILE.sharesTubeWith?.[fromCode]||fromCode;
    if(toCode==='STP')toCode=PROFILE.sharesTubeWith?.[toCode]||toCode;
    let live=null;
    if(context.homeward&&followed){
      // Read the existing source/route-guarded cache directly. Calling the live
      // inference controller here could clear a ride while merely drawing it.
      const cached=state.followTransport,expected={routeId:followed.id,vehicle:String(ride.vehicle||''),hub:toCode,
        lineId:lineIdOf(ride.line),direction:'westbound'};
      if(cached?.epoch===sourceEpoch&&cached.stopId===TUBE_STOP[toCode]&&sameFollowTransport(cached,expected))live=C.followTubeArrival(cached.predictions,
        {...expected,stopId:TUBE_STOP[toCode],now,fetchedAt:cached.at,readyMs:cached.readyMs});
      if(live)arrival=live.arrival;
      else arrival=C.tubeHomeConnections(ride.t,S(),state.saved.pace==='fast'?'fast':'avg').reach[chosen.hub]??null;
    }
    else if(!context.homeward&&ride.vehicle&&context.liveStopId&&state.ald){
      live=C.followTubeArrival(state.ald.arrivals,{vehicle:String(ride.vehicle),hub:toCode,stopId:context.liveStopId,
        lineId:lineIdOf(ride.line),direction:context.liveDirection,now,fetchedAt:state.ald.at,readyMs:0});
      if(live)arrival=live.arrival;
    }
    const plannedEnd=tubeIndex>=0?legs[tubeIndex].travelEnd??legs[tubeIndex].end:null;
    if(tubeIndex>=0){active=legs[tubeIndex].id;legs=C.retimeProgressLeg({legs,legId:active,start:context.departure,expectedEnd:arrival,tailEnd:context.homeward?undefined:context.finalArrival});}
    else{
      active='tube-current';legs=[{id:'earlier',kind:'connection',label:'Earlier legs',start:context.departure,end:context.departure},
        {id:active,kind:'tube',label:'Tube',start:context.departure,end:arrival,from:context.from,to:context.to}];
      if(context.finalArrival!=null&&arrival!=null)legs.push({id:'after-walk',kind:'walk',label:'Walk',start:arrival,end:context.finalArrival});
    }
    legs=legs.map(leg=>leg.id===active?{...leg,from:context.homeward?context.from:progressName(fromCode),to:context.homeward?progressName(toCode):context.to,fromCode,toCode,lineId:lineIdOf(ride.line)}:leg);
    calls=progressTubeCalls(ride,fromCode,toCode,arrival,context.from,context.to);
    // followTubeArrival already checks provider timestamps (including its small
    // allowed clock offset); freshness here uses our validated capture time.
    evidence={source:live?'prediction':'modelled',observedAt:live?(context.homeward?state.followTransport?.at:state.ald?.at):null,expectedAt:live?.arrival??null,
      scheduledAt:plannedEnd,identityMatched:!!live&&!!ride.vehicle};
    uncertain=!(ride.picked||ride.confirmed);
  }
  const input={now,legs,activeLeg:active,calls,evidence,uncertainIdentity:uncertain,cancelled,noEstimate,policy:PROFILE.disruption};
  let model=C.journeyProgress(input);
  if(!model)return;
  if(railFacts){
    // The pure source model validates cache age/identity. A fresh report may add
    // an incident, but a residual expected time cannot clear an explicit board
    // cancellation/unknown-delay flag; recovery comes from its normal controller.
    const {train,endpoint,details,expectedArrival}=railFacts;
    if(details?.data&&endpoint&&(model.source==='reported'||model.source==='prediction')){
      cancelled=!!(cancelled||details.data.cancelled||endpoint.cancelled);
      noEstimate=!!(noEstimate||endpoint.noEstimate);
      model=C.journeyProgress({...input,cancelled,noEstimate});
    }
    state.rendered.activeRailDisruption=C.disruptionTrainObservation(train,{source:model.source,delayMin:model.status.deltaMin,
      cancelled,noEstimate,reason:details?.data?.reason,expectedArrival});
  }
  if(context.kind==='tube'&&model.status.deltaMin!==null)model.status.text=model.status.text.replace('ahead','ahead of plan').replace('behind','behind plan');
  state.rendered.progressModel=model;
  // Along the line shares validated reports in Panda without drawing the Signal diagram.
  if(!drawProgress)return;
  const section=document.createElement('section');section.className='journey-progress';section.dataset.block='progress';section.dataset.source=model.source;section.setAttribute('aria-label','Journey progress');section.innerHTML=progressHtml(model);
  // Keep full legacy report/expected/timetable/error diagnostics accessible once,
  // without repeating their prose above the visual progress view.
  if(target.id==='hero'){
    const original=[...target.querySelectorAll('[data-block="progress"]')];
    if(original.length){
      const details=document.createElement('details');details.className='jp-source-details';
      details.dataset.key='journey-progress-source|'+(context.train?.serviceId||context.ride?.vehicle||context.kind);
      const summary=document.createElement('summary');summary.textContent='Report details';details.append(summary,...original);section.append(details);
    }
  }
  if(context.kind==='rail'&&context.details?.err){const note=document.createElement('p');note.className='jp-evidence';note.textContent=context.details.err;section.querySelector('.jp-current').append(note);}
  const before=target.querySelector(target.id==='hero'?'[data-block="then"], [data-block="lines"], [data-block="source"]':'.steps');
  if(before)before.before(section);else target.append(section);
}
