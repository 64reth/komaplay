import {data} from "react-router";
import {resolveAuth} from "./auth";
import {membershipState} from "./membership.server";
export async function privateMember(request:Request){
 const r=await resolveAuth(request);r.headers.set("Cache-Control","private, no-store");
 if(r.auth.state!=="authenticated"||!r.client||!r.user)throw data("Sign in required",{status:401,headers:r.headers});
 if(r.auth.member.accountStatus!=="active"||(await membershipState(r.client,r.user.id)).status!=="accepted")throw data("Active membership and current Pocket Guide acceptance required",{status:403,headers:r.headers});
 return {...r,client:r.client,user:r.user};
}
