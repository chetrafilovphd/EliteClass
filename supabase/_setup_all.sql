-- ==========================================================================
-- Elite Class eDiary — FULL SETUP (all migrations concatenated, in order).
-- Paste this whole file into the Supabase SQL Editor and run once.
-- Safe/idempotent on an existing project (create ... if not exists,
-- drop policy if exists, create or replace). Excludes optional demo seed.
-- ==========================================================================



-- ========================= schema.sql =========================
-- Elite Class eDiary — base schema (reconstructed from application code).
-- Idempotent: safe to run on a fresh Supabase project. On an existing project,
-- `create ... if not exists` will NOT alter already-created tables/columns.
--
-- Run order in Supabase SQL Editor (run each file top to bottom):
--   1) schema.sql                 (this file — enums, base tables, helpers, RLS)
--   2) profile_fields.sql         (teacher_title/address check constraint)
--   3) access_and_calendar.sql    (parent_students + school_events + RLS)
--   4) parent_invites.sql         (parent_student_invites + claim RPC)
--   5) admin_user_tools.sql       (admin_list_users RPC)
--   6) storage_homework_files.sql (homework-files bucket + policies)
--   7) storage_profile_avatars.sql(profile-avatars bucket + policies)
--   8) demo_seed_role_data.sql    (optional demo/seed data)
--
-- Helper functions below reference tables that may be created in a later step
-- (e.g. parent_students in access_and_calendar.sql). Disable body validation
-- so forward references are allowed; they resolve at call time.
set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'teacher', 'student', 'parent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attendance_status as enum ('present', 'late', 'absent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.homework_status as enum ('submitted', 'graded', 'returned');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role public.app_role not null default 'student',
  phone text,
  avatar_url text,
  teacher_title text,   -- extended field (teacher honorific/title)
  address text,         -- extended field
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Security-definer helpers (avoid RLS recursion; keep policies readable)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.is_teacher_of_group(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.groups g
    where g.id = gid and (g.teacher_id = auth.uid() or g.created_by = auth.uid())
  );
$$;

create or replace function public.is_student_in_group(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_students gs
    where gs.group_id = gid and gs.student_id = auth.uid()
  );
$$;

create or replace function public.is_parent_of_student(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.parent_students ps
    where ps.student_id = sid and ps.parent_id = auth.uid()
  );
$$;

create or replace function public.is_parent_in_group(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_students gs
    join public.parent_students ps on ps.student_id = gs.student_id
    where gs.group_id = gid and ps.parent_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  language text,
  level text,
  teacher_id uuid references public.profiles (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint groups_name_len check (char_length(name) >= 2)
);
create index if not exists idx_groups_teacher_id on public.groups (teacher_id);
create index if not exists idx_groups_created_by on public.groups (created_by);

-- ---------------------------------------------------------------------------
-- group_students (enrollment)
-- ---------------------------------------------------------------------------
create table if not exists public.group_students (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  unique (group_id, student_id)
);
create index if not exists idx_group_students_group_id on public.group_students (group_id);
create index if not exists idx_group_students_student_id on public.group_students (student_id);

-- ---------------------------------------------------------------------------
-- lessons
-- ---------------------------------------------------------------------------
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  lesson_date date not null,
  topic text not null,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_lessons_group_id on public.lessons (group_id);
create index if not exists idx_lessons_lesson_date on public.lessons (lesson_date);

-- ---------------------------------------------------------------------------
-- attendance
-- ---------------------------------------------------------------------------
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  status public.attendance_status not null default 'present',
  created_at timestamptz not null default now(),
  unique (lesson_id, student_id)
);
create index if not exists idx_attendance_lesson_id on public.attendance (lesson_id);
create index if not exists idx_attendance_student_id on public.attendance (student_id);

-- ---------------------------------------------------------------------------
-- grades
-- ---------------------------------------------------------------------------
create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  grade_value smallint not null,
  title text not null,
  description text,
  graded_on date not null default current_date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint grades_value_range check (grade_value between 2 and 6)
);
create index if not exists idx_grades_group_id on public.grades (group_id);
create index if not exists idx_grades_student_id on public.grades (student_id);

