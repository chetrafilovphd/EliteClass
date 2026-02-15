# Elite Lingua Project Instructions

This file provides project context and implementation rules for AI dev agents.

## Project Context

- Project: `Elite Lingua Language School eDiary`
- Course: `Software Technologies with AI`
- Stack: HTML, CSS, JavaScript, Vite, Supabase, GitHub
- Architecture: multi-page app with modular JS files
- Roles: `admin`, `teacher`, `student`, `parent`

## Product Rules

- Access must be enforced server-side with Supabase RLS.
- Client-side role checks are UI convenience only.
- Never expose data outside role permissions.
- Keep pages separated by file (no SPA framework).

## Coding Rules

- Use plain JavaScript modules (`type="module"`), no TypeScript.
- Do not introduce React/Vue/Angular.
- Keep code modular:
  - `src/auth/*`
  - `src/groups/*`
  - `src/calendar/*`
  - `src/admin/*`
  - `src/lib/*`
- Avoid monolithic files and duplicated logic.
- Sanitize user-generated content before rendering to HTML.

## Supabase Rules

- Keep schema changes in SQL files under `supabase/`.
- Use `create table if not exists` and `drop policy if exists` patterns.
- RLS is mandatory for all app tables.
- Storage access must be protected by storage policies.

## UX Rules

- Responsive on desktop and mobile.
- Clear feedback for async actions (loading, success, error).
- Use explicit error messages from Supabase where helpful.

## Git Workflow

- Small, focused commits per task.
- Follow sequence: prompt -> implement -> test -> refine -> commit.
- Keep history clear for project assessment.

