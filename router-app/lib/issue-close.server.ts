import type {SupabaseClient} from '@supabase/supabase-js';
import {issueCloseFeedback} from './issue-close';
export async function closeIssue(client:SupabaseClient,target:string) {
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target))return {error:'Choose an exact Issue before closing.'};
 try {
  const result=await client.rpc('close_issue',{target});
  if(!result.error)return issueCloseFeedback(result.data);
  console.error('issue-close-rpc',{issueId:target,code:result.error.code});
  if(result.error.code==='42501')return {error:'Active Moderator/Admin access and handbook acceptance are required to close this Issue.'};
 }catch{console.error('issue-close-transport',{issueId:target});}
 // A transport failure may occur after commit: recover the authoritative result before reporting failure.
 try {
  const current=await client.rpc('issue_close_state',{target});
  if(!current.error&&current.data&&(current.data.status!=='READY_TO_CLOSE'||current.data.lifecycle_state==='CLOSE FAILED'))return issueCloseFeedback(current.data);
 }catch{/* The next reload/retry uses the same exact Issue, safely. */}
 return {error:'The close request could not be verified. Refresh the Issue state, then safely retry closing this same Issue.'};
}
