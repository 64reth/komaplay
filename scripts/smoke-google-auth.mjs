import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const {chromium}=require('@playwright/test');
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {AuthDialog} from './router-app/components/AccountNav';
createRoot(document.getElementById('root')).render(<AuthDialog initialMode="sign-in" returnTo="/editorial?feature=panel-123" config={{url:'https://fixture.supabase.co',key:'fixture',authCallbackOrigin:'https://komaplay.com'}} onClose={()=>{document.getElementById('root').textContent='Closed';}}/>);
`},plugins:[{name:'auth-transport',setup(b){b.onResolve({filter:/browser-supabase$/},()=>({path:'fixture',namespace:'auth'}));b.onLoad({filter:/.*/,namespace:'auth'},()=>({loader:'js',contents:`export function supabaseBrowser(){return {auth:{signInWithOAuth:async(options)=>{window.trace=options;await new Promise(r=>setTimeout(r,50));if(window.fail)throw Error('private response');return {data:{url:'https://provider.test/google'},error:null};},signInWithOtp:async()=>{throw Error('private network detail');}}};}` }));}}],bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'}});
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:process.argv.includes('--mobile')?{width:390,height:844}:{width:1280,height:800}});
 await page.route('https://fixture.test/**',r=>r.fulfill({body:'<div id="root"></div>',contentType:'text/html'}));
 await page.route('https://provider.test/**',r=>r.fulfill({body:'Provider sign-in',contentType:'text/html'}));
 await page.goto('https://fixture.test/');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.getByLabel('Email',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Email',{exact:true}).evaluate(e=>e===document.activeElement),true);
 await page.evaluate(()=>{window.fail=true;});
 await page.getByRole('button',{name:'CONTINUE WITH GOOGLE'}).click();
 await page.getByRole('alert').filter({hasText:'couldn’t open Google'}).waitFor();
 const options=await page.evaluate(()=>window.trace);
 assert.equal(options.provider,'google');assert.equal(options.options.skipBrowserRedirect,true);
 assert.equal(new URL(options.options.redirectTo).searchParams.get('returnTo'),'/editorial?feature=panel-123');
 await page.getByLabel('Email',{exact:true}).fill('fixture@example.test');
 await page.getByRole('button',{name:'SEND SIGN-IN LINK'}).click();
 await page.getByRole('alert').filter({hasText:'couldn’t send'}).waitFor();
 assert.doesNotMatch(await page.locator('body').innerText(),/private response|private network/);
 await page.getByRole('button',{name:'CREATE ACCOUNT',exact:true}).first().click();
 await page.getByRole('button',{name:'CONTINUE WITH GOOGLE'}).waitFor();
 await page.evaluate(()=>{window.fail=false;});
 await page.getByRole('button',{name:'CONTINUE WITH GOOGLE'}).click();
 await page.waitForURL('https://provider.test/google');
 console.log('PASS: Google visible in both modes, keyboard focus, safe failures/retry, PKCE destination, provider navigation. Provider transport is simulated; real account consent remains manual.');
} finally {await browser.close();}
