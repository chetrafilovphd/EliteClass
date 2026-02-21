# Elite Class eDiary

Electronic diary platform for Elite Lingua language school.
Capstone project for Software Technologies with AI.

## Features
- Auth: register, login, logout, forgot/reset password
- Roles: admin, teacher, student, parent
- Groups, lessons, attendance, grades, homeworks
- School calendar events
- Parent-student linking and invite flow
- Storage uploads for homework and profile avatars

## Tech
- HTML, CSS, JavaScript (ES modules)
- Vite
- Supabase (PostgreSQL, Auth, Storage, RLS)

## Run locally
1. npm install
2. Create .env with:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
3. npm run dev

## SQL scripts
- supabase/access_and_calendar.sql
- supabase/storage_homework_files.sql
- supabase/parent_invites.sql
- supabase/profile_fields.sql
- supabase/storage_profile_avatars.sql
- supabase/admin_user_tools.sql
- supabase/demo_seed_role_data.sql

## Main pages
- index.html
- login.html
- register.html
- dashboard.html
- my-hours.html
- groups.html
- group-details.html
- calendar.html
- parent-links.html
