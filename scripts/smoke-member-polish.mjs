import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const require = createRequire(import.meta.url),
  { build } = createRequire(require.resolve("wrangler/package.json"))(
    "esbuild",
  ),
  { chromium } = require("@playwright/test");
const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
import React from 'react';import {createRoot} from 'react-dom/client';import {createMemoryRouter,RouterProvider,Outlet} from 'react-router';import Profile from './router-app/routes/profile';import Inbox from './router-app/routes/inbox';import Correction from './router-app/routes/report';import {WorkshopClient} from './router-app/components/open-panel/WorkshopClient';
const contribution={id:'00000000-0000-4000-8000-000000000003',edit_version:2,feature_id:'00000000-0000-4000-8000-000000000002',title:'Original typoo',body:'My original pending submission, with enough detail.',type:'Tip',target_section:'Contribution',source_url:'',media_url:'',screenshot_path:'',public_credit:'Anonymous Panelist',publication_consent:true,status:'Submitted',created_at:'2026-10-01',updated_at:'2026-10-01',incorporated_at:null};
const event={id:'event',feature_id:contribution.feature_id,kind:'response',message:'Please clarify this point before independent review.',read_at:null,created_at:'2026-10-01'};
const profile={state:'accepted',profile:{display_name:'A member with a longer display name',created_at:'2026-09-01',bio:''},capabilities:{editorial:false,moderation:false},publication:[],drafts:[],saved:[],inbox:[event],features:[],issues:[],authored:[],citations:0,citationHistory:[],editorialWork:[],nextPanels:[],contributions:[{...contribution,feature:null}]};
const inbox={events:[event],features:[],unread:1,filter:'all'};
const router=createMemoryRouter([{id:'root',Component:Outlet,children:[{path:'/',element:<Profile/>,loader:()=>profile},{path:'/profile/inbox',element:<Inbox loaderData={inbox}/>,loader:()=>inbox,action:()=>({})},{path:'/report',element:<Correction loaderData={{feature:{slug:'fixture'},state:'accepted',kind:'Factual error'}}/>},{path:'/workshop',element:<div className="op-workspace workshop-page"><WorkshopClient ownerId="00000000-0000-4000-8000-000000000001" featureId={contribution.feature_id} featureSlug="fixture" defaultCredit="Anonymous Panelist" contributions={[contribution]} activity={[]} readOnly={true}/></div>}]}],{initialEntries:[location.pathname],hydrationData:{loaderData:{root:{auth:{state:'signed-out'},membership:{status:'public'}},'0-0':profile,'0-1':inbox}}});createRoot(document.getElementById('root')).render(<RouterProvider router={router}/>);`,
  },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
const css = await readFile("router-app/app.css", "utf8");
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  let saved = null,
    submissions = 0;
  const errors = [];
  await context.route("https://polish.test/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.pathname.startsWith("/member/workshop/")) {
      if (req.method() === "GET") {
        await new Promise(resolve => setTimeout(resolve, 1200));
        return route.fulfill({ json: { draft: null } });
      }
      const input = req.postDataJSON();
      if (url.pathname.endsWith("submit-draft")) {
        submissions++;
        return route.fulfill({ json: { id: "canonical" } });
      }
      assert.equal(
        input.revision_target,
        "00000000-0000-4000-8000-000000000003",
      );
      assert.equal(input.payload.expected_edit_version, "2");
      saved = { ...input, version: (saved?.version ?? 0) + 1 };
      return route.fulfill({ json: { draft: saved } });
    }
    return route.fulfill({
      contentType: "text/html",
      body:
        "<style>" +
        css +
        '</style><div id="root"></div><script>' +
        bundle.outputFiles[0].text +
        "</script>",
    });
  });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  for (const width of [390, 1440]) {
    await p.setViewportSize({ width, height: 1000 });
    await p.goto("https://polish.test/");
    await p
      .getByRole("link", { name: "VIEW MY INBOX", exact: false })
      .waitFor();
    assert.equal(await p.getByRole("button", { name: "MARK READ" }).count(), 0);
    await p.getByText("Original typoo", { exact: true }).first().waitFor();
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.ok(await p.locator(".member-hub h1").evaluate(e => parseFloat(getComputedStyle(e).fontSize) <= 56), "member heading remains proportionate");
    if (width === 1440) assert.ok(await p.locator(".panel-directory-window").evaluate(e => e.scrollWidth <= e.clientWidth), "desktop contribution actions are visible");
    await p.goto("https://polish.test/report");
    assert.equal(await p.locator("select[name=kind]").inputValue(), "Factual error");
    await p.getByRole("button", {name:"SUBMIT PRIVATE REPORT",exact:true}).waitFor();
    await p.goto("https://polish.test/profile/inbox");
    await p.getByRole("heading", { name: "My Inbox", exact: true }).waitFor();
    await p.getByRole("button", { name: "MARK READ" }).waitFor();
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.goto("https://polish.test/workshop");
    const edit = p.getByRole("button", { name: "EDIT SUBMISSION" });
    await edit.waitFor();
    assert.equal(await edit.isDisabled(), true, "wait for recovery before editing");
    await edit.click();
    const title = p.getByRole("textbox", { name: "Title", exact: true });
    await title.fill("Corrected title");
    await p
      .getByRole("status")
      .filter({ hasText: /^SAVED$/ })
      .waitFor();
    assert.equal(saved.payload.title, "Corrected title");
    await p
      .getByRole("button", { name: "RESUBMIT TO WORKSHOP", exact: true })
      .click();
    await p
      .getByText("Contribution submitted. It is waiting for editorial review.")
      .waitFor();
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  assert.equal(submissions, 2);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Profile retained writing/compact Inbox, dedicated My Inbox, closed-panel pending correction form/version payload and 390/1440 layouts. Fixture transport; SQL checks authority and concurrency.",
  );
} finally {
  await browser.close();
}
