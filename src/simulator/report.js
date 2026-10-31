// In-memory simulator reports. Export a small diagnostic contract, never application state.
function createJourneySimulationReporter({now=()=>Date.now(),privateValues=[]}={}) {
 const limits={checkpoints:200,assertions:100,events:500,revisions:30,text:1200};
 const statuses=['PASS','FAIL','INCONCLUSIVE'];
 let report=null,redactions=[];
 const finite=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
 const status=value=>statuses.includes(value)?value:'INCONCLUSIVE';
 const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 function setPrivateValues(values){
  redactions=[...new Set((Array.isArray(values)?values:[]).filter(value=>typeof value==='string'&&value.length))].sort((a,b)=>b.length-a.length);
 }
 setPrivateValues(privateValues);
 function text(value,fallback='',opaque=true){
  if(typeof value!=='string')return fallback;
  let out=value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
  for(const value of redactions)out=out.replace(new RegExp(escape(value),'gi'),'[redacted]');
  out=out.replace(/\b(?:https?|wss?):\/\/[^\s<>"']+/gi,'[URL omitted]');
  const keys='(?:x-api-key|x-apikey|api[_ -]?key|rdmKey|rdmSdKey|tflKey|huxleyToken|consumerKey|subscriptionKey|access[_ -]?token|refresh[_ -]?token|authorization|password|secret|token)';
  out=out.replace(new RegExp('\\b('+keys+')\\b["\\\']?\\s*[:=]\\s*(["\\\'])(.*?)\\2','gi'),'$1=[redacted]');
  out=out.replace(new RegExp('\\b('+keys+')\\b["\\\']?\\s*[:=]\\s*["\\\']?[^\\s,"\\\'};]+','gi'),'$1=[redacted]');
  out=out.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.:-]+/gi,'$1 [redacted]');
  // No precise coordinates, postcodes or numbered street addresses are needed for a fixture report.
  out=out.replace(/[-+]?\b\d{1,3}\.\d+\s*[,/]\s*[-+]?(?:\d{1,3})?\.\d+\b/g,'[coordinates omitted]');
  out=out.replace(/[-+]?\b\d{1,3}\.\d+\b/g,'[decimal omitted]');
  out=out.replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi,'[postcode omitted]');
  out=out.replace(/\b\d{1,5}[A-Z]?\s+(?:[\w'-]+\s+){0,5}(?:Street|St|Road|Rd|Lane|Avenue|Close|Drive|Way|Place|Court|Gardens|Crescent|Terrace)\b/gi,'[address omitted]');
  if(opaque)out=out.replace(/\b(?=[A-Za-z0-9+/_=-]{24,}\b)(?=[A-Za-z0-9+/_=-]*\d)[A-Za-z0-9+/_=-]{24,}\b/g,'[opaque value omitted]');
  return out.slice(0,limits.text);
 }
 const id=(value,fallback='')=>text(value,fallback,false).slice(0,160);
 const source=value=>({gps:value&&value.gps===true,feeds:value&&value.feeds===true});
 function configuration(value={}){
  if(!value||typeof value!=='object')value={};
  const speed=typeof value.speed==='number'?value.speed:typeof value.speed==='string'?Number(value.speed):1;
  const out={direction:['outbound','return'].includes(value.direction)?value.direction:'outbound',route:['kgx','far'].includes(value.route)?value.route:'kgx',scenario:id(value.scenario,'normal'),speed:[1,5,20].includes(speed)?speed:1,startTime:finite(value.startTime),totalCheckpoints:Math.max(0,Math.min(limits.checkpoints,Math.trunc(finite(value.totalCheckpoints)||0))),sources:source(value.sources||value.source)};
  if(typeof value.accuracyMode==='string')out.accuracyMode=id(value.accuracyMode);
  if(typeof value.sessionId==='string'||finite(value.sessionId)!==null)out.sessionId=typeof value.sessionId==='string'?id(value.sessionId):value.sessionId;
  return out;
 }
 function evidence(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const out={},strings=['direction','view','expectedView','actualView','expectedDirection','actualDirection','serviceId','expectedServiceId','operator','from','to','atHub','locStatus','confidence','vehicle','expectedVehicle','line','lineId','stop','platform','point','accuracyMode','source','providerHealth'];
  const numbers=['locAcc','accuracy','depLate','arrLate','boardsCount','alternativesCount','fixAgeMs'];
  const booleans=['sure','picked','conflict','none','onLine','onWay','atHome','nearOffice','cancelled','loading','gpsAvailable','displayMatches'];
  for(const key of strings)if(typeof value[key]==='string')out[key]=id(value[key]);
  for(const key of numbers)if(finite(value[key])!==null)out[key]=value[key];
  for(const key of booleans)if(typeof value[key]==='boolean')out[key]=value[key];
  for(const key of ['serviceIds','vehicles','lines'])if(Array.isArray(value[key]))out[key]=value[key].filter(item=>typeof item==='string').slice(0,30).map(item=>id(item));
  return out;
 }
 function assertion(value={},index=0){
  if(!value||typeof value!=='object')value={};
  const defined=typeof value.id==='string'&&value.id.trim()&&typeof value.expected==='string'&&value.expected.trim()&&typeof value.actual==='string'&&value.actual.trim();
  return {id:id(value.id,'assertion-'+index),expected:text(value.expected,'No expectation recorded'),actual:text(value.actual,'No observation recorded'),status:defined?status(value.status):'INCONCLUSIVE',evidence:evidence(value.evidence)};
 }
 function display(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return {view:'',mainCard:'',notices:[]};
  const notices=Array.isArray(value.notices)?value.notices:typeof value.notices==='string'?[value.notices]:[];
  return {view:id(value.view),mainCard:text(value.mainCard),notices:notices.filter(item=>typeof item==='string').slice(0,20).map(item=>text(item))};
 }
 const classify=assertions=>assertions.some(value=>value.status==='FAIL')?'FAIL':!assertions.length||assertions.some(value=>value.status==='INCONCLUSIVE')?'INCONCLUSIVE':'PASS';
 function checkpoint(value={}){
  const assertions=(Array.isArray(value.assertions)?value.assertions:[]).filter(item=>item&&typeof item==='object').slice(0,limits.assertions).map(assertion);
  return {index:Math.max(0,Math.trunc(finite(value.index)||0)),point:id(value.point),label:text(value.label,'Checkpoint'),at:finite(value.at)??now(),status:classify(assertions),assertions,actualDisplay:display(value.actualDisplay)};
 }
 const clone=value=>JSON.parse(JSON.stringify(value));
 function snapshot(){
  if(!report)return null;
  // Sanitize again on read, so newly supplied private values also protect earlier observations.
  return JSON.parse(JSON.stringify(report),(key,value)=>{
   if(typeof value!=='string')return value;
   // These are internally generated constants or strictly validated public enums, not user text.
   // A private place called Cartref must not alter the report format's fixed discriminator.
   if(key==='kind'&&value==='cartref-commute-simulation'||key==='status'&&statuses.includes(value)||key==='route'&&['kgx','far'].includes(value)||key==='direction'&&['outbound','return'].includes(value))return value;
   return text(value,'',key!=='serviceId'&&key!=='expectedServiceId'&&key!=='vehicle'&&key!=='expectedVehicle');
  });
 }
 function matchingSession(value){
  return value&&typeof value==='object'&&report&&report.finishedAt===null&&(value.sessionId==null||report.config.sessionId==null||value.sessionId===report.config.sessionId);
 }
 function start(config={}){
  if(!config||typeof config!=='object')config={};
  report={schemaVersion:1,kind:'cartref-commute-simulation',startedAt:finite(config.startTime)??now(),finishedAt:null,reason:null,config:configuration(config),checkpoints:[],events:[],truncated:{checkpoints:0,assertions:0,events:0,revisions:0}};
  return getReport();
 }
 function recordCheckpoint(value={}){
  if(!matchingSession(value))return null;
  const next=checkpoint(value),existing=report.checkpoints.find(item=>item.index===next.index);
  if(Array.isArray(value.assertions))report.truncated.assertions+=Math.max(0,value.assertions.filter(item=>item&&typeof item==='object').length-limits.assertions);
  if(!existing){
   if(report.checkpoints.length>=limits.checkpoints){report.truncated.checkpoints++;return null;}
   next.revisions=[];report.checkpoints.push(next);report.checkpoints.sort((a,b)=>a.index-b.index);
  }else{
   const previous=clone({...existing,revisions:undefined});
   if(existing.revisions.length<limits.revisions)existing.revisions.push(previous);else report.truncated.revisions++;
   // A later success is useful evidence, but cannot silently erase a failure already observed.
   const failed=existing.assertions.filter(item=>item.status==='FAIL');
   const merged=[...failed,...next.assertions.filter(item=>!failed.some(old=>old.id===item.id))];
   report.truncated.assertions+=Math.max(0,merged.length-limits.assertions);
   const assertions=merged.slice(0,limits.assertions);
   Object.assign(existing,next,{assertions,status:classify(assertions),revisions:existing.revisions});
   // Keep the new observation separately when the displayed verdict retains an earlier failure.
   if(failed.length){
    if(existing.revisions.length<limits.revisions)existing.revisions.push(clone(next));else report.truncated.revisions++;
   }
  }
  return getReport().checkpoints.find(item=>item.index===next.index);
 }
 function recordEvent(value={}){
  if(!matchingSession(value))return null;
  if(report.events.length>=limits.events){report.truncated.events++;return null;}
  const event={at:finite(value.at)??now(),type:id(value.type,'observation'),message:text(value.message),evidence:evidence(value.evidence)};
  if(finite(value.index)!==null)event.index=Math.max(0,Math.trunc(value.index));
  if(typeof value.point==='string')event.point=id(value.point);
  report.events.push(event);return clone(event);
 }
 function summary(){
  const rows=report?report.checkpoints:[],assertions=rows.flatMap(value=>value.assertions),count=(items,value)=>items.filter(item=>item.status===value).length;
  return {completedCheckpoints:rows.length,totalCheckpoints:report?report.config.totalCheckpoints:0,passedAssertions:count(assertions,'PASS'),failedAssertions:count(assertions,'FAIL'),inconclusiveAssertions:count(assertions,'INCONCLUSIVE'),passedCheckpoints:count(rows,'PASS'),failedCheckpoints:count(rows,'FAIL'),inconclusiveCheckpoints:count(rows,'INCONCLUSIVE'),events:report?report.events.length:0,finished:!!report&&report.finishedAt!==null,reason:report?text(report.reason,null,false):null};
 }
 function getReport(){const out=snapshot();if(out)out.summary=summary();return out;}
 function serialize(space=2){return JSON.stringify(getReport(),null,[0,1,2,3,4].includes(space)?space:2);}
 function finish(reason='completed',at=now()){
  if(!report)return null;
  if(report.finishedAt===null){report.finishedAt=finite(at)??now();report.reason=id(reason,'completed');}
  return getReport();
 }
 return {start,recordCheckpoint,recordEvent,finish,summary,getReport,serialize,setPrivateValues};
}
