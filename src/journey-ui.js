// Signal and Follow a route shell. Decisions and timing belong to src/core; this file draws
// those results and adapts existing observations. All journey views share this single controller.
const followChoices = new Map();
// View choice is a shared app capability. A skin or Follow preference cannot
// remove Auto/Plan/Live; Follow itself remains independently configurable.
const journeyEnabled = () => true;
const pendingReleasedFollow = () => S().followRoute&&!Object.prototype.hasOwnProperty.call(state.saved,'followRoute')&&C.isLegacyFollowRoute(state.saved.follow)&&state.saved.follow.dir===direction()?state.saved.follow:null;
const activeFollow = () => {const r=S().followRoute&&C.restoreFollowRoute(state.saved.followRoute);return r&&r.phase!=='arrived'&&r.direction===direction()&&r.mode===currentMode()?r:pendingReleasedFollow();};
function restoreReleasedFollow(){
  const legacy=pendingReleasedFollow();if(!legacy||!state.boards)return;
  const options=(currentMode()==='leisure'?buildLeisure:buildJourneys)(legacy.dir,Date.now(),{here:true});
  const imported=C.migrateFollowRoute(legacy,options,{now:Date.now(),mode:currentMode()});
  if(imported){state.saved.followRoute=imported;save();}
}
function applyJourneyAppearance(){
  document.documentElement.dataset.design='signal';
  const theme=S().appearance;
  if(theme==='light'||theme==='dark')document.documentElement.dataset.theme=theme;
  else delete document.documentElement.dataset.theme;
  $('#journeyViewControl').hidden=!journeyEnabled();
  applySignalLayout();
}
// Arrange the existing controls once, retaining their handlers and saved values.
let signalParts=null;
function applySignalLayout(){
  if(signalParts)return;
  const root=$('#hero').closest('.wrap');
  const make=(tag,id,html)=>{const node=document.createElement(tag);node.id=id;node.innerHTML=html;root.append(node);return node;};
  signalParts={
    toolbar:make('div','signalToolbar',''),
    adjustments:make('details','signalAdjustments','<summary id="signalContextSummary">Journey options</summary><div class="signal-adjustment-body"></div>'),
    planning:make('div','signalPlanningControls',''),
    notices:make('details','signalNotices','<summary>Travel alerts <span id="signalNoticeCount"></span></summary>'),
    network:make('details','signalNetwork','<summary>Lines &amp; data</summary><div id="signalCurrentLines"></div>'),
    other:make('details','signalOtherJourneys','<summary>Other recommendations</summary>'),
    boardHeading:make('div','signalBoardHeading',''),
    disruptions:make('section','signalDisruptions',''),
    connections:make('div','signalConnections',''),
    freshness:make('span','signalFreshness','')
  };
  const p=signalParts;
  p.toolbar.className='signal-toolbar';
  for(const key of ['adjustments','notices','network','other'])p[key].dataset.key='signal-'+key;
  p.adjustments.querySelector('div').append(document.querySelector('[data-mode]').closest('.controls'));
  p.toolbar.append($('#journeyViewControl'),p.adjustments);
  p.planning.append(document.querySelector('[data-view]').closest('.controls'),$('#byForm'));
  p.notices.append($('#banners'));
  p.boardHeading.append($('#listTitle'),p.notices);
  const statusTitle=$('#status').previousElementSibling;
  p.network.append(statusTitle,$('#status'),$('#modelNote'),root.querySelector('footer > span'));
  root.querySelector('footer').prepend(p.freshness);
  const header=root.querySelector('header');header.querySelector('h1').textContent='Cartref';
  for(const node of [header,$('#alongNavigation'),p.toolbar,$('#dirNote'),p.planning,$('#originRow'),$('#destRow'),$('#signalStatus'),p.disruptions,$('#followPanel'),p.connections,$('#hero'),p.other,p.boardHeading,$('#list'),$('#diag'),p.network,root.querySelector('footer')])root.append(node);
}
function signalReadingVisible(node){
  for(let p=node;p;p=p.parentElement)if(p.hidden||(p.tagName==='DETAILS'&&!p.open))return false;
  return true;
}
function renderSignalCompact(){
  if(!signalParts)return;
  const p=signalParts;
  $('#signalContextSummary').textContent=`${state.saved.mode==='leisure'?'Leisure':direction()==='home'?'To home':'To office'} · ${state.saved.mode==='leisure'?'Journey options':state.saved.pace==='fast'?'Fast pace':'Average pace'}`;
  if(state.presentation?.mode==='auto'&&!state.pendingView)$('#journeyViewNote').textContent='';
  p.notices.hidden=!$('#banners').children.length;
  $('#signalNoticeCount').textContent=$('#banners').children.length?`· ${$('#banners').children.length}`:'';
  p.notices.querySelector('summary').firstChild.textContent=state.signalDisruptionItems?.length?'All alerts ':'Travel alerts ';
  // Consolidate only background line issues or impacts actually represented above.
  // An unused alternative's serious problem must remain on that option's row.
  const foreground=new Set((state.signalDisruptionItems||[]).filter(item=>item.scope==='tube').map(item=>item.id.slice(5)));
  document.querySelectorAll('#hero [data-network-lines],#list [data-network-lines],.follow-alternative [data-network-lines]').forEach(flag=>{
    const ids=flag.dataset.networkLines.split(',').filter(Boolean);
    const represented=ids.length&&ids.every(id=>foreground.has(id)||!C.significantLineDisruption((state.status||[]).find(line=>line.id===id)||{id,name:id,statuses:[]},PROFILE.disruption));
    flag.toggleAttribute('data-network-flag',flag.dataset.networkFallback==='true'||!!represented);
  });
  $('#signalCurrentLines').replaceChildren(...$('#hero').querySelectorAll('.strip'));
  p.freshness.textContent=($('#updated').textContent||'').split(' · requests')[0];
  // A compact, accessible fallback row; full metadata and actions remain on expansion.
  const options=[...$('#hero').children].filter(n=>n.classList.contains('opt'));
  for(const opt of options.slice(1)){
    const detail=document.createElement('details');detail.className='signal-alternative';
    detail.dataset.journeyService=opt.dataset.journeyService;
    detail.dataset.key='signal-alternative|'+(opt.querySelector('[data-key]')?.dataset.key||'next');
    const summary=document.createElement('summary'),label=document.createElement('span');label.className='signal-alt-label';label.textContent='Next best';summary.append(label);
    const times=opt.querySelector('.optrow');
    const route=times?.querySelector('.optroute');if(route)opt.prepend(route);
    if(times)summary.append(times);
    const service=document.createElement('span');service.className='signal-alt-service';service.textContent=opt.dataset.serviceLabel||'';summary.append(service);
    const boarding=opt.querySelector('.altstop');
    if(boarding){const compact=boarding.cloneNode(true);compact.className='signal-alt-boarding';summary.append(compact);}
    const facts=opt.querySelector('.journey-facts');
    if(facts){const compact=facts.cloneNode(true);compact.classList.add('signal-alt-facts');summary.append(compact);}
    const comparison=opt.querySelector('[data-fact="arrives-first"]');
    if(comparison){const compact=comparison.cloneNode(true);compact.classList.add('signal-alt-comparison');summary.append(compact);}
    opt.before(detail);detail.append(summary,opt);
  }
  p.connections.replaceChildren();
  const following=!$('#followPanel').hidden;
  const secondary=following&&state.presentation?.mode!=='plan'&&!!$('#hero .opt');
  p.other.hidden=!secondary;
  if(secondary){p.connections.append(...$('#hero').querySelectorAll('.tubes'));if($('#hero').parentElement!==p.other)p.other.append($('#hero'));}
  else rootSignalHeroHome();
  p.connections.hidden=!p.connections.childNodes.length;
  restoreOpen();
}
function rootSignalHeroHome(){if(signalParts&&$('#hero').parentElement!==signalParts.other.parentElement)signalParts.other.before($('#hero'));}
function journeyInteracting(){
  const a=document.activeElement;
  return !!($('#settings').open || (a&&!a.closest('#simDock')&&a.matches('input,select,textarea,[data-pick],[data-tubepick]')) ||
    [...document.querySelectorAll('#banners details[open],#signalDisruptions details[open],#hero details[open],#followPanel details[open],#signalNotices[open]')].some(signalReadingVisible));
}
function journeySituation(now,s){
  const live=C.chooseView({...s,plan:'now'});
  const active=!live.view.startsWith('plan-')&&live.view!=='awaiting-location';
  const station=atStation(true), way=onWay(true);
  const phase=active?live.view:station?'station:'+station:way?'walking-to-station':'planning';
  const key=`${direction()}|${currentMode()}|${phase}`;
  // A temporary denied/stale position is not a new journey situation.
  const reliable=state.locStatus==='ok'&&state.lastFixAt&&now-state.lastFixAt<=90e3&&state.locAcc<=150;
  const prefix=`${direction()}|${currentMode()}|`;
  if(reliable || !state.journeySituationKey || !state.journeySituationKey.startsWith(prefix))state.journeySituationKey=key;
  return {live,key:state.journeySituationKey,active:active||!!station||!!way};
}
function journeyPresentation(now,s){
  const auto=C.chooseView(s);
  if(!journeyEnabled())return auto;
  const current=journeySituation(now,s);
  state.journeyLivePresentation=current.live;
  let override=state.saved.viewOverride,legacyPinPending=false;
  if(!Object.prototype.hasOwnProperty.call(state.saved,'viewOverride')&&Number.isFinite(state.saved.viewAt)&&(s.plan==='by'||s.plan==='at')){
    const reliable=state.locStatus==='ok'&&state.lastFixAt&&now-state.lastFixAt<=90e3&&state.locAcc<=150;
    const oldKey=[direction(),state.atHub||'',!!state.onLine,!!currentRide(now),!!homeRide(now),!!onWay()].join('|');
    const expired=now-state.saved.viewAt>=C.VIEW_OVERRIDE_MS||state.saved.viewAt>now;
    override=expired||(reliable&&state.saved.viewKey!==oldKey)?null:C.createViewOverride('plan',state.saved.viewAt,current.key);
    legacyPinPending=!expired&&!reliable;
    if(!legacyPinPending){state.saved.viewOverride=override;save();}
  }
  const shown=C.resolveViewControl({auto,live:current.live,hasActiveJourney:current.active,plan:s.plan,
    hasFollowedJourney:!!activeFollow(),
    override,now,situationKey:current.key,previous:state.presentation,interacting:journeyInteracting()});
  if(!legacyPinPending&&JSON.stringify(state.saved.viewOverride||null)!==JSON.stringify(shown.override)){
    state.saved.viewOverride=shown.override;save();
  }
  state.pendingView=shown.pending;
  document.querySelectorAll('[data-journey-view]').forEach(b=>{
    b.setAttribute('aria-pressed',String(b.dataset.journeyView===shown.mode));
  });
  $('#journeyViewNote').textContent=shown.pending?'Journey update ready · finish what you’re reading or choose Live':
    shown.mode==='auto'?`Auto · ${current.active?'Live':'Plan'}`:shown.mode==='plan'?'Planning pinned · tracking continues':'Live pinned';
  return shown;
}
function rememberPlanningInput(){
  if(state.saved.view!=="by"&&state.saved.view!=="at")return;
  state.saved.planInputs={...state.saved.planInputs,[state.saved.view]:{date:$("#byDate").value,time:$("#byTime").value}};
}
function pinJourneyView(mode){
  const now=Date.now(), current=journeySituation(now,situation(now));
  state.saved.viewOverride=mode==='auto'?null:C.createViewOverride(mode,now,current.key);
  save();
}
document.querySelectorAll('[data-journey-view]').forEach(b=>b.addEventListener('click',()=>{pinJourneyView(b.dataset.journeyView);render();}));
// Retry a deferred transition when editing or reading ends, using the latest evidence.
document.addEventListener('focusout',()=>{if(state.pendingView)setTimeout(()=>render(),0);});
document.addEventListener('toggle',e=>{if(e.target instanceof HTMLDetailsElement&&!e.target.open&&state.pendingView)setTimeout(()=>render(),0);},true);

