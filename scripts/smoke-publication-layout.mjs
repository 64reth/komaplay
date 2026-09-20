import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);const {build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');const {chromium}=require('@playwright/test');
const supplied=process.argv[2]?JSON.parse(await readFile(process.argv[2],'utf8')):null;
const source=`
import React from 'react';import {createRoot} from 'react-dom/client';import {createMemoryRouter,RouterProvider} from 'react-router';import Feature from './router-app/routes/feature';import {publicationFixture} from './tests/fixtures/publication';import {draftDocument} from './router-app/lib/editorial-alpha';
const all=publicationFixture();const fixture={all,feature:all.features[0],panel:{data:null,message:null},publishedDocument:draftDocument({title:'A canonical publication with room for artwork',summary:'A short introduction.',image:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="600" height="400"/%3E',imageAlt:'Fixture art',sectionsJson:JSON.stringify([{id:'start',type:'heading',text:'Start reading'},...Array.from({length:25},(_,i)=>({id:'p'+i,type:'paragraph',text:'A long editorial body should never push the opening artwork down the page. '.repeat(8)}))])})};
const data=window.publicationFixture??fixture;const router=createMemoryRouter([{id:'root',path:'/',element:<Feature loaderData={data} params={{}} matches={[]}/>}],{hydrationData:{loaderData:{root:{auth:{state:'signed-out'},config:null}}}});createRoot(document.getElementById('root')).render(<RouterProvider router={router}/>);
`;
const options={bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'}};
const clientSource=source.replace("import {createRoot}","import {hydrateRoot}").replace("createRoot(document.getElementById('root')).render(<RouterProvider router={router}/>);","hydrateRoot(document.getElementById('root'),<RouterProvider router={router}/>);");
const bundle=await build({...options,stdin:{resolveDir:process.cwd(),loader:'tsx',contents:clientSource},format:'iife'});
const serverSource="import {renderToString} from 'react-dom/server';\n"+source.replace("const data=window.publicationFixture??fixture;","export function render(fixtureInput){const data=fixtureInput??fixture;").replace("createRoot(document.getElementById('root')).render(<RouterProvider router={router}/>);","return renderToString(<RouterProvider router={router}/>);}");
const server=await build({...options,stdin:{resolveDir:process.cwd(),loader:'tsx',contents:serverSource},format:'cjs',platform:'node',packages:'external'});
const mod={exports:{}};new Function('require','module','exports',server.outputFiles[0].text)(require,mod,mod.exports);
const markup=mod.exports.render(supplied);
const browser=await chromium.launch();try{
 const p=await browser.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await p.route('https://komaplay.com/__layout-fixture',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<div id="root">'+markup+'</div>'}));
 await p.goto('https://komaplay.com/__layout-fixture');await p.evaluate(data=>window.publicationFixture=data,supplied);await p.addStyleTag({content:await readFile('router-app/app.css','utf8')});await p.addScriptTag({content:bundle.outputFiles[0].text});await p.locator('.editorial-hero img').waitFor();await p.locator('.editorial-hero img').evaluate(img=>img.decode());await mkdir('test-results',{recursive:true});
 for(const width of [1920,1366,820,768,390,1440]){
  await p.setViewportSize({width,height:1000});await p.waitForTimeout(150);
  const result=await p.evaluate(()=>{const box=s=>document.querySelector(s).getBoundingClientRect().toJSON();return {titles:document.querySelectorAll('h1').length,body:box('.published-body'),header:box('.editorial-feature-header'),hero:box('.editorial-hero'),document:box('.editorial-document'),first:box('.editorial-document > :first-child'),status:box('.op-status'),overflow:document.documentElement.scrollWidth-innerWidth};});
  assert.ok(result.status.y>=result.body.bottom);
  assert.equal(result.titles,1);assert.ok(result.overflow<=2,JSON.stringify(result));assert.ok(Math.abs(result.header.y-result.body.y)<2);assert.ok(result.hero.y-result.body.y<100);
  if(width>800){assert.ok(result.document.width>result.header.width);assert.ok(Math.abs(result.document.y-result.body.y)<2);assert.ok(Math.abs(result.first.y-result.document.y)<2);}else{assert.ok(result.document.y>=result.header.bottom);assert.ok(result.document.y-result.header.bottom<=25);}
  await p.screenshot({path:'test-results/publication-layout-'+(supplied?'article':'fixture')+'-'+width+'.png',fullPage:false});console.log(JSON.stringify({width,heroTop:result.hero.y,bodyTop:result.body.y,titles:result.titles,overflow:result.overflow}));
 }
 assert.deepEqual(errors,[]);console.log('PASS: single title, early artwork, ordered narrow flow, no overflow or resize/runtime errors.');
}finally{await browser.close();}
