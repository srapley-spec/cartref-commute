import {test} from 'node:test';
import assert from 'node:assert/strict';
import {alongLine,alongPreferences,samAlongLine,profiles} from '../../dist/core.mjs';
const profile=profiles.samCommute, now=1793697600000;
const base={points:samAlongLine,line:profile.lines.KGX,hub:'KGX',reverse:false,now,here:[51.8158,-.1972],accuracy:10,fixAt:now,onboard:true,identityCertain:true,locationOK:true};

test('Along: Welwyn is shared, interests and depth are independent, and malformed preferences are safe',()=>{
 const laura=alongLine({...base,preferences:{interests:['views','places'],depth:'glance'}});
 const sam=alongLine({...base,preferences:{interests:['views','places','engineering','operations'],depth:'explore'}});
 assert.equal(laura.featuredId,'digswell');assert.equal(sam.featuredId,'digswell');
 assert.equal(laura.points.find(p=>p.point.id==='hitchin').selected,false);
 assert.equal(sam.points.find(p=>p.point.id==='hitchin').selected,true);
 assert.equal(alongPreferences({interests:['places'],depth:'explore'}).depth,'explore');
 assert.deepEqual(alongPreferences({interests:['wrong',null,'operations','operations'],depth:'garbage'}),{interests:['operations'],depth:'discover'});
 assert.deepEqual(alongPreferences(null),{interests:['views','places'],depth:'discover'});
 assert.deepEqual(alongPreferences({interests:[]}).interests,[]);
});
test('Along: route and direction scope points without claiming the wrong tunnel or flyover',()=>{
 const south=alongLine(base),north=alongLine({...base,reverse:true});
 assert.deepEqual(north.points.map(p=>p.point.id),south.points.map(p=>p.point.id).reverse());
 assert.equal(south.points.find(p=>p.point.id==='hitchin').state,'passed');
 assert.equal(north.points.find(p=>p.point.id==='hitchin').state,'upcoming');
 assert.ok(!south.points.some(p=>p.point.id==='canal-tunnels'));
 const thameslink=alongLine({...base,line:profile.lines.ZFD,hub:'ZFD'});
 assert.ok(thameslink.points.some(p=>p.point.id==='canal-tunnels'));
 assert.ok(!thameslink.points.some(p=>p.point.id==='gasworks'));
 const subset=alongLine({...base,from:profile.stationGeo.SVG,to:profile.stationGeo.KGX});
 assert.ok(!subset.points.some(p=>p.point.id==='hitchin'));
 assert.match(samAlongLine.find(p=>p.id==='hitchin').explore,/Travelling towards London does not mean you cross it/);
});
test('Along: weak stale future off-route or uncertain evidence cannot produce live landmark prompts',()=>{
 for(const patch of [{fixAt:now-60001},{fixAt:now+1},{accuracy:101},{accuracy:-1},{accuracy:NaN},{here:[52,0]},{here:[NaN,0]},{here:null},{locationOK:false},{identityCertain:false},{onboard:false}]){
  const m=alongLine({...base,...patch});assert.equal(m.reliable,false,JSON.stringify(patch));
  assert.equal(m.featuredId,null);assert.ok(m.points.every(p=>p.state==='browse'&&p.distanceM===null));
 }
 assert.equal(alongLine({...base,fixAt:now-60000,accuracy:100}).reliable,true);
 assert.equal(alongLine({...base,preferences:{interests:[]}}).empty,true);
 assert.equal(alongLine({...base,line:[]}).points.length,0);
 assert.equal(alongLine({...base,hub:'unrelated'}).points.length,0);
});
test('Along: the model does not mutate frozen observations or invent times and window sides',()=>{
 const points=JSON.parse(JSON.stringify(samAlongLine));points.forEach(p=>{Object.freeze(p.tags);Object.freeze(p);});Object.freeze(points);
 const model=alongLine(Object.freeze({...base,points}));assert.equal(model.reliable,true);
 assert.equal(model.points.find(p=>p.point.id==='digswell').state,'nearby');
 assert.ok(model.points.every(p=>!('eta' in p)&&!('side' in p)));
 assert.ok(points.every(p=>/^https:\/\/en.wikipedia.org\//.test(p.source)));
});
