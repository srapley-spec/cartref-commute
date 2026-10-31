// Verification/report orchestration observes the normal web shell after its refresh settles.
// It does not decide a route or write the application's journey state.
function createJourneySimulationSession({simulator,reporter,evaluate,readActual,settle,privateValues=()=>[],document}){
 let request=0,lastObserved=null,previousCheckpoint=null,queuedRender=false;
 const privateHistory=new Set();
 function refreshPrivacy(){for(const value of privateValues())if(typeof value==='string'&&value)privateHistory.add(value);reporter.setPrivateValues([...privateHistory]);}
 const originalGet=reporter.getReport,originalSerialize=reporter.serialize;
 reporter.getReport=()=>{refreshPrivacy();return originalGet();};
 reporter.serialize=(...args)=>{refreshPrivacy();return originalSerialize(...args);};
 const alive=()=>!!document.defaultView?.document;
 const sim=simulator.sim;
 simulator.reporter=reporter;
 function context(view=simulator.getView()){
  const checkpoint=view.checkpoints[view.index]||{};
  return {sessionId:sim.sessionId,index:view.index,point:checkpoint.point,label:checkpoint.label,mode:checkpoint.mode,now:view.clockNow,elapsed:view.elapsed,config:view.config,source:view.sources,manualOverride:view.manualOverride,app:readActual(),previous:previousCheckpoint};
 }
 function event(type,message,evidence={}){refreshPrivacy();const v=simulator.getView();reporter.recordEvent({sessionId:sim.sessionId,type,message,evidence,index:v.index,point:v.checkpoints[v.index]?.point,at:v.clockNow});}
 function publish(result){
  result.actualDisplay={view:result.observed?.view||'',mainCard:result.observed?.heroText||'',notices:result.observed?.bannersText?[result.observed.bannersText]:[]};delete result.observed;
  refreshPrivacy();const stored=reporter.recordCheckpoint(result);
  const results=sim.verification.results.filter(item=>item.index!==result.index);
  // Reports retain FAIL and revisions. Keep that verdict visible even after a later recovery.
  results.push({...result,...(stored||{})});results.sort((a,b)=>a.index-b.index);
  sim.verification={current:results.find(item=>item.index===sim.index)||null,results,pending:false};
  simulator.notify('verification');
 }
 async function verifyCurrentCheckpoint({refresh=false}={}){
  if(!alive()||!sim.active||sim.startTime===null||sim.pendingRestart)return null;
  const token=++request,v=simulator.getView(),id=sim.sessionId,index=v.index,instant=v.clockNow,elapsed=v.elapsed;
  sim.verification.pending=true;simulator.notify('verification-pending');
  const settled=await settle({refresh,cancelled:()=>id!==sim.sessionId||!sim.active||token!==request});
  if(!alive()||id!==sim.sessionId||!sim.active||token!==request||sim.index!==index||sim.elapsed!==elapsed){if(token===request){sim.verification.pending=false;simulator.notify('verification');}return null;}
  const c=context();if(!settled)c.app={...c.app,loading:true};
  const result=evaluate(c);result.observed=c.app;
  publish(result);previousCheckpoint={train:c.app.train,ride:c.app.ride};
  if(index===v.checkpoints.length-1){event('completed','Reached the final checkpoint; assertion outcomes recorded');reporter.finish('completed',instant);simulator.notify('summary');}
  return result;
 }
 function observe(){
  const app=readActual(),observation={view:app.view,direction:app.direction,serviceId:app.train?.serviceId||null,vehicle:app.ride?.vehicle||null,errors:(app.errors||[]).join('|')};
  if(lastObserved){for(const key of ['view','direction','serviceId','vehicle','errors'])if(lastObserved[key]!==observation[key])event('inference',`${key} changed from ${lastObserved[key]||'unknown'} to ${observation[key]||'unknown'}`,{view:app.view,serviceId:app.train?.serviceId,vehicle:app.ride?.vehicle});}
  lastObserved=observation;
 }
 const unsubscribe=simulator.subscribe(({type,reason})=>{
  if(type==='start'){
   request++;lastObserved=null;previousCheckpoint=null;const v=simulator.getView();
   privateHistory.clear();refreshPrivacy();reporter.start({...v.config,sessionId:sim.sessionId,sources:v.sources,speed:Number(document.getElementById('simSpeed').value),accuracyMode:document.getElementById('simAccuracyMode').value,totalCheckpoints:v.checkpoints.length});
   event('started','Journey simulation started');
  } else if(type==='checkpoint'){
   event('checkpoint','Reached '+simulator.getView().checkpoints[sim.index]?.label);
   void verifyCurrentCheckpoint({refresh:true});
  } else if(type==='stopping'){
   request++;
   if(sim.active&&sim.startTime!==null&&sim.verification.pending){const c=context();c.app={...c.app,loading:true};const result=evaluate(c);result.observed=c.app;publish(result);}
   event('stopped','Simulation stopped; real sources and original journey context restored');reporter.finish(reason||'stopped',simulator.getView().clockNow);
   sim.verification.pending=false;
  } else if(type==='sources'){
   request++;sim.verification.pending=false;refreshPrivacy();event('sources','Simulation source configuration changed');
   if(sim.active)queueMicrotask(()=>{if(alive()&&sim.active)void verifyCurrentCheckpoint({refresh:true});});
  } else if(type==='manual'||type==='configuration'){
   request++;sim.verification.pending=false;refreshPrivacy();event(type,type==='manual'?'Advanced inputs changed the observed session':'Draft configuration changed; restart is required before it takes effect');simulator.notify('verification');
  } else if(type==='application-render'&&sim.active&&sim.startTime!==null){
   observe();
   if(!sim.timer&&!sim.stepping&&!sim.pendingRestart&&!sim.verification.pending&&!readActual().loading&&!queuedRender){
    queuedRender=true;queueMicrotask(()=>{queuedRender=false;if(alive()&&sim.active&&!sim.timer&&!sim.stepping&&!sim.pendingRestart&&!sim.verification.pending)void verifyCurrentCheckpoint();});
   }
  } else if(type==='speed')event('speed','Playback speed changed');
 });
 return {verifyCurrentCheckpoint,reporter,destroy(){request++;unsubscribe();}};
}
