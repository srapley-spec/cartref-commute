// Along the line adapts the existing journey and phone fix; it never fetches or starts location.
const alongDialog=document.createElement('dialog');
alongDialog.id='alongLine';alongDialog.className='along-dialog';alongDialog.setAttribute('aria-labelledby','alongTitle');
alongDialog.innerHTML=`<header class="al-header"><div><h2 id="alongTitle">Along the line</h2><p>Discover the journey outside your window</p></div><button type="button" id="alongClose">Back to journey</button></header>
 <div id="alongJourney"></div><div id="alongImpact" role="status" hidden></div>
 <details id="alongChoices"><summary>Your interests and reading depth</summary>
 <fieldset><legend>What catches your interest?</legend>${[['views','Views and landscape'],['places','Places and their stories'],['engineering','Architecture and engineering'],['operations','How the railway works']].map(([id,label])=>`<label><input type="checkbox" value="${id}" name="alongInterest"> ${label}</label>`).join('')}</fieldset>
 <label class="al-depth">Reading depth <select id="alongDepth"><option value="glance">A glance</option><option value="discover">A little more</option><option value="explore">The full story</option></select></label>
 <p>Interests choose the highlights. Every point stays on the line. Saved on this device.</p><label><input type="checkbox" id="alongShowAll"> Show previews for every point</label></details>
 <p id="alongEvidence"></p><p id="alongEmpty" hidden>No highlights selected. Every point is still available below; choose interests for automatic highlights.</p>
 <div class="al-follow"><span id="alongFeatured"></span><button type="button" id="alongNow" hidden>Back to now</button></div>
 <div id="alongScroll" tabindex="0" aria-label="Stations and discoveries in journey order"><ol id="alongStrip"></ol></div>
 <p class="al-foot">Curated Letchworth–London stories · available offline once the app is loaded. Locations are approximate; views can be obscured.</p>`;
