import {useEffect,useState} from "react";
import {useRouteLoaderData} from "react-router";
import {launchAuthentication} from "./AccountNav";
export function SaveFeature({feature}:{feature:string}){
 const root=useRouteLoaderData("root") as {auth?:{state:string;member?:{id:string}}}|undefined;
 const signedIn=root?.auth?.state==="authenticated";
 const [saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState("");
 useEffect(()=>{let live=true;setReady(false);setSaved(false);if(signedIn)fetch(`/member/saves?feature=${feature}`,{cache:"no-store"}).then(async r=>{if(!r.ok)throw Error("Saved state unavailable. Reload to retry.");return r.json() as Promise<{saved:boolean}>;}).then(d=>{if(live){setSaved(d.saved);setReady(true);}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[feature,signedIn,root?.auth?.member?.id]);
 async function toggle(){if(!signedIn){launchAuthentication("sign-in",location.pathname);return;}setBusy(true);setError("");try{const r=await fetch("/member/saves",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({feature,save:!saved})});if(!r.ok)throw Error("Could not update Saved. Please retry.");const d=await r.json() as {saved:boolean};setSaved(d.saved);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <span><button className="op-button" type="button" aria-pressed={saved} disabled={busy||(signedIn&&!ready)} onClick={()=>void toggle()}>{busy?"SAVING…":saved?"UNSAVE":"SAVE"}</button>{error&&<small role="alert">{error}</small>}</span>;
}
