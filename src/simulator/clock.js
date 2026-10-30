// Session-scoped virtual time. Never modifies window.Date or the user's system clock.
function createJourneySimulationClock({NativeDate=Date}={}) {
 let active=false,instant=null;
 const start=(value)=>{const ms=NativeDate.parse(value);if(!Number.isFinite(ms))throw Error("Invalid simulation start time");active=true;instant=ms;return instant;};
 const set=(value)=>{if(!active)throw Error("Simulation clock inactive");const ms=Number(value);if(!Number.isFinite(ms))throw Error("Invalid simulation instant");instant=ms;return instant;};
 const advance=(minutes)=>set(instant+minutes*60000);
 const stop=()=>{active=false;instant=null;};
 const now=()=>active?instant:NativeDate.now();
 const date=(...args)=>args.length?new NativeDate(...args):new NativeDate(now());
 const ClockDate=class extends NativeDate { constructor(...args){super(...(args.length?args:[now()]));} static now(){return now();} };
 return {start,set,advance,stop,now,date,ClockDate,get active(){return active;}};
}
