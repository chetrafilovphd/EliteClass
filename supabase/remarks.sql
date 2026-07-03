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
