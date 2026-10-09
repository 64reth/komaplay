import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  contentEqual,
  recoverableLocal,
  recoveryChoice,
  type WorkshopDraft,
} from "../../router-app/lib/workshop-recovery";
import { contributionState } from "../../router-app/lib/contribution-state";

test("recovery preserves newer writing and handles an ambiguous submitted response", () => {
  const local: WorkshopDraft = {
    id: "draft",
    feature_id: "panel",
    version: 1,
    payload: { title: "My writing", body: "Private" },
    revision_target: null,
    submitted_contribution_id: null,
  };
  assert.equal(
    contentEqual({ title: "t", body: "b" }, { body: "b", title: "t" }),
    true,
  );
  assert.equal(
    recoveryChoice(local, {
      ...local,
      payload: { body: "Private", title: "My writing" },
    }),
    "remote",
  );
  assert.equal(
    recoveryChoice({ ...local, payload: { body: "New local writing" } }, local),
    "local",
  );
  assert.equal(
    recoveryChoice(
      { ...local, payload: { body: "New local writing" } },
      { ...local, version: 2 },
    ),
    "conflict",
  );
  assert.equal(
    recoveryChoice(local, { ...local, submitted_contribution_id: "canonical" }),
    "submitted",
  );
  assert.equal(
    recoveryChoice(
      { ...local, payload: { body: "New local writing" } },
      { ...local, submitted_contribution_id: "canonical" },
    ),
    "conflict",
  );
  assert.equal(recoveryChoice(local, null), "conflict");
  assert.equal(recoveryChoice({ ...local, version: 0 }, null), "local");
  assert.equal(recoverableLocal("{broken"), null);
  assert.equal(
    recoverableLocal(
      JSON.stringify({ draft: local, updated: 0 }),
      31 * 86400000,
    ),
    null,
  );
  assert.equal(
    recoverableLocal(JSON.stringify({ draft: local, updated: 100 }), 101)?.draft
      .id,
    "draft",
  );
});
test("acceptance and incorporation never imply public publication", () => {
  assert.equal(
    contributionState({ status: "Accepted" }),
    "ACCEPTED · NOT YET PUBLISHED",
  );
  assert.equal(
    contributionState({ status: "Accepted", incorporated_at: "now" }),
    "INCORPORATED · NOT CURRENTLY PUBLIC",
  );
  assert.equal(
    contributionState({ status: "Accepted" }, true, true),
    "PUBLISHED · CITED",
  );
  assert.equal(contributionState({ status: "Submitted" }), "SUBMITTED");
});

