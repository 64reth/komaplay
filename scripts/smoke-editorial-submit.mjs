import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('wrangler/package.json'))('esbuild');
const { chromium } = require('@playwright/test');
// Actual editor UI and shared rules. Actual server action/SQL persistence is tested separately.
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {createMemoryRouter,RouterProvider,Outlet,data} from 'react-router';
import Editorial from './router-app/routes/editorial';
import {draftDocument,parseComposerSections,serializeComposerSections,composerFromWorkItem} from './router-app/lib/editorial-alpha';
import {validateEditorialSubmission,submissionCopy} from './router-app/lib/editorial-validation';
const id='00000000-0000-4000-8000-000000000001';
const sections=[{id:'h',type:'heading',text:''},{id:'p',type:'paragraph',text:'Paragraph'},
{id:'q',type:'quote',text:''},{id:'b',type:'bullet-list',text:''},
{id:'i',type:'image',url:'not-an-image',alt:''},{id:'n',type:'numbered-list',text:'First'},
{id:'v',type:'video',url:'https://example.com/video'},{id:'d',type:'divider'}];
let panel={title:'',slug:'submission-fixture',summary:'A local browser fixture.',sectionsJson:serializeComposerSections(sections)};
let work={feature_id:id,title:'Untitled draft',slug:panel.slug,summary:panel.summary,lifecycle_status:'draft',updated_at:'2026-09-15',working_document:{...draftDocument(panel),composer:panel}};
window.submissionTrace=[];
const router=createMemoryRouter([{id:'root',path:'/',loader:()=>({auth:{state:'signed-out',member:null},supabase:null}),Component:Outlet,children:[{path:'editorial',Component:Editorial,loader:()=>({state:'accepted',capabilities:{editorial:true,moderation:false},categories:[],drafts:[work],review:work.lifecycle_status==='submitted'?[work]:[]}),action:async({request})=>{
 const f=await request.formData(); const intent=f.get('intent');
 panel=intent==='submit-existing'?composerFromWorkItem(work):Object.fromEntries(f);
 const sections=parseComposerSections(panel.sectionsJson);
 const issues=validateEditorialSubmission(panel,sections);
 window.submissionTrace.push({intent,id:f.get('featureId'),order:sections.map(s=>s.id),title:panel.title});
 work={...work,title:panel.title||'Untitled draft',lifecycle_status:intent!=='save'&&!issues.length?'submitted':'draft',working_document:{...draftDocument(panel),composer:panel}};
 if(intent!=='save'&&issues.length)return data({error:submissionCopy.blocked,issues,featureId:id,status:'draft'},{status:400});
 return {success:intent!=='save'?submissionCopy.submitted:submissionCopy.saved,featureId:id,status:work.lifecycle_status};
}}]}],{initialEntries:['/editorial?feature='+id]});
createRoot(document.getElementById('root')).render(<RouterProvider router={router}/>);
` }, bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'} });
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:process.argv.includes('--mobile')?{width:390,height:844}:{width:1280,height:800}});
 await page.setContent('<div id="root"></div>');
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const summary=page.getByLabel('Submission requirements');
 await summary.waitFor();
 assert.match(await summary.innerText(),/7 things need attention/);
 await page.getByRole('button',{name:'SAVE DRAFT',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Draft saved'}).waitFor();
 assert.equal(await page.locator('input[name="title"]').inputValue(),'');
 await page.getByRole('button',{name:'SUBMIT FOR REVIEW',exact:true}).last().click();
 await page.getByRole('alert').waitFor();
 assert.equal(await page.evaluate(()=>document.activeElement?.id),'panel-title');
 assert.equal(await page.getByRole('alert').locator('li').count(),7);
 assert.match(await page.getByRole('alert').innerText(),/Your draft is safely saved, but it hasn’t been submitted yet/);
 await page.locator('#panel-title').fill('Completed panel');
 await page.getByLabel('Move section 5 up').click();
 assert.match(await summary.innerText(),/Image 4 needs a short description/);
 assert.equal(await page.locator('#section-i-alt').getAttribute('aria-describedby'),'section-i-alt-error');
 await page.getByLabel('Remove section 3').click();
 assert.match(await summary.innerText(),/Image 3 needs a short description/);
 assert.doesNotMatch(await summary.innerText(),/Quote 3/);
 await summary.getByText(/Image 3 needs a short description/).click();
 assert.equal(await page.evaluate(()=>document.activeElement?.id),'section-i-alt');
 await page.getByRole('button',{name:'SUBMIT FOR REVIEW',exact:true}).first().click();
 await page.waitForFunction(()=>document.activeElement?.id==='section-h-text');
 await page.locator('#section-h-text').fill('Opening heading');
 await page.locator('#section-b-text').fill('One\nTwo');
 await page.locator('#section-i-url').fill('/image.png');
 await page.locator('#section-i-alt').fill('A useful image description');
 await page.locator('#section-v-url').fill('https://youtu.be/dQw4w9WgXcQ');
 await page.getByLabel('ADD SECTION').selectOption('quote');
 await page.getByLabel('Quote text',{exact:true}).fill('Quoted words; attribution remains optional.');
 assert.equal(await summary.count(),0);
 const ids=await page.locator('fieldset.composer-module').evaluateAll(elements=>elements.map(element=>element.id));
 await page.getByRole('button',{name:'SUBMIT FOR REVIEW',exact:true}).first().click();
 await page.getByRole('status').filter({hasText:'Everything looks ready. Your panel has been submitted for review.'}).waitFor();
 assert.equal(await page.locator('.panel-status').first().innerText(),'Submitted');
 const trace=await page.evaluate(()=>window.submissionTrace);
 assert.ok(trace.every(entry=>entry.id===trace[0].id));
 assert.deepEqual(trace.at(-1).order.map(id=>'section-'+id+'-section'),ids);
 assert.equal(trace.at(-1).order.length,8);
 console.log('PASS: permissive blank draft, seven actionable errors, stable reorder/delete targets, first-field focus, correction and all eight sections submitted under one ID.');
} finally {await browser.close();}
