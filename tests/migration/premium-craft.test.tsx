import React from 'react';
Object.assign(globalThis,{React});
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import {IssueNavigation} from '../../router-app/components/IssueNavigation';
import {CommunityAdditions,OpenPanelStatus} from '../../router-app/components/open-panel/PublishedPanel';
function render(node:React.ReactNode,path='/'){return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);}
test('search navigation retains the entered query safely',()=>{
 const html=render(<IssueNavigation/>,'/search?q=manga%20%26%20games');assert.match(html,/value="manga &amp; games"/);
});
test('Issue and article navigation identify parent context without claiming the current page',()=>{
 const current=render(<IssueNavigation issue={{status:'current'}}/>,'/features/example');
 assert.match(current,/aria-current="location" href="\/"/);assert.doesNotMatch(current,/aria-current="page"/);
 const archive=render(<IssueNavigation issue={{status:'archived'}}/>,'/issues/old');assert.match(archive,/aria-current="location" href="\/archive"/);
});
test('global routes keep exact page navigation and no invented Issue context',()=>{
 assert.match(render(<IssueNavigation/>,'/archive'),/aria-current="page" href="\/archive"/);
 assert.doesNotMatch(render(<IssueNavigation/>,'/search'),/aria-current/);
});
test('empty community section retains its state without duplicating the Workshop invitation',()=>{
 const html=render(<CommunityAdditions additions={[]} citations={[]} open/>);
 assert.match(html,/No community additions have been published yet/);assert.doesNotMatch(html,/ADD TO|THIS PANEL IS OPEN|href=/);
 assert.match(render(<OpenPanelStatus data={null} slug="example" open/>),/OPEN THE WORKSHOP/);
});
test('closed editions retain historical explanation and correction access',()=>{
 const html=render(<><CommunityAdditions additions={[]} open={false}/><OpenPanelStatus data={null} slug="example" open={false}/></>);
 assert.match(html,/No community additions were published in this edition/);assert.match(html,/REPORT A CORRECTION/);assert.doesNotMatch(html,/\/workshop/);
});
