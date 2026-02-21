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
