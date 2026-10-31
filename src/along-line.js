// Along the line adapts the existing journey and phone fix; it never fetches or starts location.
const alongDialog=document.createElement('dialog');
alongDialog.id='alongLine';alongDialog.className='along-dialog';alongDialog.setAttribute('aria-labelledby','alongTitle');
alongDialog.innerHTML=`<header class="al-header"><div><h2 id="alongTitle">Along the line</h2><p>Discover the journey outside your window</p></div><button type="button" id="alongClose">Back to journey</button></header>
 <div id="alongJourney"></div><div id="alongImpact" role="status" hidden></div>
 <details id="alongChoices"><summary>Your interests and reading depth</summary>
 <fieldset><legend>What catches your interest?</legend>${[['views','Views and landscape'],['places','Places and their stories'],['engineering','Architecture and engineering'],['operations','How the railway works']].map(([id,label])=>`<label><input type="checkbox" value="${id}" name="alongInterest"> ${label}</label>`).join('')}</fieldset>
 <label class="al-depth">Reading depth <select id="alongDepth"><option value="glance">A glance</option><option value="discover">A little more</option><option value="explore">The full story</option></select></label>
 <p>Interests choose the highlights. Saved on this device.</p><label><input type="checkbox" id="alongShowAll"> Show other discoveries too</label></details>
 <p id="alongEvidence"></p><p id="alongEmpty" hidden>No highlights selected. Choose an interest, or show other discoveries to explore every story.</p>
 <div class="al-follow"><span id="alongFeatured"></span><button type="button" id="alongNow" hidden>Back to now</button></div>
 <div id="alongScroll" tabindex="0" aria-label="Stations and discoveries in journey order"><ol id="alongStrip"></ol></div>
 <p class="al-foot">Curated Letchworth–London stories · available offline once the app is loaded. Locations are approximate; views can be obscured.</p>`;
document.body.append(alongDialog);
const alongEntry=document.createElement('button');alongEntry.id='alongEntry';alongEntry.type='button';alongEntry.hidden=true;alongEntry.textContent='Along the line ›';
$('#hero').after(alongEntry);
let alongContextKey='',alongFollowing=true,alongLastFeatured=null,alongOpener=null,alongLastEpoch=null;
function alongClose(){alongDialog.close();alongOpener?.focus({preventScroll:true});}
$('#alongClose').addEventListener('click',alongClose);
alongDialog.addEventListener('cancel',()=>{alongOpener?.focus({preventScroll:true});});
function openAlongLine(){
  if(S().alongLine!==true)return;
  alongOpener=document.activeElement;alongFollowing=true;alongLastFeatured=null;
  renderAlongLine();
  try{alongDialog.showModal();}catch(e){alongDialog.setAttribute('open','');}
  renderAlongLine();$('#alongClose').focus();
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
  const followed=S().followRoute&&state.followUpdate?.route;
  const train=progress?.kind==='rail'?progress.train:followed?.phase==='on-train'?followed.lastTrain:null;
  const hub=train?(PROFILE.hubNames[train.to]?train.to:PROFILE.hubNames[train.from]?train.from:null):'KGX';
  const onboard=!!train&&!!hub&&!!PROFILE.stationGeo[train.from]&&!!PROFILE.stationGeo[train.to]&&!!state.onLine&&progress?.kind!=='tube'&&!state.rendered?.ride;
  return {train,hub,onboard,arrival:progress?.kind==='rail'?progress.expectedArrival:train?.arr,certain:!!train&&(progress?.kind==='rail'?!progress.uncertainIdentity:!!state.trainLock?.picked)};
}
function renderAlongLine(resumePosition=false){
  const enabled=S().alongLine===true;
  const context=alongContext();
  alongEntry.hidden=!enabled||!context.onboard||!context.hub||state.presentation?.view?.startsWith('plan-');
  alongBrowse.hidden=!enabled;
  if(!enabled){if(alongDialog.open)alongClose();alongContextKey='';return;}
  if(!alongDialog.open)return;
  if(alongLastEpoch!==sourceEpoch){alongLastEpoch=sourceEpoch;alongContextKey='';alongLastFeatured=null;}
  const hub=context.hub||'KGX',line=LINE[hub]||LINE.KGX,reverse=context.onboard?context.train.to===PROFILE.home:direction()==='home';
  const key=[sourceEpoch,hub,direction(),context.train?.serviceId||context.train?.std||'browse',context.train?.from||'',context.train?.to||''].join('|');
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
    from:context.train&&PROFILE.stationGeo[context.train.from],to:context.train&&PROFILE.stationGeo[context.train.to]});
  const preferences=model.preferences;
  alongDialog.querySelectorAll('[name="alongInterest"]').forEach(el=>{el.checked=preferences.interests.includes(el.value);});
  $('#alongDepth').value=preferences.depth;
  const timingSource=state.rendered?.progressModel?.source;
  const currentReport=timingSource==='reported'||timingSource==='prediction';
  const staleArrival=timingSource==='stale'||(!currentReport&&(!state.boardsAt||Date.now()-state.boardsAt>=180000));
  const arrivalLabel=staleArrival?'last known arrival':timingSource==='modelled'||context.train?.timetable?'estimated arrival':'expected arrival';
  $('#alongJourney').textContent=context.onboard?`${context.certain?'':'Likely train · '}${C.trainName(context.train)}${context.arrival==null||context.train.cancelled||context.train.arrUnknown?' · arrival uncertain':` · ${arrivalLabel} ${hhmm(context.arrival)}`} · ${reverse?'towards Letchworth':`towards ${HUB_NAME[hub]}`}`:`Browse ${reverse?HUB_NAME[hub]+' → Letchworth':'Letchworth → '+HUB_NAME[hub]}`;
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
  alongDialog.dataset.depth=preferences.depth;
  for(const item of model.points){
    const row=[...$('#alongStrip').children].find(el=>el.dataset.point===item.point.id);if(!row)continue;
    row.hidden=!item.selected&&!$('#alongShowAll').checked&&!row.querySelector('details[open]');
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
  // Never move the reading position while a story is open.
  if(alongFollowing&&model.featuredId!==alongLastFeatured&&!$('#alongStrip details[open]'))alongScrollToNow();
  alongLastFeatured=model.featuredId;
}
