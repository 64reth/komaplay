import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";


const migration=await readFile("supabase/migrations/202609250001_cover_editor.sql","utf8");
const admin="00000000-0000-4000-8000-000000000001",moderator="00000000-0000-4000-8000-000000000002",editor="00000000-0000-4000-8000-000000000003",issue="10000000-0000-4000-8000-000000000001",feature="20000000-0000-4000-8000-000000000001";
async function fixture(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table profiles(id uuid primary key,role text,account_status text);create table issues(id uuid primary key,issue_number integer unique,slug text unique,title text,year integer,month integer,status text,updated_at timestamptz default now());create table features(id uuid primary key,issue_id uuid references issues,status text,lifecycle_status text);create table editorial_documents(feature_id uuid primary key,lifecycle_status text);create function open_panel_role() returns text language sql stable security definer as $$select role from profiles where id=auth.uid()$$;create function require_handbook_acceptance() returns void language plpgsql as $$begin end$$;insert into profiles values('${admin}','admin','active'),('${moderator}','moderator','active'),('${editor}','member','active');insert into issues values('${issue}',1,'issue-one','Issue One',2026,9,'current',now());insert into features values('${feature}','${issue}','published','final_panel');`);await db.exec(migration);await db.exec(`
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text default auth.uid()::text);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,anon;
grant select,insert on storage.objects to authenticated;grant select on storage.objects to anon;
create function public.has_current_handbook_acceptance() returns boolean language sql as $$select true$$;
grant usage on schema public,auth to authenticated,anon;
`);await db.exec(await readFile("supabase/migrations/202609280001_private_cover_pool.sql","utf8"));return db;}
async function as(db:PGlite,id:string){await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec("set role authenticated");}
const payload={issue_id:issue,issue_number:"1",slug:"issue-one",title:"Issue One",year:"2026",month:"9",cover_art:"/assets/cover.png",cover_art_alt:"Ink drawing of a pilot",cover_art_credit:"Artist",lead_feature_id:feature,lead_headline:"The future starts here",cover_theme:"Issue theme",secondary_cover_lines:[{position:"left-rail",headline:"Inside the issue"}],editor_note_teaser:"A short note",featuring_line:"Featuring KOMA contributors",cover_preset:"minimal"};


async function save(db:PGlite, actor=moderator, changes:Record<string,unknown>={}) {
 await as(db,actor);
 const path=`cover-pool/${crypto.randomUUID()}/${crypto.randomUUID()}.png`;
 await db.query("insert into storage.objects(bucket_id,name) values('issue-cover-pool',$1)",[path]);
 const draft={...payload,cover_art:path,...changes};
 const result=await db.query<{id:string}>("select cover_pool_action('save',$1,null,$2) id",[issue,draft]);
 return {id:result.rows[0].id,path,draft};
}
const act=(db:PGlite,op:string,id:string,confirmed=false)=>db.query("select cover_pool_action($1,$2,$3,'{}',$4)",[op,issue,id,confirmed]);

test("candidate cap, draft privacy, immutable submissions, vote changes and audited selection",async()=>{
 const db=await fixture();try{
  const a=await save(db), b=await save(db);
  await assert.rejects(save(db),/up to 2/);
  await as(db,moderator);await act(db,"submit",a.id);await act(db,"submit",b.id);
  await assert.rejects(db.query("select cover_pool_action('save',$1,$2,$3)",[issue,a.id,a.draft]),/Only your draft/);
  await act(db,"vote",a.id);await act(db,"vote",b.id);
  assert.equal((await db.query("select * from issue_cover_votes")).rows.length,1);
  await assert.rejects(act(db,"select",b.id),/Confirm/);
  await assert.rejects(db.query("select cover_pool_action('select',$1,$2,'{}',null)",[issue,b.id]),/Confirm/);
  await assert.rejects(act(db,"select",a.id,true),/most votes/);
  await act(db,"select",b.id,true);
  await assert.rejects(act(db,"vote",a.id),/closed/);
  await assert.rejects(act(db,"withdraw",b.id),/closed/);
  await assert.rejects(db.query("select save_issue_cover($1)",[payload]),/confirmed Cover Pool/);
  await assert.rejects(db.query("delete from issue_cover_candidates where id=$1",[b.id]),/permission denied/);
  await db.exec("reset role");
  assert.equal((await db.query<{cover_art:string}>("select cover_art from issues")).rows[0].cover_art,b.path);
  assert.equal((await db.query("select * from issue_cover_audit where details ? 'selection'")).rows.length,1);
  // Selected artwork is still private until the issue is archived.
  await db.exec("set role anon");
  assert.equal((await db.query("select * from storage.objects")).rows.length,0);
  await db.exec("reset role");await db.exec("update issues set status='archived'");await db.exec("set role anon");
  assert.deepEqual((await db.query<{name:string}>("select name from storage.objects")).rows,[{name:b.path}]);
  await assert.rejects(db.query("select * from issue_cover_candidates"),/permission denied/);
  await assert.rejects(db.query("select * from issue_cover_votes"),/permission denied/);
 }finally{await db.close();}
});

test("member, contributor, suspended moderator and anonymous access fail at RPC and RLS",async()=>{
 const db=await fixture();try{
  const a=await save(db);await act(db,"submit",a.id);
  for(const role of ["member","contributor","moderator"]){
   await db.exec("reset role");await db.query("update profiles set role=$1,account_status=$2 where id=$3",[role,role==="moderator"?"suspended":"active",editor]);
   await as(db,editor);
   assert.equal((await db.query("select * from issue_cover_candidates")).rows.length,0);
   assert.equal((await db.query("select * from issue_cover_votes")).rows.length,0);
   assert.equal((await db.query("select * from storage.objects")).rows.length,0);
   for(const op of ["save","submit","vote","select","withdraw"])await assert.rejects(act(db,op,a.id,true),/Moderator access/);
   await assert.rejects(db.query("select save_issue_cover_internal($1)",[payload]),/permission denied/);
  }
  await db.exec("reset role;set role anon");await assert.rejects(act(db,"vote",a.id),/permission denied/);
 }finally{await db.close();}
});

test("incomplete drafts remain private, cannot submit, and withdrawal retires its slot",async()=>{
 const db=await fixture();try{
  const a=await save(db,moderator,{cover_art_alt:""});
  await assert.rejects(act(db,"submit",a.id),/alt text/);
  await db.exec("reset role");await db.query("update profiles set role='moderator' where id=$1",[editor]);await as(db,editor);
  assert.equal((await db.query("select * from issue_cover_candidates")).rows.length,0);
  assert.equal((await db.query("select * from storage.objects")).rows.length,0);
  await as(db,admin);assert.equal((await db.query("select * from issue_cover_candidates")).rows.length,1);
  await as(db,moderator);await db.query("select cover_pool_action('save',$1,$2,$3)",[issue,a.id,a.draft={...a.draft,cover_art_alt:"Private art"}]);
  await act(db,"submit",a.id);await act(db,"vote",a.id);await act(db,"withdraw",a.id);
  assert.equal((await db.query("select * from issue_cover_votes")).rows.length,0);
  await assert.rejects(act(db,"submit",a.id),/Only your draft/);
 }finally{await db.close();}
});
