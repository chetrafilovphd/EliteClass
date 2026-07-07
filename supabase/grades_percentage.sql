-- Grades as a percentage (0–100) per assessment type, for language-school
-- style marking. The Bulgarian 2–6 grade_value becomes optional.
-- Idempotent; safe to run on an existing project.

alter table public.grades add column if not exists percentage numeric(5,2);
alter table public.grades alter column grade_value drop not null;

do $$ begin
  alter table public.grades
    add constraint grades_percentage_range check (percentage is null or (percentage >= 0 and percentage <= 100));
exception when duplicate_object then null; end $$;
