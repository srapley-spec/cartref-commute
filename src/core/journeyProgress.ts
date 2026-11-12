// Visual journey progress consumes the itinerary and observations already selected by
// the engine. It does not infer a service, rank a connection, fetch, or read a clock.
import type { DisruptionConfig, Option, Train } from './types';
import type { Leg, Route, Segment } from './journey';
import { delayLevel } from './rules';
import { FOLLOW_TUBE_FRESH_MS } from './followTube';
import { hhmm } from './time';

export type ProgressKind = 'walk' | 'rail' | 'tube' | 'connection';
export interface JourneyProgressLeg {
  id: string; kind: ProgressKind; label: string; start: number; end: number | null;
  travelStart?: number; travelEnd?: number | null;
  from?: string; to?: string; fromCode?: string; toCode?: string; lineId?: string;
}
export interface JourneyProgressCall {
  code?: string | null; name: string; scheduledAt?: number | null;
  expectedAt?: number | null; actualAt?: number | null; cancelled?: boolean;
}
export interface JourneyProgressEvidence {
  source: 'reported' | 'prediction' | 'modelled' | 'unknown';
  observedAt?: number | null; maxAgeMs?: number;
  expectedAt?: number | null; scheduledAt?: number | null;
  /** Prediction is usable only for the selected vehicle/service and target. */
  identityMatched?: boolean;
  /** The provider's own words for where the matched vehicle is ("At Moorgate"), with a live prediction only. */
  where?: string | null;
}
export interface JourneyProgressInput {
  now: number; legs: readonly JourneyProgressLeg[]; activeLeg: string;
  calls?: readonly JourneyProgressCall[]; evidence: JourneyProgressEvidence;
  uncertainIdentity?: boolean; cancelled?: boolean; noEstimate?: boolean;
  /** The evidence contradicts the selected train and the person hasn't answered yet: its station reports are not
   *  shown (Sam, 10 Nov 2026). Journey stages stay. */
  contradictedIdentity?: boolean;
  policy?: DisruptionConfig;
}
export interface JourneyProgressModel {
  legs: (JourneyProgressLeg & {state:'complete'|'current'|'upcoming'; fraction:number})[];
  current: JourneyProgressLeg; currentIndex: number; fraction: number | null;
  source: 'reported'|'prediction'|'modelled'|'stale'|'unknown';
  progressLabel: string; evidenceLabel: string; identityLabel: string;
  status: {text:string;level:'ok'|'warn'|'bad'|'info';deltaMin:number|null};
  calls: (JourneyProgressCall & {state:'reported'|'expected'|'unknown';time:number|null;deltaMin:number|null;level:'ok'|'warn'|'bad'|'info';passed?:boolean})[];
  /** Where you are on this leg, from reports only (Sam chose option A, 11 Nov 2026): the last station passed, the
   *  next one, and your stop. Null when nothing reports a position (then the leg says "No live position yet"). */
  where: { last: number | null; next: number | null; yours: number; stopsToGo: number; approaching: boolean } | null;
  /** Where the position comes from, in a few words: "National Rail report, 07:51" or "TfL, 08:26". */
  sourceLine: string;
}
/** Station names as two feeds write them ("Kings Cross St. Pancras", "King's Cross St Pancras"): compared loosely. */
export const sameStation = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const n = (x: string | null | undefined) => String(x || '').toLowerCase().replace(/\b(underground|station|rail|london)\b/g, '').replace(/[^a-z]/g, '');
  const x = n(a), y = n(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
};
/** TfL's location text read against the leg's stations: "At X", "Left X", "Between X and Y", "Approaching Y". */
export function tubePlace(where: string | null | undefined, names: readonly string[]): { last: number | null; next: number | null; approaching: boolean } | null {
  const w = String(where || '').trim(); if (!w) return null;
  const find = (name: string) => names.findIndex(n => sameStation(n, name));
  let m = /^(?:At|Left|Leaving|Departed|Departing)\s+(.+)$/i.exec(w);
  if (m) { const i = find(m[1]); return i < 0 ? null : { last: i, next: i + 1 < names.length ? i + 1 : null, approaching: false }; }
  m = /^Between\s+(.+?)\s+and\s+(.+)$/i.exec(w);
  if (m) { let a = find(m[1]), b = find(m[2]); if (a < 0 && b < 0) return null;
    // Named the other way round ("Between Moorgate and Liverpool Street" on a leg that reaches Liverpool Street first):
    // the train is still between the two, so the one passed is the earlier on the leg, never the later (review, 12 Nov).
    if (a >= 0 && b >= 0 && a > b) [a, b] = [b, a];
    const last = a >= 0 ? a : b - 1; return { last: last >= 0 ? last : null, next: b >= 0 ? b : a + 1 < names.length ? a + 1 : null, approaching: false }; }
  m = /^Approaching\s+(.+)$/i.exec(w);
  if (m) { const i = find(m[1]); return i < 0 ? null : { last: i > 0 ? i - 1 : null, next: i, approaching: true }; }
  return null;
}
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const fractionAt=(at:number,start:number,end:number|null|undefined):number|null=>
  finite(start)&&finite(end)&&end>start?clamp((at-start)/(end-start)):null;

