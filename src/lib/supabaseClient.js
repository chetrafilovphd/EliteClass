import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

const supabaseUrl = env.VITE_SUPABASE_URL || 'https://dgqgdqvpvtrfyvrslwdm.supabase.co';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_VUTnS-oYV4EnRn9n4KTRrw_RfXbzNsR';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Липсва Supabase конфигурация: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
