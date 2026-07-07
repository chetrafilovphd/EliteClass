import { createClient } from '@supabase/supabase-js';

// Active project (EliteClass, eu-central-1). Hardcoded on purpose: Netlify still
// has stale VITE_SUPABASE_* env vars pointing at the OLD (paused) project, and
// Vite bakes those in at build time — they would override any env-based value
// here. The publishable/anon key is public by design (ships to every browser,
// protected by RLS). Once the stale Netlify env vars are removed/updated to this
// project, we can go back to reading env vars first.
const supabaseUrl = 'https://xqltmgpableypmkmycjp.supabase.co';
const supabaseAnonKey = 'sb_publishable_HuJ7Zgi8lx5D0u_Vcp7t9g_YvqDC5Hn';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
