import {useEffect,useRef,useState} from "react";
import {contentEqual,recoveryChoice,recoverableLocal,recoveryPrefix,type WorkshopDraft,type DraftContent} from "../../lib/workshop-recovery";
async function api(action:string,body?:unknown){
 const r=await fetch(`/member/workshop/${action}`,body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{cache:"no-store"});
 const d=await r.json() as {error?:string;draft:WorkshopDraft|null;id?:string;duplicate?:boolean};if(!r.ok)throw new Error(d.error||"Draft service unavailable. Your writing is retained locally.");return d;
}
export function useWorkshopRecovery(owner:string,feature:string,apply:(content:DraftContent,target:string|null)=>void){
 const [state,setState]=useState("LOADING DRAFT…"),[ready,setReady]=useState(false),[conflict,setConflict]=useState(false);
 const draft=useRef<WorkshopDraft|null>(null),remote=useRef<WorkshopDraft|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),chain=useRef<Promise<unknown>>(Promise.resolve()),blocked=useRef(false),localKey=useRef("");
 const applyRef=useRef(apply);applyRef.current=apply;
 function persist(){if(!draft.current)return false;try{localStorage.setItem(localKey.current,JSON.stringify({draft:draft.current,updated:Date.now()}));return true;}catch{setState("LOCAL SAVE UNAVAILABLE — keep this tab open until saved to your account.");return false;}}
 const fresh=()=>({id:crypto.randomUUID(),feature_id:feature,version:0,payload:{},revision_target:null,submitted_contribution_id:null} as WorkshopDraft);
 useEffect(()=>{
  let live=true;
  const prefix=`${recoveryPrefix}${owner}:${feature}:`;
  let local:WorkshopDraft|null=null;
  try{const records=Object.keys(localStorage).filter(k=>k.startsWith(prefix)).map(k=>({key:k,record:recoverableLocal(localStorage.getItem(k))})).filter(x=>x.record).sort((a,b)=>b.record!.updated-a.record!.updated);local=records[0]?.record?.draft??null;}catch{/* Server drafts can still load. */}
  const requested=new URL(location.href).searchParams.get("draft");
  if(requested&&local?.id!==requested)local=null;
  localKey.current=prefix+crypto.randomUUID(); // Independent local copies prevent tab overwrite.
  draft.current=local??fresh();
  if(local)applyRef.current(local.payload,local.revision_target);
  api(`draft?feature=${feature}${requested||local?.id?`&id=${requested||local!.id}`:""}`).then(result=>{
   if(!live)return;remote.current=result.draft;
   const choice=recoveryChoice(local,result.draft);
   if(choice==="conflict"){blocked.current=true;setConflict(true);setState("NEWER OR SUBMITTED VERSION EXISTS — your local writing is retained.");}
   else if(choice==="submitted"){draft.current=fresh();applyRef.current({},null);setState("SUBMITTED");}
   else{draft.current=(choice==="local"?local:result.draft)??fresh();applyRef.current(draft.current!.payload,draft.current!.revision_target);setState(local||result.draft?"RECOVERED":"DRAFT");}
   setReady(true);
  }).catch(()=>{if(live){setState("OFFLINE — local recovery available; retry saving when connected.");setReady(true);}});
  return()=>{live=false;if(timer.current)clearTimeout(timer.current);};
 },[owner,feature]);
 function save(){
  if(timer.current)clearTimeout(timer.current);
  const operation=chain.current.catch(()=>{}).then(async()=>{
   if(blocked.current)throw new Error("A newer version exists. Resolve the draft conflict first.");
   const current=draft.current;if(!current)return;
   const snapshot={...current,payload:{...current.payload}};
   setState("SAVING…");
   try{const result=await api("draft",{...snapshot,expected_version:snapshot.version});
    if(draft.current?.id===snapshot.id){draft.current.version=result.draft!.version;persist();}setState("SAVED");return result.draft as WorkshopDraft;
   }catch(e){const message=e instanceof Error?e.message:"Save failed";if(/newer|version|submitted/i.test(message)){blocked.current=true;setConflict(true);}setState(`NOT SYNCED — ${message}`);throw e;}
  });chain.current=operation;return operation;
 }
 function change(payload:DraftContent,target:string|null){
  if(!ready||!draft.current)return;
  draft.current={...draft.current,payload,revision_target:target};if(persist())setState(blocked.current?"CONFLICT — LOCAL COPY RETAINED":"SAVED LOCALLY");
  if(timer.current)clearTimeout(timer.current);
  if(!blocked.current)timer.current=setTimeout(()=>{void save().catch(()=>{});},700);
 }
 async function submit(){
  const saved=await save();if(!saved)throw new Error("Draft unavailable");
  const result=await api("submit-draft",{id:saved.id,version:saved.version});
  // Keep other tab copies: the server's submitted marker prevents stale resubmission.
  try{const prefix=`${recoveryPrefix}${owner}:${feature}:`;for(const k of Object.keys(localStorage)){if(k.startsWith(prefix)){const r=recoverableLocal(localStorage.getItem(k));if(r?.draft.id===saved.id&&contentEqual(r.draft.payload,saved.payload))localStorage.removeItem(k);}}}catch{/* Server receipt still protects retry. */}
  draft.current=fresh();setState("SUBMITTED");return result;
 }
 async function startRevision(){if(timer.current)clearTimeout(timer.current);if(draft.current&&Object.keys(draft.current.payload).length)await save();draft.current=fresh();localKey.current=`${recoveryPrefix}${owner}:${feature}:${crypto.randomUUID()}`;blocked.current=false;setConflict(false);}
 function keepAsNew(){if(!draft.current)return;draft.current={...fresh(),payload:draft.current.payload,revision_target:draft.current.revision_target};blocked.current=false;setConflict(false);persist();setState("LOCAL COPY KEPT AS NEW DRAFT");}
 async function loadServer(){const r=await api(`draft?feature=${feature}&id=${draft.current!.id}`);remote.current=r.draft;draft.current=r.draft?.submitted_contribution_id?fresh():r.draft??fresh();blocked.current=false;setConflict(false);applyRef.current(draft.current!.payload,draft.current!.revision_target);persist();setState(r.draft?.submitted_contribution_id?"SUBMITTED":"RECOVERED SERVER VERSION");}
 return {hasWriting:()=>!!(draft.current?.payload.title||draft.current?.payload.body||draft.current?.payload.screenshot_path),state,ready,conflict,change,submit,startRevision,keepAsNew,loadServer,save};
}
