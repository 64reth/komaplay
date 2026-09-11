-- Replace only the known in-house development VHS placeholder. Historical
-- migrations remain immutable; existing feature history is otherwise untouched.
update public.features
set image = '/assets/koma-vhs-v2.png',
    image_alt = case
      when image_alt ilike '%VHS%' then 'An in-house KOMA://PLAY VHS tape'
      else image_alt
    end,
    updated_at = now()
where image in ('/assets/clue-vhs.png', '/assets/koma-vhs.png');
