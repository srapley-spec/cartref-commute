// Session-only provider fixtures. All times are offsets from the scenario epoch,
// so midnight does not rebuild a timetable and vehicle identities never change.
function createSimulatedTransportFeeds({now=()=>Date.now(),scenario=()=>({})}={}) {
 const names={LET:"Letchworth Garden City",HIT:"Hitchin",SVG:"Stevenage",FPK:"Finsbury Park",KGX:"London Kings Cross",STP:"London St Pancras International",ZFD:"Farringdon"};
 const minute=60000;
 const fmt=t=>new Date(t).toLocaleTimeString("en-GB",{timeZone:"Europe/London",hour:"2-digit",minute:"2-digit",hour12:false});
 let fallbackStart;
 function config(){
  const c=scenario()||{};
  if(fallbackStart==null){const d=new Date(now());d.setHours(c.direction==="return"?15:8,44,0,0);fallbackStart=d.getTime();}
  const epoch=typeof c.startTime==="number"?c.startTime:Date.parse(c.startTime);
  return {...c,startTime:Number.isFinite(epoch)?epoch:fallbackStart};
 }
 function services(){
  const c=config(),base=c.startTime-(c.direction==="return"?420:0)*minute;
  const mk=(id,from,to,dep,stops,operator)=>{
   const selected=(c.direction==="return"?id.includes("HOME"):!id.includes("HOME"))&&(c.route==="far"?id.includes("TL"):id.includes("GN"))&&!id.includes("LATER");
   // A corridor signalling restriction delays every train in this direction.
   const inDirection=c.direction==="return"?id.includes("HOME"):!id.includes("HOME");
   const delay=inDirection&&c.scenario==="delay"?8:0;
   return {id,from,to,dep:base+dep*minute,arr:base+stops[stops.length-1][1]*minute,operator,delay,
    cancelled:selected&&c.scenario==="cancellation",platform:selected&&c.scenario==="platform-change"?"4":from==="LET"?"2":"1",
    calls:[[from,dep],...stops].map(([code,at])=>({code,t:base+at*minute}))};
  };
  const result=[
   mk("SIM-GN-0905","LET","KGX",21,[["HIT",26],["SVG",32],["FPK",50],["KGX",57]],"Great Northern"),
   mk("SIM-TL-0912","LET","ZFD",28,[["HIT",33],["SVG",40],["FPK",65],["STP",71],["ZFD",76]],"Thameslink"),
   mk("SIM-GN-LATER-0917","LET","KGX",33,[["HIT",38],["SVG",44],["FPK",62],["KGX",69]],"Great Northern"),
   mk("SIM-TL-LATER-0927","LET","ZFD",43,[["HIT",48],["SVG",55],["FPK",80],["STP",86],["ZFD",91]],"Thameslink"),
   mk("SIM-GN-HOME-1617","KGX","LET",453,[["FPK",460],["SVG",477],["HIT",484],["LET",489]],"Great Northern"),
   mk("SIM-TL-HOME-1620","ZFD","LET",456,[["STP",461],["FPK",467],["SVG",492],["HIT",499],["LET",504]],"Thameslink"),
   mk("SIM-GN-HOME-LATER-1627","KGX","LET",463,[["FPK",470],["SVG",487],["HIT",494],["LET",499]],"Great Northern"),
   mk("SIM-TL-HOME-LATER-1635","ZFD","LET",471,[["STP",476],["FPK",482],["SVG",507],["HIT",514],["LET",519]],"Thameslink")
  ];
  // Near-identical reports deliberately leave the inference engine uncertain.
  // This changes provider evidence only; no service is selected in application state.
  if(c.scenario==="uncertain"){
   for(const [primary,other] of [[0,2],[1,3],[4,6],[5,7]]){
    const a=result[primary],b=result[other],shift=a.dep+2*minute-b.dep;
    b.dep+=shift;b.arr+=shift;b.calls=b.calls.map(p=>({...p,t:p.t+shift}));
   }
  }
  return result;
 }
 const call=(s,p)=>({locationName:names[p.code],crs:p.code,st:fmt(p.t),et:s.cancelled?"Cancelled":s.delay?fmt(p.t+s.delay*minute):"On time",...(now()>=p.t+s.delay*minute&&!s.cancelled?{at:fmt(p.t+s.delay*minute)}:{})});
 function train(s,from){
  const index=s.calls.findIndex(p=>p.code===from),p=s.calls[index];
  return {std:fmt(p.t),etd:s.cancelled?"Cancelled":s.delay?fmt(p.t+s.delay*minute):"On time",platform:s.platform,operator:s.operator,
   serviceID:s.id,isCancelled:s.cancelled,cancelReason:s.cancelled?"Synthetic train crew shortage":"",delayReason:s.delay?"Synthetic signalling delay":"",
   origin:[{locationName:names[s.from],crs:s.from}],destination:[{locationName:s.to==="ZFD"?"Brighton":s.to==="LET"?"Cambridge":names[s.to],crs:s.to}],
   subsequentCallingPoints:[{callingPoint:s.calls.slice(index+1).map(p=>call(s,p))}]};
 }
 function board(from,to){
  return {locationName:names[from]||from,crs:from,generatedAt:new Date(now()).toISOString(),trainServices:services().filter(s=>{
   const a=s.calls.findIndex(p=>p.code===from),b=s.calls.findIndex(p=>p.code===to);return a>=0&&b>a;
  }).map(s=>train(s,from)),nrccMessages:[]};
 }
 function details(id){
  const s=services().find(s=>s.id===id);if(!s)return null;
  return {...train(s,s.from),locationName:names[s.from],crs:s.from,...(now()>=s.dep+s.delay*minute&&!s.cancelled?{atd:fmt(s.dep+s.delay*minute)}:{}),
   previousCallingPoints:[],subsequentCallingPoints:[{callingPoint:s.calls.slice(1).map(p=>call(s,p))}]};
 }
 function tube(url){
  const c=config(),ret=c.direction==="return",route=c.route==="far"?"far":"kgx";
  const railShift=["later-train","wrong-train","cancellation"].includes(c.scenario)?(ret?(route==="far"?15:10):(route==="far"?15:12)):c.scenario==="delay"?8:0;
  const shift=c.scenario==="disruption"?5:0;
  const stop=/StopPoint\/([^/]+)/i.exec(url)?.[1];
  const offset=ret?({"940GZZLUALD":10,"940GZZLUBBN":18,"940GZZLUFCN":20,"940GZZLUKSX":24}[stop]):
   ({"940GZZLUKSX":64,"940GZZLUFCN":route==="far"?83:69,"940GZZLUBBN":route==="far"?86:72,"940GZZLUALD":route==="far"?92:78}[stop]);
  if(offset==null)return [];
  return [-6,0,6,12,18,24].map((extra,i)=>{
   const t=c.startTime+(offset+extra+shift+(ret?0:railShift))*minute;
   return {vehicleId:`SIM-TUBE-${ret?"WEST":"EAST"}-${route}-${i}`,lineId:i%3===2?"circle":"metropolitan",direction:ret?"outbound":"inbound",
    destinationName:ret?(i%3===2?"Edgware Road Underground Station":"Uxbridge Underground Station"):"Aldgate Underground Station",platformName:ret?"Westbound - Platform 1":"Eastbound - Platform 2",
    expectedArrival:new Date(t).toISOString(),timeToStation:Math.round((t-now())/1000)};
  }).filter(a=>a.timeToStation>=0&&a.timeToStation<=1800);
 }
 function journey(s,from,to){
  const a=s.calls.find(p=>p.code===from),b=s.calls.find(p=>p.code===to);
  return {legs:[{mode:{id:"national-rail"},departureTime:new Date(a.t+s.delay*minute).toISOString(),scheduledDepartureTime:new Date(a.t).toISOString(),
   arrivalTime:new Date(b.t+s.delay*minute).toISOString(),departurePoint:{commonName:names[from]+" Rail Station"},arrivalPoint:{commonName:names[to]+" Rail Station"},instruction:{summary:s.operator},
   path:{stopPoints:s.calls.slice(s.calls.indexOf(a)+1,s.calls.indexOf(b)).map(p=>({name:names[p.code]+" Rail Station"}))}}]};
 }
 function localJourney(from,to){
  const known={"940GZZLUKSX":[51.5307,-.1237],"940GZZLUFCN":[51.5205,-.1053],"940GZZLUALD":[51.5142,-.0755],"Science Museum":[51.4967,-.1764],"SW7 2DD":[51.4967,-.1764],"office":[51.5139,-.071]};
  const location=v=>{if(known[v])return known[v];if(!/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(v))return null;const p=v.split(',').map(Number);return p[0]>51.3&&p[0]<51.7&&p[1]>-.6&&p[1]<.3?p:null;};
  const a=location(from),b=location(to);if(!a||!b)return null;
  const distance=111*Math.hypot(a[0]-b[0],(a[1]-b[1])*.62),walk=distance<=1.5;
  const duration=walk?Math.max(1,Math.ceil(distance*1.3/4.3*60)):Math.ceil(8+distance/25*60);
  const departure=now(),arrival=departure+duration*minute;
  const point=(name,p)=>({commonName:name,lat:p[0],lon:p[1]});
  const legs=walk?[{mode:{id:"walking",name:"Walking"},duration,departureTime:new Date(departure).toISOString(),arrivalTime:new Date(arrival).toISOString(),departurePoint:point(from,a),arrivalPoint:point(to,b),instruction:{summary:"Walk to destination"}}]:[
   {mode:{id:"walking",name:"Walking"},duration:4,departureTime:new Date(departure).toISOString(),arrivalTime:new Date(departure+4*minute).toISOString(),departurePoint:point(from,a),arrivalPoint:point("Underground platforms",a),instruction:{summary:"Walk to Underground platforms"}},
   {mode:{id:"tube",name:"Underground"},duration:duration-8,departureTime:new Date(departure+4*minute).toISOString(),arrivalTime:new Date(arrival-4*minute).toISOString(),departurePoint:point("Underground platforms",a),arrivalPoint:point("Destination Underground platforms",b),routeOptions:[{name:"Circle"}],instruction:{summary:"Circle line towards destination"}},
   {mode:{id:"walking",name:"Walking"},duration:4,departureTime:new Date(arrival-4*minute).toISOString(),arrivalTime:new Date(arrival).toISOString(),departurePoint:point("Destination Underground platforms",b),arrivalPoint:point(to,b),instruction:{summary:"Walk to destination"}}];
  return {duration,startDateTime:new Date(departure).toISOString(),arrivalDateTime:new Date(arrival).toISOString(),legs};
 }
 const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>JSON.parse(JSON.stringify(body))});
 function respond(url){
  const u=String(url),c=config(),elapsed=(now()-c.startTime)/minute;
  if(c.scenario==="outage"&&elapsed>=16&&elapsed<40)return response({message:"Synthetic provider outage; recovery at minute 40"},503);
  const boardMatch=/GetDepBoardWithDetails\/([A-Z]{3})(?:\?|$)/i.exec(u),dest=/filterCrs=([A-Z]{3})/i.exec(u),proxy=/\/board\/([A-Z]{3})\/([A-Z]{3})/i.exec(u),huxley=/\/departures\/([A-Z]{3})\/to\/([A-Z]{3})/i.exec(u);
  if(boardMatch)return response(board(boardMatch[1].toUpperCase(),dest?dest[1].toUpperCase():"KGX"));
  if(proxy||huxley){const m=proxy||huxley;return response(board(m[1].toUpperCase(),m[2].toUpperCase()));}
  if(/GetServiceDetails\//i.test(u)){const s=details(decodeURIComponent(u.split(/GetServiceDetails\//i)[1].split("?")[0]));return response(s||{message:"Unknown synthetic service"},s?200:404);}
  if(/StopPoint\/.*\/Arrivals/i.test(u))return response(tube(u));
  if(/Line\//i.test(u))return response(c.scenario==="disruption"?[{id:"metropolitan",name:"Metropolitan",lineStatuses:[{statusSeverity:6,statusSeverityDescription:"Severe Delays",reason:"Synthetic signal failure"}]}]:[]);
  if(/Journey\/JourneyResults\//i.test(u)){
   // Coordinate pairs used by normal rail search. Other journeys explicitly fail,
   // ensuring unsupported fixtures cannot masquerade as a successful empty route.
   const coordinates={"51.98002,-0.22909":"LET","51.53197,-0.12341":"KGX","51.53062,-0.12594":"STP","51.52036,-0.10514":"ZFD"};
   const m=/JourneyResults\/([^/]+)\/to\/([^?]+)/i.exec(decodeURIComponent(u));
   const from=m&&(coordinates[m[1]]||m[1]),to=m&&(coordinates[m[2]]||m[2]);
   const found=services().filter(s=>!s.cancelled&&s.calls.some(p=>p.code===from)&&s.calls.findIndex(p=>p.code===to)>s.calls.findIndex(p=>p.code===from));
   if(found.length)return response({journeys:found.map(s=>journey(s,from,to))});
   const local=localJourney(from,to);
   return local?response({journeys:[local]}):response({message:"Unsupported synthetic Journey Planner endpoints"},422);
  }
  return response({message:"Unsupported synthetic provider URL"},501);
 }
 return {respond,services,board,details,tube};
}