-- ---------------------------------------------------------------------------
-- homeworks
-- ---------------------------------------------------------------------------
create table if not exists public.homeworks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_homeworks_group_id on public.homeworks (group_id);

-- ---------------------------------------------------------------------------
-- homework_submissions
-- ---------------------------------------------------------------------------
create table if not exists public.homework_submissions (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.homeworks (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  status public.homework_status not null default 'submitted',
  file_path text,
  submitted_at timestamptz not null default now(),
  unique (homework_id, student_id)
);
create index if not exists idx_homework_submissions_homework_id on public.homework_submissions (homework_id);
create index if not exists idx_homework_submissions_student_id on public.homework_submissions (student_id);

-- NOTE: parent_students + school_events live in access_and_calendar.sql;
--       parent_student_invites + claim_parent_links_for_current_user() live in
--       parent_invites.sql; admin_list_users() lives in admin_user_tools.sql;
--       the teacher_title/address check constraint lives in profile_fields.sql.
--       This file intentionally does not redefine them (see run order above).

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.profiles              enable row level security;
alter table public.groups                enable row level security;
alter table public.group_students        enable row level security;
alter table public.lessons               enable row level security;
alter table public.attendance            enable row level security;
alter table public.grades                enable row level security;
alter table public.homeworks             enable row level security;
alter table public.homework_submissions  enable row level security;

-- --- profiles ---------------------------------------------------------------
-- Any authenticated user can read profiles (names are shown across roles).
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_insert_self_or_admin" on public.profiles;
create policy "profiles_insert_self_or_admin" on public.profiles
  for insert to authenticated with check (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- --- groups -----------------------------------------------------------------
drop policy if exists "groups_select_visible" on public.groups;
create policy "groups_select_visible" on public.groups
  for select to authenticated using (
    public.is_admin()
    or teacher_id = auth.uid()
    or created_by = auth.uid()
    or public.is_student_in_group(id)
    or public.is_parent_in_group(id)
  );

drop policy if exists "groups_insert_admin_teacher" on public.groups;
create policy "groups_insert_admin_teacher" on public.groups
  for insert to authenticated with check (
    created_by = auth.uid() and (public.is_admin() or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','teacher')
    ))
  );

drop policy if exists "groups_update_admin_owner" on public.groups;
create policy "groups_update_admin_owner" on public.groups
  for update to authenticated
  using (public.is_admin() or teacher_id = auth.uid() or created_by = auth.uid())
  with check (public.is_admin() or teacher_id = auth.uid() or created_by = auth.uid());

drop policy if exists "groups_delete_admin_owner" on public.groups;
create policy "groups_delete_admin_owner" on public.groups
  for delete to authenticated
  using (public.is_admin() or created_by = auth.uid());

-- --- group_students ---------------------------------------------------------
drop policy if exists "group_students_select_visible" on public.group_students;
create policy "group_students_select_visible" on public.group_students
  for select to authenticated using (
    public.is_admin()
    or public.is_teacher_of_group(group_id)
    or student_id = auth.uid()
    or public.is_parent_of_student(student_id)
  );

drop policy if exists "group_students_write_admin_teacher" on public.group_students;
create policy "group_students_write_admin_teacher" on public.group_students
  for all to authenticated
  using (public.is_admin() or public.is_teacher_of_group(group_id))
  with check (public.is_admin() or public.is_teacher_of_group(group_id));

-- --- lessons ----------------------------------------------------------------
drop policy if exists "lessons_select_visible" on public.lessons;
create policy "lessons_select_visible" on public.lessons
  for select to authenticated using (
    public.is_admin()
    or public.is_teacher_of_group(group_id)
    or public.is_student_in_group(group_id)
    or public.is_parent_in_group(group_id)
  );

drop policy if exists "lessons_write_admin_teacher" on public.lessons;
create policy "lessons_write_admin_teacher" on public.lessons
  for all to authenticated
  using (public.is_admin() or public.is_teacher_of_group(group_id))
  with check (public.is_admin() or public.is_teacher_of_group(group_id));

-- --- attendance -------------------------------------------------------------
drop policy if exists "attendance_select_visible" on public.attendance;
create policy "attendance_select_visible" on public.attendance
  for select to authenticated using (
    public.is_admin()
    or student_id = auth.uid()
    or public.is_parent_of_student(student_id)
    or exists (
      select 1 from public.lessons l
      where l.id = attendance.lesson_id and public.is_teacher_of_group(l.group_id)
    )
  );

drop policy if exists "attendance_write_admin_teacher" on public.attendance;
create policy "attendance_write_admin_teacher" on public.attendance
  for all to authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.lessons l
      where l.id = attendance.lesson_id and public.is_teacher_of_group(l.group_id)
    )
  )
  with check (
    public.is_admin() or exists (
      select 1 from public.lessons l
      where l.id = attendance.lesson_id and public.is_teacher_of_group(l.group_id)
    )
  );