test("complete SQL chain: private drafts, atomic submission receipts, saves and safety reports", async (t) => {
  const db = new PGlite();
  const admin = "00000000-0000-4000-8000-000000000099",
    owner = "00000000-0000-4000-8000-000000000001",
    other = "00000000-0000-4000-8000-000000000002",
    draft = "00000000-0000-4000-8000-000000000003";
  const as = async (id: string, role = "authenticated") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec(`set role ${role}`);
  };
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth,storage to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text default auth.uid()::text);
 alter table storage.objects enable row level security;grant select,insert on storage.objects to anon,authenticated;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`);
    for (const file of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      if (file === "202609110009_koma_handbook_panel_repair.sql")
        await db.exec(
          `insert into auth.users(id) values('${admin}');update profiles set role='admin' where id='${admin}'`,
        );
      await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
      if (file === "202609290002_public_attribution_boundary.sql") {
        assert.equal(
          (
            await db.query<any>(
              "select has_table_privilege('anon','public.published_additions','select') legacy",
            )
          ).rows[0].legacy,
          true,
          "Additive stage must preserve the old Worker interface",
        );
        assert.ok(
          (
            await db.query<any>(
              "select pg_get_viewdef('public.public_profiles'::regclass) definition",
            )
          ).rows[0].definition.includes("profiles p"),
        );
        assert.ok(
          !(
            await db.query<any>(
              "select pg_get_functiondef('public.public_editorial_document(text)'::regprocedure) definition",
            )
          ).rows[0].definition.includes("publication_document"),
        );
        assert.equal(
          (
            await db.query<any>(
              "select has_function_privilege('anon','public.public_attributed_document(text)','execute') ready",
            )
          ).rows[0].ready,
          true,
        );
      }
    }
    await db.query("insert into auth.users(id) values($1),($2)", [
      owner,
      other,
    ]);
    const version = (
      await db.query<any>(
        "select id,content_hash,statement_version from handbook_versions where active",
      )
    ).rows[0];
    for (const id of [owner, other, admin]) {
      await as(id);
      await db.query("select accept_handbook($1,$2,$3,true)", [
        version.id,
        version.content_hash,
        version.statement_version,
      ]);
    }
    await db.exec("reset role");
    await t.test(
      "production rollback smoke is valid against the complete migration chain",
      async () => {
        await db.exec(
          await readFile("scripts/phase1-production-checks.sql", "utf8"),
        );
      },
    );
    await t.test(
      "ecosystem production RPC/RLS smoke rolls back safely",
      async () => {
        await db.exec(
          await readFile("scripts/ecosystem-production-checks.sql", "utf8"),
        );
      },
    );
    await t.test(
      "polish correction workflow protects original text and concurrent review",
      async () => {
        await db.exec(
          await readFile("scripts/polish-production-checks.sql", "utf8"),
        );
      },
    );
    const feature = (
      await db.query<any>(
        "select id,issue_id from features where feature_is_public(id) limit 1",
      )
    ).rows[0];
    assert.ok(feature);
    await db.query(
      "update issues set opens_at=now()-interval '1 day',closes_at=now()+interval '1 day' where id=$1",
      [feature.issue_id],
    );
    await db.query(
      "update features set lifecycle_status='open_panel',deadline_override=now()+interval '1 day' where id=$1",
      [feature.id],
    );
    await as(owner);
    const save = async (id: string, v: number, p: object) =>
      (
        await db.query<any>("select (save_workshop_draft($1,$2,$3,$4)).*", [
          id,
          feature.id,
          v,
          p,
        ])
      ).rows[0];
    const screenshot = owner + "/00000000-0000-4000-8000-000000000044.png";
    await db.query(
      "insert into storage.objects(bucket_id,name) values('open-panel-screenshots',$1)",
      [screenshot],
    );
    const payload = {
      feature_id: feature.id,
      type: "Tip",
      title: "A private proposal",
      body: "Substantial context retained through a failed network response.",
      target_section: "Contribution",
      source_url: "",
      media_url: "",
      screenshot_path: screenshot,
      public_credit: "Anonymous Panelist",
      publication_consent: true,
    };
    await t.test("atomic access transitions and safe monthly rollover", async () => {
      await db.exec("reset role");
      await db.exec(await readFile("scripts/access-rollover-production-checks.sql", "utf8"));
      await as(owner);
    });
    await t.test("a mid-archive failure rolls back membership and retries cleanly", async () => {
      await db.exec("reset role");
      const sql = (await readFile("scripts/access-rollover-production-checks.sql", "utf8")).replace(
        "update public.features set deadline_override=null where id=fid;",
        `update public.features set deadline_override=null where id=fid;
         alter table public.issue_cover_audit add constraint simulated_archive_failure check(action<>'archive-validated') not valid;
         perform public.run_issue_rollover();
         if not exists(select 1 from public.issue_rollover where issue_id=iid and phase='error') then raise exception 'Failure not visible';end if;
         if exists(select 1 from public.features where id=fid and lifecycle_status='archived') then raise exception 'Partial archive survived failure';end if;
         alter table public.issue_cover_audit drop constraint simulated_archive_failure;`,
      );
      await db.exec(sql);
      await as(owner);
    });

    await t.test(
      "incomplete autosave, same-content retry and stale-tab rejection",
      async () => {
        assert.equal(
          (await save(draft, 0, { title: "Unfinished" })).version,
          1,
        );
        await assert.rejects(
          db.query("select submit_workshop_draft($1,1)", [draft]),
        );
        assert.equal(
          (
            await db.query<any>(
              "select payload from workshop_drafts where id=$1",
              [draft],
            )
          ).rows[0].payload.title,
          "Unfinished",
        );
        assert.equal((await save(draft, 1, payload)).version, 2);
        assert.equal((await save(draft, 1, payload)).version, 2);
        await assert.rejects(
          save(draft, 1, { ...payload, body: "Stale overwrite" }),
          /Newer draft/,
        );
      },
    );
    let canonical: string;
    await t.test(
      "submission retry returns one canonical contribution and resolves the draft",
      async () => {
        canonical = (
          await db.query<any>("select submit_workshop_draft($1,2) id", [draft])
        ).rows[0].id;
        assert.equal(
          (
            await db.query<any>("select submit_workshop_draft($1,2) id", [
              draft,
            ])
          ).rows[0].id,
          canonical,
        );
        assert.equal(
          (await save(draft, 2, payload)).submitted_contribution_id,
          canonical,
        );
        assert.equal(
          (
            await db.query<any>(
              "select count(*)::int n from contributions where author_id=$1",
              [owner],
            )
          ).rows[0].n,
          1,
        );
        await assert.rejects(
          save(draft, 2, {
            ...payload,
            body: "Do not overwrite submitted work",
          }),
          /submitted/,
        );
        const direct = { ...payload, request_key: draft };
        assert.equal(
          (await db.query<any>("select save_contribution($1) id", [direct]))
            .rows[0].id,
          canonical,
        );
        await assert.rejects(
          db.query("select save_contribution($1)", [
            { ...direct, title: "Changed retry" },
          ]),
          /different content/,
        );
        assert.deepEqual(
          (await db.query("select * from my_contribution_publication()")).rows,
          [{ contribution_id: canonical, published: false, cited: false }],
        );
      },
    );
    await t.test(
      "private save/unsave is idempotent and reporting works on an open panel",
      async () => {
        await db.query("select set_feature_saved($1,true)", [feature.id]);
        await db.query("select set_feature_saved($1,true)", [feature.id]);
        assert.equal(
          (await db.query("select * from saved_features")).rows.length,
          1,
        );
        const args = [
          feature.id,
          "Safety concern",
          "Private concern about harassment, please investigate.",
          "",
        ];
        const id = (
          await db.query<any>("select submit_correction($1,$2,$3,$4) id", args)
        ).rows[0].id;
        assert.equal(
          (
            await db.query<any>(
              "select submit_correction($1,$2,$3,$4) id",
              args,
            )
          ).rows[0].id,
          id,
        );
        assert.equal(
          (await db.query("select * from correction_reports")).rows.length,
          1,
        );
        await assert.rejects(
          db.query(
            "insert into saved_features(user_id,feature_id) values($1,$2)",
            [other, feature.id],
          ),
          /permission denied/,
        );
      },
    );
    await t.test(
      "cross-user isolation, actual moderator access and anonymous denial",
      async () => {
        await as(other);
        assert.equal(
          (await db.query("select * from workshop_drafts")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from saved_features")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from correction_reports")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from correction_audit")).rows.length,
          0,
        );
        await assert.rejects(save(draft, 2, payload), /unavailable/);
        await assert.rejects(
          db.query("select submit_workshop_draft($1,2)", [draft]),
          /unavailable/,
        );
        await db.query("select set_feature_saved($1,false)", [feature.id]);
        await db.exec("reset role");
        await db.query(
          "insert into editorial_access_grants(user_id,access_level,granted_by) values($1,'administrator',$2)",
          [other, admin],
        );
        await as(other);
        assert.equal(
          (await db.query("select * from correction_reports")).rows.length,
          0,
        );
        await as(admin);
        assert.equal(
          (await db.query("select * from correction_reports")).rows.length,
          1,
        );
        assert.equal(
          (await db.query("select * from workshop_drafts")).rows.length,
          0,
        );
        await as("", "anon");
        for (const table of [
          "workshop_drafts",
          "saved_features",
          "workshop_submission_receipts",
          "correction_reports",
        ])
          await assert.rejects(
            db.query("select * from " + table),
            /permission denied/,
          );
        await assert.rejects(
          db.query("select set_feature_saved($1,true)", [feature.id]),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select submit_workshop_draft($1,2)", [draft]),
          /permission denied/,
        );
        await as(owner);
        assert.equal(
          (await db.query("select * from saved_features")).rows.length,
          1,
        );
        await db.query("select set_feature_saved($1,false)", [feature.id]);
        assert.equal(
          (await db.query("select * from saved_features")).rows.length,
          0,
        );
      },
    );
    await t.test(
      "accepted is not published; independent incorporation creates truthful private status and anonymous credit",
      async () => {
        await as(admin);
        await db.query(
          "select moderate_contribution_current($1,(select edit_version from contributions where id=$1),'Accepted','Suitable')",
          [canonical!],
        );
        await as(owner);
        assert.equal(
          (await db.query<any>("select * from my_contribution_publication()"))
            .rows[0].published,
          false,
        );
        await as(admin);
        await db.query(
          "select prepare_contribution_incorporation($1,$2,$3,$4)",
          [
            canonical!,
            "Edited heading",
            "Useful edited contribution with enough context.",
            "Prepared for independent review",
          ],
        );
        await assert.rejects(
          db.query(
            "select review_contribution_incorporation($1,'approve','')",
            [canonical!],
          ),
          /Independent review/,
        );
        await as(admin);
        await db.exec("reset role");
        await db.query("update profiles set role='moderator' where id=$1", [
          other,
        ]);
        await as(other);
        await db.query(
          "select review_contribution_incorporation($1,'approve','')",
          [canonical!],
        );
        await db.query("select publish_contribution_incorporation($1)", [
          canonical!,
        ]);
        await as(owner);
        assert.deepEqual(
          (await db.query("select * from my_contribution_publication()")).rows,
          [{ contribution_id: canonical!, published: true, cited: true }],
        );
        await as("", "anon");
        assert.equal(
          (
            await db.query<any>(
              "select public_credit from public_citations where feature_id=$1",
              [feature.id],
            )
          ).rows[0].public_credit,
          "Anonymous Panelist",
        );
        assert.equal(
          (await db.query("select * from public_profiles where id=$1", [owner]))
            .rows.length,
          0,
        );
        const anonRows = (
          await db.query<any>(
            "select * from public_additions where feature_id=$1",
            [feature.id],
          )
        ).rows;
        const anonPublic = JSON.stringify({
          additions: anonRows,
          revisions: (await db.query("select * from public_revisions")).rows,
          citations: (await db.query("select * from public_citations")).rows,
        });
        for (const secret of [owner, admin, other, canonical!, screenshot])
          assert.ok(!anonPublic.includes(secret), secret + " leaked");
        assert.equal(anonRows[0].credit_id, null);
        assert.equal(anonRows[0].anonymous, true);
        assert.match(
          anonRows[0].screenshot_path,
          /^\/api\/public-media\/[0-9a-f-]{36}$/,
        );
        for (const table of [
          "published_additions",
          "revisions",
          "panel_citations",
          "publication_media_refs",
          "publication_credits",
          "features",
          "issues",
        ])
          await assert.rejects(
            db.query("select * from " + table),
            /permission denied/,
          );
        assert.equal(
          (
            await db.query("select * from storage.objects where bucket_id=$1", [
              "open-panel-screenshots",
            ])
          ).rows.length,
          0,
        );
        const anonMedia = anonRows[0].screenshot_path.split("/").at(-1);
        await assert.rejects(
          db.query("select publication_text($1,$2,'addition')", [
            screenshot,
            anonRows[0].id,
          ]),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select created_by from handbook_versions"),
          /permission denied/,
        );
        assert.ok(
          (
            await db.query(
              "select id,label from handbook_versions where active",
            )
          ).rows.length,
        );
        assert.ok(
          (await db.query("select * from public_features")).rows.length,
        );
        assert.ok((await db.query("select * from weekly_drops")).rows.length);
        assert.ok((await db.query("select * from public_issues")).rows.length);
        await assert.rejects(
          db.query("select * from resolve_publication_media($1)", [anonMedia]),
          /permission denied/,
        );
        await as(owner);
        assert.equal(
          (
            await db.query<any>(
              "select author_id,screenshot_path from contributions where id=$1",
              [canonical!],
            )
          ).rows[0].author_id,
          owner,
        );
        assert.equal(
          (
            await db.query<any>(
              "select contributor_id from published_additions where contribution_id=$1",
              [canonical!],
            )
          ).rows[0].contributor_id,
          owner,
        );
        assert.equal(
          (
            await db.query("select * from storage.objects where name=$1", [
              screenshot,
            ])
          ).rows.length,
          1,
        );
        await db.query(
          "update profiles set pen_name='Published Pen',display_name='Private Account Name' where id=$1",
          [owner],
        );
        const named = (
          await db.query<any>("select save_contribution($1) id", [
            {
              ...payload,
              title: "Named second proposal",
              public_credit: "Pen name",
              request_key: "00000000-0000-4000-8000-000000000077",
            },
          ])
        ).rows[0].id;
        await as(admin);
        assert.equal(
          (
            await db.query<any>(
              "select contributor_id from published_additions where contribution_id=$1",
              [canonical!],
            )
          ).rows[0].contributor_id,
          owner,
        );
        await db.query(
          "select moderate_contribution_current($1,(select edit_version from contributions where id=$1),'Accepted','Suitable')",
          [named],
        );
        await db.query(
          "select prepare_contribution_incorporation($1,$2,$3,$4)",
          [
            named,
            "Named publication",
            "Named contribution with enough reviewed context.",
            "Ready",
          ],
        );
        await as(other);
        assert.equal(
          (
            await db.query<any>(
              "select author_id from contributions where id=$1",
              [canonical!],
            )
          ).rows[0].author_id,
          owner,
        );
        await db.query(
          "select review_contribution_incorporation($1,'approve','')",
          [named],
        );
        await db.query("select publish_contribution_incorporation($1)", [
          named,
        ]);
        await as("", "anon");
        const namedRows = (
          await db.query<any>(
            "select * from public_additions where feature_id=$1 order by revision_number",
            [feature.id],
          )
        ).rows;
        assert.equal(namedRows[1].public_credit, "Published Pen");
        assert.notEqual(namedRows[1].credit_id, owner);
        assert.notEqual(
          namedRows[1].screenshot_path,
          namedRows[0].screenshot_path,
          "Asset token must be publication-scoped even for a reused file",
        );
        const publicFixture = {
          rows: namedRows,
          profiles: (await db.query("select * from public_profiles")).rows,
          revisions: (await db.query("select * from public_revisions")).rows,
          citations: (await db.query("select * from public_citations")).rows,
        };
        const allPublic = JSON.stringify(publicFixture);
        if (process.env.KOMA_PRIVACY_FIXTURE_OUT)
          await writeFile(process.env.KOMA_PRIVACY_FIXTURE_OUT, allPublic);
        for (const secret of [
          owner,
          canonical!,
          named,
          "Private Account Name",
          screenshot,
        ])
          assert.ok(!allPublic.includes(secret));
        await as("", "service_role");
        assert.equal(
          (
            await db.query<any>("select * from resolve_publication_media($1)", [
              anonMedia,
            ])
          ).rows[0].path,
          screenshot,
        );
        await db.exec("reset role");
        const unapproved = other + "/00000000-0000-4000-8000-000000000090.png";
        await db.query(
          "update published_additions set body=$1 where contribution_id=$2",
          [
            "Text is not asset publication authority: " + unapproved,
            canonical!,
          ],
        );
        const unapprovedRef = (
          await db.query<any>(
            "select id from publication_media_refs where path=$1",
            [unapproved],
          )
        ).rows[0].id;
        await as("", "service_role");
        assert.equal(
          (
            await db.query("select * from resolve_publication_media($1)", [
              unapprovedRef,
            ])
          ).rows.length,
          0,
          "Text references cannot expose somebody else's private upload",
        );
        await db.exec("reset role");
        await db.query(
          "update features set lifecycle_status='taken_down' where id=$1",
          [feature.id],
        );
        await as(owner);
        assert.ok(
          (
            await db.query<any>("select * from my_contribution_publication()")
          ).rows.every((r) => !r.published && !r.cited),
        );
        await db.exec("reset role");
        assert.equal(
          (
            await db.query("select * from resolve_publication_media($1)", [
              anonMedia,
            ])
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "public cover projection hides staff and storage provenance and exposes only archived selected art",
      async () => {
        await as(admin);
        await db.exec("reset role");
        const issue = "00000000-0000-4000-8000-000000000088",
          panel = "00000000-0000-4000-8000-000000000089";
        await db.query(
          "insert into issues(id,issue_number,slug,title,year,month,status,opens_at,closes_at,created_by) values($1,20000,'privacy-cover','Private compilation',2199,12,'draft',now(),now()+interval '1 month',$2)",
          [issue, admin],
        );
        const drop = (
          await db.query<any>(
            "insert into weekly_drops(issue_id,week_number,label,status,published_at) values($1,1,'Privacy fixture','published',now()) returning id",
            [issue],
          )
        ).rows[0].id;
        await db.query(
          "insert into features(id,issue_id,weekly_drop_id,slug,title,status,lifecycle_status) values($1,$2,$3,'privacy-cover-panel','Cover panel','published','final_panel')",
          [panel, issue, drop],
        );
        await as(admin);
        const first =
            "cover-pool/00000000-0000-4000-8000-000000000011/00000000-0000-4000-8000-000000000012.png",
          second =
            "cover-pool/00000000-0000-4000-8000-000000000021/00000000-0000-4000-8000-000000000022.png";
        await db.query(
          "insert into storage.objects(bucket_id,name,owner_id) values('issue-cover-pool',$1,$3),('issue-cover-pool',$2,$3)",
          [first, second, admin],
        );
        const content = {
          cover_art: first,
          cover_art_alt: "Selected art",
          lead_feature_id: panel,
          lead_headline: "Published cover",
          cover_preset: "minimal",
          secondary_cover_lines: [],
        };
        const chosen = (
          await db.query<any>(
            "select cover_pool_action('save',$1,null,$2) id",
            [issue, content],
          )
        ).rows[0].id;
        await db.query("select cover_pool_action('save',$1,null,$2)", [
          issue,
          { ...content, cover_art: second },
        ]);
        await db.query("select cover_pool_action('submit',$1,$2)", [
          issue,
          chosen,
        ]);
        await db.query("select cover_pool_action('select',$1,$2,'{}',true)", [
          issue,
          chosen,
        ]);
        await as("", "anon");
        assert.equal(
          (await db.query("select * from public_issues where id=$1", [issue]))
            .rows.length,
          0,
        );
        await as(admin);
        await db.exec("reset role");
        await db.query(
          "update issues set status='archived',archived_at=now() where id=$1",
          [issue],
        );
        await as("", "anon");
        const published = (
          await db.query<any>("select * from public_issues where id=$1", [
            issue,
          ])
        ).rows[0];
        for (const secret of [
          admin,
          first,
          second,
          chosen,
          "created_by",
          "cover_updated_by",
        ])
          assert.ok(!JSON.stringify(published).includes(secret));
        assert.match(
          published.cover_art,
          /^\/api\/public-media\/[0-9a-f-]{36}$/,
        );
        assert.equal(
          (
            await db.query(
              "select * from storage.objects where bucket_id='issue-cover-pool'",
            )
          ).rows.length,
          0,
        );
        await assert.rejects(
          db.query("select * from issue_cover_candidates"),
          /permission denied/,
        );
        await as(admin);
        await db.exec("reset role");
        const ref = published.cover_art.split("/").at(-1);
        assert.equal(
          (
            await db.query<any>("select * from resolve_publication_media($1)", [
              ref,
            ])
          ).rows[0].path,
          first,
        );
        assert.equal(
          (
            await db.query(
              "select id from publication_media_refs where path=$1",
              [second],
            )
          ).rows.length,
          0,
        );
        await db.query(
          "update issues set status='draft',archived_at=null where id=$1",
          [issue],
        );
        assert.equal(
          (await db.query("select * from resolve_publication_media($1)", [ref]))
            .rows.length,
          0,
        );
      },
    );
    await t.test(
      "broad preferences, private duplicate-safe Inbox and mixed attribution remain isolated",
      async () => {
        await as(owner);
        await db.query("select set_member_preferences($1)", [
          ["gaming", "anime"],
        ]);
        assert.deepEqual(
          (
            await db.query<any>("select interests from profiles where id=$1", [
              owner,
            ])
          ).rows[0].interests,
          ["anime", "gaming"],
        );
        await assert.rejects(
          db.query("select set_member_preferences($1)", [["franchise"]]),
          /Invalid category/,
        );
        await assert.rejects(
          db.query(
            "update profiles set interests=array['franchise'] where id=$1",
            [owner],
          ),
          /Choose Gaming/,
        );
        assert.equal(
          (
            await db.query<any>("select role from profiles where id=$1", [
              owner,
            ])
          ).rows[0].role,
          "member",
        );
        assert.ok(
          (await db.query("select * from my_citation_history()")).rows.length >=
            2,
        );
        const events = (
          await db.query<any>("select * from my_editorial_inbox()")
        ).rows;
        assert.ok(events.some((e) => e.kind === "status"));
        assert.ok(events.some((e) => e.kind === "cited"));
        assert.ok(events.some((e) => e.kind === "published"));
        assert.ok(events.some((e) => e.kind === "incorporated"));
        assert.equal(
          (await db.query("select * from my_editorial_inbox()")).rows.length,
          events.length,
        );
        const event = events[0];
        await db.query("select set_inbox_read($1,true)", [event.id]);
        assert.ok(
          (
            await db.query<any>(
              "select read_at from member_inbox where id=$1",
              [event.id],
            )
          ).rows[0].read_at,
        );
        await as(other);
        assert.equal(
          (await db.query("select * from member_inbox")).rows.length,
          0,
        );
        assert.equal(
          (await db.query<any>("select set_inbox_read($1,true) ok", [event.id]))
            .rows[0].ok,
          false,
        );
        await assert.rejects(
          db.query(
            "select deliver_editorial_event($1,'fake','published',$2,null,'Forged')",
            [owner, feature.id],
          ),
          /permission denied/,
        );
        await as(admin);
        assert.equal(
          (
            await db.query("select * from member_inbox where user_id=$1", [
              owner,
            ])
          ).rows.length,
          0,
        );
        await as("", "anon");
        await assert.rejects(
          db.query("select * from member_inbox"),
          /permission denied/,
        );
        for (const sql of [
          "select * from my_editorial_inbox()",
          "select * from my_editorial_publications()",
          "select * from my_citation_history()",
          "select set_member_preferences('{}')",
        ]) {
          await assert.rejects(db.query(sql), /permission denied/);
        }
        const publicRows = await db.query("select * from public_additions");
        const publicJSON = JSON.stringify(publicRows.rows);
        assert.ok(
          !publicJSON.includes(owner) && !publicJSON.includes(event.id),
        );
        await as(owner);
        await db.query("select set_member_preferences('{}')");
        assert.deepEqual(
          (
            await db.query<any>("select interests from profiles where id=$1", [
              owner,
            ])
          ).rows[0].interests,
          [],
        );
      },
    );
    await t.test(
      "suspended account cannot read or mutate private continuity data",
      async () => {
        await as("", "anon");
        await db.exec("reset role");
        await db.query(
          "update profiles set account_status='suspended' where id=$1",
          [owner],
        );
        await as(owner);
        assert.equal(
          (await db.query("select * from workshop_drafts")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from correction_reports")).rows.length,
          0,
        );
        await assert.rejects(save(draft, 2, payload), /active membership/);
        assert.equal(
          (await db.query("select * from member_inbox")).rows.length,
          0,
        );
        await assert.rejects(db.query("select * from my_editorial_inbox()"));
      },
    );
  } finally {
    await db.close();
  }
});
