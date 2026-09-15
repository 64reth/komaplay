import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('wrangler/package.json'))('esbuild');
const { chromium } = require('@playwright/test');

// Real route UI; HTTP/persistence is covered by editorial-timestamp.test.ts.
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {createMemoryRouter,RouterProvider,Outlet} from 'react-router';
import Editorial from './router-app/routes/editorial';
import {draftDocument,parseComposerSections,serializeComposerSections,validateComposerSections} from './router-app/lib/editorial-alpha';
const id='00000000-0000-4000-8000-000000000001';
const sections=[{id:'h',type:'heading',text:'Opening'},{id:'p',type:'paragraph',text:'Paragraph'},
{id:'q',type:'quote',text:'Quote'},{id:'b',type:'bullet-list',text:'One\\nTwo'},
{id:'i',type:'image',url:'/image.png',alt:''},{id:'n',type:'numbered-list',text:'First'},
{id:'v',type:'video',url:'https://youtu.be/dQw4w9WgXcQ'},{id:'d',type:'divider'}];
let work={feature_id:id,title:'Submission fixture',slug:'submission-fixture',summary:'A local browser fixture.',lifecycle_status:'draft',updated_at:'2026-09-15',working_document:draftDocument({title:'Submission fixture',summary:'A local browser fixture.',sectionsJson:serializeComposerSections(sections)})};
window.submissionTrace=[];
const router=createMemoryRouter([{id:'root',path:'/',loader:()=>({auth:{state:'signed-out',member:null},supabase:null}),Component:Outlet,children:[{path:'editorial',Component:Editorial,loader:()=>({state:'accepted',capabilities:{editorial:true,moderation:false},categories:[],drafts:[work],review:work.lifecycle_status==='submitted'?[work]:[]}),action:async({request})=>{
 const f=await request.formData(); const intent=f.get('intent');
 const sections=f.has('sectionsJson')?parseComposerSections(f.get('sectionsJson')):[];
 const issues=intent==='submit-existing'?['Image section 5 needs alt text.']:validateComposerSections(sections,intent==='submit');
 window.submissionTrace.push({intent,id:f.get('featureId'),order:sections.map(s=>s.id)});
 if(issues.length)return {error:issues.join(' ')};
 work={...work,lifecycle_status:intent==='submit'?'submitted':'draft',working_document:draftDocument({title:work.title,summary:work.summary,sectionsJson:serializeComposerSections(sections)})};
 return {success:intent==='submit'?'Submitted for review.':'Draft saved.',featureId:id,status:work.lifecycle_status};
}}]}],{initialEntries:['/editorial?feature='+id]});
createRoot(document.getElementById('root')).render(<RouterProvider router={router}/>);
` }, bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' } });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByLabel('Submission requirements').waitFor();
  assert.match(await page.getByLabel('Submission requirements').innerText(), /Image section 5 needs alt text/);
  await page.getByRole('button', { name: 'SUBMIT FOR REVIEW', exact: true }).last().click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'alert');
  assert.match(await page.getByRole('alert').innerText(), /Image section 5 needs alt text/);
  await page.getByLabel('Alt text (required)', { exact: true }).fill('Descriptive image alt');
  assert.equal(await page.getByLabel('Submission requirements').count(), 0);
  await page.getByRole('button', { name: 'SUBMIT FOR REVIEW', exact: true }).first().click();
  await page.getByRole('status').filter({ hasText: 'Submitted for review.' }).waitFor();
  const trace = await page.evaluate(() => window.submissionTrace);
  assert.equal(trace[0].intent, 'submit-existing');
  assert.equal(trace[1].intent, 'submit');
  assert.equal(trace[0].id, trace[1].id);
  assert.deepEqual(trace[1].order, ['h','p','q','b','i','n','v','d']);
  console.log('PASS: saved-row error focuses visible feedback; correction submits all eight ordered sections with the same featureId.');
} finally { await browser.close(); }
