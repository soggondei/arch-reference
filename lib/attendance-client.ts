import { createClient } from '@supabase/supabase-js';

export const attendanceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { storageKey: 'lv-lab-attendance' } },
);
