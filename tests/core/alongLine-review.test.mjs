import {test} from 'node:test';import assert from 'node:assert/strict';
import {alongLine} from '../../dist/core.mjs';
const now=Date.parse('2026-11-03T12:00:00Z');
const point={id:'independent',title:'A view',geo:[0,.05],hubs:['route'],tags:['views'],hook:'',notice:'',discover:'',explore:'',source:'',sourceTitle:'',visibility:''};
const input={points:[point],line:[[0,0],[0,.1]],hub:'route',reverse:false,now,here:[0,.052],accuracy:10,fixAt:now,onboard:true,identityCertain:true,locationOK:true};
test('independent: approximate landmark areas include nearby positions rather than just exact anchors',()=>{
 const model=alongLine(input);assert.equal(model.points[0].state,'nearby');
 const outside=alongLine({...input,here:[0,.053]});assert.equal(outside.points[0].state,'passed');
 const expanded=alongLine({...input,here:[0,.053],points:[{...point,radiusM:400}]});assert.equal(expanded.points[0].state,'nearby');
});
test('independent: the GPS uncertainty buffer changes only the nearby boundary within the accepted fix limit',()=>{
 const narrow=alongLine({...input,here:[0,.0528],accuracy:0});assert.equal(narrow.points[0].state,'passed');
 const wide=alongLine({...input,here:[0,.0528],accuracy:100});assert.equal(wide.points[0].state,'nearby');
});
