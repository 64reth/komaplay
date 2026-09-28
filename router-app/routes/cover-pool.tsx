import { data, Form, Link, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/cover-pool";
import { requireCoverCommittee } from "../lib/cover-pool.server";
import { Masthead } from "../components/Masthead";
import { CoverPreview } from "../components/CoverPreview";
import type { CoverDraft } from "../lib/cover-editor";
import { actionFailure } from "../lib/action-feedback";

type Candidate = { id:string; issue_id:string; created_by:string; status:string; payload:CoverDraft };
export async function loader({request}:Route.LoaderArgs) {
  const {client,user,headers}=await requireCoverCommittee(request);
  const issues=await client.from("issues").select("id,title,status").order("year",{ascending:false}).order("month",{ascending:false});
  if(issues.error)throw data("Issues unavailable.",{status:503,headers});
  const issue=issues.data.find(i=>i.id===new URL(request.url).searchParams.get("issue"))??issues.data.find(i=>i.status!=="archived")??issues.data[0];
  if(!issue)return data({issues:[],issue:null,candidates:[] as Candidate[],votes:[] as {candidate_id:string;voter_id:string}[],userId:user.id},{headers});
  const [candidates,votes]=await Promise.all([
    client.from("issue_cover_candidates").select("id,issue_id,created_by,status,payload").eq("issue_id",issue.id).order("created_at"),
    client.from("issue_cover_votes").select("candidate_id,voter_id").eq("issue_id",issue.id),
  ]);
  if(candidates.error||votes.error)throw data("Cover Pool unavailable. Please retry shortly.",{status:503,headers});
  return data({issues:issues.data,issue,candidates:candidates.data as Candidate[],votes:votes.data,userId:user.id},{headers});
}
export async function action({request}:Route.ActionArgs) {
  const {client,headers}=await requireCoverCommittee(request);
  if(request.headers.get("origin")!==new URL(request.url).origin)return data({error:"Same-origin request required."},{status:403,headers});
  const form=await request.formData(),operation=String(form.get("intent"));
  if(!["submit","withdraw","vote","select","archive"].includes(operation))return data({error:"Unknown action."},{status:400,headers});
  if(operation==="archive") {
    const issue=await client.from("issues").select("id,status").eq("id",String(form.get("issue_id"))).single();
    const selected=await client.from("issue_cover_candidates").select("id").eq("issue_id",String(form.get("issue_id"))).eq("status","selected").single();
    if(issue.error||selected.error||!["current","finalising"].includes(issue.data.status))return data({error:"Select the current issue’s official cover first."},{status:400,headers});
    const result=await client.rpc("close_current_issue");
    return data(result.error?{error:actionFailure(result.error,"Archiving failed.")}:{success:"Issue archived with its official cover."},{status:result.error?400:200,headers});
  }
  const result=await client.rpc("cover_pool_action",{operation,target_issue:String(form.get("issue_id")),target_candidate:String(form.get("candidate_id")),confirmed:form.get("confirmed")==="yes"});
  return data(result.error?{error:actionFailure(result.error,"Cover action failed.")}:{success:operation==="select"?"Official cover selected. Committee voting is now closed.":"Cover Pool updated."},{status:result.error?400:200,headers});
}
export const meta=()=>[{title:"Private Cover Pool — KOMA://PLAY"},{name:"robots",content:"noindex, nofollow"}];
export default function CoverPool({loaderData:d}:Route.ComponentProps) {
  const result=useActionData<typeof action>(),navigation=useNavigation(),busy=navigation.state!=="idle";
  const selected=d.candidates.some(c=>c.status==="selected"),closed=selected||d.issue?.status==="archived";
  const mine=d.candidates.filter(c=>c.created_by===d.userId),count=(id:string)=>d.votes.filter(v=>v.candidate_id===id).length;
  const max=Math.max(0,...d.candidates.map(c=>count(c.id)));
  return <main className="editorial-page"><Masthead/><section className="op-workspace cover-editor"><p className="editorial-marker">PRIVATE COMMITTEE</p><h1>Cover Pool</h1>
    <p>You can submit up to 2 cover candidates for this issue. Drafts count towards this limit.</p><p>Committee voting is private to authorised editors. You can change your vote until an official cover is selected.</p>
    <Form method="get"><label>Issue <select name="issue" defaultValue={d.issue?.id} onChange={e=>e.currentTarget.form?.requestSubmit()}>{d.issues.map(i=><option key={i.id} value={i.id}>{i.title} · {i.status}</option>)}</select></label><button className="op-button">VIEW ISSUE</button></Form>
    {result&&("error" in result?<p role="alert">{result.error}</p>:<p role="status">{result.success}</p>)}
    <h2>My cover candidates · {mine.length}/2</h2>
    {d.issue&&!closed&&mine.length<2&&<Link className="op-button" to={`/cover-editor?issue=${d.issue.id}&candidate=new`}>CREATE CANDIDATE</Link>}
    <p>Drafts are private to their creator and Admins. Submitted covers are immutable; withdrawing a cover retires its slot.</p>
    {!d.candidates.length&&<p>No candidates yet.</p>}
    <div className="cover-pool-grid">{d.candidates.map(c=><article key={c.id} className="cover-pool-card">
      <p><strong>{c.status.replaceAll("-"," ")}</strong> · {c.created_by===d.userId?"You":`Editor ${c.created_by}`} · {count(c.id)} votes</p>
      <CoverPreview draft={c.payload} imageUrl={c.payload.cover_art?`/member/cover-pool/image?path=${encodeURIComponent(c.payload.cover_art)}`:""} panelCount={0}/>
      {c.status==="selected"&&<p>✓ Official selected cover</p>}
      {!closed&&<Form method="post"><input type="hidden" name="issue_id" value={c.issue_id}/><input type="hidden" name="candidate_id" value={c.id}/>
        {c.status==="draft"&&c.created_by===d.userId&&<><Link className="op-button" to={`/cover-editor?issue=${c.issue_id}&candidate=${c.id}`}>EDIT DRAFT</Link><button className="op-button" name="intent" value="submit" disabled={busy}>SUBMIT CANDIDATE</button></>}
        {c.status==="submitted"&&<><button className="op-button" name="intent" value="vote" disabled={busy||d.votes.some(v=>v.voter_id===d.userId&&v.candidate_id===c.id)}>{d.votes.some(v=>v.voter_id===d.userId&&v.candidate_id===c.id)?"YOUR VOTE":"VOTE / CHANGE VOTE"}</button>{c.created_by===d.userId&&<button className="op-button" name="intent" value="withdraw" disabled={busy}>WITHDRAW</button>}
          {count(c.id)===max&&<fieldset><legend>Confirm official selection</legend><p>Selecting a cover makes it the official archive cover. This replaces the existing cover and closes voting. It becomes public when the issue is archived.</p><label><input type="checkbox" name="confirmed" value="yes"/> I confirm this official cover selection.</label><button className="op-button" name="intent" value="select" disabled={busy}>SELECT OFFICIAL COVER</button></fieldset>}</>}
      </Form>}
    </article>)}</div>
    {selected&&d.issue&&["current","finalising"].includes(d.issue.status)&&<Form method="post"><input type="hidden" name="issue_id" value={d.issue.id}/><button className="op-button" name="intent" value="archive" disabled={busy}>ARCHIVE ISSUE WITH OFFICIAL COVER</button></Form>}
    <Link to="/cover-editor">RETURN TO COVER EDITOR</Link>
  </section></main>;
}

export const headers: Route.HeadersFunction = ({loaderHeaders,actionHeaders,errorHeaders}) => {
  const headers=new Headers(loaderHeaders);
  for(const source of [actionHeaders,errorHeaders]) source?.forEach((value,key)=>headers.set(key,value));
  headers.set("Cache-Control","private, no-store");headers.set("Vary","Cookie");
  return headers;
};

export { CoverAccessError as ErrorBoundary } from "../components/CoverAccessError";
