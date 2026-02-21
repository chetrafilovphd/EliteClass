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
