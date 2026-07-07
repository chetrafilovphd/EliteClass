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
  grade_value smallint,                 -- optional Bulgarian 2–6 scale
  percentage numeric(5,2),              -- result as a percentage (0–100)
  title text not null,                  -- assessment type (Тест, Writing, …)
  description text,
  graded_on date not null default current_date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint grades_value_range check (grade_value is null or grade_value between 2 and 6),
  constraint grades_percentage_range check (percentage is null or (percentage >= 0 and percentage <= 100))
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
