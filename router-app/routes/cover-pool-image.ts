import type { Route } from "./+types/cover-pool-image";
import { requireCoverCommittee } from "../lib/cover-pool.server";
export async function loader({request}:Route.LoaderArgs){
 const {client,headers}=await requireCoverCommittee(request);
 const path=new URL(request.url).searchParams.get("path")??"";
 if(!/^cover-pool\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(path))return new Response("Image unavailable.",{status:404,headers});
 const result=await client.storage.from("issue-cover-pool").download(path);
 if(result.error||!result.data)return new Response("Image unavailable.",{status:404,headers});
 headers.set("Content-Type",result.data.type);headers.set("X-Content-Type-Options","nosniff");
 return new Response(result.data,{headers});
}
