// Removing the two-design policy must not stop CI executing either suite or reporting failures.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
test('test runner discovers page and core suites and propagates either failure',()=>{
 const root=mkdtempSync(join(tmpdir(),'cartref-test-runner-'));
 try{
  for(const dir of ['tools','tests','tests/core'])mkdirSync(join(root,dir),{recursive:true});
  copyFileSync(new URL('../tools/run-tests.mjs',import.meta.url),join(root,'tools/run-tests.mjs'));
  writeFileSync(join(root,'tests/clock.mjs'),'export {};\n');
  const source=(name,fail)=>`import {test} from 'node:test'; test('${name}',()=>{${fail?"throw Error('intentional test failure');":''}});\n`;
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  for(const [failure,concurrency] of [[null,undefined],['page',undefined],['core',undefined],[null,'1'],['core','1']]){
   if(concurrency)env.COMMUTE_TEST_CONCURRENCY=concurrency;else delete env.COMMUTE_TEST_CONCURRENCY;
   writeFileSync(join(root,'tests/page.test.mjs'),source('page probe',failure==='page'));
   writeFileSync(join(root,'tests/core/core.test.mjs'),source('core probe',failure==='core'));
   const result=spawnSync(process.execPath,['tools/run-tests.mjs'],{cwd:root,env,encoding:'utf8',timeout:15000});
   assert.ifError(result.error);assert.equal(result.status,failure?1:0,result.stdout+result.stderr);
   assert.match(result.stdout,/page probe/);assert.match(result.stdout,/core probe/);
  }
  env.COMMUTE_TEST_CONCURRENCY='0';
  const invalid=spawnSync(process.execPath,['tools/run-tests.mjs'],{cwd:root,env,encoding:'utf8',timeout:15000});
  assert.equal(invalid.status,1);assert.match(invalid.stderr,/positive integer/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
