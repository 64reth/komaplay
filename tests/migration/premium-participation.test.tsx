import React from 'react';
Object.assign(globalThis,{React});
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {createMemoryRouter,RouterProvider} from 'react-router';
import Feature from '../../router-app/routes/feature';
import {PanelCitationDisclosure} from '../../router-app/components/open-panel/PublishedPanel';
import {publicationFixture} from '../fixtures/publication';
import {contributionState} from '../../router-app/lib/contribution-state';
function render(options:{closed?:boolean;expired?:boolean;archived?:boolean;status?:string;account?:string;handbook?:string}={}){
 const all=publicationFixture(),feature=all.features[0],issue=all.issues.find(i=>i.id===feature.issue_id)!;
 all.now='2026-09-15T12:00:00Z';
 if(options.expired)all.now='2026-10-02T12:00:00Z';
 if(options.closed)feature.lifecycle_status='final_panel';
 if(options.archived)issue.status='archived';
 const publishedDocument={schemaVersion:1,header:{title:feature.title,byline:'Public pen name',eyebrow:'',standfirst:''},modules:[]};
 const root={auth:{state:options.status??'signed-out',member:{accountStatus:options.account??'active',displayName:'Member'}},membership:{status:options.handbook??'accepted'},supabase:null};
 const router=createMemoryRouter([{id:'root',path:'/',element:<Feature loaderData={{all,feature,panel:{data:null,message:null},publishedDocument} as React.ComponentProps<typeof Feature>["loaderData"]} params={{}} matches={[]}/>}],{hydrationData:{loaderData:{root}}});
 return renderToStaticMarkup(<RouterProvider router={router}/>);
}
test('open Panel exposes restrained contribution access for readers and eligible members',()=>{
 for(const options of [{},{status:'authenticated'},{status:'authenticated',handbook:'required'}]){
  const html=render(options);assert.match(html,/class="contribute-link" href="\/features\/first\/workshop"/);assert.match(html,/OPEN THE WORKSHOP/);assert.match(html,/By Public pen name/);
 }
});
test('closed or archived Panels expose no Workshop contribution routes',()=>{
 for(const options of [{closed:true},{archived:true},{expired:true}]){
  const html=render(options);assert.doesNotMatch(html,/contribute-link|href="[^"]*\/workshop/);assert.match(html,/REPORT A CORRECTION/);
 }
});
test('contextual access respects server-resolved account restrictions and unavailable membership',()=>{
 for(const options of [{status:'authenticated',account:'suspended'},{status:'authenticated',account:'restricted'},{status:'authenticated',handbook:'unavailable'},{status:'profile-unavailable'}])assert.doesNotMatch(render(options),/class="contribute-link"/);
});
test('acceptance is not presented as publication or citation',()=>{
 assert.equal(contributionState({status:'Accepted'}),'ACCEPTED · NOT YET PUBLISHED');
 assert.equal(contributionState({status:'Accepted'},true,true),'PUBLISHED · CITED');
 assert.equal(contributionState({status:'Accepted',incorporated_at:'2026-10-09'}),'INCORPORATED · NOT CURRENTLY PUBLIC');
});
test('public citation disclosure has a readable label and retains only supplied public attribution',()=>{
 const html=renderToStaticMarkup(<PanelCitationDisclosure citation={{id:'citation',addition_id:'addition',revision_number:2,public_credit:'Anonymous Panelist',contribution_type:'Source',source_url:'',submitted_at:'2026-10-01',published_at:'2026-10-09',reviewing_editor:'Editorial team',editorial_summary:'Added evidence'}}/>);
 assert.match(html,/Panel Citation · P\/\/02/);assert.match(html,/Anonymous Panelist/);assert.doesNotMatch(html,/author_id|profile_id|email/);
});
