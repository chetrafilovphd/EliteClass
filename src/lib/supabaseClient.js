import { createClient } from '@supabase/supabase-js';

const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Липсва Supabase конфигурация: задай VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env (виж .env.example)'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
