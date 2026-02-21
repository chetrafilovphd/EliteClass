-- Demo data for role-specific dashboards (safe re-run).
-- Use in Supabase SQL Editor after your schema is ready.

do $$
declare
  v_admin uuid;
  v_teacher uuid;
  v_student_1 uuid;
  v_student_2 uuid;
  v_parent uuid;
  v_group uuid;
  v_creator uuid;
  v_lesson uuid;
  v_homework uuid;
begin
  select id into v_admin
  from public.profiles
  where role = 'admin'
  order by created_at
  limit 1;

  select id into v_teacher
  from public.profiles
  where role = 'teacher'
  order by created_at
  limit 1;

  select id into v_student_1
  from public.profiles
  where role = 'student'
  order by created_at
  limit 1;

  select id into v_student_2
  from public.profiles
  where role = 'student'
  order by created_at
  offset 1
  limit 1;

  select id into v_parent
  from public.profiles
  where role = 'parent'
  order by created_at
  limit 1;

  v_creator := coalesce(v_admin, v_teacher, v_student_1, v_parent);

  if v_teacher is null or v_student_1 is null or v_creator is null then
    raise notice 'Seed skipped: need at least teacher + student + creator profiles.';
    return;
  end if;

  select id into v_group
  from public.groups
  where name = 'A2 English Evening'
  limit 1;

  if v_group is null then
    insert into public.groups (name, language, level, teacher_id, created_by)
    values ('A2 English Evening', 'English', 'A2', v_teacher, v_creator)
    returning id into v_group;
  else
    update public.groups
    set teacher_id = v_teacher
    where id = v_group;
  end if;

  insert into public.group_students (group_id, student_id)
  values (v_group, v_student_1)
  on conflict (group_id, student_id) do nothing;

  if v_student_2 is not null then
    insert into public.group_students (group_id, student_id)
    values (v_group, v_student_2)
    on conflict (group_id, student_id) do nothing;
  end if;

  if v_parent is not null then
    insert into public.parent_students (parent_id, student_id)
    values (v_parent, v_student_1)
    on conflict (parent_id, student_id) do nothing;
  end if;

  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'school_events') then
    insert into public.school_events (group_id, title, description, starts_at, ends_at, created_by)
    select
      v_group,
      'Седмичен преговор',
      'Преговор върху последните 2 урока.',
      now() + interval '1 day',
      now() + interval '1 day 1 hour',
      v_creator
    where not exists (
      select 1
      from public.school_events se
      where se.group_id = v_group
        and se.title = 'Седмичен преговор'
    );

    insert into public.school_events (group_id, title, description, starts_at, ends_at, created_by)
    select
      null,
      'Родителска среща',
      'Обща среща за всички групи.',
      now() + interval '5 day',
      now() + interval '5 day 2 hour',
      v_creator
    where not exists (
      select 1
      from public.school_events se
      where se.group_id is null
        and se.title = 'Родителска среща'
    );
  end if;

  insert into public.lessons (group_id, lesson_date, topic, notes, created_by)
  select v_group, current_date + 1, 'Past Simple vs Present Perfect', 'Дискусия и упражнения.', v_creator
  where not exists (
    select 1
    from public.lessons l
    where l.group_id = v_group
      and l.lesson_date = current_date + 1
      and l.topic = 'Past Simple vs Present Perfect'
  );

  insert into public.lessons (group_id, lesson_date, topic, notes, created_by)
  select v_group, current_date + 3, 'Listening Practice B1', 'Работа по двойки.', v_creator
  where not exists (
    select 1
    from public.lessons l
    where l.group_id = v_group
      and l.lesson_date = current_date + 3
      and l.topic = 'Listening Practice B1'
  );

  select l.id into v_lesson
  from public.lessons l
  where l.group_id = v_group
  order by l.lesson_date desc
  limit 1;

  if v_lesson is not null then
    insert into public.attendance (lesson_id, student_id, status, note)
    values (v_lesson, v_student_1, 'present', 'Навременно участие.')
    on conflict (lesson_id, student_id) do update
    set status = excluded.status,
        note = excluded.note;
  end if;

  insert into public.grades (group_id, student_id, grade_value, title, description, graded_on, created_by)
  select v_group, v_student_1, 5.50, 'Тест - Unit 4', 'Много добро представяне.', current_date, v_creator
  where not exists (
    select 1
    from public.grades g
    where g.group_id = v_group
      and g.student_id = v_student_1
      and g.title = 'Тест - Unit 4'
  );

  if v_student_2 is not null then
    insert into public.grades (group_id, student_id, grade_value, title, description, graded_on, created_by)
    select v_group, v_student_2, 4.75, 'Устно изпитване', 'Добра работа, нужда от още увереност.', current_date, v_creator
    where not exists (
      select 1
      from public.grades g
      where g.group_id = v_group
        and g.student_id = v_student_2
        and g.title = 'Устно изпитване'
    );
  end if;

  insert into public.homeworks (group_id, title, description, due_date, created_by)
  select v_group, 'Домашно: Grammar Worksheet 5', 'Workbook page 42-43.', current_date + 4, v_creator
  where not exists (
    select 1
    from public.homeworks h
    where h.group_id = v_group
      and h.title = 'Домашно: Grammar Worksheet 5'
  );

  select h.id into v_homework
  from public.homeworks h
  where h.group_id = v_group
    and h.title = 'Домашно: Grammar Worksheet 5'
  limit 1;

  if v_homework is not null then
    insert into public.homework_submissions (homework_id, student_id, status, teacher_note, submitted_at)
    values (v_homework, v_student_1, 'submitted', 'Получено навреме.', now())
    on conflict (homework_id, student_id) do update
    set status = excluded.status,
        teacher_note = excluded.teacher_note,
        submitted_at = excluded.submitted_at;
  end if;

  raise notice 'Demo seed completed for group id: %', v_group;
end $$;
