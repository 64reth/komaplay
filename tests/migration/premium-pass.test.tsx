import React from 'react';
Object.assign(globalThis,{React});
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import {homeFilters,homePublication} from '../../router-app/lib/home-publication';
import {publicationFixture} from '../fixtures/publication';
import {ArticleSectionBuilder} from '../../router-app/components/ArticleSectionBuilder';
import {validateSections} from '../../router-app/lib/editorial-validation';
import {ArchiveIssueCard} from '../../router-app/components/publication/ArchiveShelf';

test('category links and quick filter aliases select the same current published Panels',()=>{
 const data=publicationFixture();
 for(const category of data.categories){
  const a=homeFilters({category:category.slug},data.categories), b=homeFilters({filter:category.slug},data.categories);
  assert.equal(a.filter,b.filter);assert.equal(a.category,b.category);
  assert.deepEqual(homePublication(data,a).features,homePublication(data,b).features);
 }
});
test('explicit category resolves a conflicting alias consistently',()=>{
 const categories=[{slug:'manga'},{slug:'gaming'}];
 assert.deepEqual(homeFilters({category:'manga',filter:'gaming'},categories),{category:'manga',filter:'manga'});
});
test('non-category discovery controls keep their meaning',()=>{
 assert.equal(homeFilters({filter:'open'},[]).filter,'open');
 assert.equal(homeFilters({filter:'guides'},[]).filter,'guides');
});
test('untouched body hides errors without relaxing submission validation',()=>{
 const sections=[{id:'p',type:'paragraph' as const,text:''}];
 const html=renderToStaticMarkup(<ArticleSectionBuilder sections={sections} showValidation={false} onChange={()=>{}} upload={()=>{}}/>);
 assert.doesNotMatch(html,/aria-invalid="true"|id="section-p-text-error"/);
 const empty=renderToStaticMarkup(<ArticleSectionBuilder sections={[]} showValidation={false} onChange={()=>{}} upload={()=>{}}/>);
 assert.doesNotMatch(empty,/aria-invalid="true"|aria-describedby="panel-sections-error"/);
 assert.ok(validateSections(sections).length);
 const submitted=renderToStaticMarkup(<ArticleSectionBuilder sections={sections} showValidation onChange={()=>{}} upload={()=>{}}/>);
 assert.match(submitted,/aria-invalid="true"/);
});
test('archive navigation does not reuse historical cover branding',()=>{
 const data=publicationFixture(),issue={...data.issues[0],cover_label:'INK//:PLAY / 000'};
 const html=renderToStaticMarkup(<MemoryRouter><ArchiveIssueCard issue={issue} data={data}/></MemoryRouter>);
 assert.match(html,/READ THE ISSUE/);assert.doesNotMatch(html,/INK\/\/:PLAY/);
 assert.equal(issue.cover_label,'INK//:PLAY / 000');
});
