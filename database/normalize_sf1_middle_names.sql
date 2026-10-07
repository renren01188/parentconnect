-- Repair legacy SF1 registration records such as `FERANIL, `.
-- This is intentionally limited to middle_name: hyphens and apostrophes remain unchanged.
update public.student_family_members
set middle_name = nullif(
  btrim(regexp_replace(regexp_replace(middle_name, '[,，]+', ' ', 'g'), '\\s+', ' ', 'g')),
  ''
)
where middle_name ~ '[,，]' or middle_name <> btrim(middle_name) or middle_name ~ '\\s{2,}';
