// Browser fixture verifies real components; SQL tests exercise the actual security boundary.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const {chromium}=require('@playwright/test');
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {createMemoryRouter,RouterProvider,useLoaderData,Outlet} from 'react-router';
import CoverPool from './router-app/routes/cover-pool';
import {CoverEditorClient} from './router-app/components/CoverEditorClient';
const payload={issue_id:'issue',issue_number:'1',title:'Fixture issue',slug:'fixture-issue',year:'2026',month:'9',cover_art:'',cover_art_alt:'Artwork',cover_art_credit:'',lead_feature_id:'panel',lead_headline:'A private cover',cover_theme:'Play',secondary_cover_lines:[],editor_note_teaser:'',featuring_line:'',cover_preset:'minimal'};
const state={issues:[{id:'issue',title:'Fixture issue',status:'current'}],issue:{id:'issue',title:'Fixture issue',status:'current'},candidates:[{id:'one',issue_id:'issue',created_by:'editor',status:'draft',payload},{id:'two',issue_id:'issue',created_by:'editor',status:'draft',payload:{...payload,lead_headline:'Second cover'}}],votes:[],userId:'editor'};
function Pool(){return <CoverPool loaderData={useLoaderData()}/>}
const router=createMemoryRouter([{id:'root',path:'/',Component:Outlet,loader:()=>({auth:{state:'signed-out',member:null},supabase:null}),children:[{path:'cover-editor/pool',Component:Pool,loader:()=>structuredClone(state),action:async({request})=>{const f=await request.formData(),op=f.get('intent'),id=f.get('candidate_id'),c=state.candidates.find(c=>c.id===id);if(op==='submit')c.status='submitted';if(op==='vote')state.votes=[{voter_id:'editor',candidate_id:id}];if(op==='select'){if(f.get('confirmed')!=='yes')return {error:'Confirm replacement of the official issue cover'};for(const c of state.candidates)c.status=c.id===id?'selected':'not-selected';}return {success:'Cover Pool updated.'};}},{path:'cover-editor',Component:()=> <CoverEditorClient issues={[{...payload,id:'issue',status:'current',archived_at:null}]} panelsByIssue={{issue:[{id:'panel',title:'Published panel',image:'',image_alt:'',status:'published',lifecycle_status:'published'}]}} initialId='issue' candidateId='new'/>,action:()=>({success:'Draft saved.'})}]}],{initialEntries:['/cover-editor/pool']});
createRoot(document.getElementById('root')).render(<RouterProvider router={router}/>);
`},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'}});
const browser=await chromium.launch();
try{
 const page=await browser.newPage();page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
 await page.goto('https://fixture.test/');await page.addStyleTag({content:await readFile('router-app/app.css','utf8')});await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.getByRole('heading',{name:'My cover candidates · 2/2'}).waitFor();
 assert.equal(await page.getByRole('link',{name:'CREATE CANDIDATE'}).count(),0);
 await page.getByRole('button',{name:'SUBMIT CANDIDATE'}).first().click();await page.getByRole('button',{name:'SUBMIT CANDIDATE'}).click();
 await page.getByRole('button',{name:'VOTE / CHANGE VOTE'}).first().click();await page.getByRole('button',{name:'YOUR VOTE'}).waitFor();
 await page.getByRole('button',{name:'VOTE / CHANGE VOTE'}).click();
 const second=page.locator('.cover-pool-card').nth(1);await second.getByRole('button',{name:'YOUR VOTE'}).waitFor();
 await second.getByRole('button',{name:'SELECT OFFICIAL COVER'}).click();await page.getByRole('alert').filter({hasText:'Confirm replacement'}).waitFor();
 await second.getByRole('checkbox').check();await second.getByRole('button',{name:'SELECT OFFICIAL COVER'}).click();await page.getByText('✓ Official selected cover').waitFor();
 assert.equal(await page.getByRole('button',{name:'VOTE / CHANGE VOTE'}).count(),0);
 for(const width of [390,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), 'Pool overflow at '+width);}
 await page.getByRole('link',{name:'RETURN TO COVER EDITOR'}).click();await page.getByRole('button',{name:'SAVE PRIVATE DRAFT'}).waitFor();
 for(const width of [390,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), 'Editor overflow at '+width);}
 assert.deepEqual(errors,[]);
 console.log('PASS: Cover Pool submission, cap affordance, vote/change vote, confirmation, selected state and editor at 390px/1440px. Fixture transport; SQL tests verify persistence and access.');
}finally{await browser.close();}
