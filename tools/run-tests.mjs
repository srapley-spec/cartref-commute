#!/usr/bin/env node
// Run the complete page and engine suites with the same virtual clock locally and in CI.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root=fileURLToPath(new URL('..',import.meta.url));
const files=['tests','tests/core'].flatMap(dir=>
  readdirSync(join(root,dir)).filter(file=>file.endsWith('.test.mjs')).sort().map(file=>`${dir}/${file}`));
const env={...process.env,TZ:'Europe/London'};
delete env.NODE_TEST_CONTEXT;
const child=spawn(process.execPath,['--import','./tests/clock.mjs','--test','--test-reporter=tap',...files],
  {cwd:root,env,stdio:'inherit'});
child.on('error',error=>{console.error(`✗ Could not run tests: ${error.message}`);process.exitCode=1;});
child.on('close',(code,signal)=>{
  if(signal)console.error(`✗ Test process terminated by ${signal}`);
  process.exitCode=code===0&&!signal?0:1;
});
