// Signal and Follow a route shell. Decisions and timing belong to src/core; this file draws
// those results and adapts existing observations. Both designs share this single controller.
const followChoices = new Map();
const journeyEnabled = () => !!(S().signal || S().followRoute);
function applyJourneyAppearance(){
  document.documentElement.dataset.design=S().signal?'signal':'panda';
  const theme=S().appearance;
  if(theme==='light'||theme==='dark')document.documentElement.dataset.theme=theme;
  else delete document.documentElement.dataset.theme;
  $('#journeyViewControl').hidden=!journeyEnabled();
}
function journeyInteracting(){
  const a=document.activeElement;
  return !!($('#settings').open || (a&&a.matches('input,select,textarea,[data-pick],[data-tubepick]')) ||
    document.querySelector('#banners details[open],#hero details[open],#followPanel details[open]'));
}
function journeySituation(now,s){
  const live=C.chooseView({...s,plan:'now'});
  const active=!live.view.startsWith('plan-')&&live.view!=='awaiting-location';
  const station=atStation(), way=onWay();
  const phase=active?live.view:station?'station:'+station:way?'walking-to-station':'planning';
  const key=`${direction()}|${currentMode()}|${phase}`;
  // A temporary denied/stale position is not a new journey situation.
  const reliable=state.locStatus==='ok'&&state.lastFixAt&&now-state.lastFixAt<=90e3&&state.locAcc<=150;
  if(reliable || !state.journeySituationKey)state.journeySituationKey=key;
  return {live,key:state.journeySituationKey,active:active||!!station||!!way};
}
function journeyPresentation(now,s){
  const auto=C.chooseView(s);
  if(!journeyEnabled())return auto;
  const current=journeySituation(now,s);
  const shown=C.resolveViewControl({auto,live:current.live,hasActiveJourney:current.active,plan:s.plan,
    override:state.saved.viewOverride,now,situationKey:current.key,previous:state.presentation,interacting:journeyInteracting()});
  if(JSON.stringify(state.saved.viewOverride||null)!==JSON.stringify(shown.override)){
    state.saved.viewOverride=shown.override;save();
  }
  state.pendingView=shown.pending;
  document.querySelectorAll('[data-journey-view]').forEach(b=>{
    b.setAttribute('aria-pressed',String(b.dataset.journeyView===shown.mode));
    if(b.dataset.journeyView==='auto')b.textContent=shown.mode==='auto'?'Auto':'Return to Auto';
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
  const possible=!!C.startFollowRoute(option,{now:Date.now(),direction:direction(),mode:currentMode()});
  return `<button type="button" class="follow-btn" data-follow="${esc(key)}"${possible?'':' disabled'} aria-label="Follow the ${esc(option.train.std)} ${esc(option.train.operator)} via ${esc(HUB_NAME[option.hub]||option.hub)}">${possible?'Follow this route':'Cannot follow this train'}</button>`;
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
  if(action==='stop'){state.saved.followRoute=null;state.followUpdate=null;}
  else if(action==='seen'&&state.followUpdate)state.saved.followRoute=C.acknowledgeFollowNotice(state.followUpdate.route,state.followUpdate.notice?.id);
  else if(action==='switch'&&state.followUpdate?.alternative){selectFollowRoute(state.followUpdate.alternative);return;}
  else if(action==='dismiss'&&state.followUpdate?.alternative)state.saved.followRoute=C.dismissFollowAlternative(state.followUpdate.route,state.followUpdate.alternative);
  save();render();
});
function followedObservation(route,now){
  const reliable=state.locStatus==='ok'&&state.lastFixAt&&now-state.lastFixAt<=90e3&&state.locAcc<=150;
  let phase=route.phase, currentTrainArrival=null;
  const fit=state.onLine?whichTrain(now):null;
  if(fit?.t&&C.followMatchesService(route,{...route.option,train:fit.t,hub:fit.hub||route.option.hub})){
    phase='on-train';
    const pg=progressFor(fit.t.serviceId);
    currentTrainArrival=pg?.data?.at(route.option.train.to)||fit.projected||fit.t.arr;
  }
  if(reliable){
    if(route.direction==='office'&&C.atOffice(fix(),PROFILE))phase='arrived';
    else if(route.direction==='home'&&state.saved.home&&km(state.here,state.saved.home)<=0.1)phase='arrived';
    else if(route.phase==='on-train'&&!state.onLine&&
      ((route.direction==='office'&&state.atHub)||(route.direction==='home'&&nearlyHome())))phase='after-train';
  }
  return {phase,currentTrainArrival,hasReliableLocation:reliable};
}
function renderFollowPanel(){
  const panel=$('#followPanel');
  const route=C.restoreFollowRoute(state.saved.followRoute);
  panel.hidden=!S().followRoute||!route;
  if(panel.hidden){panel.innerHTML='';return;}
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
    !(state.routeFailed&&state.routeFailed[selectedBoard]);
  const result=C.updateFollowRoute(route,{now,options:raw,availableOptions,dataFresh,...observation});
  state.followUpdate=result;
  if(JSON.stringify(result.route)!==JSON.stringify(state.saved.followRoute)){state.saved.followRoute=result.route;save();}
  const r=result.route,t=r.lastTrain, alt=result.alternative,st=C.trainStatus(t);
  const unknown=result.status==='cancelled'||(result.status==='unknown'&&result.level==='bad');
  const notice=result.notice;
  const delta=result.deltaMin;
  panel.innerHTML=`<div class="lbl">${result.status==='arrived'?'Journey complete':'Following your route'} · ${esc(r.direction==='office'?'outbound':'homeward')}</div>
    <div class="big">${unknown?'Arrival uncertain':`Arriving <span class="t">${hhmm(r.expectedArrival)}</span>`}</div>
    <div><span class="chip">${esc(C.trainName(t))}</span>${st?` <span class="pill ${st.level}">${esc(st.text)}</span>`:''}${platTag(t)}</div>
    <div class="follow-status ${result.level}">${esc(result.text)}</div>
    ${!dataFresh?'<div class="note">Last known times · waiting for fresh journey data.</div>':''}
    ${result.nextStep?`<div class="follow-next"><b>Next:</b> ${result.nextStep.t==null?'':hhmm(result.nextStep.t)+' · '}${esc(result.nextStep.d)}${result.nextStep.note?` <span class="note">${esc(result.nextStep.note)}</span>`:''}</div>`:''}
    ${notice?`<div class="banner ${notice.kind==='cancelled'||notice.kind==='missed'?'bad':'warn'}" role="status"><span>${esc(notice.text)}</span><button type="button" class="follow-action" data-follow-action="seen">Seen</button></div>`:''}
    ${alt?`<div class="follow-alternative"><b>${result.status==='missed'||result.status==='cancelled'?'A way on':'Another option'}</b>: ${esc(C.trainName(alt.train))} via ${esc(HUB_NAME[alt.hub]||alt.hub)} · arriving ${hhmm(alt.arrive)}${delta==null?'':` (${Math.abs(delta)} min ${delta<=0?'sooner':'later'})`}${pills(alt.flags,true)}
      <div class="follow-actions"><button type="button" class="follow-btn" data-follow-action="switch">Follow this instead</button><button type="button" class="follow-action" data-follow-action="dismiss">Keep my route</button></div></div>`:''}
    <details class="steps" data-key="follow-steps|${esc(r.id)}"><summary>Your journey steps</summary><ol class="legs">${C.followedLegs(r).map(l=>`<li class="t">${l.t==null?'':hhmm(l.t)}</li><li class="d">${esc(l.d)}${l.note?` <small>· ${esc(l.note)}</small>`:''}</li>`).join('')}</ol></details>
    <button type="button" class="follow-action" data-follow-action="stop">Stop following</button>`;
  restoreOpen();
}
function renderSignalStatus(){
  const el=$('#signalStatus');el.hidden=!S().signal;if(el.hidden)return;
  const failed=Object.keys(state.routeFailed||{}).map(k=>HUB_NAME[hubOfKey(k)]||k);
  const result=C.statusLine({errors:state.errors||[],notLoaded:failed,stale:!!state.boardsAt&&Date.now()-state.boardsAt>=3*60e3,
    tubeFallback:aldgateUnusable(),tiers:state.boards?railWarnings():null,tubeLines:state.status||[],operators:state.nrStatus||[],
    planLater:planIsLater(),demo:S().provider==='demo',timetableOnly:state.railSource==='tfl'});
  if(!state.boards&&!state.errors?.length){el.className="info";el.textContent=state.loading?"Loading journey data…":"Journey data not available yet";return;}
  el.className=result.level;
  el.textContent=result.text;
}
function renderJourneyExtras(){renderFollowPanel();renderSignalStatus();}
// DOM refreshes retain keyboard focus and the reading position. Stable data keys survive reordering.
function journeyFocus(){
  if(!journeyEnabled())return null;
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
