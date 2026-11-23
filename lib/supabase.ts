import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Project and reference screens use the public workspace even when the employee is signed in.
export const supabase = createClient(url, key, {
  auth: { storageKey: 'lv-lab-public', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