/** Known calling points only: a reported dot marks a station report, not where
 * a train is now between stations. Tube predictions never become stop reports. */
export function journeyProgress(i:JourneyProgressInput):JourneyProgressModel|null {
  if(!finite(i.now)||!Array.isArray(i.legs)||!i.legs.length)return null;
  if(i.legs.some(l=>!l||!finite(l.start)||(l.end!==null&&(!finite(l.end)||l.end<l.start))))return null;
  const currentIndex=i.legs.findIndex(l=>l.id===i.activeLeg);if(currentIndex<0)return null;
  const current={...i.legs[currentIndex]},e=i.evidence;
  const age=finite(e.observedAt)?i.now-e.observedAt:null;
  const fresh=age!==null&&age>=0&&age<(e.maxAgeMs??FOLLOW_TUBE_FRESH_MS);
  const accepted=(e.source==='reported'||e.source==='prediction')&&fresh&&e.identityMatched===true;
  let source:JourneyProgressModel['source']=e.source==='modelled'?'modelled':accepted?e.source:
    age!==null&&age>=0&&!fresh?'stale':'unknown';
  if(e.identityMatched===false)source='modelled';
  const calls=(i.calls||[]).map(c=>{
    const actual=finite(c.actualAt)&&finite(e.observedAt)&&e.observedAt<=i.now&&c.actualAt<=e.observedAt?c.actualAt:null;
    const expected=!i.cancelled&&!i.noEstimate&&!c.cancelled&&finite(c.expectedAt)?c.expectedAt:null;
    // Historical facts remain labelled last-known when the feed is stale. A Tube
    // route sequence or live arrival prediction is never a calling-point report.
    const reported=actual!==null&&!c.cancelled&&e.source==='reported'&&e.identityMatched===true;
    const time=reported?actual:accepted?expected:null;
    const deltaMin=accepted&&finite(c.scheduledAt)&&time!==null?Math.round((time-c.scheduledAt)/60000):null;
    return {...c,state:reported?'reported' as const:accepted&&expected!==null?'expected' as const:'unknown' as const,
      time:time??(finite(c.scheduledAt)?c.scheduledAt:null),
      deltaMin,level:c.cancelled?'bad' as const:deltaMin===null||current.kind==='tube'?'info' as const:delayLevel(deltaMin,i.policy)};
  });
  const lastReported=calls.reduce((last,c,index)=>c.state==='reported'?index:last,-1);
  let fraction:number|null;
  if(e.source==='reported'&&lastReported>=0&&calls.length>1){
    fraction=lastReported/(calls.length-1);
  }else{
    const at=source==='stale'&&finite(e.observedAt)?e.observedAt:i.now;
    fraction=source==='unknown'?null:fractionAt(at,current.travelStart??current.start,
      accepted&&finite(e.expectedAt)?e.expectedAt:current.travelEnd??current.end);
    if(source==='reported')source='prediction';
  }
  if(i.cancelled||i.noEstimate){
    // Preserve historical reports, but do not animate an unusable arrival onward.
    if(lastReported<0)fraction=null;
  }
  const reportedCall=lastReported>=0?calls[lastReported]:null;
  const targetExpected=accepted&&finite(e.expectedAt)?e.expectedAt:null;
  const targetScheduled=finite(e.scheduledAt)?e.scheduledAt:null;
  const lastDelta=reportedCall?.deltaMin??null;
  const delta=targetExpected!==null&&targetScheduled!==null?Math.round((targetExpected-targetScheduled)/60000):lastDelta;
  let status:JourneyProgressModel['status']={text:'Timing estimate · live comparison unavailable',level:'info',deltaMin:null};
  if(accepted&&delta!==null){
    status={text:delta<0?`${-delta} min ahead`:delta>0?`${delta} min behind`:'On time',level:current.kind==='tube'?'info':delta>0&&delayLevel(delta,i.policy)==='ok'?'warn':delayLevel(delta,i.policy),deltaMin:delta};   // behind is never green (11 Nov 2026)
    status.text+=' · '+(targetExpected!==null&&targetScheduled!==null?'live expected':'at last report');
  }
  if(source==='stale')status={text:'Last known progress · waiting for fresh data',level:'info',deltaMin:null};
  if(i.noEstimate)status={text:'No live arrival estimate',level:'bad',deltaMin:null};
  if(i.cancelled)status={text:'Service cancelled · check your next step',level:'bad',deltaMin:null};
  const progressLabel=source==='reported'?'Calling-point progress':source==='stale'?'Last known progress':
    source==='unknown'?'Progress unavailable':'Estimated time progress';
  const evidenceLabel=source==='reported'?`Last reported at ${reportedCall?.name||'a calling point'}.`:
    source==='prediction'&&e.where&&e.source==='prediction'?`${e.where} · TfL${finite(e.observedAt)?`, ${hhmm(e.observedAt)}`:''}.`:
    source==='prediction'?'Live arrival; position is a time-based estimate.':
    source==='stale'?'Stale feed · last known reports; progress is frozen.':
    source==='modelled'?'Modelled timing · live position and timing comparison unavailable.':
    'Live progress is unavailable; the selected journey is kept.';
  const stages=(f:number|null)=>i.legs.map((l,index)=>({...l,state:index<currentIndex?'complete' as const:index===currentIndex?'current' as const:'upcoming' as const,
      fraction:index<currentIndex?1:index===currentIndex?(f??0):0}));
  if(i.contradictedIdentity)return {current,currentIndex,fraction:null,source:'unknown',progressLabel:'Progress unavailable',
    evidenceLabel:'Station reports are hidden until you say which train you’re on.',identityLabel:'',
    status:{text:'Train not confirmed',level:'info',deltaMin:null},calls:[],legs:stages(null),where:null,sourceLine:''};
  // Where you are (option A): a station counts as passed only from a report: National Rail's actual time, or TfL's
  // "At", "Left" or "Between" text for the tube you're matched to. Nothing is placed from elapsed time.
  let where:JourneyProgressModel['where']=null;
  const yours=calls.length-1;
  if(yours>=1){
    if(lastReported>=0&&e.source==='reported'&&e.identityMatched===true){
      const next=lastReported<yours?lastReported+1:null;
      where={last:lastReported,next,yours,stopsToGo:yours-lastReported,approaching:false};
    }else if(current.kind==='tube'&&accepted&&e.where){
      const p=tubePlace(e.where,calls.map(c=>c.name));
      if(p)where={last:p.last,next:p.next,yours,stopsToGo:p.next===null?0:yours-p.next+1,approaching:p.approaching};
    }
  }
  const graded:JourneyProgressModel['calls']=calls;
  if(where)graded.forEach((c,index)=>{c.passed=where!.last!==null&&index<=where!.last;});
  const sourceLine=!where?'':current.kind==='tube'?`TfL${finite(e.observedAt)?`, ${hhmm(e.observedAt)}`:''}`
    :`National Rail report${finite(e.observedAt)?`, ${hhmm(e.observedAt)}`:''}`;
  return {current,currentIndex,fraction,source,progressLabel,evidenceLabel,
    identityLabel:i.uncertainIdentity?'Likely service · identity not confirmed':'',status,
    legs:stages(fraction),where,sourceLine,calls:graded};
}

