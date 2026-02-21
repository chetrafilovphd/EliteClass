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
