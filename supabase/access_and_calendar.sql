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

