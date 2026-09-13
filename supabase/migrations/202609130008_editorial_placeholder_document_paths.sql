-- Normalize current editorial working documents that still serialize the old
-- non-existent no-image fallback path. Historical snapshots remain untouched.

update public.editorial_documents ed
   set working_document = replace(ed.working_document::text,'/assets/koma-vhs-v2.svg','/assets/koma-feature-placeholder.svg')::jsonb,
       updated_at = now(),
       revision_token = gen_random_uuid()
 where ed.working_document::text like '%/assets/koma-vhs-v2.svg%';
