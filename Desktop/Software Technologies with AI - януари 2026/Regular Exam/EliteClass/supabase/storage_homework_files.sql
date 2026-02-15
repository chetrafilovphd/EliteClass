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