document.body.append(alongDialog);
const alongEntry=document.createElement('button');alongEntry.id='alongEntry';alongEntry.type='button';alongEntry.className='ghost';alongEntry.hidden=true;alongEntry.textContent='Along the line ›';
alongEntry.setAttribute('aria-haspopup','dialog');alongEntry.setAttribute('aria-controls','alongLine');
const alongNavigation=document.createElement('nav');alongNavigation.id='alongNavigation';alongNavigation.hidden=true;
alongNavigation.setAttribute('aria-label','Along the line');alongNavigation.append(alongEntry);
document.querySelector('.wrap > header').after(alongNavigation);
let alongContextKey='',alongFollowing=true,alongLastFeatured=null,alongOpener=null,alongRouteScope='',alongRoute=null;
function alongClose(){alongDialog.close();alongOpener?.focus({preventScroll:true});}
$('#alongClose').addEventListener('click',alongClose);
alongDialog.addEventListener('cancel',()=>{alongOpener?.focus({preventScroll:true});});
function openAlongLine(){
  if(S().alongLine!==true)return;
  alongOpener=document.activeElement;alongFollowing=true;alongLastFeatured=null;
  renderAlongLine();
  try{alongDialog.showModal();}catch(e){alongDialog.setAttribute('open','');}
  renderAlongLine(true);$('#alongClose').focus();
}
alongEntry.addEventListener('click',openAlongLine);
const alongBrowse=document.createElement('button');alongBrowse.type='button';alongBrowse.id='alongBrowse';alongBrowse.className='ghost';alongBrowse.textContent='Browse Along the line';
$('#s_alongLine').closest('label').after(alongBrowse);
alongBrowse.addEventListener('click',()=>{dlg.close();openAlongLine();});
const alongPause=()=>{alongFollowing=false;$('#alongNow').hidden=false;};
for(const type of ['wheel','touchstart','pointerdown'])$('#alongScroll').addEventListener(type,alongPause,{passive:true});
$('#alongScroll').addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(e.key))alongPause();});
$('#alongScroll').addEventListener('scroll',()=>{if(!alongAutoScrolling)alongPause();});
let alongAutoScrolling=false;
function alongScrollToNow(){
  const marker=$('#alongPosition');
  const target=marker&&!marker.hidden?marker:$('#alongStrip [data-featured="true"]');
  if(!target)return;
  alongAutoScrolling=true;
  // Scroll just the strip, never the page or the open article into a new position.
  $('#alongScroll').scrollTop=Math.max(0,target.offsetTop-$('#alongStrip').offsetTop-12);
  setTimeout(()=>{alongAutoScrolling=false;},0);
}
$('#alongNow').addEventListener('click',()=>{alongFollowing=true;$('#alongNow').hidden=true;renderAlongLine(true);alongScrollToNow();});
$('#alongChoices').addEventListener('change',()=>{
  state.saved.alongLinePreferences=C.alongPreferences({interests:[...alongDialog.querySelectorAll('[name="alongInterest"]:checked')].map(el=>el.value),depth:$('#alongDepth').value});
  if(S().alongLine===true)save();renderAlongLine();
});
function alongContext(){
  const progress=state.rendered?.progress;
  const candidate=S().followRoute&&state.followUpdate?.route;
  const restored=candidate&&C.restoreFollowRoute(state.saved.followRoute);
  const followed=restored&&candidate.id===restored.id&&candidate.direction===direction()&&candidate.mode===currentMode()&&candidate.phase!=='arrived'?candidate:null;
  const train=progress?.kind==='rail'?progress.train:followed?.phase==='on-train'?followed.lastTrain:null;
  const hub=train?(PROFILE.hubNames[train.to]?train.to:PROFILE.hubNames[train.from]?train.from:null):'KGX';
  const onboard=!!train&&!!hub&&!!PROFILE.stationGeo[train.from]&&!!PROFILE.stationGeo[train.to]&&!!state.onLine&&progress?.kind!=='tube'&&!state.rendered?.ride;
  return {train,hub,onboard,routeTrain:train||followed?.lastTrain||followed?.option?.train,option:progress?.kind==='rail'?progress.option:followed?.option,
    finalArrival:progress?.kind==='rail'?progress.finalArrival:followed?.expectedArrival,
    arrival:progress?.kind==='rail'?progress.expectedArrival:train?.arr,certain:!!train&&(progress?.kind==='rail'?!progress.uncertainIdentity:!!state.trainLock?.picked)};
}
function renderAlongLine(resumePosition=false){
  const enabled=S().alongLine===true;
  const context=alongContext();
  // Navigation is available before boarding too; only the model may claim a live position.
  alongNavigation.hidden=!enabled;alongEntry.hidden=!enabled;
  alongBrowse.hidden=!enabled;
  if(!enabled){if(alongDialog.open)alongClose();alongContextKey='';return;}
  const routeScope=[sourceEpoch,direction(),currentMode()].join('|');
  if(alongRouteScope!==routeScope){alongRouteScope=routeScope;alongRoute=null;alongContextKey='';alongLastFeatured=null;}
  const routeTrain=context.routeTrain;
  const knownHub=routeTrain&&(PROFILE.hubNames[routeTrain.to]?routeTrain.to:PROFILE.hubNames[routeTrain.from]?routeTrain.from:null);
  if(knownHub&&PROFILE.stationGeo[routeTrain.from]&&PROFILE.stationGeo[routeTrain.to]){
    alongRoute={hub:knownHub,from:routeTrain.from,to:routeTrain.to,reverse:routeTrain.to===PROFILE.home};
  }
  const fallbackHub='KGX',fallbackReverse=direction()==='home';
  const route=alongRoute||{hub:fallbackHub,from:fallbackReverse?fallbackHub:PROFILE.home,to:fallbackReverse?PROFILE.home:fallbackHub,reverse:fallbackReverse};
  if(!alongDialog.open)return;
  const {hub,reverse}=route,line=LINE[hub]||LINE.KGX;
  // Location or identity loss cannot remove the route being explored or close a story.
  const key=[routeScope,hub,route.from,route.to].join('|');
  // Calling-point times come from the existing progress model, not a second timetable.
  const calls=state.rendered?.progressModel?.calls||[];
  const stations=[...C.samAlongStations,{code:hub,name:HUB_NAME[hub]}].map(station=>{
    const call=calls.find(c=>c.code===station.code);
    return {id:'station-'+station.code,kind:'station',title:station.name,geo:PROFILE.stationGeo[station.code],hubs:[hub],tags:[],
      stationTime:call?.time??null,stationTiming:call?call.state==='reported'?(state.rendered.progressModel.source==='stale'?'Last known report':'Reported'):call.state==='expected'?'Expected':call.scheduledAt!=null?'Timetable':'No live report':'Station · route reference',
      hook:'',notice:'',discover:'',explore:'',source:'',sourceTitle:'',visibility:''};
  }).filter(s=>s.geo);
  const model=C.alongLine({points:[...C.samAlongLine,...stations],line,hub,reverse,now:Date.now(),preferences:state.saved.alongLinePreferences,
    here:state.here,accuracy:state.locAcc,fixAt:state.lastFixAt,onboard:context.onboard,identityCertain:context.certain,locationOK:state.locStatus==='ok',
    from:PROFILE.stationGeo[route.from],to:PROFILE.stationGeo[route.to]});
  const preferences=model.preferences;
  alongDialog.querySelectorAll('[name="alongInterest"]').forEach(el=>{el.checked=preferences.interests.includes(el.value);});
  $('#alongDepth').value=preferences.depth;
  const timingSource=state.rendered?.progressModel?.source;
  const currentReport=timingSource==='reported'||timingSource==='prediction';
  const staleArrival=timingSource==='stale'||(!currentReport&&(!state.boardsAt||Date.now()-state.boardsAt>=180000));
  const arrivalLabel=staleArrival?'last known arrival':timingSource==='modelled'||context.train?.timetable?'estimated arrival':'expected arrival';
  $('#alongJourney').textContent=context.onboard?`${context.certain?'':'Likely train · '}${C.trainName(context.train)}${context.arrival==null||context.train.cancelled||context.train.arrUnknown?' · arrival uncertain':` · ${arrivalLabel} ${hhmm(context.arrival)}`} · ${reverse?'towards Letchworth':`towards ${HUB_NAME[hub]}`}`:`Browse ${progressName(route.from)} → ${progressName(route.to)}`;
  if(context.onboard){
    const facts=document.createElement('div');facts.className='al-journey-facts';
    facts.innerHTML=journeyFactsMarkup(context.option||null,{train:{...context.train,arr:context.arrival??null},arrival:context.finalArrival??null});
    $('#alongJourney').append(facts);
  }
  const impacts=S().signal?(state.signalDisruptionItems||[]):journeyDisruptions().items;
  $('#alongImpact').hidden=!impacts.length;
  $('#alongImpact').textContent=impacts.map(item=>[item.title,item.qualifier,...item.detail].filter(Boolean).join(' · ')).join(' · ');
  $('#alongEvidence').textContent=model.evidence;
  $('#alongEmpty').hidden=!model.empty;
  if(alongContextKey!==key){
    alongContextKey=key;alongLastFeatured=null;alongFollowing=true;
    $('#alongNow').hidden=true;
    $('#alongStrip').innerHTML=model.points.map(({point:p})=>p.kind==='station'?`<li class="al-station" data-point="${esc(p.id)}"><span class="al-dot" aria-hidden="true"></span><b>${esc(p.title)}</b><span class="al-location"></span></li>`:
      `<li class="al-story" data-point="${esc(p.id)}"><span class="al-dot" aria-hidden="true"></span><span class="al-location"></span><details data-key="along|${esc(key)}|${esc(p.id)}"><summary><span class="al-title">${esc(p.title)}</span><span class="al-hook">${esc(p.hook)}</span></summary>
      <p>${esc(p.notice)}</p><div class="al-discover"><p>${esc(p.discover)}</p></div><div class="al-explore"><p>${esc(p.explore)}</p></div>
      <button type="button" class="al-more">Read the full story</button><p class="al-visibility">${esc(p.visibility)}</p><a href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">Source: ${esc(p.sourceTitle)}</a><small>Original curated text · checked 31 October 2026</small></details></li>`).join('');
    const marker=document.createElement('li');marker.id='alongPosition';marker.className='al-position';marker.hidden=true;$('#alongStrip').append(marker);
    $('#alongScroll').scrollTop=0;
    $('#alongStrip').querySelectorAll('.al-more').forEach(button=>button.addEventListener('click',()=>{button.closest('details').dataset.full='true';button.hidden=true;}));
  }
  alongDialog.dataset.depth=preferences.depth;alongDialog.dataset.showAll=String($('#alongShowAll').checked);
  for(const item of model.points){
    const row=[...$('#alongStrip').children].find(el=>el.dataset.point===item.point.id);if(!row)continue;
    row.hidden=false; // Interests rank highlights; every route point remains browsable.
    row.dataset.state=item.state;row.dataset.featured=String(item.point.id===model.featuredId);row.dataset.selected=String(item.selected);
    row.querySelector('.al-location').textContent=item.point.kind==='station'?`${item.point.stationTiming}${item.point.stationTime==null?'':' '+hhmm(item.point.stationTime)}`:
      item.state==='browse'?'Route discovery':item.state==='nearby'?'Near here · approximate':item.state==='passed'?'Passed · approximate':`Coming up · about ${Math.max(1,Math.round(item.distanceM/1000))} km along the route`;
  }
  const marker=$('#alongPosition');
  if(resumePosition||!$('#alongStrip details[open]')){
    marker.hidden=!model.reliable;marker.textContent='You are around here · approximate';
    const before=[...$('#alongStrip').children].find(el=>el.dataset.point===model.markerBeforeId);
    if(before)before.before(marker);else $('#alongStrip').append(marker);
  }else if(!marker.hidden){marker.textContent='Last shown position · reading paused';}
  const featured=model.points.find(p=>p.point.id===model.featuredId);
  $('#alongFeatured').textContent=featured?`${featured.state==='nearby'?'Near here':'Coming up'} · ${featured.point.title}`:'Explore the places along this route';
  // Opening/Back to now starts at the phone position even with no matching interests.
  // Ordinary refresh never moves the reading position while a story is open.
  if(alongFollowing&&(resumePosition||model.featuredId!==alongLastFeatured)&&(resumePosition||!$('#alongStrip details[open]')))alongScrollToNow();
  alongLastFeatured=model.featuredId;
}
