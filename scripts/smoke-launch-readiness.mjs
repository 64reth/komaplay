// One read-only desktop session. Does not send email or mutate production content.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const origin=process.env.PLAYWRIGHT_BASE_URL ?? 'https://komaplay.com';
const browser=await chromium.launch({headless:true});
const report={checkedAt:new Date().toISOString(),origin,routes:[],links:[],browserErrors:[],publicCredentialKinds:[]};
const checked=new Set();const discovered=new Set();
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const sitemapText=await (await page.request.get(origin+'/sitemap.xml')).text();
 const featureUrl=sitemapText.match(/<loc>([^<]*\/features\/[^<]+)<\/loc>/)?.[1];
 const featurePath=featureUrl ? new URL(featureUrl).pathname : null;
 page.on('pageerror',error=>report.browserErrors.push(error.message));
 for(const path of ['/','/about','/documents','/documents/platform-notice','/handbook','/archive','/search?q=tokon',...(featurePath?[featurePath,featurePath+'/workshop']:[]),'/onboarding','/profile','/profile/settings','/editorial','/moderation','/launch-readiness-missing-page']) {
  const response=await page.goto(origin+path,{waitUntil:'networkidle'});
  const status=response?.status();
  const expected=path.includes('missing-page')?404:200;
  if(status!==expected) throw Error(`${path}: expected ${expected}, got ${status}`);
  checked.add(new URL(origin+path).pathname+new URL(origin+path).search);
  const body=await page.locator('body').innerText();
  if(/Unexpected Server Error|The panel slipped\./.test(body)) throw Error('Server error at '+path);
  const heading=await page.locator('h1').first().textContent();
  report.routes.push({path,status,heading});
  if(['/profile','/profile/settings','/editorial','/moderation'].includes(path)&&!/SIGN IN TO/.test(body)) throw Error('Missing signed-out gate at '+path);
  if(path==='/documents'&&!body.includes('OWNER REVIEW PENDING')) throw Error('Legal status unclear');
  if(path==='/') {
   await page.getByRole('button',{name:'SIGN IN',exact:true}).click();
   await page.getByRole('dialog').waitFor();
   await page.getByRole('button',{name:'CONTINUE WITH GOOGLE'}).waitFor();
   await page.getByLabel('Email',{exact:true}).fill('not-an-email');
   if(await page.getByLabel('Email',{exact:true}).evaluate(el=>el.checkValidity())) throw Error('Invalid email was accepted');
   await page.getByRole('button',{name:'Close account dialog'}).click();
   await mkdir('test-results',{recursive:true});
   await page.screenshot({path:'test-results/launch-desktop.png',fullPage:true});
   const html=await response.text();
   if(/sb_secret_[A-Za-z0-9_-]+/.test(html)) throw Error('Privileged key marker in HTML');
   for(const token of html.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)??[]) {
    try {const role=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).role;if(role) report.publicCredentialKinds.push(role);if(role==='service_role') throw Error('Privileged JWT in HTML');} catch(error) {if(error.message.includes('Privileged')) throw error;}
   }
  }
  for(const href of await page.locator('a[href]').evaluateAll(links=>links.map(a=>a.href))) {
   const url=new URL(href);if(url.origin===origin&&!url.pathname.startsWith('/auth/')) discovered.add(url.pathname+url.search);
  }
 }
 await page.goto(origin+'/auth/callback?code=launch-invalid&returnTo=%2Farchive',{waitUntil:'networkidle'});
 if(!page.url().includes('/archive?auth_error=expired')) throw Error('Callback did not return safely');
 await page.getByRole('dialog').waitFor();
 if(!(await page.getByRole('dialog').innerText()).includes('invalid or expired')) throw Error('Expired callback has no recovery message');
 report.callback='Invalid callback returns to Archive with a visible retry message; no email was sent.';
 // Only unique internal destinations not already visited, bounded to this publication.
 for(const path of [...discovered].filter(path=>!checked.has(path)).slice(0,35)) {
  const response=await page.request.get(origin+path);report.links.push({path,status:response.status()});
  if(!response.ok()) throw Error('Broken internal link '+path+' '+response.status());
 }
 if(report.browserErrors.length) throw Error('Uncaught browser errors: '+report.browserErrors.join('; '));
 const sitemap=await page.request.get(origin+'/sitemap.xml');
 if(!sitemap.ok() || !(await sitemap.text()).includes('<urlset'))throw Error('Sitemap unavailable');
 if(/\/(editorial|moderation|profile|member|auth)(?:<|\/)/.test(await sitemap.text()))throw Error('Private route in sitemap');
 const robots=await page.request.get(origin+'/robots.txt');if(!robots.ok() || !(await robots.text()).includes('Sitemap: https://komaplay.com/sitemap.xml'))throw Error('Robots unavailable');
 const privateHtml=await (await page.request.get(origin+'/editorial')).text();if(!privateHtml.includes('noindex, nofollow'))throw Error('Private indexing directive missing');
 if(featurePath){const articleHtml=await (await page.request.get(origin+featurePath)).text();if(!articleHtml.includes('application/ld+json') || !articleHtml.includes('og:title'))throw Error('Article metadata missing');}
 await page.goto(origin+'/auth/callback?error=access_denied&returnTo=%2Feditorial%3Ffeature%3Dfixture',{waitUntil:'networkidle'});
 await page.getByRole('dialog').waitFor();if(!(await page.getByRole('dialog').innerText()).includes('Sign-in was cancelled'))throw Error('Cancelled OAuth recovery missing');
 if(!page.url().includes('feature=fixture'))throw Error('OAuth destination lost');
 report.seo='Sitemap, robots, private noindex and public article metadata passed.';
 const oauthRequest=page.waitForRequest(request=>request.url().startsWith('https://zrckabmgrbmbjbhqcngp.supabase.co/auth/v1/authorize'),{timeout:15000});
 await page.getByRole('button',{name:'CONTINUE WITH GOOGLE'}).click();
 const oauth=new URL((await oauthRequest).url());
 if(oauth.searchParams.get('provider')!=='google' || oauth.searchParams.get('code_challenge_method')!=='s256')throw Error('Google PKCE initiation missing');
 const callback=new URL(oauth.searchParams.get('redirect_to'));
 if(callback.origin!==origin || callback.pathname!=='/auth/callback' || callback.searchParams.get('returnTo')!=='/editorial?feature=fixture')throw Error('Google callback destination mismatch');
 report.google='Live button initiates Google PKCE with the correct production callback and original panel destination; cancellation recovery passed. No account consent performed.';
 report.result='passed';
} catch(error) {report.result='failed';report.error=error.message;process.exitCode=1;}
finally {await browser.close();await mkdir('test-results',{recursive:true});await writeFile('test-results/launch-desktop.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
