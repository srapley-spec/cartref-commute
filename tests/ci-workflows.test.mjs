import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'yaml';
const load=name=>parse(readFileSync(new URL(`../.github/workflows/${name}.yml`,import.meta.url),'utf8'));
test('CI runs one PR gate and preserves tested main and nightly coverage',()=>{
 const w=load('test');
 assert.deepEqual(w.on.push.branches,['main']);
 assert.deepEqual(w.on.pull_request.branches,['main']);
 assert(w.on.schedule.length);
 assert(Object.hasOwn(w.on,'workflow_dispatch'));
 assert.equal(w.concurrency['cancel-in-progress'],"${{ github.event_name == 'pull_request' }}");
 assert(w.concurrency.group.includes('github.event_name'));
 assert(w.concurrency.group.includes('github.ref'));
 assert.equal(w.jobs.ios.needs,'test');
 assert(!w.jobs.test.if && !w.jobs.ios.if);
 for(const command of ['npm run typecheck','node tools/run-tests.mjs']) assert(w.jobs.test.steps.some(s=>s.run===command),command);
 for(const command of ['npm run ios:sync','npm run ios:test']) assert(w.jobs.ios.steps.some(s=>s.run===command),command);
 assert(w.jobs.test.steps.some(s=>s.run?.includes('git diff --exit-code')));
 assert(w.jobs.test.steps.some(s=>s.run?.includes('check-docs.mjs')));
});
test('cost changes preserve every tested main release and no PR signing',()=>{
 const w=load('testflight');
 assert.deepEqual(w.on.workflow_run.workflows,['Tests']);
 assert.deepEqual(w.on.workflow_run.branches,['main']);
 assert.equal(w.concurrency.queue,'max');
 assert(!w.concurrency['cancel-in-progress']);
 for(const text of ["conclusion == 'success'","event == 'push'","head_branch == 'main'","head_repository.full_name == 'srapley-spec/cartref-commute'"]) assert(w.jobs.upload.if.includes(text));
 const checkout=w.jobs.upload.steps.find(s=>s.uses?.startsWith('actions/checkout@'));
 assert.equal(checkout.with.ref,'${{ github.event.workflow_run.head_sha || inputs.source_sha }}');
 // A dispatched release (after a pipeline merge) is checked through the API before checkout and signing.
 assert.equal(w.jobs.upload.steps[0].if,"github.event_name == 'workflow_dispatch'");
 assert(w.jobs.upload.if.includes("github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'"));
 assert(!JSON.stringify(load('test')).includes('secrets.'));
});
test('Pages publishes only a main commit that passed Tests (only-tested-code-goes-live)',()=>{
 const w=load('test');
 const source=w.jobs['pages-source'], pages=w.jobs.pages;
 // Only after both the web and the iPhone jobs pass, only on main, never for a pull request or the nightly run.
 assert.deepEqual(source.needs,['test','ios']);
 assert.equal(source.if,"github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')");
 assert.equal(pages.needs,'pages-source');
 assert.equal(pages.if,"needs.pages-source.outputs.publish == 'yes'");
 // Publishes nothing while the source is still a branch, nor from an older commit once main has moved on.
 const check=source.steps.find(s=>s.id==='check').run;
 for(const text of ['.build_type','"$source" != workflow','repos/$REPO/commits/main','"$newest" != "$SHA"','publish=yes']) assert(check.includes(text),text);
 assert.equal(source.permissions.pages,'read');
 assert.deepEqual(pages.permissions,{contents:'read',pages:'write','id-token':'write'});
 assert.equal(pages.environment.name,'github-pages');
 assert(pages.steps.some(s=>s.uses?.startsWith('actions/upload-pages-artifact@')));
 assert(pages.steps.some(s=>s.uses?.startsWith('actions/deploy-pages@')));
 // The test and iPhone jobs stay unconditional; the Pages jobs read no secrets (checked for the whole file above).
 assert(!w.jobs.test.needs && w.jobs.ios.needs==='test');
 // After a pipeline merge, the old branch build is requested only while Pages still builds from a branch.
 const merge=load('merge-when-green').jobs.merge.steps.at(-1).run;
 assert(merge.includes('--jq .build_type'));
 assert(merge.indexOf('!= workflow')<merge.indexOf('pages/builds'));
 assert(merge.includes('gh workflow run test.yml'));
});
