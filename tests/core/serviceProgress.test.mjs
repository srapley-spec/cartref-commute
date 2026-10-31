import {test} from 'node:test';
import assert from 'node:assert/strict';
import {core,at,MIN} from './helpers.mjs';

test('Service Details preserves ordered scheduled expected and reported times with signed early evidence',()=>{
 const now=at('2026-11-03','09:20');
 const data={locationName:'Central',crs:'CEN',std:'09:30',etd:'09:28',
  previousCallingPoints:[{callingPoint:[{locationName:'Riverside',crs:'RVS',st:'09:00',at:'08:58'}]}],
  subsequentCallingPoints:[{callingPoint:[{locationName:'Market',crs:'MKT',st:'09:45',et:'09:49'}]}]};
 const p=core.parseServiceDetails(data,now);
 assert.deepEqual(p.calls.map(c=>c.code),['RVS','CEN','MKT']);
 assert.equal(p.calls[0].actualAt-p.calls[0].scheduledAt,-2*MIN);
 assert.equal(p.calls[1].expectedAt-p.calls[1].scheduledAt,-2*MIN);
 assert.equal(p.calls[2].expectedAt-p.calls[2].scheduledAt,4*MIN);
 assert.equal(p.calls[1].actualAt,null,'expected is never reported');
 assert.equal(p.last.late,0,'existing clamped-late API remains compatible');
 assert.equal(p.at('MKT'),at('2026-11-03','09:49'));
});

test('Service Details leaves delayed cancelled and absent estimates unknown instead of manufacturing on-time facts',()=>{
 const p=core.parseServiceDetails({locationName:'Central',crs:'CEN',std:'09:30',etd:'Delayed',
  subsequentCallingPoints:[{callingPoint:[{locationName:'Market',crs:'MKT',st:'09:45',et:'Cancelled'}]}]},at('2026-11-03','09:20'));
 assert.equal(p.calls[0].expectedAt,null);assert.equal(p.calls[0].actualAt,null);
 assert.equal(p.calls[0].noEstimate,true);
 assert.equal(p.calls[1].expectedAt,null);assert.equal(p.calls[1].cancelled,true);
 assert.equal(p.calls[1].noEstimate,false);
});

test('Service Details keeps ordered midnight calls on the same coherent journey',()=>{
 const p=core.parseServiceDetails({locationName:'Central',crs:'CEN',std:'23:55',atd:'23:53',
  previousCallingPoints:[{callingPoint:[{locationName:'Riverside',crs:'RVS',st:'23:40',at:'23:39'}]}],
  subsequentCallingPoints:[{callingPoint:[{locationName:'Market',crs:'MKT',st:'00:10',et:'00:08'}]}]},at('2026-11-03','23:58'));
 assert.equal(p.calls[2].scheduledAt,at('2026-11-04','00:10'));
 assert.equal(p.calls[2].expectedAt,at('2026-11-04','00:08'));
 assert.ok(p.calls[2].expectedAt>p.calls[1].actualAt);
});
