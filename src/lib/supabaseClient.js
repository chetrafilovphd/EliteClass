import { createClient } from '@supabase/supabase-js';

const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

// Prefer env vars (set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in Netlify or
// .env). Fall back to the project's PUBLISHABLE anon key, which is public by
// design — it ships to every browser and is protected by RLS — so the site
// keeps working even before env vars are configured. Rotating the key later is
// still recommended; if you do, update these fallbacks and the env vars.
const supabaseUrl = env.VITE_SUPABASE_URL || 'https://xqltmgpableypmkmycjp.supabase.co';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_HuJ7Zgi8lx5D0u_Vcp7t9g_YvqDC5Hn';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
