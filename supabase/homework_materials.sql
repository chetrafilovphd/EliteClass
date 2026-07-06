-- Homework materials uploaded by teachers. Students do NOT submit anything.
-- Depends on: schema.sql (homeworks table + is_admin / is_teacher_of_group /
--             is_student_in_group / is_parent_in_group helpers).
-- Run in Supabase SQL Editor after schema.sql.

-- Columns on homeworks for the (optional) attached material.
alter table public.homeworks add column if not exists material_path text;
alter table public.homeworks add column if not exists material_name text;

-- Public bucket: materials are non-sensitive learning files. Public read is
-- served from Supabase's CDN and cached, which keeps egress low.
insert into storage.buckets (id, name, public)
values ('homework-materials', 'homework-materials', true)
on conflict (id) do update set public = true;

-- Path convention: '<group_id>/<file>' so RLS can find the owning group.

-- Anyone may read (CDN-cached public files).
drop policy if exists "hw_materials_public_read" on storage.objects;
create policy "hw_materials_public_read"
on storage.objects
for select
to public
using (bucket_id = 'homework-materials');

-- Only admin or the group's teacher may upload.
drop policy if exists "hw_materials_insert" on storage.objects;
create policy "hw_materials_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'homework-materials'
  and (
    public.is_admin()
    or public.is_teacher_of_group(nullif((storage.foldername(name))[1], '')::uuid)
  )
);

drop policy if exists "hw_materials_update" on storage.objects;
create policy "hw_materials_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'homework-materials'
  and (
    public.is_admin()
    or public.is_teacher_of_group(nullif((storage.foldername(name))[1], '')::uuid)
  )
)
with check (
  bucket_id = 'homework-materials'
  and (
    public.is_admin()
    or public.is_teacher_of_group(nullif((storage.foldername(name))[1], '')::uuid)
  )
);

drop policy if exists "hw_materials_delete" on storage.objects;
create policy "hw_materials_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'homework-materials'
  and (
    public.is_admin()
    or public.is_teacher_of_group(nullif((storage.foldername(name))[1], '')::uuid)
  )
);
