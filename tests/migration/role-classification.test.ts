import assert from "node:assert/strict";
import test from "node:test";
import { accessFor, editorialContributor, keyRingAccess, legacyEditorialReviewer, rolePresentation } from "../../router-app/lib/role-classification";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import AdminDashboard from "../../router-app/routes/admin";
Object.assign(globalThis,{React});

test("visible classifications describe the permissions the database actually grants", () => {
  assert.deepEqual(accessFor("member"), {workshop:true,editorial:false,canonicalReview:false,canonicalPublish:false,openPanelModeration:false,admin:false});
  assert.deepEqual(accessFor("contributor"), accessFor("member"));
  assert.equal(accessFor("member", true).editorial, true);
  assert.equal(accessFor("member", true).canonicalReview, false);
  assert.equal(accessFor("moderator").canonicalReview, true);
  assert.equal(accessFor("moderator").canonicalPublish, true);
  assert.equal(accessFor("moderator").admin, false);
  assert.equal(accessFor("admin").admin, true);
  assert.equal(accessFor("admin").openPanelModeration, true);
  assert.equal(accessFor("admin").editorial, true);
});

test("legacy editorial administrator is not presented as site admin", () => {
  const legacy=accessFor("member",false,true);
  assert.equal(legacy.canonicalReview,true);assert.equal(legacy.canonicalPublish,true);
  assert.equal(legacy.openPanelModeration,false);assert.equal(legacy.admin,false);
  assert.match(legacyEditorialReviewer.description,/not Admin access/i);
});

test("key-ring counts derive only from existing server role and grant fields",()=>{
  assert.equal(keyRingAccess("member").badge,"member");
  assert.equal(keyRingAccess("contributor").badge,"member");
  assert.equal(keyRingAccess("member",true).badge,"editorial-contributor");
  assert.equal(keyRingAccess("moderator").badge,"moderator");
  assert.equal(keyRingAccess("admin").badge,"admin");
  assert.equal(keyRingAccess("member",false,true).badge,"moderator");
  assert.match(keyRingAccess("member",false,true).tooltip,/Legacy editorial access/);
});

test("key-ring SVG assets are small accessible monochrome vectors",async()=>{
  for(const name of ["member","editorial-contributor","moderator","admin"]){
    const svg=await readFile(`public/assets/badges/key-ring-${name}.svg`,"utf8");
    assert.match(svg,/<title id="title">/);assert.match(svg,/<desc id="desc">/);
    assert.match(svg,/stroke="currentColor"/);assert.doesNotMatch(svg,/<filter|<linearGradient|data:image/);
    assert.ok(svg.length<3000);
  }
});

test("admin copy uses honest tiers and does not invent Publisher or Owner options",async()=>{
  const route=await readFile("router-app/routes/admin.tsx","utf8");
  assert.match(route,/Editorial Contributor/);assert.match(route,/>Moderator</);assert.match(route,/>Admin</);
  assert.doesNotMatch(route,/<option value="moderator">Moderator \/ reviewer \/ publisher/);
  assert.doesNotMatch(route,/<option value="admin">Admin \/ owner/);
  assert.match(rolePresentation.moderator.description,/publish approved panels/i);
  assert.match(rolePresentation.admin.description,/manage users/i);
  assert.match(editorialContributor.description,/create and submit canonical panels/i);
});

test("rendered admin controls explain each visible classification",()=>{
  const router=createMemoryRouter([{path:"/admin",element:React.createElement(AdminDashboard),loader:()=>null}],{
    initialEntries:["/admin"],hydrationData:{loaderData:{"0":{state:"accepted",members:[{user_id:"00000000-0000-4000-8000-000000000001",email:"member@example.com",display_name:"Member",role:"member",account_status:"active",joined_at:"2026-09-23T00:00:00Z",editorial_access:false,legacy_review_grant:false,total_count:1}],total:1,page:1,params:{search_term:"",role_filter:"all",status_filter:"all",sort_order:"newest"}}}}
  });
  const html=renderToStaticMarkup(React.createElement(RouterProvider,{router}));
  assert.match(html,/Can join KOMA and submit Open Panel contributions/);
  assert.match(html,/Can access the Editorial Dashboard and create and submit canonical panels/);
  assert.match(html,/Cannot approve their own work/);
  assert.match(html,/<option value="moderator">Moderator<\/option>/);
  assert.match(html,/<option value="admin">Admin<\/option>/);
  assert.match(html,/key-ring-member\.svg/);assert.match(html,/key-ring-editorial-contributor\.svg/);
  assert.match(html,/key-ring-moderator\.svg/);assert.match(html,/key-ring-admin\.svg/);
});