function followButton(option){
  if(!S().followRoute)return '';
  const key=C.followServiceKey(option);
  followChoices.set(key,option);
  const selected=C.restoreFollowRoute(state.saved.followRoute);
  if(selected&&selected.phase!=='arrived'&&selected.direction===direction()&&selected.mode===currentMode()&&C.followMatchesService(selected,option))return '<span class="followtag pill info">Following this route</span>';
  const possible=!!C.startFollowRoute(option,{now:Date.now(),direction:direction(),mode:currentMode()});
  return `<button type="button" class="follow-btn" data-follow="${esc(key)}"${possible?'':' disabled'} aria-label="Follow the ${esc(option.train.std)} ${esc(option.train.operator)} via ${esc(HUB_NAME[option.hub]||option.hub)}">${possible?'Follow':'Unavailable'}</button>`;
}
function selectFollowRoute(option){
  const chosen=C.startFollowRoute(option,{now:Date.now(),direction:direction(),mode:currentMode()});
  if(!chosen)return;
  state.saved.followRoute=chosen;state.followUpdate=null;state.saved.viewOverride=null;save();render();
}
document.addEventListener('click',e=>{
  const b=e.target.closest&&e.target.closest('[data-follow],[data-follow-action]');if(!b)return;
  if(b.dataset.follow){const option=followChoices.get(b.dataset.follow);if(option)selectFollowRoute(option);return;}
  const action=b.dataset.followAction;
  if(action==='boarded'&&state.followUpdate){
    const route=C.confirmFollowBoarding(state.followUpdate.route,Date.now());
    state.saved.followRoute=route;state.saved.viewOverride=null;
    const train=route.lastTrain;
    state.trainLock={operator:train.operator,std:train.std,from:train.from,picked:true,...(train.serviceId?{serviceId:train.serviceId}:{})};
  }
  else if(action==='stop'){state.saved.followRoute=null;if(Object.prototype.hasOwnProperty.call(state.saved,'follow'))state.saved.follow=null;state.followUpdate=null;}
  else if(action==='seen'&&state.followUpdate)state.saved.followRoute=C.acknowledgeFollowNotice(state.followUpdate.route,state.followUpdate.notice?.id);
  else if(action==='switch'&&state.followUpdate?.alternative){selectFollowRoute(state.followUpdate.alternative);return;}
  else if(action==='dismiss'&&state.followUpdate?.alternative)state.saved.followRoute=C.dismissFollowAlternative(state.followUpdate.route,state.followUpdate.alternative);
  save();render();
});
function followedObservation(route,now){
  const reliable=state.locStatus==='ok'&&state.lastFixAt&&now-state.lastFixAt<=90e3&&state.locAcc<=150;
  let phase=route.phase, currentTrainArrival=null,trainArrivalLive=false;
  const fit=state.onLine?whichTrain(now):null;
  if(fit&&state.rendered)state.rendered.train=fit;
  if(fit?.t&&C.followMatchesObservedTrain(route,{...route.option,train:fit.t,hub:fit.hub||route.option.hub})){
    phase='on-train';
    const pg=progressFor(fit.t.serviceId);
    const reported=pg?.data?.at(route.option.train.to);
    const boardKey=`${route.option.train.from}-${route.option.train.to}`;
    const freshBoard=!!state.boardsAt&&now-state.boardsAt<3*60e3&&!(state.followFailedBoards||[]).includes(boardKey)&&!state.routeFailed?.[boardKey];
    const sameTarget=fit.t.to===route.option.train.to;
    const chosenTrain=state.boards?.[boardKey]?.services?.find(train=>C.followMatchesService(route,{...route.option,train}));
    const observedTrain=sameTarget?fit.t:chosenTrain;
    currentTrainArrival=reported||(sameTarget?(fit.projected||fit.t.arr):chosenTrain?.arr)||null;
    trainArrivalLive=!!reported||!!(observedTrain&&!observedTrain.timetable&&freshBoard&&Number.isFinite(currentTrainArrival));
  }
  if(reliable){
    if(route.phase!=='before-train'&&route.mode==='commute'&&route.direction==='office'&&C.atOffice(fix(),PROFILE))phase='arrived';
    else if(route.phase!=='before-train'&&route.direction==='home'&&state.saved.home&&km(state.here,state.saved.home)<=0.1)phase='arrived';
    else if(route.phase==='on-train'&&!state.onLine&&
      ((route.direction==='office'&&state.atHub)||(route.direction==='home'&&nearlyHome())))phase='after-train';
  }
  let activeConnection=false,readyAt,connectionSource='';
  if(route.direction==='home'&&route.mode==='commute'&&phase==='before-train'){
    const ride=homeRide(now);if(ride&&state.rendered)state.rendered.ride=ride;
    if(ride){
      const connection=C.tubeHomeConnections(ride.t,S(),state.saved.pace==='fast'?'fast':'avg');
      readyAt=C.readyAtFromConnection(connection.reach,connection.ready);activeConnection=true;
      const live=followedTubeArrival(route,now);
      if(live){
        // A measured delay at one stop must not leave an earlier modelled readiness at
        // another stop eligible as a supposedly live recovery. Retain only this physical
        // interchange (King’s Cross and St Pancras share the Tube station).
        const reach=Object.fromEntries(Object.keys(connection.ready).filter(h=>(h==='STP'?'KGX':h)===live.hub).map(h=>[h,live.arrival]));
        readyAt=C.readyAtFromConnection(reach,connection.ready);
        connectionSource='Live arrival for your Tube vehicle at '+(HUB_NAME[route.option.hub]||route.option.hub);
      }
      else connectionSource='Estimated Tube ride to your rail connection';
    }
  }
  let currentArrival=null,onwardFresh=false,onwardSource='';
  if(phase==='after-train'&&route.mode==='commute'){
    const pace=state.saved.pace==='fast'?'fast':'avg';
    if(route.direction==='home'&&reliable&&state.here){
      const e=C.nearlyHomeEta(now,state.here,null,state.saved.home||null,S().letExit*1000,
        (pace==='fast'?S().walkStationHomeFast:S().walkStationHomeAvg)*1000,pace,PROFILE);
      if('at' in e){currentArrival=e.at;onwardFresh=true;onwardSource='Walk from your current location';}
    } else if(route.direction==='office'){
      const ride=currentRide(now);if(ride&&state.rendered)state.rendered.ride=ride;
      if(ride){
        const leg=officeLeg(ride.hub,lineIdOf(ride.line))||officeLeg(ride.hub,'circle');
        const live=leg?.stop==='Aldgate'&&state.ald&&now-state.ald.at<3*60e3?
          state.ald.arrivals?.find(a=>a.vehicle&&a.vehicle===ride.vehicle):null;
        if(leg){currentArrival=C.segmentArrival(live?live.t:ride.t,[...(live?[]:[{kind:'ride',secs:leg.rideMs/1000}]),{kind:'walk',secs:leg.tailMs/1000}]);
          onwardFresh=true;onwardSource=live?'Live Tube arrival and measured onward walk':'Estimated Tube ride and measured onward walk';}
      } else if(reliable&&nearOffice()){
        currentArrival=C.segmentArrival(now,[{kind:'walk',secs:C.walkSecs(state.here,PROFILE.places.office,pace,PROFILE)}]);onwardFresh=true;onwardSource='Walk from your current location';
      } else if(state.toOffice&&now-state.toOffice.at<120e3){currentArrival=state.toOffice.arrive;onwardFresh=true;onwardSource='TfL journey from your current location';}
    }
  }
  return {phase,currentTrainArrival,trainArrivalLive,activeConnection,readyAt,currentArrival,onwardFresh,onwardSource,connectionSource,
    hasReliableLocation:reliable&&(!state.onLine||phase==='on-train')};
}
function renderFollowPanel(){
  const panel=$('#followPanel');
  const route=C.restoreFollowRoute(state.saved.followRoute);
  const pending=pendingReleasedFollow();
  if(!route&&pending){
    panel.hidden=false;panel._renderedHtml=null;
    panel.innerHTML=`<div class="lbl">Restoring your saved followed journey</div><div class="big">Last known arrival ${hhmm(pending.arrive)}</div><div>${esc(pending.train.std)} ${esc(pending.train.operator)}</div><div class="note">Waiting for the matching train and itinerary. Your saved selection is kept.</div>${pending.reason?`<div class="note">${esc(pending.reason.text)}</div>`:''}<button type="button" class="follow-action" data-follow-action="stop">Stop following</button>`;
    return;
  }
  panel.hidden=!S().followRoute||!route||route.phase==='arrived'||route.direction!==direction()||route.mode!==currentMode();
  if(panel.hidden){panel.innerHTML='';panel._renderedHtml=null;return;}
  const now=Date.now(), observation=followedObservation(route,now);
  // Unfiltered options retain a departed/cancelled chosen service. Existing effort grading
  // supplies the reachable alternatives without giving the shell a second planning algorithm.
  const sameContext=route.direction===direction()&&route.mode===currentMode();
  const raw=sameContext?(route.mode==='leisure'?buildLeisure:buildJourneys)(route.direction,now,{here:true}):[];
  const availableOptions=sameContext?liveAdjust(raw,now,'follow'):[];
  // A cancelled/no-estimate service may lack an arrival and is correctly omitted by
  // buildOptions. Keep its actual observation for following without planning from it.
  if(sameContext&&!raw.some(o=>C.followMatchesService(route,o))){
    for(const board of Object.values(state.boards||{}))for(const train of board?.services||[]){
      const observed={...route.option,train};
      if(C.followMatchesService(route,observed))raw.push(observed);
    }
  }
  const selectedBoard=`${route.option.train.from}-${route.option.train.to}`;
  const dataFresh=!!state.boards&&sameContext&&!!state.boardsAt&&now-state.boardsAt<3*60e3&&
    !(state.routeFailed&&state.routeFailed[selectedBoard])&&!(state.followFailedBoards||[]).includes(selectedBoard);
  const result=C.updateFollowRoute(route,{now,options:raw,availableOptions,dataFresh,...observation,policy:PROFILE.disruption});
  state.followUpdate=result;
  if(JSON.stringify(result.route)!==JSON.stringify(state.saved.followRoute)){state.saved.followRoute=result.route;save();}
  const r=result.route,t=r.lastTrain, alt=result.alternative,st=result.trainStatus;
  const unknown=r.incident==='boarding'||result.status==='missed'||result.status==='cancelled'||(result.status==='unknown'&&result.level==='bad');
  const notice=result.notice;
  const delta=result.deltaMin;
  // Compare only before boarding, using the same current ranked options as the
  // other views. A saved winning label is not evidence that a route still wins.
  const comparison=r.phase==='before-train'?C.rankNow(availableOptions,r.direction,PROFILE,true).find(option=>C.followMatchesService(r,option)):null;
  const comparisonFlags=(comparison?.flags||[]).filter(flag=>flag.txt.startsWith('Arrives first'));
  panel.dataset.journeyService=journeyServiceKey(t);
  const html=`<div class="lbl">${result.status==='arrived'?'Journey complete':'Following your route'} · ${esc(r.direction==='office'?'outbound':'homeward')}</div>
    <div class="big">${unknown?'Arrival uncertain':`Arriving <span class="t">${hhmm(r.expectedArrival)}</span>`}</div>
    <div><span class="chip">${esc(C.trainName(t))}</span>${st?` <span class="pill ${st.level}">${esc(st.text)}</span>`:''}${platTag(t)}</div>
    <div class="meta">${journeyFactsMarkup(r.option,{train:t,arrival:unknown?null:r.expectedArrival,unavailable:unknown?true:r.phase==='after-train'?false:undefined})}${comparisonFlags.length?` · ${pills(comparisonFlags,true)}`:''}</div>
    <div class="follow-status ${result.level}">${esc(result.text)}</div>
    ${unknown||r.expectedArrival!==r.plannedArrival?`<div class="note">Original plan: arrive ${hhmm(r.plannedArrival)}</div>`:''}
    ${observation.connectionSource?`<div class="note">${esc(observation.connectionSource)}</div>`:''}
    ${!dataFresh&&!observation.onwardFresh&&!observation.trainArrivalLive?'<div class="note">Last known times · waiting for fresh journey data.</div>':''}
    ${observation.onwardSource?`<div class="note">${esc(observation.onwardSource)}</div>`:''}
    ${result.nextStep?`<div class="follow-next"><b>Next:</b> ${result.nextStep.t==null?'':hhmm(result.nextStep.t)+' · '}${esc(result.nextStep.d)}${result.nextStep.note?` <span class="note">${esc(result.nextStep.note)}</span>`:''}</div>`:''}
    ${notice?`<div class="banner ${notice.kind==='cancelled'||notice.kind==='missed'?'bad':notice.kind==='recovered'?'info':'warn'}" role="status"><span>${esc(notice.text)}</span><button type="button" class="follow-action" data-follow-action="seen">Seen</button></div>`:''}
    ${alt?`<div class="follow-alternative" data-journey-service="${esc(journeyServiceKey(alt.train))}"><b>${result.status==='missed'||result.status==='cancelled'?'A way on':'Another option'}</b>: ${esc(C.trainName(alt.train))} via ${esc(HUB_NAME[alt.hub]||alt.hub)} · arriving ${hhmm(alt.arrive)}${delta==null?'':` (${Math.abs(delta)} min ${delta<=0?'sooner':'later'})`}<div class="meta">${journeyFactsMarkup(alt)}</div>${pills(alt.flags,true)}
      <div class="follow-actions"><button type="button" class="follow-btn" data-follow-action="switch">Follow this instead</button><button type="button" class="follow-action" data-follow-action="dismiss">Keep my route</button></div></div>`:''}
    <details class="steps" data-key="follow-steps|${esc(r.id)}"><summary>Your journey steps</summary><ol class="legs">${C.followedLegs(r).map(l=>`<li class="t">${l.t==null?'':hhmm(l.t)}</li><li class="d">${esc(l.d)}${l.note?` <small>· ${esc(l.note)}</small>`:''}</li>`).join('')}</ol></details>
    ${r.phase==='before-train'&&now>=r.option.train.dep?'<button type="button" class="follow-action" data-follow-action="boarded">I’m on it</button>':''}
    <button type="button" class="follow-action" data-follow-action="stop">Stop following</button>`;
  if(panel._renderedHtml!==html){panel.innerHTML=html;panel._renderedHtml=html;}
  restoreOpen();
}
function signalDisruptionEvidence(){
  const now=Date.now(),view=state.journeyLivePresentation?.view||state.rendered?.view;
  const followed=state.followUpdate?.route;
  const current=state.rendered?.progress;
  const railComplete=followed?followed.phase==='after-train'||followed.phase==='arrived':
    direction()==='office'?['at-hub','on-tube','in-london'].includes(view):view==='nearly-home';
  const railActive=followed?.phase==='on-train'||state.onLine;
  const tubeComplete=direction()==='home'?(railActive||followed?.phase==='after-train'||['on-train','nearly-home'].includes(view)):view==='in-london';
  // Drawing an alert must not select, finish or persist a ride. The normal
  // journey controller has already established any current Tube journey.
  const cachedRide=state.saved.tubeRide;
  const ride=tubeComplete?null:(state.rendered?.ride||(cachedRide&&C.rideActive(cachedRide,now,fix())&&!C.rideEnded(cachedRide,now,fix())?cachedRide:null));
  const option=followed?.option||current?.option;
  const usesFallback=option?.tube?.fallback??aldgateUnusable();
  const tubeIds=currentMode()==='leisure'||tubeComplete?[]:ride?.line?[lineIdOf(ride.line)]:
    option?(usesFallback?['hammersmith-city']:['circle','metropolitan']):
    usesFallback?['circle','metropolitan','hammersmith-city']:['circle','metropolitan'];
  let boards=state.boards;
  let activeTrains=[];
  const currentTrain=state.rendered?.train?.t||current?.train||(state.onLine?whichTrain(now,false)?.t:null)||
    (railActive&&state.trainLock?.picked?C.lockedTrain(state.boards,state.trainLock):null);
  const chosen=followed?.option?.train||currentTrain;
  if(railComplete)boards={};
  else if(chosen){
    const matches=t=>followed?C.followMatchesService(followed,{...followed.option,train:t}):
      t===chosen||!!(t.serviceId&&t.serviceId===chosen.serviceId&&t.std===chosen.std&&t.from===chosen.from);
    const preferred=`${chosen.from}-${chosen.to}`,entries=Object.entries(boards||{});
    const scoped=entries.some(([key])=>key===preferred)?entries.filter(([key])=>key===preferred):entries;
    boards=Object.fromEntries(scoped.map(([key,board])=>[key,board?{...board,services:(board.services||[]).filter(matches)}:board]));
    const observed=Object.values(boards).flatMap(board=>board?.services||[]).find(matches);
    if(railActive&&observed)activeTrains=[observed];
  }
  if(!railComplete&&railActive&&state.rendered?.activeRailDisruption){
    if(!boards)boards={};
    activeTrains=[state.rendered.activeRailDisruption];
  }
  const keys=state.railSource==='darwin'?livePairs().map(pair=>pair.join('-')):boardKeys();
  return {railComplete,tiers:boards?C.railWarnings(boards,keys,now,PROFILE,{activeTrains}):null,
    tubeLines:(state.status||[]).filter(line=>tubeIds.includes(line.id)),
    fallback:!tubeComplete&&usesFallback&&aldgateUnusable()};
}
function signalNetworkLine(context=signalDisruptionEvidence()){
  const fallback=context.fallback;
  return C.statusLine({errors:[],notLoaded:[],stale:false,tiers:null,tubeFallback:fallback,
    fallbackUnavailable:fallback&&C.tubeFallbackNeeded(state.status||null,['hammersmith-city'],PROFILE.disruption),
    tubeLines:context.tubeLines,operators:[],statusUnavailable:false,planLater:false,demo:false,timetableOnly:false,policy:PROFILE.disruption});
}
function journeyDisruptions(){
  const context=signalDisruptionEvidence();
  const failed=Object.keys(displayedFailures()).map(k=>HUB_NAME[hubOfKey(k)]||k);
  const input={errors:state.errors||[],notLoaded:context.railComplete?[]:failed,stale:!context.railComplete&&!!state.boardsAt&&Date.now()-state.boardsAt>=3*60e3,
    tubeFallback:context.fallback,fallbackUnavailable:context.fallback&&C.tubeFallbackNeeded(state.status||null,['hammersmith-city'],PROFILE.disruption),tiers:context.tiers,tubeLines:context.tubeLines,operators:state.nrStatus||[],
    statusUnavailable:!state.status?.length||!state.nrStatus?.length,
    planLater:planIsLater(),demo:S().provider==='demo',timetableOnly:state.railSource==='tfl',policy:PROFILE.disruption};
  return {context,failed,input,items:C.visibleDisruptions(input)};
}
function renderSignalStatus(){
  const el=$('#signalStatus');el.hidden=false;
  const {context,failed,input,items}=journeyDisruptions();
  state.signalDisruptionItems=items;
  const region=$('#signalDisruptions');region.hidden=!items.length;region.setAttribute('aria-label','Significant disruption on your journey');
  region.innerHTML=items.map(item=>{
    const preview=item.detail.length?C.noticeTitle(item.detail[0]):'';
    const comparable=text=>String(text||'').replace(/\s+/g,' ').trim().replace(/[.!?]$/,'');
    const full=item.detail.length>1||comparable(item.detail[0])!==comparable(preview);
    return `<article class="signal-disruption ${item.level}" data-alert-id="${esc(item.id)}" data-scope="${item.scope}"><h3 class="signal-disruption-title">${esc(item.title)}</h3>${item.qualifier?`<p class="signal-disruption-qualifier">${esc(item.qualifier)}</p>`:''}${preview?`<p class="signal-disruption-detail">${linkify(preview)}</p>`:''}${full&&item.detail.length?`<details data-key="impact|${esc(item.id)}|${esc(item.title)}"><summary>Full details</summary><ul>${item.detail.map(detail=>`<li>${linkify(detail)}</li>`).join('')}</ul></details>`:''}</article>`;
  }).join('');
  const result=C.statusLine(input);
  const planBoards=state.saved.view==='by'?state.by?.boards:state.saved.view==='at'?state.at?.boards:null;
  if(!state.boards&&!planBoards&&!failed.length&&!state.errors?.length&&!items.length){el.className="info";el.textContent=state.loading?"Loading journey data…":"Journey data not available yet";return;}
  el.className=result.level;
  el.textContent=result.text;
  // Consolidated network flags must remain visible even when a train cancellation
  // or a feed failure takes precedence. The engine still chooses both summaries.
  const network=signalNetworkLine(context);
  if(['bad','warn'].includes(network.level)&&network.text!==result.text){
    const impact=document.createElement('span');impact.className='signal-network-impact '+network.level;impact.textContent=' · '+network.text;el.append(impact);
  }
  if(input.demo||input.timetableOnly){
    const source=C.statusLine({...input,errors:[],notLoaded:[],stale:false,tiers:null,tubeFallback:false,tubeLines:[],operators:[]});
    if(source.text!==result.text){const note=document.createElement('span');note.className='signal-source-note';note.textContent=' · '+source.text;el.append(note);}
  }
}
function renderSignalLocation(){
  const view=state.journeyLivePresentation?.view||state.rendered?.view,progress=state.rendered?.progressModel;
  const station=atStation(true),ride=state.rendered?.ride;
  const rail=state.onLine||state.followUpdate?.route?.phase==='on-train';
  const phase=rail?'On the train':ride?`On the ${ride.line||'Tube'}`:station?`At ${station}`:
    view==='nearly-home'?'Nearly home':view==='in-london'?'Walking to the office':'';
  const report=rail&&progress?.calls?.filter(call=>call.state==='reported').slice(-1)[0];
  const reportText=report?` · last ${progress.source==='stale'?'known ':''}report ${report.name}${report.time==null?'':' '+hhmm(report.time)}`:'';
  const fallback=state.autoSrc||(state.locStatus==='pending'||!state.locStatus?'finding your location…':'location unavailable');
  const phone=phase?` · phone: ${fallback.replace(/^you're /,'')}`:fallback;
  const old=state.lastFixAt&&Date.now()-state.lastFixAt>90e3?` · stale fix ${hhmm(state.lastFixAt)}`:'';
  $('#dirNote').textContent=`Location: ${phase}${reportText}${phone}${old}${state.locAcc>150?' · approximate position':''}`;
}
function renderJourneyExtras(){renderFollowPanel();renderJourneyProgress();renderSignalLocation();renderSignalStatus();renderSignalCompact();renderAlongLine();}
// DOM refreshes retain keyboard focus and the reading position. Stable data keys survive reordering.
function journeyFocus(){
  const a=document.activeElement;
  if(!a||a===document.body)return null;
  const keys=['data-follow','data-follow-action','data-pick','data-tubepick','data-ride'];
  const key=keys.find(k=>a.hasAttribute(k));
  return {id:a.id,key,value:key?a.getAttribute(key):null,detail:a.tagName==='SUMMARY'?detailsKey(a.parentElement):null,x:window.scrollX,y:window.scrollY};
}
function restoreJourneyFocus(f){
  if(!f)return;
  let el=f.id?document.getElementById(f.id):f.key?[...document.querySelectorAll(`[${f.key}]`)].find(e=>e.getAttribute(f.key)===f.value):null;
  if(f.detail){const d=[...document.querySelectorAll('details')].find(d=>detailsKey(d)===f.detail);el=d?.querySelector('summary');}
  if(el&&el!==document.activeElement){el.focus({preventScroll:true});if(window.scrollX!==f.x||window.scrollY!==f.y)window.scrollTo(f.x,f.y);}
}