-- --- grades -----------------------------------------------------------------
drop policy if exists "grades_select_visible" on public.grades;
create policy "grades_select_visible" on public.grades
  for select to authenticated using (
    public.is_admin()
    or student_id = auth.uid()
    or public.is_parent_of_student(student_id)
    or public.is_teacher_of_group(group_id)
  );

drop policy if exists "grades_write_admin_teacher" on public.grades;
create policy "grades_write_admin_teacher" on public.grades
  for all to authenticated
  using (public.is_admin() or public.is_teacher_of_group(group_id))
  with check (public.is_admin() or public.is_teacher_of_group(group_id));

-- --- homeworks --------------------------------------------------------------
drop policy if exists "homeworks_select_visible" on public.homeworks;
create policy "homeworks_select_visible" on public.homeworks
  for select to authenticated using (
    public.is_admin()
    or public.is_teacher_of_group(group_id)
    or public.is_student_in_group(group_id)
    or public.is_parent_in_group(group_id)
  );

drop policy if exists "homeworks_write_admin_teacher" on public.homeworks;
create policy "homeworks_write_admin_teacher" on public.homeworks
  for all to authenticated
  using (public.is_admin() or public.is_teacher_of_group(group_id))
  with check (public.is_admin() or public.is_teacher_of_group(group_id));

-- --- homework_submissions ---------------------------------------------------
drop policy if exists "hw_sub_select_visible" on public.homework_submissions;
create policy "hw_sub_select_visible" on public.homework_submissions
  for select to authenticated using (
    public.is_admin()
    or student_id = auth.uid()
    or public.is_parent_of_student(student_id)
    or exists (
      select 1 from public.homeworks h
      where h.id = homework_submissions.homework_id and public.is_teacher_of_group(h.group_id)
    )
  );

drop policy if exists "hw_sub_write_student_admin" on public.homework_submissions;
create policy "hw_sub_write_student_admin" on public.homework_submissions
  for all to authenticated
  using (public.is_admin() or student_id = auth.uid())
  with check (public.is_admin() or student_id = auth.uid());

-- ===========================================================================
-- Grants — helper functions are called from RLS policies; admin_list_users()
-- and claim_parent_links_for_current_user() are granted in their own files.
-- ===========================================================================
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_teacher_of_group(uuid) to authenticated;
grant execute on function public.is_student_in_group(uuid) to authenticated;
grant execute on function public.is_parent_of_student(uuid) to authenticated;
grant execute on function public.is_parent_in_group(uuid) to authenticated;


-- ========================= profile_fields.sql =========================
-- Optional profile enhancements for dashboard profile editor.

alter table public.profiles
add column if not exists teacher_title text;

alter table public.profiles
add column if not exists address text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_teacher_title_chk'
  ) then
    alter table public.profiles
    add constraint profiles_teacher_title_chk
    check (
      teacher_title is null
      or teacher_title in ('г-н', 'г-жа', 'д-р')
    );
  end if;
end
$$;


-- ========================= access_and_calendar.sql =========================
-- Access model for parents and school calendar events.
-- Run in Supabase SQL editor after verifying existing schema.

