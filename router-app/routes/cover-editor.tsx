import { data, Link } from "react-router";
import type { Route } from "./+types/cover-editor";
import { Masthead } from "../components/Masthead";
import { CoverEditorClient } from "../components/CoverEditorClient";
import { resolveAuth } from "../lib/auth";
import { membershipState } from "../lib/membership.server";
import { actionFailure } from "../lib/action-feedback";
import { coverErrors, type CoverDraft, type CoverLine } from "../lib/cover-editor";

const issueColumns="id,issue_number,slug,title,year,month,status,archived_at,cover_art,cover_art_alt,cover_art_credit,lead_feature_id,lead_headline,cover_theme,secondary_cover_lines,editor_note_teaser,featuring_line,cover_preset";

async function context(request:Request){
  const resolved=await resolveAuth(request);
  if(resolved.auth.state!=="authenticated"||!resolved.client||!resolved.user)return {resolved,state:"signed-out" as const};
  if(resolved.auth.member.accountStatus!=="active")return {resolved,state:"denied" as const};
  const handbook=await membershipState(resolved.client,resolved.user.id);
  if(handbook.status!=="accepted")return {resolved,state:"verifying" as const};
  return {resolved,state:["moderator","admin"].includes(resolved.auth.member.role)?"accepted" as const:"denied" as const};
}

export async function loader({request}:Route.LoaderArgs){
  const ctx=await context(request), {resolved}=ctx;
  if(ctx.state!=="accepted"||!resolved.client)return data({state:ctx.state,issues:[],panelsByIssue:{},initialId:""},{headers:resolved.headers});
  const [issuesResult,panelsResult]=await Promise.all([
    resolved.client.from("issues").select(issueColumns).order("year",{ascending:false}).order("month",{ascending:false}),
    resolved.client.from("features").select("id,issue_id,title,image,image_alt,lifecycle_status,status").eq("status","published").not("lifecycle_status","in",'(draft,taken_down)').order("strip_position"),
  ]);
  if(issuesResult.error||panelsResult.error)throw data("The Cover Editor could not be loaded. Please try again shortly.",{status:503,headers:resolved.headers});
  const issues=(issuesResult.data??[]).map((row:any)=>({...row,issue_id:row.id,issue_number:String(row.issue_number),year:String(row.year),month:String(row.month),lead_feature_id:row.lead_feature_id??"",secondary_cover_lines:Array.isArray(row.secondary_cover_lines)?row.secondary_cover_lines:[]}));
  const panelsByIssue:Record<string,unknown[]>={};for(const panel of panelsResult.data??[])(panelsByIssue[panel.issue_id]??=[]).push(panel);
  const requested=new URL(request.url).searchParams.get("issue");
  return data({state:"accepted" as const,issues,panelsByIssue,initialId:issues.some(row=>row.id===requested)?requested!:issues.find(row=>row.status!=="archived")?.id??issues[0]?.id??""},{headers:resolved.headers});
}

export async function action({request}:Route.ActionArgs){
  const ctx=await context(request),{resolved}=ctx;if(ctx.state!=="accepted"||!resolved.client)return data({error:"Moderator access is required."},{status:403,headers:resolved.headers});
  const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return data({error:"Same-origin request required."},{status:403,headers:resolved.headers});
  const form=await request.formData();let lines:CoverLine[]=[];try{lines=JSON.parse(String(form.get("secondary_cover_lines")??"[]"));}catch{return data({error:"Check the secondary cover lines.",field:"secondary_0"},{status:400,headers:resolved.headers});}
  const draft:CoverDraft={issue_id:String(form.get("issue_id")??""),issue_number:String(form.get("issue_number")??""),slug:String(form.get("slug")??""),title:String(form.get("title")??""),year:String(form.get("year")??""),month:String(form.get("month")??""),cover_art:String(form.get("cover_art")??""),cover_art_alt:String(form.get("cover_art_alt")??""),cover_art_credit:String(form.get("cover_art_credit")??""),lead_feature_id:String(form.get("lead_feature_id")??""),lead_headline:String(form.get("lead_headline")??""),cover_theme:String(form.get("cover_theme")??""),secondary_cover_lines:lines,editor_note_teaser:String(form.get("editor_note_teaser")??""),featuring_line:String(form.get("featuring_line")??""),cover_preset:String(form.get("cover_preset")??"minimal") as CoverDraft["cover_preset"]};
  const panels=await resolved.client.from("features").select("id").eq("issue_id",draft.issue_id).eq("status","published").not("lifecycle_status","in",'(draft,taken_down)');
  if(panels.error)return data({error:"Published panels could not be verified."},{status:503,headers:resolved.headers});
  const errors=coverErrors(draft,(panels.data??[]).map(row=>row.id));if(Object.keys(errors).length)return data({error:Object.values(errors)[0],field:Object.keys(errors)[0]},{status:400,headers:resolved.headers});
  try{
    const saved=await resolved.client.rpc("save_issue_cover",{payload:draft});if(saved.error)throw saved.error;
    if(form.get("intent")==="archive"){const closed=await resolved.client.rpc("close_current_issue");if(closed.error)throw closed.error;return data({success:"Cover saved. Issue archived and added to the public collection."},{headers:resolved.headers});}
    return data({success:"Cover saved."},{headers:resolved.headers});
  }catch(error){return data({error:actionFailure(error,"The cover could not be saved. Nothing was changed.")},{status:400,headers:resolved.headers});}
}

export const meta:Route.MetaFunction=()=>[{title:"Cover Editor — KOMA://PLAY"},{name:"robots",content:"noindex, nofollow"}];
export default function CoverEditor({loaderData}:Route.ComponentProps){
  if(loaderData.state!=="accepted")return <main className="editorial-page"><Masthead/><section className="op-workspace"><p className="editorial-marker">COVER EDITOR</p><h1>{loaderData.state==="signed-out"?"Sign in to continue.":"Cover Editor access is restricted."}</h1><p>Only active Moderators and Admins can package and archive issues.</p><Link to="/">RETURN TO PUBLICATION →</Link></section></main>;
  return <main className="editorial-page"><Masthead/><section className="op-workspace cover-editor"><p className="op-eyebrow editorial-marker">ISSUE PACKAGING</p><h1>Cover Editor</h1><p>Create a restrained magazine cover, validate its published panels, then archive through the existing issue-close workflow.</p>{loaderData.issues.length?<CoverEditorClient issues={loaderData.issues as any} panelsByIssue={loaderData.panelsByIssue as any} initialId={loaderData.initialId}/>:<p className="op-notice">No issues are available.</p>}</section></main>;
}
