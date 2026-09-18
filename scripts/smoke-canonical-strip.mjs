import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const {chromium}=require('@playwright/test');
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router';
import {WeeklyDropStrip} from './router-app/components/publication/WeeklyDropStrip';import {publicationFixture} from './tests/fixtures/publication';
const root=createRoot(document.getElementById('root'));const data=publicationFixture();
window.showCount=(n)=>root.render(<MemoryRouter><WeeklyDropStrip data={data} drop={data.drops[0]} features={data.features.slice(0,n)}/></MemoryRouter>);window.showCount(2);
`},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch();try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
 await page.goto('https://fixture.test');await page.addStyleTag({content:await readFile('router-app/app.css','utf8')});await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.locator('.feature-panel').nth(1).waitFor();assert.equal(await page.locator('.feature-panel').count(),2);assert.equal(await page.locator('.feature-panel').first().getAttribute('href'),'/features/first');
 for(const width of [1440,800,390,1100,700,1440]){await page.setViewportSize({width,height:900});await page.waitForTimeout(80);}
 await page.evaluate(()=>window.showCount(1));await page.waitForTimeout(100);assert.equal(await page.locator('.feature-panel').count(),1);
 await page.evaluate(()=>window.showCount(0));await page.getByText('No features in this drop match the selected filters.').waitFor();assert.equal(await page.locator('.feature-panel').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS: two/one/zero canonical panels, links, desktop/mobile resizing, no browser or ResizeObserver errors.');
}finally{await browser.close();}