create table if not exists public.parent_students (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (parent_id, student_id)
);

create index if not exists idx_parent_students_parent_id on public.parent_students (parent_id);
create index if not exists idx_parent_students_student_id on public.parent_students (student_id);

alter table public.parent_students enable row level security;

drop policy if exists "parent_students_admin_all" on public.parent_students;
create policy "parent_students_admin_all"
on public.parent_students
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "parent_students_parent_read_own" on public.parent_students;
create policy "parent_students_parent_read_own"
on public.parent_students
for select
to authenticated
using (
  parent_id = auth.uid()
);

drop policy if exists "parent_students_student_read_own" on public.parent_students;
create policy "parent_students_student_read_own"
on public.parent_students
for select
to authenticated
using (
  student_id = auth.uid()
);

create table if not exists public.school_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid null references public.groups (id) on delete cascade,
  title text not null,
  description text null,
  starts_at timestamptz not null,
  ends_at timestamptz null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint school_events_title_len check (char_length(title) >= 3),
  constraint school_events_time_range check (ends_at is null or ends_at >= starts_at)
);

create index if not exists idx_school_events_group_id on public.school_events (group_id);
create index if not exists idx_school_events_starts_at on public.school_events (starts_at);

alter table public.school_events enable row level security;

drop policy if exists "school_events_select_visible" on public.school_events;
create policy "school_events_select_visible"
on public.school_events
for select
to authenticated
using (
  -- Admin sees all events
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
  or
  -- Teachers see global events and events for their groups
  (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'teacher'
    )
    and (
      school_events.group_id is null
      or exists (
        select 1
        from public.groups g
        where g.id = school_events.group_id
          and (g.teacher_id = auth.uid() or g.created_by = auth.uid())
      )
    )
  )
  or
  -- Students see global events and events for their groups
  (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'student'
    )
    and (
      school_events.group_id is null
      or exists (
        select 1
        from public.group_students gs
        where gs.group_id = school_events.group_id
          and gs.student_id = auth.uid()
      )
    )
  )
  or
  -- Parents see global events and events for groups where their children are enrolled
  (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'parent'
    )
    and (
      school_events.group_id is null
      or exists (
        select 1
        from public.group_students gs
        join public.parent_students ps on ps.student_id = gs.student_id
        where gs.group_id = school_events.group_id
          and ps.parent_id = auth.uid()
      )
    )
  )
);

drop policy if exists "school_events_insert_admin_teacher" on public.school_events;
create policy "school_events_insert_admin_teacher"
on public.school_events
for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    -- Admin can create global and group events
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
    or
    -- Teacher can create only for their own groups
    (
      exists (
        select 1
        from public.profiles p
        where p.id = auth.uid() and p.role = 'teacher'
      )
      and school_events.group_id is not null
      and exists (
        select 1
        from public.groups g
        where g.id = school_events.group_id
          and (g.teacher_id = auth.uid() or g.created_by = auth.uid())
      )
    )
  )
);

drop policy if exists "school_events_update_admin_teacher_owner_group" on public.school_events;
create policy "school_events_update_admin_teacher_owner_group"
on public.school_events
for update
to authenticated
using (
  -- Admin can update all
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
  or
  -- Teacher can update only events they created for their groups
  (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'teacher'
    )
    and school_events.created_by = auth.uid()
    and school_events.group_id is not null
    and exists (
      select 1
      from public.groups g
      where g.id = school_events.group_id
        and (g.teacher_id = auth.uid() or g.created_by = auth.uid())
    )
  )
)
with check (
  -- Keep same rights on new row values
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
  or
  (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'teacher'
    )
    and school_events.created_by = auth.uid()
    and school_events.group_id is not null
    and exists (
      select 1
      from public.groups g
      where g.id = school_events.group_id
        and (g.teacher_id = auth.uid() or g.created_by = auth.uid())
    )
  )
);

