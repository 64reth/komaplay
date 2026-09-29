import {data} from "react-router";
import {z} from "zod";
import type {Route} from "./+types/saves";
import {privateMember} from "../lib/private-member.server";
export async function loader({request}:Route.LoaderArgs){
 const {client,user,headers}=await privateMember(request);
 const target=z.string().uuid().safeParse(new URL(request.url).searchParams.get("feature"));
 if(!target.success)return data({error:"Invalid panel"},{status:400,headers});
 const result=await client.from("saved_features").select("feature_id").eq("user_id",user.id).eq("feature_id",target.data).maybeSingle();
 return data(result.error?{error:"Saved state unavailable"}:{saved:!!result.data},{status:result.error?503:200,headers});
}
export async function action({request}:Route.ActionArgs){
 const {client,headers}=await privateMember(request);
 if(request.headers.get("origin")!==new URL(request.url).origin)return data({error:"Same-origin request required"},{status:403,headers});
 const input=z.object({feature:z.string().uuid(),save:z.boolean()}).safeParse(await request.json());
 if(!input.success)return data({error:"Invalid request"},{status:400,headers});
 const r=await client.rpc("set_feature_saved",{target:input.data.feature,save:input.data.save});
 return data(r.error?{error:"Could not update Saved. Please retry."}:{saved:r.data},{status:r.error?409:200,headers});
}
