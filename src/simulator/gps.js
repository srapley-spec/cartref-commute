// Synthetic browser-position provider. It emits observations only, never journey conclusions.
function createSimulatedGPSProvider({now,onPosition}){
 return {emit(latitude,longitude,accuracy,speed=null){
  if(![latitude,longitude,accuracy].every(Number.isFinite)||Math.abs(latitude)>90||Math.abs(longitude)>180||accuracy<0)throw new Error("Invalid simulated GPS observation");
  onPosition({coords:{latitude,longitude,accuracy,speed},timestamp:now()});
 }};
}
function interpolateSimulatedPosition(a,b,f,isRail,railLine){
 if(!isRail)return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
 const near=q=>railLine.reduce((best,p,i)=>Math.hypot(p[0]-q[0],(p[1]-q[1])*.62)<best.d?{i,d:Math.hypot(p[0]-q[0],(p[1]-q[1])*.62)}:best,{i:0,d:Infinity}).i;
 const ia=near(a),ib=near(b),middle=ia<ib?railLine.slice(ia+1,ib):railLine.slice(ib+1,ia).reverse(),path=[a,...middle,b];
 const ds=path.slice(1).map((q,i)=>Math.hypot(q[0]-path[i][0],(q[1]-path[i][1])*.62));let distance=ds.reduce((x,y)=>x+y,0)*f;
 for(let i=0;i<ds.length;i++){if(distance<=ds[i]||i===ds.length-1){const t=ds[i]?distance/ds[i]:0;return [path[i][0]+(path[i+1][0]-path[i][0])*t,path[i][1]+(path[i+1][1]-path[i][1])*t];}distance-=ds[i];}
 return b;
}
