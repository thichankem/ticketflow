import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://kmciluchcfajlawrwbgs.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImttY2lsdWNoY2Zhamxhd3J3YmdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxNTAxMTksImV4cCI6MjEwOTcyNjExOX0.RhNxhApAGSpqdm0fX3uVjF6i59Od_UdvCCQnztZgtvw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export default supabase;
