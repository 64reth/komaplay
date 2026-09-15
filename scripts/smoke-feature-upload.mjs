import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const {build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');const {chromium}=require('@playwright/test');
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';import {createMemoryRouter,RouterProvider,Outlet,MemoryRouter} from 'react-router';
import Editorial from './router-app/routes/editorial';import {FeatureStrip} from './router-app/components/FeatureStrip';import {draftDocument,composerFromWorkItem} from './router-app/lib/editorial-alpha';
let saved=null;const id='00000000-0000-4000-8000-000000000001';
window.showPublished=()=>createRoot(document.getElementById('public')).render(<MemoryRouter><FeatureStrip items={[{id:'upload-fixture',issueNumber:'000',pageIndex:1,title:saved.title,summary:saved.summary,image:saved.image,imageAlt:saved.imageAlt,href:'/features/upload-fixture',panelSize:'standard',panelClass:'',category:'Games',format:'Essay'}]}/></MemoryRouter>);
const router=createMemoryRouter([{id:'root',path:'/',Component:Outlet,loader:()=>({auth:{state:'signed-out',member:null},supabase:null}),children:[{path:'editorial',Component:Editorial,loader:()=>({state:'accepted',capabilities:{editorial:true,moderation:false},categories:[],review:[],drafts:saved?[{feature_id:id,title:saved.title,slug:saved.slug,summary:saved.summary,image:saved.image,image_alt:saved.imageAlt,lifecycle_status:'draft',updated_at:'2026-09-15',working_document:{...draftDocument(saved),composer:saved}}]:[]}),action:async({request})=>{saved=Object.fromEntries(await request.formData());window.savedPanel=saved;return {success:'Draft saved',featureId:id,status:'draft'};}}]}],{initialEntries:['/editorial']});createRoot(document.getElementById('root')).render(<RouterProvider router={router}/>);
`},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'}});
const browser=await chromium.launch();try {
 const page=await browser.newPage();page.setDefaultTimeout(15000);page.on("pageerror",e=>console.log(e.message));let uploads=0;
 let png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64');
 await page.route('https://fixture.test/**',async r=>{if(r.request().url().endsWith('/member/editorial/upload')){uploads++;assert.match(r.request().postDataBuffer().toString('latin1'),/image\/webp/);return r.fulfill({contentType:'application/json',body:JSON.stringify({url:'/asset.webp'})});}if(r.request().url().endsWith('/asset.webp'))return r.fulfill({contentType:'image/png',body:png});return r.fulfill({contentType:'text/html',body:'<div id="root"></div><div id="public"></div>'});});
 await page.goto('https://fixture.test/');png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=8;c.height=8;c.getContext('2d').fillRect(0,0,8,8);return c.toDataURL('image/png').split(',')[1];}),'base64');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.locator('input[name="title"]').fill('Upload fixture');await page.locator('textarea[name="summary"]').fill('Persisted image fixture.');
 await page.locator('input[type="file"]').first().setInputFiles({name:'image.png',mimeType:'image/png',buffer:png});
 await page.getByText('Image uploaded.',{exact:true}).waitFor();
 await page.locator('[name="imageAlt"]').fill('A small test illustration');
 await page.getByRole('button',{name:'SAVE DRAFT',exact:true}).click();await page.getByRole('status').filter({hasText:'Draft saved'}).waitFor();
 assert.equal(uploads,1);assert.equal(await page.evaluate(()=>window.savedPanel.image),'/asset.webp');
 await page.evaluate(()=>window.showPublished());await page.locator('#public img').waitFor();
 assert.equal(await page.locator('#public img').getAttribute('src'),'/asset.webp');assert.equal(await page.locator('#public img').getAttribute('alt'),'A small test illustration');
 assert.match(await page.locator('#public a').first().getAttribute('href'),/upload-fixture/);
 console.log('PASS: actual editor upload re-encoding, server response persistence, draft save and Feature Strip asset/alt/link. Transport/publication fixture; real storage access and lifecycle are covered by SQL tests.');
}finally{await browser.close();}
