// Development-only transport feed simulator. No request is sent to a real provider in this mode.
// Intentional standalone boundary: synthetic data must still pass through normal application adapters.
function createSimulatedTransportFeeds({now=()=>Date.now(),scenario=()=>({})}={}) {
 const origin={LET:"Letchworth Garden City",KGX:"London Kings Cross",STP:"London St Pancras International",ZFD:"Farringdon"};
 const fmt=t=>new Date(t).toLocaleTimeString("en-GB",{timeZone:"Europe/London",hour:"2-digit",minute:"2-digit",hour12:false});
 const time=(hour,min)=>{let d=new Date(now()); d.setHours(hour,min,0,0);return d.getTime()};
 const chosen=()=>scenario().route==="far"?"far":"kgx";
 const services=()=>{
   // Every fixture service has an immutable identity and several plausible competitors.
   const start=time(9,0), mk=(id,from,to,offset,duration,operator)=>({
     id,from,to,dep:start+offset*60000,arr:start+(offset+duration)*60000,operator
   });
   return [
     mk("SIM-GN-0905","LET","KGX",5,36,"Great Northern"),
     mk("SIM-TL-0912","LET","ZFD",12,48,"Thameslink"),
     mk("SIM-GN-0917","LET","KGX",17,35,"Great Northern"),
     mk("SIM-TL-0927","LET","ZFD",27,48,"Thameslink"),
     mk("SIM-GN-HOME-1005","KGX","LET",65,36,"Great Northern"),
     mk("SIM-TL-HOME-1012","ZFD","LET",72,48,"Thameslink"),
     mk("SIM-GN-HOME-1017","KGX","LET",77,35,"Great Northern")
   ];
 };
 const shifted=(s,from,to)=>s.from===from&&s.to===to ||
    (from==="LET"&&to==="STP"&&s.from==="LET"&&s.to==="ZFD") ||
    (from==="STP"&&to==="LET"&&s.from==="ZFD"&&s.to==="LET");
 const call=(code,t)=>({locationName:origin[code]||code,crs:code,st:fmt(t),et:"On time"});
 const train=(s,from,to)=>{
   const effectiveTo=to==="STP"?"STP":to;
   const arrival=effectiveTo==="STP" ? s.arr-5*60000 : s.arr;
   return {std:fmt(s.dep),etd:"On time",platform:s.from==="LET"?"2":"1",operator:s.operator,
    serviceID:s.id,origin:[{locationName:origin[s.from]}],destination:[{locationName:origin[to]||to}],
    subsequentCallingPoints:[{callingPoint:[call(effectiveTo,arrival)]}]};
 };
 const board=(from,to)=>({locationName:origin[from]||from,trainServices:services().filter(s=>shifted(s,from,to)).map(s=>train(s,from,to)),nrccMessages:[]});
 const details=id=>{
   const s=services().find(s=>s.id===id);
   if(!s)return {locationName:"Unknown",crs:"LET",subsequentCallingPoints:[]};
   const clock=now(),departed=clock>=s.dep,arrived=clock>=s.arr;
   return {locationName:origin[s.from],crs:s.from,std:fmt(s.dep),atd:departed?fmt(s.dep):undefined,etd:departed?"On time":fmt(s.dep),
     subsequentCallingPoints:[{callingPoint:[{...call(s.to,s.arr),...(arrived?{at:fmt(s.arr)}:{})}]}]};
 };
 const tflJourney=(s)=>({legs:[{mode:{id:"national-rail"},departureTime:new Date(s.dep).toISOString(),
   arrivalTime:new Date(s.arr).toISOString(),departurePoint:{commonName:origin[s.from]+" Rail Station"},
   arrivalPoint:{commonName:origin[s.to]+" Rail Station"},instruction:{summary:s.operator}}]});
 const tube=(u)=>{
   const west=u.includes("940GZZLUALD"),at=now()+2*60000;
   return [2,6,10].map((min,i)=>({vehicleId:"SIM-TUBE-"+i,lineId:i===2?"circle":"metropolitan",
    destinationName:west?"Uxbridge Underground Station":"Aldgate Underground Station",
    platformName:west?"Westbound - Platform 1":"Eastbound - Platform 2",
    expectedArrival:new Date(now()+min*60000).toISOString(),timeToStation:min*60}));
 };
 function respond(url){
  const u=String(url);
  let body;
  const m=/GetDepBoardWithDetails\/([A-Z]{3})\?/.exec(u);
  const dest=/filterCrs=([A-Z]{3})/.exec(u);
  if(m)body=board(m[1],dest?dest[1]:"KGX");
  else if(/GetServiceDetails\//.test(u))body=details(decodeURIComponent(u.split("GetServiceDetails/")[1].split("?")[0]));
  else if(/StopPoint\/.*\/Arrivals/.test(u))body=tube(u);
  else if(/Line\//.test(u))body=[];
  else if(/Journey\/JourneyResults\//.test(u))body={journeys:services().map(tflJourney)};
  else body={};
  return {ok:true,status:200,json:async()=>body};
 }
 return {respond,services,board,details};
}
