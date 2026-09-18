import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import {createClient} from '@supabase/supabase-js';
import {publicationFixture} from '../fixtures/publication';
import {WeeklyDropStrip} from '../../router-app/components/publication/WeeklyDropStrip';
Object.assign(globalThis, {React});
import {catalogue} from '../../router-app/lib/publication.server';

test('small canonical strips keep real links; empty strips do not invent panels',()=>{
 const data=publicationFixture();
 for(const count of [0,1,2]){
  const html=renderToStaticMarkup(<MemoryRouter><WeeklyDropStrip data={data} drop={data.drops[0]} features={data.features.slice(0,count)}/></MemoryRouter>);
  assert.equal((html.match(/class="feature-panel /g)||[]).length,count);
  if(count)assert.match(html,/href="\/features\/first"/);
  else assert.match(html,/No features in this drop match the selected filters/);
 }
});

test('runtime contains no legacy fallback or seed navigation',async()=>{
 for(const file of ['issue-zero','publication-demo','editorial','tokon-guide'])await assert.rejects(access(`router-app/data/${file}.ts`));
 const route=await readFile('router-app/routes/feature.tsx','utf8');
 assert.doesNotMatch(route,/documentFor|tokonGuide|data\/editorial/);
 assert.match(route,/if \(!publishedDocument\) throw data/);
 const nav=await readFile('router-app/components/Masthead.tsx','utf8');
 assert.doesNotMatch(nav,/issueZero|\/features\//);
 const strip=await readFile('router-app/components/FeatureStrip.tsx','utf8');
 assert.match(strip,/lib\/publication/);
 assert.match(strip,/requestAnimationFrame/);
});

test('unconfigured publication stays empty, never a demo catalogue',async()=>{
 const keys=Object.keys(process.env).filter(k=>/SUPABASE/.test(k));
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{keys.forEach(k=>delete process.env[k]);const result=await catalogue();assert.deepEqual(result.features,[]);assert.ok(result.message);}
 finally{Object.assign(process.env,old);}
});

test('public catalogue admits only canonical published documents and fails closed on RPC errors',async()=>{
 const fixture=publicationFixture();const tables:Record<string,unknown[]>={issues:fixture.issues,weekly_drops:fixture.drops,features:fixture.features,categories:fixture.categories,content_formats:fixture.formats,tags:[],feature_tags:[],feature_relationships:[],published_additions:[],public_profiles:[]};
 let fail=false;const calls:string[]=[];
 const db=createClient('https://catalogue.test','test-key',{auth:{persistSession:false},global:{fetch:async(input,init)=>{
  const url=new URL(String(input));let body:unknown=tables[url.pathname.split('/').pop()!];
  if(url.pathname.includes('/rpc/')){
   const slug=JSON.parse(String(init?.body)).feature_slug;calls.push(slug);
   if(fail)return new Response(JSON.stringify({message:'unavailable'}),{status:503,headers:{'content-type':'application/json'}});
   body=slug==='first'?{schemaVersion:1,header:{title:'Canonical'},modules:[]}:null;
  }
  return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
 }}});
 const result=await catalogue(db);assert.deepEqual(result.features.map(f=>f.slug),['first']);assert.ok(calls.includes('guide'));
 fail=true;const unavailable=await catalogue(db);assert.deepEqual(unavailable.features,[]);assert.ok(unavailable.message);
});