const kindLabel=(kind:ProgressKind)=>({walk:'Walk',rail:'Train',tube:'Tube',connection:'Connection'})[kind];
function segmentLegs(segments:readonly Segment[],start:number,prefix:string):JourneyProgressLeg[]{
  const result:JourneyProgressLeg[]=[];let cursor=start,pending:number|null=null;
  for(const segment of segments){
    if(!finite(segment.secs)||segment.secs<0)return [];
    const end=cursor+segment.secs*1000;
    const movement:ProgressKind|null=segment.kind==='walk'?'walk':segment.kind==='ride'?'tube':segment.kind==='planned'?'connection':null;
    if(movement&&end>cursor){
      const previous=result[result.length-1];
      if(previous?.kind===movement){previous.end=end;previous.travelEnd=end;}
      else result.push({id:`${prefix}-${result.length}`,kind:movement,label:kindLabel(movement),start:pending??cursor,end,travelStart:cursor,travelEnd:end});
      pending=null;
    }else if(result.length){result[result.length-1].end=end;}
    else if(end>cursor&&pending===null)pending=cursor;
    cursor=end;
  }
  if(!result.length&&cursor>start)result.push({id:`${prefix}-0`,kind:'connection',label:'Connection',start,end:cursor});
  return result;
}
export interface ProgressItineraryInput {
  option:Option; train?:Train; route?:Route; steps?:readonly Leg[];
  /** Original saved route/profile data, not a new duration guessed by the UI. */
  tubeRideSecs?:number|null; names?:Record<string,string>;
}
/** Adapt an existing engine itinerary. New inferred routes use their typed route
 * segments; saved Follow history uses its own immutable before/steps/tube duration. */
