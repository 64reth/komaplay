import assert from "node:assert/strict";
import { createRequire } from "node:module";
import process from "node:process";
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("wrangler/package.json"))("esbuild");
const { chromium } = require("@playwright/test");

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(), loader: "tsx", contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {createMemoryRouter,Outlet,RouterProvider} from "react-router";
      import Moderation from "./router-app/routes/moderation";
      const rootData={auth:{state:"authenticated",member:{displayName:"Reviewer",accountStatus:"active"}},membership:{status:"accepted"},capabilities:{editorial:true,moderation:true}};
      const router=createMemoryRouter([{id:"root",path:"/",element:<Outlet/>,children:[{id:"moderation",path:"moderation",element:<Moderation/>,action:async()=>({success:"Feature published."})}]}],{initialEntries:["/moderation?review=canonical-own"],hydrationData:{loaderData:{root:rootData,moderation:window.fixture}}});
      createRoot(document.getElementById("root")).render(<RouterProvider router={router}/>);
    `,
  },
  bundle: true, write: false, format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
});

const doc={schemaVersion:1,header:{eyebrow:"COMMUNITY EDITION",title:"Own canonical submission",panelHeadline:"Own canonical submission",standfirst:"Fixture",byline:"KOMA://PLAY Editorial",hero:{id:"fixture",src:"/assets/koma-feature-placeholder.svg",alt:"Fixture"},heroCaption:"Fixture"},modules:[{id:"p",type:"paragraph",version:1,content:{text:"Fixture body"}}]};
const fixture={state:"accepted",capabilities:{editorial:true,moderation:true},grants:[],closePreview:null,
  contributions:[
    {contribution_id:"own",feature_title:"Panel",contribution_type:"Tip",title:"Own proposal",body:"Private fixture proposal",status:"Submitted",author_display_name:"Current reviewer",can_review:false,moderator_note:null},
    {contribution_id:"other",feature_title:"Panel",contribution_type:"Source",title:"Independent proposal",body:"Different contributor fixture",status:"Submitted",author_display_name:"Other contributor",can_review:true,moderator_note:null},
  ],incorporations:[],review:[{feature_id:"canonical-own",title:"Own canonical submission",slug:"own-canonical",summary:"Fixture",lifecycle_status:"submitted",updated_at:new Date().toISOString(),working_document:doc,author_display_name:"Current reviewer",can_review:false}],
  publication:[{feature_id:"publishable",title:"Publishable fixture",slug:"publishable-fixture",summary:"Fixture",lifecycle_status:"publish_ready",updated_at:new Date().toISOString(),working_document:doc,author_display_name:"Other editor",published_at:null}]};

const browser=await chromium.launch();
try{
  const page=await browser.newPage();page.setDefaultTimeout(15000);
  await page.route("https://fixture.test/**",route=>route.fulfill({contentType:"text/html",body:'<div id="root"></div>'}));
  await page.goto("https://fixture.test/moderation?review=canonical-own");
  await page.evaluate(value=>{globalThis.fixture=value},fixture);
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.waitForTimeout(500);
  const own=page.locator("article",{hasText:"Own proposal"});
  await own.getByText("Independent review required.",{exact:false}).waitFor();
  assert.equal(await own.getByRole("button",{name:"ACCEPT",exact:true}).count(),0);
  const other=page.locator("article",{hasText:"Independent proposal"});
  assert.equal(await other.getByRole("button",{name:"ACCEPT",exact:true}).count(),1);
  assert.equal(await other.getByRole("button",{name:"REQUEST CHANGES",exact:true}).count(),1);
  assert.equal(await other.getByRole("button",{name:"DECLINE",exact:true}).count(),1);
  await page.getByLabel("Reviewer decision controls").getByText("Independent review required.",{exact:false}).waitFor();
  assert.equal(await page.getByRole("button",{name:"APPROVE AS PUBLISH-READY"}).count(),0);

  const publish=page.getByRole("button",{name:"PUBLISH FEATURE"});
  await publish.click();await page.getByRole("dialog").waitFor();
  await page.getByRole("button",{name:"CANCEL"}).click();assert.equal(await page.getByRole("dialog").count(),0);
  await publish.click();await page.getByRole("button",{name:"CONFIRM PUBLISH"}).click();
  await page.getByRole("dialog").waitFor({state:"detached"});
  process.stdout.write("PASS: actual moderation UI hides own Open Panel/canonical approval, exposes independent reviewer actions, and preserves confirmation cancel/success lifecycle.\n");
}finally{await browser.close();}
