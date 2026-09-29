// Real Workshop component with deterministic failure transport; RPC security runs in SQL tests.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const {chromium}=require('@playwright/test');
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {createMemoryRouter,RouterProvider} from 'react-router';
import {WorkshopClient} from './router-app/components/open-panel/WorkshopClient';
const router=createMemoryRouter([{path:'/',Component:()=> <WorkshopClient ownerId="00000000-0000-4000-8000-000000000001" featureId="00000000-0000-4000-8000-000000000002" featureSlug="fixture" defaultCredit="Anonymous Panelist" contributions={[]} activity={[]} readOnly={false}/>}]);
createRoot(document.getElementById('root')).render(<RouterProvider router={router}/>);
`},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const css=await readFile('router-app/app.css','utf8');
const browser=await chromium.launch();
try{
 const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const drafts=new Map();let offline=false,loseSubmit=false,contributions=0;
 await context.route('https://fixture.test/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(!url.pathname.startsWith('/member/workshop/'))return route.fulfill({contentType:'text/html',body:`<style>${css}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`});
  if(offline)return route.abort();
  const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(req.method()==='GET')return reply({draft:structuredClone(drafts.get(url.searchParams.get('id'))??[...drafts.values()].filter(d=>!d.submitted_contribution_id).at(-1)??null)});
  const input=req.postDataJSON();
  if(url.pathname.endsWith('/submit-draft')){
   const d=drafts.get(input.id);if(!d.submitted_contribution_id){contributions++;d.submitted_contribution_id='canonical-'+contributions;}
   if(loseSubmit){loseSubmit=false;return route.abort();}return reply({id:d.submitted_contribution_id});
  }
  const prev=drafts.get(input.id);
  if(prev&&JSON.stringify(prev.payload)!==JSON.stringify(input.payload)&&(prev.version!==input.expected_version||prev.submitted_contribution_id))return reply({error:'Newer or submitted draft exists. Keep your local copy or load the server version.'},409);
  const saved={...input,version:prev?(JSON.stringify(prev.payload)===JSON.stringify(input.payload)?prev.version:prev.version+1):1,submitted_contribution_id:prev?.submitted_contribution_id??null};drafts.set(input.id,saved);return reply({draft:saved});
 });
 await page.goto('https://fixture.test/');
 const title=page.getByRole('textbox',{name:'Title',exact:true}),body=page.locator('textarea[name=body]');
 await title.fill('Recover this proposal');await body.fill('Writing that survives an unexpected tab closure.');
 await page.getByRole('status').filter({hasText:/^SAVED$/}).waitFor();
 await page.reload();await assert.doesNotReject(()=>body.waitFor());await page.waitForFunction(()=>document.querySelector('textarea[name=body]')?.value==='Writing that survives an unexpected tab closure.');
 offline=true;await body.fill('Offline edits must survive refresh and later reconnect.');
 await page.getByRole('status').filter({hasText:/NOT SYNCED/}).waitFor();await page.reload();
 await page.waitForFunction(()=>document.querySelector('textarea[name=body]')?.value==='Offline edits must survive refresh and later reconnect.');
 offline=false;await body.fill('Reconnected writing remains private until editorial review.');
 await page.getByRole('status').filter({hasText:/^SAVED$/}).waitFor();
 // A different device wins the server version; this tab must retain its conflicting writing.
 const current=[...drafts.values()].at(-1);current.version++;current.payload={...current.payload,body:'Another device saved newer work.'};
 await body.fill('This tab retains its own newer writing without overwriting the other device.');
 await page.getByRole('button',{name:'KEEP LOCAL WRITING AS NEW DRAFT'}).waitFor();
 assert.equal(current.payload.body,'Another device saved newer work.');
 await page.getByRole('button',{name:'KEEP LOCAL WRITING AS NEW DRAFT'}).click();
 await page.getByRole('checkbox').check();
 loseSubmit=true;await page.getByRole('button',{name:'SUBMIT TO WORKSHOP',exact:true}).click();
 await page.getByRole('alert').waitFor();assert.equal(contributions,1);assert.match(await body.inputValue(),/This tab retains/);
 await page.getByRole('button',{name:'SUBMIT TO WORKSHOP',exact:true}).click();
 await page.getByText('Contribution submitted. It is waiting for editorial review.').waitFor();
 assert.equal(contributions,1);assert.equal(await body.inputValue(),'');
 // Deliberately clearing all writing must persist, rather than resurrecting an older copy.
 await title.fill('Clear me');await body.fill('Writing intentionally removed by its author.');await page.getByRole('status').filter({hasText:/^SAVED$/}).waitFor();
 await title.fill('');await body.fill('');await page.getByRole('status').filter({hasText:/^SAVED$/}).waitFor();await page.reload();
 await page.waitForFunction(()=>!document.querySelector('fieldset')?.disabled);assert.equal(await body.inputValue(),'');assert.equal(await title.inputValue(),'');
 for(const width of [390,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Workshop overflow at '+width);}
 assert.deepEqual(errors,[]);
 console.log('PASS: autosave, refresh, offline recovery, conflicting device, ambiguous submission retry, resolved draft and deliberate clearing; 390px/1440px. Fixture transport; SQL suite verifies authority.');
}finally{await browser.close();}
