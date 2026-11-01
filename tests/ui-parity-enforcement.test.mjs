import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadParityRegistry, parityTestName, parityRegistryProblems, parityCoverageProblems, previousParityRegistry, productionDesignInventory, surfaceDesigns} from '../tools/check-ui-parity.mjs';
import {core} from './core/helpers.mjs';

const ROOT=fileURLToPath(new URL('..',import.meta.url));
const registry=()=>structuredClone(loadParityRegistry());
const views=Object.keys(core.BLOCKS);
const passed=r=>r.surfaces.flatMap(s=>surfaceDesigns(r,s).map(d=>parityTestName(d.id,s.id)))
 .map((name,index)=>`ok ${index+1} - ${name}`).join('\n');

test('UI parity gate registers every supported design and every engine view, with no duplicate or empty entries',()=>{
 const r=registry();assert.deepEqual(parityRegistryProblems(r,{viewIds:views}),[]);
 assert.deepEqual(r.designs.map(d=>d.id),['panda','signal']);
 const missing=registry();missing.surfaces=missing.surfaces.filter(s=>s.view!=='on-tube');
 assert.match(parityRegistryProblems(missing,{viewIds:views}).join(' '),/Engine view has no UI parity surface: on-tube/);
 const unknown=registry();unknown.surfaces.push({id:'new-screen',view:'unregistered-engine-view'});
 assert.match(parityRegistryProblems(unknown,{viewIds:views}).join(' '),/unknown engine view/);
 const duplicate=registry();duplicate.designs.push(duplicate.designs[0]);
 assert.match(parityRegistryProblems(duplicate,{viewIds:views}).join(' '),/Duplicate/);
 for(const key of ['designs','surfaces']){
  const empty=registry();empty[key]=[];
  assert.match(parityRegistryProblems(empty,{viewIds:views}).join(' '),/must not be empty/);
 }
});

test('UI parity gate requires actual passing results for every tuple and rejects skip TODO omission failure and duplicate',()=>{
 const r=registry(),tap=passed(r);assert.deepEqual(parityCoverageProblems(r,tap),[]);
 const first=parityTestName(r.designs[0].id,r.surfaces[0].id);
 const one=`ok 1 - ${first}`;
 for(const broken of [tap.replace(one,one+' # SKIP temporarily unavailable'),tap.replace(one,one+' # TODO later'),
  tap.replace(one,'not '+one),tap.replace(one,''),tap+'\n'+one])
  assert.ok(parityCoverageProblems(r,broken).length,broken);
 assert.match(parityCoverageProblems(r,'# declared coverage: '+[...r.designs].map(d=>d.id).join(',')).join(' '),/Missing/);
 assert.match(parityCoverageProblems(r,tap+'\nok 99 - UI parity: other-design / plan-now').join(' '),/Unexpected/);
});

test('UI parity gate forbids silent registry shrinkage even when a docs waiver exists',()=>{
 const prior=registry(),current=registry();current.designs=current.designs.filter(d=>d.id!=='panda');
 const problems=parityRegistryProblems(current,{viewIds:views,previous:prior});
 assert.match(problems.join(' '),/panda was removed without an explicit retirement/);
 // Commit text is intentionally not accepted as an input to this gate.
 assert.ok(parityRegistryProblems({...current,messages:['Docs: none — UI tidy']},{viewIds:views,previous:prior}).length);
 const removedSurface=registry();removedSurface.surfaces=removedSurface.surfaces.filter(s=>s.id!=='live-departures');
 assert.match(parityRegistryProblems(removedSurface,{viewIds:views,previous:prior}).join(' '),/live-departures was removed/);
});

