import React from 'react';
Object.assign(globalThis,{React});
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {createMemoryRouter,RouterProvider} from 'react-router';
import Home from '../../router-app/routes/home';
import {homePublication} from '../../router-app/lib/home-publication';
import {publicationFixture} from '../fixtures/publication';
function render(data:ReturnType<typeof publicationFixture>){
 const publication=homePublication(data);
 const router=createMemoryRouter([{id:'root',path:'/',element:<Home loaderData={{data,filters:{},publication}} params={{}} matches={[]}/>}],{hydrationData:{loaderData:{root:{auth:{state:'signed-out'},config:null}}}});
 return {publication,html:renderToStaticMarkup(<RouterProvider router={router}/>)};
}
function shell(html:string){assert.match(html,/issue-home/);assert.match(html,/aria-label="KOMA:\/\/PLAY"/);assert.match(html,/role="search"/);assert.match(html,/Current issue/);assert.match(html,/COMMUNITY HANDBOOK/);assert.match(html,/class="feature-strip"/);assert.doesNotMatch(html,/The next issue is taking shape/);}
test('active Issue with no published Panels retains shell and editorial strip',()=>{const d=publicationFixture();d.features=[];const {html}=render(d);shell(html);assert.match(html,/ISSUE 00 \/ SEPTEMBER 2026/);assert.match(html,/The next issue starts here/);assert.match(html,/ENTER THE WORKSHOP/);assert.doesNotMatch(html,/Previous features|SCROLL TO EXPLORE|data-drift/);});
test('one Panel retains artwork, metadata, caption and summary without carousel affordances',()=>{const d=publicationFixture();d.features=d.features.filter(f=>f.issue_id===d.issues[0].id).slice(0,1);const {html,publication}=render(d);shell(html);assert.equal(publication.stripItemCount,1);assert.match(html,/class="feature-caption"/);assert.match(html,/class="feature-summary"/);assert.match(html,/class="feature-art"/);assert.doesNotMatch(html,/Previous features|SCROLL TO EXPLORE|data-drift|The next issue starts here/);});
test('multiple Panels retain the normal strip',()=>{const d=publicationFixture();const {html,publication}=render(d);shell(html);assert.ok(publication.stripItemCount>1);assert.match(html,/class="feature-meta"/);assert.doesNotMatch(html,/feature-rail-empty/);});
test('archived Panels cannot enter the current strip, including forced archive filters',()=>{const d=publicationFixture();const old=d.features.find(f=>f.issue_id!==d.issues[0].id)!;const state=homePublication(d,{issue:d.issues[1].slug});assert.ok(state.features.every(f=>f.issue_id===d.issues[0].id));assert.ok(!state.features.includes(old));d.features.filter(f=>f.issue_id===d.issues[0].id).forEach(f=>f.lifecycle_status='archived');assert.equal(homePublication(d).stripItemCount,0);});
test('no current Issue retains shell without inventing identity or reusing archived Panels',()=>{const d=publicationFixture();d.issues.forEach(i=>i.status='archived');const {html,publication}=render(d);shell(html);assert.equal(publication.issue,undefined);assert.equal(publication.stripItemCount,0);assert.match(html,/ENTER THE WORKSHOP/);assert.doesNotMatch(html,/ISSUE 00 \/ SEPTEMBER|class="feature-art"/);});
