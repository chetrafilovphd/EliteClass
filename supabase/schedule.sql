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
