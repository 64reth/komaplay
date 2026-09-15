import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const {build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');const {chromium}=require('@playwright/test');
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {AuthCompletion} from './router-app/components/AuthCompletion';createRoot(document.getElementById('root')).render(<AuthCompletion returnTo="/editorial?feature=retained"/>);`},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'}});
const browser=await chromium.launch();try {
 const page=await browser.newPage();page.setDefaultTimeout(15000);let requests=0;let readyAfter=3;let mode='new';
 await page.route('https://fixture.test/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/auth/session'){
   requests++;assert.equal(route.request().method(),'POST');assert.equal(route.request().postDataJSON().returnTo,'/editorial?feature=retained');
   return route.fulfill({json:requests>=readyAfter?{state:'ready',next:mode==='new'?'/onboarding?returnTo=%2Feditorial%3Ffeature%3Dretained':'/editorial?feature=retained'}:{state:'pending'}});
  }
  return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});
 });
 const open=async()=>{await page.goto('https://fixture.test/auth/complete');await page.addScriptTag({content:bundle.outputFiles[0].text});};
 await open();await page.getByRole('heading',{name:'Completing your sign-in…'}).waitFor();
 assert.equal(await page.getByRole('button',{name:/SIGN IN|GOOGLE/}).count(),0);
 await page.waitForURL(/\/onboarding\?/);assert.equal(requests,3);assert.equal(new URL(page.url()).searchParams.get('returnTo'),'/editorial?feature=retained');
 requests=0;readyAfter=100;await open();await page.getByRole('button',{name:'TRY AGAIN'}).waitFor();assert.equal(requests,6);
 assert.match(await page.getByRole('alert').innerText(),/without sending you back to Google/);
 mode='existing';readyAfter=7;await page.getByRole('button',{name:'TRY AGAIN'}).click();await page.waitForURL('https://fixture.test/editorial?feature=retained');assert.equal(requests,7);
 console.log('PASS: delayed session/profile stays in completion state, new member reaches Pocket Guide with retained return path, transient failure retries existing sign-in, existing member returns directly. No OAuth restart.');
}finally{await browser.close();}
