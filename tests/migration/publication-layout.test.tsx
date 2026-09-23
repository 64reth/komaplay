import React from 'react';
Object.assign(globalThis,{React});
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {createMemoryRouter,RouterProvider} from 'react-router';
import Feature from '../../router-app/routes/feature';
import {ArticleRenderer} from '../../router-app/components/ArticleRenderer';
import {publicationFixture} from '../fixtures/publication';
import {draftDocument} from '../../router-app/lib/editorial-alpha';
// The route/component generated prop types are deliberately bypassed in this SSR fixture.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const document=draftDocument({title:'Canonical document title',summary:'Introduction',image:'/hero.png',imageAlt:'Hero artwork',sectionsJson:JSON.stringify([{id:'one',type:'heading',text:'First section'},{id:'two',type:'paragraph',text:'Second section'},{id:'three',type:'image',url:'/body.png',alt:'Body artwork'}])} as any);
test('publication shell owns exactly one document title and preserves artwork and section order',()=>{
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 const all=publicationFixture();const element=<Feature loaderData={{all,feature:all.features[0],panel:{data:null,message:null},publishedDocument:document} as any} params={{}} matches={[]}/>;
 const router=createMemoryRouter([{id:"root",path:"/",element}],{hydrationData:{loaderData:{root:{auth:{state:"signed-out"},config:null}}}});
 const html=renderToStaticMarkup(<RouterProvider router={router}/>);
 assert.equal((html.match(/<h1/g)||[]).length,1);
 assert.equal((html.match(/Canonical document title/g)||[]).length,1);
 assert.ok(html.indexOf('alt="Body artwork"')<html.indexOf('aria-label="Open Panel status"'));
 assert.match(html,/alt="Hero artwork"/);assert.match(html,/alt="Body artwork"/);
 assert.ok(html.indexOf('First section')<html.indexOf('Second section'));assert.ok(html.indexOf('Second section')<html.indexOf('alt="Body artwork"'));
});
test('standalone editor and review renderer retains its semantic document title',()=>{
 const html=renderToStaticMarkup(<ArticleRenderer document={document}/>);
 assert.equal((html.match(/<h1/g)||[]).length,1);assert.match(html,/Canonical document title/);
});
