-- Retire only the four positively identified production prototype records.
-- No deletes: Workshop contributions, citations, revisions, assets and history remain.
-- Other installations with different seed UUIDs are intentionally unaffected.
do $$
declare seed record; existing public.features;
begin
 -- Prevent a concurrent editorial conversion between the guard and retirement.
 lock table public.features, public.editorial_documents in share row exclusive mode;
 for seed in select * from (values
  ('ec8c0b46-fe86-48b2-afa5-ececca8598f3'::uuid,'time','ocarina','/assets/clue-ocarina.png'),
  ('2455f99e-3c4d-4941-9164-3e9aedbf97c7'::uuid,'vice','vice','/assets/clue-seat.png'),
  ('7500f1f6-e5a8-43af-a835-44001615052a'::uuid,'tokon','tokon','/assets/clue-shield.png'),
  ('f479d5e1-083d-42d7-9247-63a60cda38be'::uuid,'afterimage','vhs','/assets/koma-vhs-v2.png')
 ) as seeds(id,slug,panel_class,image)
 loop
  select * into existing from public.features where id=seed.id;
  if not found then continue; end if;
  if existing.slug is distinct from seed.slug
     or existing.panel_class is distinct from seed.panel_class
     or existing.image is distinct from seed.image
     or exists(select 1 from public.editorial_documents where feature_id=seed.id)
     or exists(select 1 from public.published_additions where feature_id=seed.id)
     or exists(select 1 from public.panel_citations where feature_id=seed.id)
  then raise exception 'Legacy seed retirement guard failed for %',seed.id; end if;
  if existing.status='archived' and existing.lifecycle_status='taken_down' then continue; end if;
  if existing.status<>'published' or existing.lifecycle_status<>'open_panel'
  then raise exception 'Legacy seed lifecycle changed for %',seed.id; end if;
  update public.features set status='archived',lifecycle_status='taken_down',updated_at=now()
   where id=seed.id;
 end loop;
end $$;