test('UI parity gate accepts explicit documented retirement and retains its history',()=>{
 const root=mkdtempSync(join(tmpdir(),'cartref-ui-retirement-'));
 try{
  mkdirSync(join(root,'docs'));
  mkdirSync(join(root,'src'));writeFileSync(join(root,'src/app.css'),'html[data-design="signal"]{}');
  const previous=registry(),current=registry();current.designs=current.designs.filter(d=>d.id!=='panda');
  // Retiring Panda also ends Trip's Panda exception: those surfaces then cover every remaining design.
  current.surfaces=current.surfaces.map(({designs,exception,...surface})=>surface);
  current.retired=[{kind:'design',id:'panda',decision:'docs/retire-panda.md'}];
  assert.match(parityRegistryProblems(current,{viewIds:views,previous,root}).join(' '),/existing decision/);
  writeFileSync(join(root,'docs/retire-panda.md'),'Retired UI: design:panda\n');
  assert.match(parityRegistryProblems(current,{viewIds:views,previous,root}).join(' '),/explicitly record/);
  writeFileSync(join(root,'docs/retire-panda.md'),'Approved by: Sam\nRetired UI: design:panda\n');
  assert.deepEqual(parityRegistryProblems(current,{viewIds:views,previous,root}),[]);
  const withoutHistory={...current,retired:[]};
  assert.match(parityRegistryProblems(withoutHistory,{viewIds:views,previous:current,root}).join(' '),/history was removed/);
  assert.ok(parityRegistryProblems({...current,retired:[{...current.retired[0],decision:'../retire-panda.md'}]},
   {viewIds:views,previous,root}).length,'a retirement decision cannot escape docs/');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('UI parity gate discovers third production CSS and assignment designs but ignores historical prototypes',()=>{
 const root=mkdtempSync(join(tmpdir(),'cartref-ui-design-'));
 try{
  mkdirSync(join(root,'src'));mkdirSync(join(root,'docs'));
  writeFileSync(join(root,'src/page.html'),`<style>html[data-design="panda"]{}</style><script>document.documentElement.dataset.design=enabled?'signal':'panda';</script>`);
  writeFileSync(join(root,'docs/prototype.html'),'<html data-design="historical">');
  assert.deepEqual(productionDesignInventory(root),{ids:['panda','signal'],problems:[]});
  writeFileSync(join(root,'src/new.css'),'html [ data-design = "third" ]{}');
  assert.match(parityRegistryProblems(registry(),{viewIds:views,root}).join(' '),/Production design is not registered.*third/);
  writeFileSync(join(root,'src/new.css'),'/* [data-design="not-live"] */');
  writeFileSync(join(root,'src/next.js'),`node.dataset['design']=flag?'signal':(other?'panda':'next');`);
  assert.match(parityRegistryProblems(registry(),{viewIds:views,root}).join(' '),/Production design is not registered.*next/);
  writeFileSync(join(root,'src/next.js'),'// The implementation was moved to an ES module.');
  writeFileSync(join(root,'src/next.mjs'),`node.setAttribute('data-design', 'fourth');`);
  assert.match(parityRegistryProblems(registry(),{viewIds:views,root}).join(' '),/Production design is not registered.*fourth/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('UI parity gate rejects opaque computed design assignment instead of assuming registry completeness',()=>{
 const root=mkdtempSync(join(tmpdir(),'cartref-ui-computed-'));
 try{
  mkdirSync(join(root,'src'));
  writeFileSync(join(root,'src/app.js'),`node.dataset.design=enabled?'signal':saved.design;`);
  assert.match(productionDesignInventory(root).problems.join(' '),/explicit literal design IDs/);
  writeFileSync(join(root,'src/app.js'),`node.setAttribute('data-design', saved.design);`);
  assert.match(productionDesignInventory(root).problems.join(' '),/explicit literal design IDs/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('UI parity gate is mandatory in npm test and both committed CI paths without rerunning the matrix',()=>{
 const pkg=JSON.parse(readFileSync(join(ROOT,'package.json'),'utf8'));
 assert.match(pkg.scripts.test,/tools\/run-tests\.mjs/);
 assert.match(pkg.scripts['check-ui-parity'],/tools\/run-tests\.mjs --ui-parity-only/);
 for(const path of ['tools/ci-local.mjs','.github/workflows/test.yml']){
  const text=readFileSync(join(ROOT,path),'utf8');
  assert.match(text,/tools\/run-tests\.mjs/,path);
  assert.match(text,/UI_PARITY_BASE/,path);
  assert.doesNotMatch(text,/check-ui-parity.*--ui-parity-only/,path+' runs the whole suite only once');
 }
});

test('UI parity gate rejects a broken comparison base instead of discarding retirement protection',()=>{
 assert.throws(()=>previousParityRegistry(ROOT,'this-is-not-a-real-parity-base'),/not a commit/);
});

test('UI parity gate accepts a design exception only with Sam\'s recorded decision naming the surface and its designs',()=>{
 const r=registry(),trip=r.surfaces.find(x=>x.id==='plan-trip-now');
 assert.deepEqual(trip.designs,['signal']);assert.equal(trip.exception,'docs/decisions/trip-signal-only.md');
 assert.deepEqual(parityRegistryProblems(r,{viewIds:views}),[]);
 const tap=passed(r);assert.deepEqual(parityCoverageProblems(r,tap),[]);
 assert.ok(!tap.includes('panda / plan-trip-now'),'an excepted design has no expected case');
 assert.match(parityCoverageProblems(r,tap+'\nok 999 - UI parity: panda / plan-trip-now').join(' '),/Unexpected/);
 assert.match(parityCoverageProblems(r,tap.replace(/^ok \d+ - UI parity: signal \/ plan-trip-now$/m,'')).join(' '),/Missing UI parity result: UI parity: signal \/ plan-trip-now/);
 const edit=f=>{const x=registry();f(x.surfaces.find(y=>y.id==='plan-trip-now'),x);return parityRegistryProblems(x,{viewIds:views}).join(' ');};
 assert.match(edit(t=>{delete t.exception;}),/needs an existing decision/);
 assert.match(edit(t=>{t.exception='docs/decisions/missing.md';}),/needs an existing decision/);
 assert.match(edit(t=>{t.designs=['panda'];}),/exactly this surface and its designs/);
 assert.match(edit(t=>{t.designs=['panda','signal'];}),/leave out at least one design/);
 assert.match(edit(t=>{t.designs=['womble'];}),/list registered designs/);
 assert.match(edit(t=>{t.designs=[];}),/list registered designs/);
 assert.match(edit((t,x)=>{x.surfaces.find(y=>y.id==='plan-now').designs=['signal'];x.surfaces.find(y=>y.id==='plan-now').exception=t.exception;}),/surface plan-now|Surface plan-now/,'the record names Trip only: a commute view cannot borrow it');
 const dir=mkdtempSync(join(tmpdir(),'parity-exception-'));
 try{
  mkdirSync(join(dir,'docs'));writeFileSync(join(dir,'docs','x.md'),'Design exception: surface:plan-trip-now designs:signal\n');
  const x=registry(),t=x.surfaces.find(y=>y.id==='plan-trip-now');t.exception='docs/x.md';
  const problems=parityRegistryProblems(x,{viewIds:views,root:dir,inventory:{ids:['panda','signal'],problems:[]}}).filter(p=>/plan-trip-now/.test(p));
  assert.match(problems.join(' '),/record Sam's approval/,'no approval line: refused');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
