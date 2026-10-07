-- Parent enrollment and safe LRN correction.
-- Apply through the normal Supabase migration workflow before deploying the
-- ICT User Management route that calls rename_student_lrn.

-- One email represents one parent account. Stop safely for staff review if a
-- legacy installation already contains duplicate normalized addresses; never
-- merge people automatically in a migration.
do $$
begin
  if exists (
    select 1
    from public.parents
    where nullif(btrim(email), '') is not null
    group by lower(btrim(email))
    having count(*) > 1
  ) then
    raise exception 'Resolve duplicate parent email addresses before applying parent enrollment integrity.';
  end if;
end;
$$;

create unique index if not exists parents_email_normalized_unique_idx
  on public.parents (lower(btrim(email)));

-- LRN is a mutable school identifier. These references must follow a
-- correction atomically rather than being reassigned to an unrelated student.
alter table public.parent_student_links
  drop constraint if exists parent_student_links_student_id_fkey;
alter table public.parent_student_links
  add constraint parent_student_links_student_id_fkey
  foreign key (student_id) references public.students(student_id)
  on delete cascade on update cascade;

alter table public.parents
  drop constraint if exists parents_student_id_fkey;
alter table public.parents
  add constraint parents_student_id_fkey
  foreign key (student_id) references public.students(student_id)
  on delete cascade on update cascade;

alter table public.excuse_letters
  drop constraint if exists excuse_letters_student_id_fkey;
alter table public.excuse_letters
  add constraint excuse_letters_student_id_fkey
  foreign key (student_id) references public.students(student_id)
  on update cascade;

create or replace function public.rename_student_lrn(
  p_student_db_id integer,
  p_new_student_id text
)
returns table (id integer, student_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_new_student_id text := regexp_replace(coalesce(p_new_student_id, ''), '\D', '', 'g');
begin
  if v_new_student_id !~ '^\d{12}$' then
    raise exception 'An LRN must contain exactly 12 digits.' using errcode = '22023';
  end if;

  select * into v_student
  from public.students
  where students.id = p_student_db_id
  for update;

  if not found then
    raise exception 'Student record not found.' using errcode = 'P0002';
  end if;

  if v_student.student_id = v_new_student_id then
    return query select v_student.id, v_student.student_id;
    return;
  end if;

  if exists (
    select 1 from public.students
    where students.student_id = v_new_student_id
      and students.id <> p_student_db_id
  ) then
    raise exception 'The replacement LRN is already assigned to another student.' using errcode = '23505';
  end if;

  update public.students
  set student_id = v_new_student_id
  where students.id = p_student_db_id;

  return query
  select students.id, students.student_id
  from public.students
  where students.id = p_student_db_id;
end;
$$;

revoke all on function public.rename_student_lrn(integer, text) from public, anon, authenticated;
grant execute on function public.rename_student_lrn(integer, text) to service_role;
