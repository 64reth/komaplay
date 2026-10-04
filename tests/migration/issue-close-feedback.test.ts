import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {issueCloseFeedback} from '../../router-app/lib/issue-close';
import {closeIssue} from '../../router-app/lib/issue-close.server';
import {readFile} from 'node:fs/promises';
test('known close states show actual server results',()=>{
 for(const status of ['ARCHIVED','ALREADY_ARCHIVED'])assert.deepEqual(issueCloseFeedback({status,reason:'Specific result'}),{success:'Specific result'});
 for(const status of ['AWAITING_COVER','CLOSE_IN_PROGRESS','BLOCKED','FAILED'])assert.deepEqual(issueCloseFeedback({status,reason:'Specific blocker'}),{error:'Specific blocker'});
});
test('a lost close response recovers committed archive state',async()=>{
 const calls:string[]=[];
 const client={rpc:async(name:string,args:{target:string})=>{calls.push(name);assert.equal(args.target,'2794607f-27a7-4cad-8ba6-a8243c252357');if(name==='close_issue')throw Error('Lost response');return {data:{status:'ALREADY_ARCHIVED',reason:'Issue was already archived.'},error:null};}} as unknown as SupabaseClient;
 assert.deepEqual(await closeIssue(client,'2794607f-27a7-4cad-8ba6-a8243c252357'),{success:'Issue was already archived.'});assert.deepEqual(calls,['close_issue','issue_close_state']);
});
test('all close surfaces send the exact Issue to the canonical RPC',async()=>{
 for(const route of ['moderation','cover-editor','cover-pool']){const source=await readFile(`router-app/routes/${route}.tsx`,'utf8');assert.match(source,/closeIssue\(/);assert.doesNotMatch(source,/rpc\("close_current_issue"/);}
 const sql=await readFile('supabase/migrations/202610040002_canonical_issue_close.sql','utf8');assert.match(sql,/return public\.close_issue_internal\(target\)/);assert.match(sql,/state:=public\.close_issue_internal\(i.id\)/);assert.doesNotMatch(sql,/issue_drop_for_month/);
});