export function progressLegsFromSteps(i:ProgressItineraryInput):JourneyProgressLeg[]{
  const o=i.option,t=i.train||o.train,names=i.names||{};
  if(!finite(o.leave)||!finite(t.dep))return [];
  const before=Array.isArray(o.before)?o.before as Segment[]:i.route?.before||[];
  const steps=i.steps||(Array.isArray(o.legs)?o.legs as Leg[]:[]);
  const railStep=steps.findIndex(l=>l.train);
  const beforeSteps=railStep>=0?steps.slice(0,railStep).filter(l=>finite(l.t)&&!l.calls):[];
  const movementKinds=before.filter(s=>['walk','ride','planned'].includes(s.kind));
  // Effort grading can retime canonical steps while intentionally keeping the
  // original segment budget. Use the actual emitted steps, never that old budget.
  const legs:JourneyProgressLeg[]=beforeSteps.flatMap((step,index)=>{
    const start=step.t as number,end=index+1<beforeSteps.length?beforeSteps[index+1].t as number:t.dep;
    if(end<=start)return [];
    const mode=movementKinds[index]?.kind;
    const kind:ProgressKind=step.tube||mode==='ride'?'tube':mode==='planned'?'connection':'walk';
    return [{id:`before-${index}`,kind,label:kindLabel(kind),start,end,travelStart:start,
      travelEnd:kind==='tube'&&finite(i.tubeRideSecs)&&i.tubeRideSecs>0?Math.min(end,start+i.tubeRideSecs*1000):end}];
  });
  if(!legs.length&&o.leave<t.dep)legs.push({id:'before-0',kind:'connection',label:'Access',start:o.leave,end:t.dep});
  legs.push({id:'rail',kind:'rail',label:'Train',start:t.dep,end:finite(t.arr)?t.arr:null,
    travelStart:t.dep,travelEnd:finite(t.arr)?t.arr:null,from:names[t.from]||t.from,to:names[t.to]||t.to,fromCode:t.from,toCode:t.to});
  // Unknown live arrival keeps the original later stage identities as plan context;
  // it never supplies a new arrival estimate to the active rail leg.
  const railEnd=finite(t.arr)?t.arr:finite(o.train.arr)?o.train.arr:null;
  if(railEnd===null)return legs;
  if(i.route){return [...legs,...segmentLegs(i.route.after,railEnd,'after')];}
  const tube=steps.find(l=>l.tube&&finite(l.t)&&l.t>=railEnd);
  const arrival=steps.reduce<number>((last,l)=>finite(l.t)&&l.t>last?l.t:last,railEnd);
  if(tube&&finite(tube.t)&&finite(i.tubeRideSecs)&&i.tubeRideSecs>0){
    const end=tube.t+i.tubeRideSecs*1000;
    legs.push({id:'after-tube',kind:'tube',label:'Tube',start:railEnd,end,travelStart:tube.t,travelEnd:end});
    if(arrival>end)legs.push({id:'after-walk',kind:'walk',label:'Walk',start:end,end:arrival});
  }else if(arrival>railEnd){legs.push({id:'after-0',kind:tube?'connection':'walk',label:tube?'Onward connection':'Walk',start:railEnd,end:arrival});}
  return legs;
}

export interface JourneyTimingShiftInput {legs:readonly JourneyProgressLeg[];legId:string;start:number;expectedEnd:number|null;tailEnd?:number|null;}
/** Existing connection calculations supply these instants; the pure layer handles
 * all shifts so the renderer never reimplements itinerary timing arithmetic. */
export function retimeProgressLeg(i:JourneyTimingShiftInput):JourneyProgressLeg[]{
  return i.legs.map(l=>l.id===i.legId?{...l,start:i.start,travelStart:i.start,end:i.expectedEnd,travelEnd:i.expectedEnd}:
    finite(i.tailEnd)&&l.kind==='walk'&&l.id.startsWith('after')&&finite(i.expectedEnd)?{...l,start:i.expectedEnd,end:i.tailEnd}:({...l}));
}

/** A UI-only remembered itinerary is reusable only inside its known journey
 * window. Source epoch, mode, direction and endpoint identity are checked by the adapter. */
export function progressContextCurrent(legs:readonly JourneyProgressLeg[],observedAt:number,departure:number):boolean {
  const ends=legs.map(l=>l.end).filter(finite);
  return finite(observedAt)&&finite(departure)&&departure>=observedAt&&ends.length>0&&departure<=Math.max(...ends);
}
