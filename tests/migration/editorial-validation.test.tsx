import React from 'react';
Object.assign(globalThis, { React });
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { validateEditorialSubmission, validateSections, issueTarget, submissionCopy } from '../../router-app/lib/editorial-validation';
import { composerSectionTypes, createComposerSection, moveComposerSection, removeComposerSection, type ComposerSection } from '../../router-app/lib/editorial-alpha';
import { ArticleSectionBuilder } from '../../router-app/components/ArticleSectionBuilder';
const panel = {title:'A panel title',slug:'a-panel-title',summary:'A useful summary.'};
const valid: ComposerSection[] = [
 {id:'para',type:'paragraph',text:'Words'}, {id:'head',type:'heading',text:'Heading'},
 {id:'image',type:'image',url:'/image.png',alt:'An image'}, {id:'quote',type:'quote',text:'Quote'},
 {id:'bullet',type:'bullet-list',text:'One\nTwo'}, {id:'number',type:'numbered-list',text:'One'},
 {id:'video',type:'video',url:'https://youtu.be/dQw4w9WgXcQ'}, {id:'divider',type:'divider'},
];
for (const type of composerSectionTypes) test(`submission requirements: ${type}`, () => {
 const section = createComposerSection(type);
 const issues = validateSections([section]);
 const fields = {paragraph:['text'],heading:['text'],image:['url','alt'],quote:['text'],'bullet-list':['text'],'numbered-list':['text'],video:['url'],divider:[]}[type];
 assert.deepEqual(issues.map(issue=>issue.field),fields);
 assert.ok(issues.every(issue=>issue.sectionId===section.id));
 assert.equal(validateSections([valid.find(section=>section.type===type)!]).length,0);
});
test('every panel requirement, optional attribution, placeholder and format follow existing rules', () => {
 assert.deepEqual(validateEditorialSubmission(panel,valid),[]);
 const issues=validateEditorialSubmission({title:'',slug:'',summary:'',image:'javascript:bad',imageAlt:'',categoryId:'no',format:'html'},valid);
 assert.deepEqual(new Set(issues.map(i=>i.field)),new Set(['title','slug','summary','image','imageAlt','categoryId','format']));
 assert.ok(issues.every(i=>i.sectionId===null));
 for(const [field,value] of [['title','x'.repeat(151)],['slug','x'.repeat(81)],['summary','x'.repeat(1001)],['imageAlt','x'.repeat(401)]]) assert.ok(validateEditorialSubmission({...panel,[field]:value},valid).some(i=>i.field===field));
 assert.ok(validateEditorialSubmission({...panel,title:'ab',slug:'a',summary:'tiny'},valid).length===3);
});
test('multiple errors retain identity and updated labels after reorder and deletion', () => {
 const sections:ComposerSection[]=[{id:'quote-a',type:'quote',text:''},{id:'image-b',type:'image',url:'',alt:''},{id:'video-c',type:'video',url:'https://example.com/video'}];
 const before=validateSections(sections);assert.equal(before.length,4);
 const moved=validateSections(moveComposerSection(sections,'image-b','up'));
 assert.equal(moved.find(i=>i.sectionId==='image-b'&&i.field==='alt')!.key,before.find(i=>i.sectionId==='image-b'&&i.field==='alt')!.key);
 assert.match(moved.find(i=>i.sectionId==='image-b'&&i.field==='alt')!.message,/Image 1/);
 const removed=validateSections(removeComposerSection(sections,'quote-a'));
 assert.ok(removed.every(i=>i.sectionId!=='quote-a'));assert.match(removed[0].message,/Image 1/);
});
test('limits, invalid addresses and empty lists use contributor-friendly corrective copy', () => {
 const sections:ComposerSection[]=[{id:'i',type:'image',url:'//evil.test/image',alt:'a'.repeat(401)}, {id:'q',type:'quote',text:'q',attribution:'a'.repeat(401)}, {id:'b',type:'bullet-list',text:'- \n* '}, {id:'v',type:'video',url:'javascript:alert(1)'}, {id:'p',type:'paragraph',text:'a'.repeat(20001)}];
 const issues=validateSections(sections);assert.equal(issues.length,6);
 assert.ok(issues.every(i=>i.message.length<160));
 assert.doesNotMatch(issues.map(i=>i.message).join(' '),/schema|RPC|payload|validation|missing field|column|relation/i);
 assert.match(issues.find(i=>i.sectionId==='v')!.message,/Check the link in Embed 4/);
 assert.match(submissionCopy.submitFailure,/Your draft is still safe/);
 assert.equal(submissionCopy.saved,'Draft saved');
 assert.equal(submissionCopy.submitted,'Everything looks ready. Your panel has been submitted for review.');
});
test('every invalid input has an associated message and stable focus target', () => {
 const sections=composerSectionTypes.map(type=>createComposerSection(type));
 const issues=validateSections(sections);
 const html=renderToStaticMarkup(<ArticleSectionBuilder sections={sections} onChange={()=>{}} upload={()=>{}}/>);
 for(const issue of issues){const id=issueTarget(issue);assert.ok(html.includes(`id="${id}"`));assert.ok(html.includes(`aria-describedby="${id}-error"`));assert.ok(html.includes(`id="${id}-error"`));}
 assert.match(html,/aria-invalid="true"/);
});

test('document limits and unavailable categories return structured guidance', () => {
 const sections=Array.from({length:121},(_,index)=>({id:`divider-${index}`,type:'divider' as const}));
 assert.ok(validateSections(sections).some(issue=>issue.field==='sections'&&issue.code==='limit'));
 assert.ok(validateSections([{id:'long-text',type:'paragraph',text:'x'.repeat(61000)}]).some(issue=>issue.field==='sections'&&issue.code==='length'));
 assert.ok(validateEditorialSubmission({...panel,categoryId:'00000000-0000-4000-8000-000000000001'},valid,[]).some(issue=>issue.field==='categoryId'&&issue.code==='unavailable'));
 assert.equal(validateEditorialSubmission({...panel,title:''},valid)[0].message,'Add a title before submitting.');
});
