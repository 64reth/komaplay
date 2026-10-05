import React from 'react';
Object.assign(globalThis,{React});
import test from 'node:test';import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';import {createMemoryRouter,RouterProvider} from 'react-router';
import Feature from '../../router-app/routes/feature';import {publicationFixture} from '../fixtures/publication';import {draftDocument} from '../../router-app/lib/editorial-alpha';import {acceptsContributions,filterFeatures} from '../../router-app/lib/publication';
test('archived parent renders a readable permanent edition even with stale child status',()=>{
 const all=publicationFixture('2026-09-15T00:00:00Z'),feature=all.features[0];all.issues.find(i=>i.id===feature.issue_id)!.status='archived';feature.lifecycle_status='open_panel';feature.deadline_override='2200-01-01T00:00:00Z';
 assert.equal(acceptsContributions(feature,all.issues[0],all.now),false);assert.ok(!filterFeatures(all,{filter:'open'}).includes(feature));
 // A real publication document remains readable; no contribution invitation is substituted for it.
 const document=draftDocument({title:'Preserved article',summary:'Preserved summary',image:'/hero.png',imageAlt:'Artwork',sectionsJson:'[]'} as Parameters<typeof draftDocument>[0]);
 const router=createMemoryRouter([{id:'root',path:'/',element:<Feature loaderData={{all,feature,panel:{data:null,message:null},publishedDocument:document}} params={{}} matches={[]}/>}],{hydrationData:{loaderData:{root:{auth:{state:'signed-out'},config:null}}}});
 const html=renderToStaticMarkup(<RouterProvider router={router}/>);assert.match(html,/Preserved article/);assert.match(html,/ARCHIVED PANEL/);assert.match(html,/Publication history/);assert.doesNotMatch(html,/OPEN THE WORKSHOP|ADD TO THIS EDITORIAL|DAYS REMAINING|href="[^"]*\/workshop"/);
});
