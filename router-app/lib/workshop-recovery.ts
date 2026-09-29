export type DraftContent=Record<string,string|boolean>;
export type WorkshopDraft={id:string;feature_id:string;version:number;payload:DraftContent;revision_target:string|null;submitted_contribution_id:string|null};
export type LocalDraft={draft:WorkshopDraft;updated:number};
export const recoveryPrefix="koma:workshop:";
export function recoverableLocal(value:string|null,now=Date.now()):LocalDraft|null{
 try{const r=JSON.parse(value??"null");return r&&typeof r.updated==="number"&&now-r.updated<30*86400000&&r.draft&&typeof r.draft.id==="string"&&typeof r.draft.version==="number"&&r.draft.payload&&typeof r.draft.payload==="object"?r:null;}catch{return null;}
}
export function contentEqual(a:DraftContent,b:DraftContent){return JSON.stringify(Object.entries(a).sort())===JSON.stringify(Object.entries(b).sort());}
export function recoveryChoice(local:WorkshopDraft|null,remote:WorkshopDraft|null){
 if(!local)return remote?.submitted_contribution_id?"submitted":"remote";
 if(!remote)return local.version===0?"local":"conflict";
 if(contentEqual(local.payload,remote.payload))return remote.submitted_contribution_id?"submitted":"remote";
 if(remote.submitted_contribution_id||local.version!==remote.version)return "conflict";
 return "local";
}
export function clearPrivateRecovery(){
 try{for(const key of Object.keys(localStorage))if(key.startsWith(recoveryPrefix)||key.startsWith("koma:editorial:"))localStorage.removeItem(key);}catch{/* Unavailable browser storage must not prevent sign-out. */}
}