drop policy if exists "school_events_delete_admin_teacher_owner_group" on public.school_events;
create policy "school_events_delete_admin_teacher_owner_group"
on public.school_events
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
  or
  (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'teacher'
    )
    and school_events.created_by = auth.uid()
    and school_events.group_id is not null
    and exists (
      select 1
      from public.groups g
      where g.id = school_events.group_id
        and (g.teacher_id = auth.uid() or g.created_by = auth.uid())
    )
  )
);



-- ========================= parent_invites.sql =========================
-- Parent invitation flow:
-- Admin prepares parent-student links by parent email.
-- When the parent logs in, links are automatically claimed.

create table if not exists public.parent_student_invites (
  id uuid primary key default gen_random_uuid(),
  parent_email text not null,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  claimed_by uuid null references public.profiles (id) on delete set null,
  claimed_at timestamptz null,
  constraint parent_student_invites_email_chk check (position('@' in parent_email) > 1),
  constraint parent_student_invites_unique unique (parent_email, student_id)
);

create index if not exists idx_parent_student_invites_email on public.parent_student_invites (lower(parent_email));
create index if not exists idx_parent_student_invites_student_id on public.parent_student_invites (student_id);

alter table public.parent_student_invites enable row level security;

drop policy if exists "parent_student_invites_admin_all" on public.parent_student_invites;
create policy "parent_student_invites_admin_all"
on public.parent_student_invites
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "parent_student_invites_parent_read_own" on public.parent_student_invites;
create policy "parent_student_invites_parent_read_own"
on public.parent_student_invites
for select
to authenticated
using (
  lower(parent_email) = lower((select u.email from auth.users u where u.id = auth.uid()))
);

create or replace function public.claim_parent_links_for_current_user()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_claimed integer := 0;
begin
  select lower(u.email)
  into v_email
  from auth.users u
  where u.id = auth.uid();

  if v_email is null then
    return 0;
  end if;

  insert into public.parent_students (parent_id, student_id)
  select auth.uid(), psi.student_id
  from public.parent_student_invites psi
  where lower(psi.parent_email) = v_email
    and psi.claimed_at is null
  on conflict (parent_id, student_id) do nothing;

  get diagnostics v_claimed = row_count;

  update public.parent_student_invites
  set claimed_by = auth.uid(),
      claimed_at = now()
  where lower(parent_email) = v_email
    and claimed_at is null;

  return coalesce(v_claimed, 0);
end;
$$;

grant execute on function public.claim_parent_links_for_current_user() to authenticated;


-- ========================= admin_user_tools.sql =========================
-- Admin helper functions for account management.

create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  full_name text,
  role public.app_role,
  phone text,
  teacher_title text,
  address text,
  avatar_url text,
  created_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    p.id,
    u.email::text,
    p.full_name,
    p.role,
    p.phone,
    p.teacher_title,
    p.address,
    p.avatar_url,
    p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where exists (
    select 1
    from public.profiles ap
    where ap.id = auth.uid()
      and ap.role = 'admin'
  )
  order by p.created_at desc;
$$;

grant execute on function public.admin_list_users() to authenticated;


-- ========================= storage_homework_files.sql =========================
-- Supabase Storage setup for homework file upload/download.
-- Run this in Supabase SQL Editor.

insert into storage.buckets (id, name, public)
values ('homework-files', 'homework-files', false)
on conflict (id) do nothing;

drop policy if exists "homework_files_select" on storage.objects;
create policy "homework_files_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'homework-files'
  and (
    public.is_admin()
    or auth.uid()::text = (storage.foldername(name))[1]
    or exists (
      select 1
      from public.homework_submissions hs
      join public.homeworks h on h.id = hs.homework_id
      join public.groups g on g.id = h.group_id
      where hs.file_path = storage.objects.name
        and (g.teacher_id = auth.uid() or g.created_by = auth.uid())
    )
    or exists (
      select 1
      from public.homework_submissions hs
      join public.parent_students ps on ps.student_id = hs.student_id
      where hs.file_path = storage.objects.name
        and ps.parent_id = auth.uid()
    )
  )
);

