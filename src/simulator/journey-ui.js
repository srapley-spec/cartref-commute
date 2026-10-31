// Presentation and controls for the existing simulator session. Never infers a journey.
function createJourneySimulatorUI({simulator,document,onStartJourney,onRememberSelection=()=>{},onSetSources=()=>{},preferences={},verification,reporter}={}){
 const $=id=>document.getElementById(id),win=document.defaultView;
 const catalog=createJourneySimulatorCatalog(),byId=new Map(catalog.map(item=>[item.id,item]));
 let mode='journey',busy=false,lastTimeline='',lastVerification='',lastSummary='';
 const inspected=new Set(),listeners=[];
 const listen=(id,event,fn)=>{const e=$(id);if(e){e.addEventListener(event,fn);listeners.push(()=>e.removeEventListener(event,fn));}};
 const text=(id,value)=>{const e=$(id),s=String(value??'');if(e&&e.textContent!==s)e.textContent=s;};
 const localTime=value=>Number.isFinite(value)?new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:false}).format(value):'—';
 const localDate=value=>Number.isFinite(value)?new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZoneName:'short',hour12:false}).format(value):'British local time';
 const view=()=>typeof simulator.getView==='function'?simulator.getView():{};
 const config=()=>({direction:$('journeyDirection').value,route:$('journeyRoute').value,scenario:$('journeyScenario').value});
 const element=(tag,value,className)=>{const e=document.createElement(tag);if(value!=null)e.textContent=String(value);if(className)e.className=className;return e;};
 const cleanStatus=status=>['PASS','FAIL','INCONCLUSIVE'].includes(status)?status:'INCONCLUSIVE';
 const pretty=value=>typeof value==='string'?value:JSON.stringify(value??null,null,2);
 const resultsFor=v=>v.verification?.results||[];
 function scenarioDescription(current=view()){const c=config(),item=byId.get(c.scenario)||catalog[0];text('journeyScenarioDescription',item.description);text('journeyScenarioExpected',item.expected);const draft=current.draftConfig||{};const instant=draft.direction===c.direction&&Number.isFinite(draft.startTime)?draft.startTime:Date.parse(c.direction==='return'?'2026-11-03T15:44:00Z':'2026-11-03T08:44:00Z');text('journeyStartHint',`Starts ${localDate(instant)}. Pauses at every checkpoint. All inputs are simulated.`);}
 function setMode(next){
  mode=next==='advanced'?'advanced':'journey';$('journeySetup').hidden=mode!=='journey';$('journeyStartFooter').hidden=mode!=='journey';
  $('journeyModeButton').setAttribute('aria-pressed',String(mode==='journey'));$('journeyAdvancedButton').setAttribute('aria-pressed',String(mode==='advanced'));
  $('simAdvanced').open=mode==='advanced';if(mode==='journey')$('simPanelScroll').scrollTop=0;else win.setTimeout(()=>$('simAdvanced').scrollIntoView?.({block:'start'}),0);measure();
 }
 function open(next='journey'){simulator.setPanelVisible(true);setMode(next);render();}
 function measure(){const bar=$('simBar');if(bar&&!bar.hidden){const height=bar.getBoundingClientRect().height;if(height>0)document.body.style.setProperty('--sim-dock-height',`${Math.ceil(height)}px`);}else document.body.style.removeProperty('--sim-dock-height');}
 function inspectTimeline(index){inspected.has(index)?inspected.delete(index):inspected.add(index);lastTimeline='';render();}
 function renderTimeline(v){
  const history=v.historicalTimeline,historical=!!history,timeline=history||v;
  const checkpoints=timeline.checkpoints||[],summary=v.summary||{},started=Number.isFinite(timeline.startTime),done=!historical&&summary.finished&&summary.reason==='completed';
  const results=historical?(history.results||[]):resultsFor(v),reached=new Set(results.map(result=>result.index));
  $('journeyTimelineContext').hidden=!historical;
  if(historical){const c=history.config||{},scenario=byId.get(c.scenario)?.title||c.scenario||'Journey';text('journeyTimelineContext',`Previous journey · ${history.reason||'stopped'} · ${c.direction==='return'?'To Letchworth / Home':'To London / Office'} · ${c.route==='far'?'Thameslink via Farringdon':'Great Northern via King’s Cross'} · ${scenario}`);}
  const key=JSON.stringify([timeline.startTime,timeline.index,historical,v.pendingRestart,done,checkpoints,results,[...inspected]]);if(key===lastTimeline)return;lastTimeline=key;
  const list=$('journeyTimeline');list.replaceChildren();
  checkpoints.forEach((cp,index)=>{
   const completed=historical?reached.has(index):started&&(done||index<v.index),current=!historical&&started&&!completed&&index===v.index;
   const state=completed?'completed':current?'current':'upcoming';
   const row=element('li');row.dataset.checkpointIndex=String(index);row.dataset.status=state;row.dataset.state=state==='completed'?'complete':state;
   if(current)row.setAttribute('aria-current','step');
   const button=element('button');button.type='button';button.dataset.checkpointInspect=String(index);button.setAttribute('aria-expanded',String(inspected.has(index)));
   button.append(element('strong',cp.label||cp.point||`Checkpoint ${index+1}`));
   const stamp=started?localTime(timeline.startTime+Number(cp.at||0)*60000):'After Start';
   button.append(element('small',`${stamp} · ${completed?'Completed':current?'Current':'Upcoming'}`));button.addEventListener('click',()=>inspectTimeline(index));row.append(button);
   if(inspected.has(index)){
    const detail=element('div',null,'simTimelineEvidence'),result=results.find(r=>r.index===index);
    if(result){detail.append(element('strong',cleanStatus(result.status)));for(const a of result.assertions||[]){detail.append(element('p',`Expected: ${pretty(a.expected)}\nActual: ${pretty(a.actual)}\n${cleanStatus(a.status)}`));}}
    else detail.append(element('p','No completed verification for this checkpoint. Reaching a location alone does not count as a pass.'));
    row.append(detail);
   }
   list.append(row);
  });
  text('journeyTimelineCount',historical?`${reached.size} / ${checkpoints.length} completed`:started?`${Math.min((v.index||0)+1,checkpoints.length)} / ${checkpoints.length}`:'');
 }
 function renderVerification(v){
  const results=resultsFor(v),supplied=v.verification?.current,current=(supplied?.index===v.index?supplied:null)||results.find(r=>r.index===v.index),pending=!!v.verification?.pending;
  const failures=results.filter(result=>cleanStatus(result.status)==='FAIL').length;
  const status=current?cleanStatus(current.status):'INCONCLUSIVE',badge=$('journeyVerificationBadge');
  badge.dataset.result=failures?'FAIL':pending?'INCONCLUSIVE':status;text('journeyVerificationBadge',failures?`${failures} FAIL`:pending?'Checking':current?status:'Not checked');badge.setAttribute('aria-label',failures?`${failures} checkpoint failures recorded. Open expected and actual details.`:pending?'Checkpoint verification pending':`Checkpoint verification: ${current?status:'not checked'}. Open expected and actual details.`);
  const key=JSON.stringify([results,pending]);if(key===lastVerification)return;lastVerification=key;
  const panel=$('journeyVerificationResults');panel.replaceChildren();
  const totals={PASS:0,FAIL:0,INCONCLUSIVE:0};results.forEach(r=>totals[cleanStatus(r.status)]++);
  text('journeyVerificationCount',results.length?`${totals.PASS} pass · ${totals.FAIL} fail · ${totals.INCONCLUSIVE} inconclusive`:'');
  if(!results.length)panel.append(element('p',pending?'Waiting for the real application to finish refreshing.':'No checkpoint verification yet. Playback alone does not prove the application is correct.'));
  for(const result of results){
   const section=element('section',null,'simVerificationRow');section.dataset.result=cleanStatus(result.status);section.dataset.checkpointIndex=String(result.index);section.append(element('strong',`${result.label||'Checkpoint'} · ${cleanStatus(result.status)}`));
   if(!(result.assertions||[]).length)section.append(element('p','No explicit assertion is defined, or the evidence is insufficient.'));
   for(const assertion of result.assertions||[]){
    const block=element('div');block.dataset.assertionId=assertion.id||'';block.dataset.result=cleanStatus(assertion.status);
    block.append(element('p',`${cleanStatus(assertion.status)} · Expected: ${pretty(assertion.expected)}`),element('p',`Actual: ${pretty(assertion.actual)}`));
    if(assertion.evidence&&Object.keys(assertion.evidence).length){const details=element('details');details.append(element('summary','Diagnostic evidence'),element('pre',pretty(assertion.evidence)));block.append(details);}
    section.append(block);
   }
   if(result.revisions?.length){section.append(element('p',result.status==='FAIL'?'A failure has been recorded. Observation history is retained below.':'Earlier observations are retained below.'));const history=element('details');history.append(element('summary','Observation history'));for(const revision of result.revisions){history.append(element('p',`${localTime(revision.at)} · ${pretty(revision.actualDisplay||revision.assertions||revision)}`));}section.append(history);}
   if(result.actualDisplay){const actual=element('details');actual.append(element('summary','What the real app showed'));const display=result.actualDisplay;actual.append(element('p',`View: ${display.view||'Unknown'}`),element('p',display.mainCard||'No main card text was available.'));if(display.followCard)actual.append(element('p',display.followCard));if(Array.isArray(display.notices)&&display.notices.length)actual.append(element('p',display.notices.join('\n')));section.append(actual);}
   panel.append(section);
  }
 }
 function renderSummary(v){
  const summary=v.summary||(reporter&&reporter.summary?reporter.summary():null),key=JSON.stringify(summary);if(key===lastSummary)return;lastSummary=key;
  const panel=$('journeyResultsSummary');panel.replaceChildren();if(!summary){panel.append(element('p','Results become available when a journey starts.'));return;}
  panel.append(element('p',`${summary.completedCheckpoints||0} / ${summary.totalCheckpoints||v.checkpoints?.length||0} checkpoints completed`));
  panel.append(element('p',`${summary.passedAssertions||0} assertions passed · ${summary.failedAssertions||0} failed · ${summary.inconclusiveAssertions||0} inconclusive`));
  if(summary.finished)panel.append(element('p',summary.reason==='completed'?'Journey complete. Review failures and inconclusive results before drawing a conclusion.':`Session ended: ${summary.reason||'stopped'}.`));
  const report=reporter&&reporter.getReport?reporter.getReport():null,events=report?.events||[];
  if(report?.config?.recoveryReason)panel.append(element('p',`Fresh inference attempt from checkpoint ${(report.config.initialCheckpoint||0)+1}. Earlier journey choices were discarded.`));
  if(report?.previousAttempts?.length){
   const history=element('details');history.append(element('summary',`${report.previousAttempts.length} previous attempt(s)`));
   for(const previous of report.previousAttempts){
    const attempt=element('details'),failures=previous.checkpoints.flatMap(row=>row.assertions).filter(row=>row.status==='FAIL').length;
    attempt.append(element('summary',`${localTime(previous.startedAt)} → ${localTime(previous.finishedAt)} · ${previous.checkpoints.length} checkpoint(s) · ${failures} failed assertion(s)`));
    for(const checkpoint of previous.checkpoints){
     const item=element('details');item.append(element('summary',`${checkpoint.label} · ${checkpoint.status}`));
     for(const assertion of checkpoint.assertions)item.append(element('p',`${assertion.status} · Expected: ${assertion.expected}\nActual: ${assertion.actual}`));
     if(checkpoint.actualDisplay?.mainCard)item.append(element('p',`What the real app showed: ${checkpoint.actualDisplay.mainCard}`));
     if(checkpoint.actualDisplay?.followCard)item.append(element('p',checkpoint.actualDisplay.followCard));
     attempt.append(item);
    }
    history.append(attempt);
   }
   panel.append(history);
  }
  if(report?.truncated?.attempts)panel.append(element('p',`${report.truncated.attempts} older attempt(s) exceeded the history limit. Export results before further resets.`));
  if(events.length){const details=element('details');details.append(element('summary',`${events.length} journey events`));const list=element('ol');events.forEach(e=>list.append(element('li',`${localTime(e.at)} · ${e.label||e.message||e.type||'Journey event'}`)));details.append(list);panel.append(details);}
 }
 function render(v=view()){
  scenarioDescription(v);
  const points=v.checkpoints||[],index=Number(v.index)||0,started=Number.isFinite(v.startTime),current=points[index],next=points[index+1],summary=v.summary||{};
  $('simPanel').classList.toggle('simSetupOpen',!v.active);
  text('journeyDockTime',localTime(v.clockNow));$('journeyDockTime').setAttribute('datetime',Number.isFinite(v.clockNow)?new Date(v.clockNow).toISOString():'');
  const place=typeof v.location==='string'?v.location:v.location?.label||v.location?.name;
  const location=started?(place||current?.label||'Journey in progress'):'Choose a journey';text('journeyDockLocation',location);$('journeyDockLocation').title=location;
  const nextText=started?(next?`Next: ${next.label}`:'Final checkpoint'):'Starts paused. Stop restores real operation.';text('journeyDockNext',nextText);$('journeyDockNext').title=nextText;
  text('journeyTimelineToggle',started?`${Math.min(index+1,points.length)} / ${points.length}`:'Timeline');
  $('journeyDockProgress').max=Math.max(points.length,1);$('journeyDockProgress').value=started?Math.min(index+1,points.length):0;text('journeyDockProgress',started?`${Math.min(index+1,points.length)} of ${points.length} checkpoints`:'Journey not started');$('journeyDockProgress').setAttribute('aria-valuetext',started?`${Math.min(index+1,points.length)} of ${points.length} checkpoints`:'Journey not started');
  const play=$('journeyPlay')||$('simAdvance');if(play){play.setAttribute('aria-label',v.playing?'Pause simulation':'Play to the next checkpoint');}
  const complete=started&&index>=points.length-1;
  $('journeyNext').disabled=!!(busy||v.stepping||v.verification?.pending);text('journeyNext',complete?'Results':'Next checkpoint');$('journeyNext').setAttribute('aria-label',complete?'Open the journey summary':'Continue sequentially to the next checkpoint');
  $('journeyBack').disabled=!!(busy||!v.canBack);
  $('journeyStateTools').hidden=!v.active;
  $('journeyResetState').disabled=!!(busy||v.pendingRestart||!v.sources?.gps&&!v.sources?.feeds);$('simClear').disabled=!!(busy||!v.sources?.gps&&!v.sources?.feeds);
  text('journeyResetNotice',v.recovery?'Journey state cleared. The app is inferring afresh; previous attempts remain in Results.':'Reset forgets journey history at the current location and time.');
  if(v.sources){$('simAdvancedGPS').checked=!!v.sources.gps;$('simAdvancedFeeds').checked=!!v.sources.feeds;}
  text('journeyStart',v.active?'Restart journey':'Start journey');$('journeyStart').disabled=busy;
  text('journeySourceDiagnostics',JSON.stringify({sources:v.sources||{},clock:localDate(v.clockNow),playing:!!v.playing,checkpoint:started?index+1:null,pendingRestart:!!v.pendingRestart,verificationPending:!!v.verification?.pending,actual:v.diagnostics||{}},null,2));
  renderTimeline(v);renderVerification(v);renderSummary(v);measure();
 }
 async function startJourney(){
  if(busy)return;busy=true;$('journeySetupError').hidden=true;render();
  try{const c=config();const result=await onStartJourney(c);if(result===false)throw new Error('The journey could not start. Check Advanced diagnostics.');inspected.clear();}
  catch(error){text('journeySetupError',error?.message||'The journey could not start.');$('journeySetupError').hidden=false;}
  finally{busy=false;render();}
 }
 function reportText(){if(!reporter||typeof reporter.serialize!=='function')throw new Error('No journey report is available yet.');const report=reporter.getReport?.();if(!report||!report.config)throw new Error('Start a journey before exporting results.');return reporter.serialize(2);}
 function copyFallback(value){let field=$('journeyReportText');if(!field){field=element('textarea');field.id='journeyReportText';field.readOnly=true;field.rows=8;field.setAttribute('aria-label','Diagnostic report to copy');$('journeyResultsDetails').append(field);}field.hidden=false;field.value=value;field.focus();field.select();$('journeyResultsDetails').open=true;text('journeyExportStatus','Clipboard unavailable. Select and copy the report below.');}
 async function copyResults(){try{const value=reportText();try{if(!win.navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await win.navigator.clipboard.writeText(value);text('journeyExportStatus','Report copied.');}catch(error){copyFallback(value);}}catch(error){text('journeyExportStatus',error.message);}}
 function exportResults(){try{const value=reportText();if(!win.URL?.createObjectURL)throw new Error('Download unavailable. Use Copy results instead.');const blob=new win.Blob([value],{type:'application/json'}),url=win.URL.createObjectURL(blob),a=element('a');a.href=url;a.download='cartref-commute-simulation.json';document.body.append(a);try{a.click();text('journeyExportStatus','Report exported.');}finally{a.remove();win.setTimeout(()=>win.URL.revokeObjectURL(url),0);}}catch(error){text('journeyExportStatus',error.message||'Export failed. Use Copy results instead.');}}
 function inspect(section){simulator.setPanelVisible(true);$(section).open=true;win.setTimeout(()=>$(section).scrollIntoView?.({block:'nearest'}),0);measure();}
 // Setup selections are drafts. Only Start copies them into the running simulator configuration.
 $('journeyDirection').value=['outbound','return'].includes(preferences.direction)?preferences.direction:'outbound';$('journeyRoute').value=['kgx','far'].includes(preferences.route)?preferences.route:'kgx';
 const groups=new Map();catalog.forEach(item=>{let group=groups.get(item.group);if(!group){group=element('optgroup');group.label=item.group;groups.set(item.group,group);$('journeyScenario').append(group);}const option=element('option',item.title);option.value=item.id;group.append(option);});$('journeyScenario').value=byId.has(preferences.scenario)?preferences.scenario:'normal';
 listen('journeyDirection','change',()=>{scenarioDescription();onRememberSelection(config());});listen('journeyRoute','change',()=>onRememberSelection(config()));listen('journeyScenario','change',()=>{scenarioDescription();onRememberSelection(config());});
 listen('simToggle','click',()=>{if($('simPanel').hidden)open(mode);else simulator.setPanelVisible(false);});
 listen('journeyModeButton','click',()=>setMode('journey'));listen('journeyAdvancedButton','click',()=>setMode('advanced'));listen('journeyStart','click',startJourney);
 listen('simAdvance','click',()=>{const v=view();if(!v.active&&!v.sources?.gps&&!v.sources?.feeds){startJourney();return;}if(v.playing)simulator.pause();else if(Number.isFinite(v.startTime)&&v.index>=(v.checkpoints?.length||1)-1)simulator.restart();else simulator.continuePlayback();});
 listen('journeyNext','click',async()=>{const v=view();if(!v.active){await startJourney();return;}if(Number.isFinite(v.startTime)&&v.index>=(v.checkpoints?.length||1)-1){inspect('journeyResultsDetails');return;}if(simulator.nextCheckpoint)await simulator.nextCheckpoint();else simulator.continuePlayback();render();});
 listen('journeyTimelineToggle','click',()=>inspect('journeyTimelineDetails'));listen('journeyVerificationBadge','click',()=>inspect('journeyVerificationDetails'));
 listen('journeyBack','click',()=>{simulator.previousCheckpoint();render();});
 listen('journeyResetState','click',()=>{simulator.resetJourneyState();render();});
 listen('journeyCopyResults','click',copyResults);listen('journeyExportResults','click',exportResults);
 for(const id of ['simAdvancedGPS','simAdvancedFeeds'])listen(id,'change',async()=>{try{await onSetSources({gps:$('simAdvancedGPS').checked,feeds:$('simAdvancedFeeds').checked});$('journeySetupError').hidden=true;}catch(error){text('journeySetupError',error?.message||'Could not change simulation sources.');$('journeySetupError').hidden=false;}render();});
 const unsubscribe=typeof simulator.subscribe==='function'?simulator.subscribe(()=>render()):null;
 const resize=typeof win.ResizeObserver==='function'?new win.ResizeObserver(measure):null;resize?.observe($('simBar'));win.addEventListener('resize',measure);
 scenarioDescription();setMode('journey');render();
 return {open,render,setMode,copyResults,exportResults,destroy(){listeners.forEach(remove=>remove());if(typeof unsubscribe==='function')unsubscribe();resize?.disconnect();win.removeEventListener('resize',measure);}};
}
