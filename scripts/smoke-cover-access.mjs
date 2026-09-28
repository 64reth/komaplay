import assert from "node:assert/strict";
const origin=process.env.COVER_SMOKE_ORIGIN??"http://127.0.0.1:4179";
for(const path of ["/cover-editor","/cover-editor/pool","/cover-editor/pool.data","/member/cover-pool/image?path=cover-pool/test"]){
  const response=await fetch(new URL(path,origin));
  assert.equal(response.status,401,path);
  assert.match(response.headers.get("cache-control")??"",/private.*no-store/,path);
}
const upload=await fetch(new URL("/member/cover-pool/upload",origin),{method:"POST",headers:{Origin:origin}});
assert.equal(upload.status,401);
assert.match(upload.headers.get("cache-control")??"",/private.*no-store/);
console.log("PASS: anonymous cover documents, route data, private images and uploads are denied with private/no-store responses.");