drop policy if exists "homework_files_insert" on storage.objects;
create policy "homework_files_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'homework-files'
  and (
    public.is_admin()
    or auth.uid()::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "homework_files_update" on storage.objects;
create policy "homework_files_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'homework-files'
  and (
    public.is_admin()
    or auth.uid()::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'homework-files'
  and (
    public.is_admin()
    or auth.uid()::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "homework_files_delete" on storage.objects;
create policy "homework_files_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'homework-files'
  and (
    public.is_admin()
    or auth.uid()::text = (storage.foldername(name))[1]
  )
);



-- ========================= storage_profile_avatars.sql =========================
-- Supabase Storage for profile avatar uploads.

insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict (id) do nothing;

drop policy if exists "profile_avatars_select" on storage.objects;
create policy "profile_avatars_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-avatars'
);

drop policy if exists "profile_avatars_insert" on storage.objects;
create policy "profile_avatars_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_avatars_update" on storage.objects;
create policy "profile_avatars_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_avatars_delete" on storage.objects;
create policy "profile_avatars_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);


-- ========================= schedule.sql =========================
-- Weekly recurring schedule slots per group.
-- Depends on: schema.sql (groups + is_admin/is_teacher_of_group/
--             is_student_in_group/is_parent_in_group helpers).
-- Run in Supabase SQL Editor after schema.sql.

create table if not exists public.schedule_slots (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  day_of_week smallint not null,          -- 1 = Monday ... 7 = Sunday (ISO)
  start_time time not null,
  end_time time not null,
  room text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint schedule_slots_dow_range check (day_of_week between 1 and 7),
  constraint schedule_slots_time_range check (end_time > start_time),
  unique (group_id, day_of_week, start_time)
);

create index if not exists idx_schedule_slots_group_id on public.schedule_slots (group_id);
create index if not exists idx_schedule_slots_day on public.schedule_slots (day_of_week);

alter table public.schedule_slots enable row level security;

-- Visible to admin, the group's teacher, enrolled students and their parents.
drop policy if exists "schedule_slots_select_visible" on public.schedule_slots;
create policy "schedule_slots_select_visible" on public.schedule_slots
  for select to authenticated using (
    public.is_admin()
    or public.is_teacher_of_group(group_id)
    or public.is_student_in_group(group_id)
    or public.is_parent_in_group(group_id)
  );

-- Only admin or the owning teacher may create/update/delete slots.
drop policy if exists "schedule_slots_write_admin_teacher" on public.schedule_slots;
create policy "schedule_slots_write_admin_teacher" on public.schedule_slots
  for all to authenticated
  using (public.is_admin() or public.is_teacher_of_group(group_id))
  with check (public.is_admin() or public.is_teacher_of_group(group_id));


-- ========================= remarks.sql =========================
-- Teacher remarks & praise for students, with full chronological history.
-- Depends on: schema.sql (groups/profiles + is_admin / is_teacher_of_group /
--             is_parent_of_student helpers).
-- Run in Supabase SQL Editor after schema.sql.

do $$ begin
  create type public.remark_type as enum ('praise', 'remark');
exception when duplicate_object then null; end $$;

create table if not exists public.remarks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  type public.remark_type not null,
  note text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint remarks_note_len check (char_length(btrim(note)) >= 2)
);

create index if not exists idx_remarks_group_id on public.remarks (group_id);
create index if not exists idx_remarks_student_id on public.remarks (student_id);
create index if not exists idx_remarks_created_at on public.remarks (created_at desc);

alter table public.remarks enable row level security;

-- Admin, the group's teacher, the student, and the student's parent can read.
drop policy if exists "remarks_select_visible" on public.remarks;
create policy "remarks_select_visible" on public.remarks
  for select to authenticated using (
    public.is_admin()
    or student_id = auth.uid()
    or public.is_parent_of_student(student_id)
    or public.is_teacher_of_group(group_id)
  );

-- Only admin or the owning teacher may create/update/delete remarks.
drop policy if exists "remarks_write_admin_teacher" on public.remarks;
create policy "remarks_write_admin_teacher" on public.remarks
  for all to authenticated
  using (public.is_admin() or public.is_teacher_of_group(group_id))
  with check (public.is_admin() or public.is_teacher_of_group(group_id));
