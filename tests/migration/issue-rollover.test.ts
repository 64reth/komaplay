import test from 'node:test';
import assert from 'node:assert/strict';
import { runIssueRollover } from '../../workers/issue-rollover';
test('scheduled rollover calls only the private service RPC with no caller-supplied date or Issue',async()=>{
 const result=await runIssueRollover('https://fixture.supabase.co/','private-test-key',async(input,init)=>{
  assert.equal(input,'https://fixture.supabase.co/rest/v1/rpc/run_issue_rollover');assert.equal(init?.method,'POST');assert.equal(init?.body,'{}');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer private-test-key');assert.ok(init?.signal);return Response.json([{issue:0,phase:'needs_editorial'}]);
 });assert.deepEqual(result,[{issue:0,phase:'needs_editorial'}]);
});
test('missing service configuration fails closed',async()=>{await assert.rejects(runIssueRollover(undefined,'key'),/bindings are unavailable/);});
test('RPC failure is observable and does not leak service credentials or response bodies',async()=>{
 await assert.rejects(runIssueRollover('https://fixture.supabase.co','private-test-key',async()=>new Response('private data',{status:503})),e=>{assert.match(String(e),/503/);assert.doesNotMatch(String(e),/private-test-key|private data/);return true;});
});
