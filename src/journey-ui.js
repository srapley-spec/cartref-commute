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
    modebar:make('div','signalModebar',''),
    toolbar:make('div','signalToolbar',''),
    adjustments:make('details','signalAdjustments','<summary id="signalContextSummary">Journey options</summary><div class="signal-adjustment-body"></div>'),
    planning:make('div','signalPlanningControls',''),
    notices:make('details','signalNotices','<summary>Travel alerts <span id="signalNoticeCount"></span></summary>'),
    network:make('details','signalNetwork','<summary>Lines &amp; data</summary><div id="signalCurrentLines"></div>'),
    other:make('details','signalOtherJourneys','<summary>Other recommendations</summary>'),
    later:make('details','signalLaterTrains','<summary>Other trains</summary>'),
    boardHeading:make('div','signalBoardHeading',''),
    disruptions:make('section','signalDisruptions',''),
    connections:make('div','signalConnections',''),
    freshness:make('span','signalFreshness','')
  };
  const p=signalParts;
  p.toolbar.className='signal-toolbar';p.modebar.className='signal-modebar';
  for(const key of ['adjustments','notices','network','other'])p[key].dataset.key='signal-'+key;
  const originalControls=document.querySelector('[data-mode]').closest('.controls');
  const modeButtons=document.querySelector('[data-mode]').closest('.seg');
  p.adjustments.querySelector('div').append(originalControls,$('#journeySimulatorBtn'));
  p.modebar.append(modeButtons);
  const utility=document.createElement('div');utility.className='signal-utility';
  const settings=$('#settingsBtn'),refresh=$('#refreshBtn');
  settings.textContent='⚙';settings.setAttribute('aria-label','Settings');settings.title='Settings';
  refresh.textContent='↻';refresh.setAttribute('aria-label','Refresh');refresh.title='Refresh';
  utility.append(settings,refresh);p.modebar.append(utility);
  p.toolbar.append($('#journeyViewControl'),p.adjustments);
  p.planning.append(document.querySelector('[data-view]').closest('.controls'),$('#byForm'));
  p.notices.append($('#banners'));
  p.boardHeading.append($('#listTitle'),p.notices);
  const statusTitle=$('#status').previousElementSibling;
  p.network.append(statusTitle,$('#status'),$('#modelNote'),root.querySelector('footer > span'));
  root.querySelector('footer').prepend(p.freshness);
  const header=root.querySelector('header');header.hidden=true;
  for(const node of [header,p.modebar,$('#alongNavigation'),p.toolbar,$('#dirNote'),p.planning,$('#originRow'),$('#destRow'),$('#signalStatus'),p.disruptions,$('#followPanel'),p.connections,$('#hero'),p.other,p.boardHeading,p.later,$('#list'),$('#diag'),p.network,root.querySelector('footer')])root.append(node);
}
// Under way (a route followed, or a live view showing) the controls fold into one row (amendment §7, #57 A5): a
// summary ("Commute · To office · Leave now") that opens them, beside Settings and Refresh. Planning keeps every
// control in view. Only the drawing changes: the controls themselves, and their handlers, are the same.
function underWayControls(context){
  const p=signalParts;if(!p)return;
  const view=state.rendered?.view||state.presentation?.view||'';
  const under=state.saved.mode!=='trip'&&(!!state.saved.followRoute||!['','plan-now','plan-at','plan-by','awaiting-location'].includes(view));
  let btn=$('#signalUnderwaySummary');
  if(!btn){btn=document.createElement('button');btn.type='button';btn.id='signalUnderwaySummary';btn.className='signal-underway-summary';
    btn.addEventListener('click',()=>{const open=document.body.toggleAttribute('data-controls-open');btn.setAttribute('aria-expanded',String(open));});
    p.modebar.insertBefore(btn,p.modebar.querySelector('.signal-utility'));}
  const modeName={commute:'Commute',leisure:'Leisure',trip:'Trip'}[state.saved.mode]||'Commute';
  const viewName={now:'Leave now',by:'Arrive by',at:'Leave around'}[state.saved.view]||'Leave now';
  btn.textContent=`${modeName} · ${context} · ${viewName}`;
  btn.setAttribute('aria-label',`Journey controls: ${modeName}, ${context}, ${viewName}`);
  btn.hidden=!under;
  if(!under)document.body.removeAttribute('data-controls-open');
  btn.setAttribute('aria-expanded',String(document.body.hasAttribute('data-controls-open')));
  document.body.toggleAttribute('data-underway',under);
}
function setJourneyContext(label,modes='',detail=''){
  const summary=$('#signalContextSummary');
  summary.innerHTML=`<span class="signal-context-copy"><span>${esc(label)}</span>${modes?`<small>${esc(modes)}</small>`:''}</span>`;
  summary.title=detail||label;summary.setAttribute('aria-label','Journey options: '+label+(modes?' · '+modes:''));
}
function signalReadingVisible(node){
  for(let p=node;p;p=p.parentElement)if(p.hidden||(p.tagName==='DETAILS'&&!p.open))return false;
  return true;
}
function renderSignalCompact(){
  if(!signalParts)return;
  const p=signalParts;
  const context=state.saved.mode==='leisure'?(direction()==='home'?'To home':outTo(direction(),'leisure')?.name||'To London'):direction()==='home'?'To home':'To office';
  setJourneyContext(context,'',$('#routeLabel').textContent);
  underWayControls(context);
  arrangeJourneySummaries($('#hero'));arrangeJourneySummaries($('#list'));arrangeJourneySummaries($('#followPanel'));
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
  // Duration has a dedicated home immediately after the headline times. Long
  // routes, platforms, flags and Follow labels must never displace that row.
  for(const opt of $('#hero').querySelectorAll('.opt')){
    if(opt.classList.contains('journey-option'))continue;
    const times=opt.querySelector('.optrow'),facts=opt.querySelector('.journey-facts');
    if(times&&facts){
      times.after(facts);
      const route=times.querySelector('.optroute');if(route)facts.after(route);
    }
  }
  for(const row of $('#list').querySelectorAll('.row')){
    const mid=row.querySelector('.mid'),facts=mid?.querySelector('.journey-facts');
    if(facts){
      const meta=facts.parentElement;mid.prepend(facts);
      if(meta!==mid&&!meta.textContent.trim())meta.remove();
    }
  }
  // Both recommendations keep the same complete option renderer and actions.
  const options=[...$('#hero').children].filter(n=>n.classList.contains('opt'));
  for(const opt of options.slice(1)){
    opt.classList.add('signal-alternative');
    if(!opt.querySelector(':scope>.signal-alt-label')){
      const label=document.createElement('h3');label.className='signal-alt-label';label.textContent='Next best';opt.prepend(label);
    }
  }
  p.connections.replaceChildren();
  const following=!$('#followPanel').hidden;
  const secondary=following&&state.presentation?.mode!=='plan'&&!!$('#hero .opt');
  p.other.hidden=!secondary;
  if(secondary){p.connections.append(...$('#hero').querySelectorAll('.tubes'));if($('#hero').parentElement!==p.other)p.other.append($('#hero'));}
  else rootSignalHeroHome();
  p.connections.hidden=!p.connections.childNodes.length;
  // One journey, no repeats (Sam, 10 Nov): while you follow a route and the live card is about that same journey,
  // the followed card alone states it; the live card keeps what you tap or look at. A live card about a different
  // train (one you selected instead) is shown in full.
  const followed=following?activeFollow():null, shown=state.rendered?.train?.t;
  const shares=!!followed&&!!followed.option&&!secondary&&!$('#hero .opt')&&(!shown||C.followIsTrain(followed,shown));
  $('#hero').classList.toggle('shares-follow',shares);
  // (Marked on the blocks too, so the rule doesn't depend on which stylesheet is read last.)
  for(const n of $('#hero').querySelectorAll(':scope > [data-block="headline"]:not(.empty), :scope > .journey-connection, :scope > [data-block="then"], :scope > .meta[data-block="which"]'))n.hidden=shares;
  // Once you've set off, the list of other trains folds away (no stale "Can't make it" cards beside your journey).
  const setOff=!!followed&&!!followed.option&&(followed.phase!=='before-train'||Date.now()>=followed.option.leave);
  p.later.hidden=!setOff;$('#listTitle').hidden=setOff;
  if(setOff){if($('#list').parentElement!==p.later)p.later.append($('#list'));}
  else if($('#list').parentElement===p.later)p.later.after($('#list'));
  // (Only a live view is the journey under way; a plan under the followed card, or the wait for a position, is not.)
  const view=state.presentation?.view||'', liveView=!!view&&!view.startsWith('plan-')&&view!=='following'&&view!=='awaiting-location';
  singleCard(shares&&liveView?followed:null);
  restoreOpen();
}
// One journey card (10 Nov amendment §1; Sam, 11 Nov: "Build the single card view as this was confusing"). While you
// follow a route and the live card is about that same journey, the live card is not drawn beside the followed card:
// what it still shows moves into the one card, in this order: the journey (clocks, the service you're on, status,
// anything the app is asking you); the legs; what's next; then, folded, "Not your train?", "Report details", your
// journey steps and Stop following. The parts keep their own handlers (clicks are handled at the document) and their
// own styles (each group sits in a box that carries the live card's class).
// One "behind" figure on the card (#57 H10): the followed card's status says how the journey stands, so the legs'
// own status ("3 min behind") goes from the one journey card.
function oneStatus(node){node?.querySelector('.jp-heading > .jp-status')?.remove();}
function singleCard(route){
  const panel=$('#followPanel'), hero=$('#hero');
  const drawn=panel.querySelector(':scope > .journey-progress');   // put there this pass by renderJourneyProgress
  const reportIn=n=>[...n.querySelectorAll('details')].find(d=>/Report details/.test(d.querySelector('summary')?.textContent||''));
  // Nothing changed since the card was last built: keep its parts as they are (a tap under way still lands on its
  // button) and take in only the legs, which are drawn afresh on every pass.
  const sig=(panel._renderedHtml||'')+'\u0000'+hero.innerHTML+'\u0000'+(drawn?drawn.outerHTML:'');
  if(route&&panel.dataset.single&&panel._singleSig===sig){
    const fresh=drawn||hero.querySelector(':scope > .journey-progress'), slot=panel.querySelector(':scope > [data-slot="legs"]'), kept=panel._singleReport;   // (it went out with the old legs)
    const start=panel.querySelector(':scope > .follow-next')||panel.querySelector(':scope > .steps')||panel.querySelector(':scope > [data-follow-action="stop"]');
    if(fresh){
      oneStatus(fresh);
      if(slot&&!drawn)slot.replaceChildren(fresh);else if(start)start.before(fresh);
      const details=reportIn(fresh);if(kept&&details)details.append(kept);
    }
    hero.hidden=true;return;
  }
  delete panel._singleSig;delete panel._singleReport;
  if(panel.dataset.single){                                        // back to the card as drawn, then build afresh
    drawn?.remove();panel.innerHTML=panel._renderedHtml||'';delete panel.dataset.single;arrangeJourneySummaries(panel);
    if(drawn){const before=panel.querySelector(':scope > .steps');if(before)before.before(drawn);else panel.append(drawn);}
  }
  hero.hidden=false;
  if(!route)return;
  const own=sel=>panel.querySelector(`:scope > ${sel}`);
  const box=(slot,nodes)=>{const d=document.createElement('div');d.className='hero merged';d.dataset.slot=slot;d.append(...nodes);return d;};
  const fold=(key,label,open,inner)=>{const d=document.createElement('details');d.className='fold';d.dataset.key=`${key}|${route.id}`;d.open=!!open;
    const s=document.createElement('summary');s.textContent=label;d.append(s,inner);return d;};
  // What the live card still shows: not what "one journey, no repeats" already hides, and not empty leftovers.
  const live=[...hero.children].filter(n=>!n.hidden&&(n.textContent.trim()||n.querySelector('button,a,input,select,svg,img')));
  const take=test=>{const out=[];for(let i=0;i<live.length;)if(test(live[i]))out.push(...live.splice(i,1));else i++;return out;};
  const legs=take(n=>n.classList.contains('journey-progress'));
  legs.forEach(oneStatus);if(drawn)oneStatus(drawn);
  // Where the figures come from goes with the legs' own "Report details". With no legs drawn (at the change
  // station), only the live card's title folds away; its notes ("Loading live tube times…", the allowances) stay in view.
  const legsFold=!!(drawn||legs[0])&&!!reportIn(drawn||legs[0]);
  const report=take(n=>n.dataset.block==='label'||(legsFold&&n.dataset.block==='source'));
  // An arrive-by verdict ("On time for 09:00 · 6 min to spare") belongs with the status.
  const verdict=take(n=>n.dataset.block==='verdict');
  // A question the app is asking (the wrong-train check, "Switch to …?") is never folded away.
  const asking=take(n=>n.classList.contains('pick')&&(n.classList.contains('doubt')||!!n.querySelector('[data-pick-cancel]')));
  // On a train, the other candidates are the correction ("Not your train?"), folded unless the app is unsure. Other
  // choices the live card offers (which tube, "Got off already?") are things to do next and stay in view.
  const correct=state.rendered?.train?take(n=>n.classList.contains('pick')):[];
  // Which train you're on is said once: the live card's line when it has one ("You're on …", or "Probably … or …"
  // while it is unsure, which is also when "Not your train?" stands open), else the followed card's own.
  let found=false;const identity=take(n=>!found&&n.dataset.block==='which'&&(found=true));
  if(identity.length){const mine=own('.follow-service'),b=box('service',identity);b.classList.add('follow-service');
    if(mine)mine.replaceWith(b);else (own('.meta')||own('.follow-status'))?.before(b);}
  // At the change station the live instruction ("Get on the Met to Aldgate …") is the next step: the saved "Next:
  // Circle or Met to Aldgate" isn't said beside it (11 Nov 2026: "Get on the H&C" above "Next: Circle or Met").
  if(state.presentation?.view==='at-hub'&&live.some(n=>n.dataset.block==='which'&&n.querySelector('.slack')))own('.follow-next')?.remove();
  const next=own('.follow-next'), steps=own('.steps'), stop=own('[data-follow-action="stop"]'), start=next||steps||stop;
  if(!start)return;
  // 1. The journey: notices, questions and the other option sit with the status, above the legs.
  for(const n of [verdict.length?box('verdict',verdict):null,own('.banner'),own('[data-boarding-ask]'),own('[data-follow-action="boarded"]'),asking.length?box('asking',asking):null,own('.follow-alternative')])if(n)start.before(n);
  // 2. The legs.
  if(legs.length)start.before(box('legs',legs));else if(own('.journey-progress'))start.before(own('.journey-progress'));
  // 3. What's next: the next step, the onward tube, then whatever else the live card has to say or offer.
  let after=next;
  const place=n=>{if(after){after.after(n);after=n;}else (steps||stop).before(n);};
  if(route.direction!=='home'&&own('.tube-line'))place(own('.tube-line'));
  if(live.length)place(box('next',live));
  // 4. Folded away. "Not your train?" opens by itself only while the app is unsure which train you're on.
  const unsure=!!state.rendered?.train&&!state.rendered.train.sure;
  // (Its own key while it stands open by itself, so that isn't remembered as your choice once the train is settled.)
  // Standing open by itself is not you reading it: it doesn't hold back a change of view.
  if(correct.length){const f=fold(unsure?'follow-correct-unsure':'follow-correct','Not your train?',unsure,box('correct',correct));if(unsure)f.dataset.auto='1';(steps||stop).before(f);}
  // Where the figures come from joins the legs' own "Report details" when there is one (one fold, not two).
  const legsNow=panel.querySelector('.journey-progress'), details=legsNow?reportIn(legsNow):null;
  if(report.length){if(details)details.append(panel._singleReport=box('report',report));else (steps||stop).before(fold('follow-report','Report details',false,box('report',report)));}
  panel.dataset.single='1';panel._singleSig=sig;hero.hidden=true;
}
function rootSignalHeroHome(){if(signalParts&&$('#hero').parentElement!==signalParts.other.parentElement)signalParts.other.before($('#hero'));}
function journeyInteracting(){
  const a=document.activeElement;
  return !!($('#settings').open || (a&&!a.closest('#simDock')&&a.matches('input,select,textarea,[data-pick],[data-tubepick]')) ||
    [...document.querySelectorAll('#banners details[open],#signalDisruptions details[open],#hero details[open],#followPanel details[open]:not([data-auto]),#signalNotices[open]')].some(signalReadingVisible));
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
  if(tripActive()){tripUiFor().pinView(mode);return;}
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
// "I'm on it", or (after it was tapped while the evidence is unsure) the trains that could be yours, the one you
// follow first. Selecting another train here is an answer to the question, so it isn't asked a second time.
function boardingMarkup(route,now){
  // (The question belongs to the route it was asked about.)
  const check=state.boardingAsk===route.id?C.boardingCheck(route,state.onLine?whichTrain(now,false):null):{ask:false};
  if(!check.ask){state.boardingAsk=false;return '<button type="button" class="follow-action" data-follow-action="boarded">I’m on it</button>';}
  return `<div class="pick doubt" data-boarding-ask><b>Which train are you on?</b>${check.candidates.map(t=>C.followIsTrain(route,t)
    ?`<button type="button" class="pickbtn" data-follow-action="boarded" data-sure>${esc(C.trainName(t))} · the train you're following</button>`
    :`<button type="button" class="pickbtn" data-pick="${pickData(t)}" data-pick-confirmed>${esc(C.trainName(t))}</button>`).join('')}</div>`;
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
    // "I'm on it" looks at the evidence first (#57 C2): unsure between trains, or the working-out says another
    // train, and it asks which. The answer (data-sure: "the train you're following") is then taken at its word.
    if(b.dataset.sure==null&&C.boardingCheck(state.followUpdate.route,state.onLine?whichTrain(Date.now(),false):null).ask){state.boardingAsk=state.followUpdate.route.id;render();return;}
    state.boardingAsk=false;state.pendingPick=null;
    const route=C.confirmFollowBoarding(state.followUpdate.route,Date.now());
    state.saved.followRoute=route;state.saved.viewOverride=null;
    const train=route.lastTrain;
    state.trainLock={operator:train.operator,std:train.std,from:train.from,picked:true,at:Date.now(),...(train.serviceId?{serviceId:train.serviceId}:{})};
  }
  else if(action==='stop'){state.boardingAsk=false;state.saved.followRoute=null;if(Object.prototype.hasOwnProperty.call(state.saved,'follow'))state.saved.follow=null;state.followUpdate=null;}
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
  // Aboard by your own word or an earlier working-out, but the phone isn't placed on the line (underground, a
  // reload): the train's own reports and its board still say when it arrives.
  if(!fit&&route.phase==='on-train'){
    const train=route.lastTrain||route.option.train, pg=progressFor(train.serviceId), reported=pg?.data?.at(route.option.train.to);
    const boardKey=`${route.option.train.from}-${route.option.train.to}`;
    const freshBoard=!!state.boardsAt&&now-state.boardsAt<3*60e3&&!(state.followFailedBoards||[]).includes(boardKey)&&!state.routeFailed?.[boardKey];
    const chosenTrain=state.boards?.[boardKey]?.services?.find(t=>C.followMatchesService(route,{...route.option,train:t}));
    currentTrainArrival=reported||chosenTrain?.arr||null;
    trainArrivalLive=!!reported||!!(chosenTrain&&!chosenTrain.timetable&&freshBoard&&Number.isFinite(currentTrainArrival));
  }
  // Are you at the station the followed train leaves from? (The page's usual test for a station: a fix good to
  // 250 m.) 'at' with a fresh fix; 'was' when that was the last fix and nothing fresher has arrived.
  const from=route.option.train.from;
  let boarding=C.boardingPlace({phase,accM:state.here?state.locAcc:null,
    atHub:route.direction==='home'&&!!state.atHub&&state.atHub===from,
    kmToStation:route.direction!=='home'&&from===HOME&&state.here?km(state.here,GEO.HOME):null,
    fixOk:state.locStatus==='ok',fixAgeMs:state.lastFixAt?now-state.lastFixAt:null});
  // Seen at the station within the last 10 minutes and not seen anywhere that rules out boarding since: last seen
  // there, so never "missed" as the train pulls away and the phone is neither at the station nor yet placed on the
  // line (11 Nov 2026, 07:34: declared missed while aboard).
  if(boarding==='at')state.seenAtStation={route:route.id,at:now};
  else if(!boarding&&phase==='before-train'&&state.seenAtStation?.route===route.id&&now-state.seenAtStation.at<=10*60e3&&!state.atHub)boarding='was';
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
        currentArrival=C.segmentArrival(now,[{kind:'walk',secs:officeWalkSecs(pace)}]);onwardFresh=true;onwardSource='Walk from your current location';
      } else if(state.atHub&&state.hubOffice&&state.hubOffice.hub===state.atHub&&now-state.hubOffice.at<120e3){
        // At the change station: the same tubes the card lists, not TfL's journey planner (11 Nov 2026, #57 retest).
        currentArrival=state.hubOffice.arrive;onwardFresh=true;onwardSource='Next tube and measured onward walk';
      } else if(state.toOffice&&now-state.toOffice.at<120e3){currentArrival=state.toOffice.arrive;onwardFresh=true;onwardSource='TfL journey from your current location';}
    }
  }
  return {phase,currentTrainArrival,trainArrivalLive,activeConnection,readyAt,currentArrival,onwardFresh,onwardSource,connectionSource,boarding:activeConnection?null:boarding,
    hasReliableLocation:reliable&&(!state.onLine||phase==='on-train')};
}
// "Arriving 08:28 (was 08:24): …": the new time carries the weight.
const noticeMarkup=text=>{const m=/^(Arriving \d\d:\d\d)( \(was .*)$/.exec(text);return m?`<b>${esc(m[1])}</b>${esc(m[2])}`:esc(text);};
// A tube named with its lines, each in TfL's colour (identity, not status). Words confirmed by Sam, 10 Nov.
const TUBE_LINE_LABEL={circle:'Circle',met:'Met',hc:'H&C'};
const tubeLineChips=lines=>lines.map(l=>`<span class="chip ${esc(l)}">${esc(TUBE_LINE_LABEL[l]||l)}</span>`).join(' ');
function tubeLineMarkup(option,direction){
  const t=C.tubeLine(option,direction,STATIONS);if(!t)return '';
  return direction==='office'
    ?`<div class="tube-line" data-block="tube-line"><div><b>Then</b> ${tubeLineChips(t.lines)} to ${esc(t.to)}${t.toward?` · ${esc(t.toward)}`:''} · about ${t.rideMin} min</div>${t.alt?`<div class="tube-alt">or ${tubeLineChips(t.alt.lines)} to ${esc(t.alt.to)} · if it comes first</div>`:''}</div>`
    :`<div class="tube-line" data-block="tube-line"><b>Tube:</b> ${tubeLineChips(t.lines)} ${esc(t.from)} → ${esc(t.to)} · ${t.rideMin} min</div>`;
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
  const panelLayout=r.phase==='before-train';
  // How hard you'd have to walk is a question only while the way to the station is still ahead of you: not on the
  // tube you're riding to it, and not once you're at it (10 Nov, #57 H15/H20: the label came from a fresh plan made
  // from the phone's position and contradicted the status line beneath it).
  const wayAhead=!observation.activeConnection&&!observation.boarding;
  const access=panelLayout&&!unknown&&wayAhead?comparison:null;
  const platformBy=C.platformBy(r.option,t.dep,Date.now());
  // One leave time (10 Nov, #57 H2): while the header shows Leave by, the first step ("Leave office") carries that
  // same time, not its own copy.
  const legs=C.followedLegs(r,Date.now()), leaveStep=access&&Number.isFinite(access.leave)&&legs[0]&&!legs[0].train&&!legs[0].tube?legs[0]:null;
  const stepTime=l=>l===leaveStep||(leaveStep&&l&&l.d===leaveStep.d&&l.t===leaveStep.t)?access.leave:l.t;
  // The live card names a different train (one you selected instead): this card names the train it follows, and
  // leaves "You're on …" to the card that is working out where you are (never two cards claiming two trains).
  const otherShown=!!state.rendered?.train?.t&&!C.followIsTrain(r,state.rendered.train.t);
  // Off the train (10 Nov, #57 H26): the finished train leaves the card, and once the only step left is arriving
  // the header reads "Now → At home", not the arrival time on both sides.
  const offTrain=r.phase==='after-train'||r.phase==='arrived';
  const tailLeg=legs.filter(l=>l.t!=null&&!l.calls).pop();
  const lastLeg=r.phase==='after-train'&&!!result.nextStep&&!!tailLeg&&result.nextStep.d===tailLeg.d&&result.nextStep.t===tailLeg.t;
  // The tube that goes with the journey, named with its lines: coming home it is the first thing you do (until
  // you're at the station the train leaves from); going out it follows the train (until you're off the train).
  const tubeLine=r.direction==='home'?(r.phase==='before-train'&&!observation.boarding&&!state.atHub?tubeLineMarkup(r.option,'home'):'')
    :(r.phase==='before-train'||r.phase==='on-train'?tubeLineMarkup(r.option,'office'):'');
  // When it can no longer be made, the header shows the way on instead of "Unavailable" (11 Nov 2026, 07:16).
  const giveUpWay=result.status==='missed'&&result.alternative&&!observation.activeConnection?result.alternative:null;
  panel.dataset.journeyService=journeyServiceKey(t);
  const html=`<div class="lbl">${result.status==='arrived'?'Journey complete':'Following your route'} · ${esc(r.direction==='office'?'outbound':'homeward')}</div>
    ${giveUpWay?`<div class="follow-instead">Instead: the ${esc(C.trainName(giveUpWay.train))}</div>${journeyTimesMarkup({leave:giveUpWay.leave,arrive:giveUpWay.arrive,dest:r.direction==='office'?'office':'home',leftLabel:'Leave by',isLeave:true})}`
      :access?journeyHeadlineMarkup({...access,arrive:r.expectedArrival},r.direction==='office'?'office':'home')
      :panelLayout&&observation.boarding&&!unknown?journeyTimesMarkup({leave:platformBy,arrive:r.expectedArrival,dest:r.direction==='office'?'office':'home',leftLabel:'Be on the platform by',isLeave:false})
      :journeyTimesMarkup({leave:r.phase==='on-train'?(observation.currentTrainArrival??t.arr):lastLeg?Date.now():result.nextStep?.t,arrive:unknown?null:r.expectedArrival,dest:r.direction==='office'?'office':'home',leftLabel:r.phase==='on-train'?'At '+(STATIONS[t.to]||t.to):lastLeg?'Now':'Next action',isLeave:false})}
    ${r.direction==='home'?tubeLine:''}
    ${''/* The train is stated once, by the train panel (amendment §3; #57 A4): no "Next train: …" line. */}
    ${comparison&&wayAhead?journeyAccessMarkup(comparison):''}
    ${r.phase!=='on-train'?'':otherShown
      ?`<div class="follow-service"><span class="chip">${esc(C.trainName(t))}</span>${st?` <span class="pill ${st.level}">${esc(st.text)}</span>`:''}</div>`
      :`<div class="follow-service">You’re on the <b>${esc(C.trainName(t))}</b>${st?` · <span class="pill ${st.level}">${esc(st.text)}</span>`:''}</div>`}
    ${r.phase==='on-train'&&C.thameslinkNote(t.operator)?`<div class="tl-note" data-block="thameslink">${esc(C.thameslinkNote(t.operator))}</div>`:''}
    <div class="meta">${giveUpWay?journeyFactsMarkup(giveUpWay,{train:giveUpWay.train,arrival:giveUpWay.arrive,duration:'remaining'})   /* the way on's own figures, not "unavailable" */
      :offTrain?journeyFactsContentMarkup(C.journeyFacts(r.option,{train:t,duration:'remaining'}),{arrival:unknown?null:r.expectedArrival,showTrain:false})
      :journeyFactsMarkup(r.option,{train:t,arrival:unknown?null:r.expectedArrival,duration:'remaining',unavailable:unknown?true:undefined})}</div>
    ${r.phase==='before-train'?trainConnectionMarkup(t):''}
    ${r.direction==='home'?'':tubeLine}
    <div class="follow-status ${result.level}">${unknown?'Arrival uncertain · ':''}${esc(result.text)}</div>
    ${result.ifMissed?`<div class="follow-ifmissed" data-block="if-missed">If you miss it: ${esc(result.ifMissed.std)}, ${r.direction==='office'?'office':'home'} ${hhmm(result.ifMissed.arrive)}</div>`:''}
    ${unknown||r.expectedArrival!==r.plannedArrival?`<div class="note">Original plan: arrive ${hhmm(r.plannedArrival)}</div>`:''}
    ${observation.connectionSource?`<div class="note">${esc(observation.connectionSource)}</div>`:''}
    ${!dataFresh&&!observation.onwardFresh&&!observation.trainArrivalLive?'<div class="note">Last known times · waiting for fresh journey data.</div>':''}
    ${observation.onwardSource?`<div class="note">${esc(observation.onwardSource)}</div>`:''}
    ${result.nextStep&&!(r.phase==='before-train'&&result.nextStep.train)&&!(r.phase==='after-train'&&result.nextIsLast)?`<div class="follow-next"><b>Next:</b> ${stepTime(result.nextStep)==null?'':hhmm(stepTime(result.nextStep))+' · '}${esc(result.nextStep.d)}${result.nextStep.note?` <span class="note">${esc(result.nextStep.note)}</span>`:''}</div>`:''}
    ${notice?`<div class="banner ${notice.kind==='cancelled'||notice.kind==='missed'?'bad':notice.kind==='recovered'?'info':'warn'}" role="status"><span>${noticeMarkup(notice.text)}</span><button type="button" class="follow-action follow-close" data-follow-action="seen" aria-label="Dismiss this notice">✕</button></div>`:''}
    ${alt?`<div class="follow-alternative" data-journey-service="${esc(journeyServiceKey(alt.train))}"><b>${result.status==='missed'||result.status==='cancelled'?'A way on':'Another option'}</b>${delta==null?'':` · ${Math.abs(delta)} min ${delta<=0?'sooner':'later'}`}${journeyOverviewMarkup(alt)}${altLines(alt)}${pills(alt.flags.filter(f=>!f.status&&!isEffortFlag(f)),true)}
      <div class="follow-actions"><button type="button" class="follow-btn" data-follow-action="switch">Follow this instead</button><button type="button" class="follow-action" data-follow-action="dismiss">Keep my route</button></div></div>`:''}
    <details class="steps" data-key="follow-steps|${esc(r.id)}"><summary>Your journey steps</summary><ol class="legs">${legs.map(l=>`<li class="t">${stepTime(l)==null?'':hhmm(stepTime(l))}</li><li class="d">${esc(l.d)}${l.note?` <small>· ${esc(l.note)}</small>`:''}</li>`).join('')}</ol></details>
    ${r.phase==='before-train'&&now>=r.option.train.dep?boardingMarkup(r,now):''}
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
  el.hidden=false;
  if(!state.boards&&!planBoards&&!failed.length&&!state.errors?.length&&!items.length){
    // Under way on a followed route the trains aren't needed (on the tube, on the walk): nothing is missing (#57 E3).
    if(state.saved.followRoute&&state.saved.followRoute.phase!=='before-train'){el.hidden=true;el.textContent='';return;}
    el.className="info";el.textContent=state.loading?"Loading journey data…":"Journey data not available yet";return;}
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
  // Said once (#57: "Delays up to 9 min on your route" twice, in the strip and the disruption card right under it):
  // the strip says it, and the card under it keeps its details without repeating the heading.
  const same=t=>String(t||'').replace(/\s+/g,' ').trim().toLowerCase();
  region.querySelectorAll('.signal-disruption-title').forEach(h=>{const dup=same(h.textContent)===same(result.text);h.hidden=dup;h.closest('.signal-disruption')?.toggleAttribute('data-titled-by-status',dup);});
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
  const old=state.lastFixAt&&Date.now()-state.lastFixAt>90e3?` · as of ${hhmm(state.lastFixAt)}`:'';   // amendment §8 (was "stale fix")
  $('#dirNote').textContent=`Location: ${phase}${reportText}${phone}${old}${state.locAcc>150?' · approximate position':''}`;
  // Under way the line stays out of the folded controls only when it says something you need (amendment §7).
  const needed=!!old||(!!state.locStatus&&!['ok','pending','off','unsupported'].includes(state.locStatus));
  $('#dirNote').classList.toggle('needed',needed);
  // "Update location" asks the phone again without reloading the page; it runs only when tapped (amendment §8, E4).
  if(needed&&state.locStatus!=='denied'&&!(typeof sim!=='undefined'&&sim.active&&S().simulatorEnabled)){
    const b=document.createElement('button');b.type='button';b.className='linkbtn';b.dataset.updateLocation='';b.textContent='Update location';
    b.addEventListener('click',()=>{locate();render();});
    $('#dirNote').append(' · ',b);
  }
}
function renderJourneyExtras(){renderFollowPanel();renderJourneyProgress();renderSignalLocation();renderSignalStatus();renderSignalCompact();renderAlongLine();if(state.presentation?.mode!=='live')tick();}
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
