import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile("supabase/migrations/202609230002_admin_dashboard.sql", "utf8");
const admin="00000000-0000-4000-8000-000000000001", moderator="00000000-0000-4000-8000-000000000002", member="00000000-0000-4000-8000-000000000003";
async function fixture() {
  const db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table auth.users(id uuid primary key,email varchar(255));
    create table profiles(id uuid primary key,display_name text,role text,account_status text default 'active',created_at timestamptz default now());
    create table editorial_access_grants(id uuid primary key default gen_random_uuid(),user_id uuid,access_level text,revoked_at timestamptz);
    insert into auth.users values ('${admin}','owner@example.com'),('${moderator}','reviewer@example.com'),('${member}','son@example.com');
    insert into profiles values ('${admin}','Owner','admin','active',now()),('${moderator}','Reviewer','moderator','active',now()),('${member}','Son','member','active',now());`);
  await db.exec(migration);
  await db.exec(await readFile("supabase/migrations/202609230003_admin_directory_return_type.sql", "utf8")); return db;
}
async function as(db:PGlite,id:string){await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec("set role authenticated");}

test("only active admins can search the paginated private member directory",async()=>{const db=await fixture();try{
  await as(db,moderator);await assert.rejects(db.query("select * from admin_member_directory()"),/Administrator access required/);
  await as(db,admin);const rows=(await db.query<any>("select * from admin_member_directory('son','all','active','name',25,0)")).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].email,"son@example.com");assert.equal(Number(rows[0].total_count),1);
}finally{await db.close();}});

test("directory exposes existing grants and hierarchy without treating moderators as admins",async()=>{const db=await fixture();try{
  await db.exec(`insert into editorial_access_grants(user_id,access_level) values('${member}','editor')`);await as(db,admin);
  const editor=(await db.query<any>("select * from admin_member_directory('son','editor')")).rows[0];
  assert.equal(editor.editorial_access,true);assert.equal(editor.role,"member");
  const admins=(await db.query<any>("select email from admin_member_directory('','admin')")).rows;
  assert.deepEqual(admins.map(r=>r.email),["owner@example.com"]);
}finally{await db.close();}});
