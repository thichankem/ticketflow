import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

if (process.env.NODE_ENV === 'production' && !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_ANON_KEY) {
  console.warn('[SECURITY WARNING] Supabase credentials not explicitly configured via environment variables.');
}

const supabaseUrl = process.env.SUPABASE_URL || 'https://kmciluchcfajlawrwbgs.supabase.co';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImttY2lsdWNoY2Zhamxhd3J3YmdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxNTAxMTksImV4cCI6MjEwOTcyNjExOX0.RhNxhApAGSpqdm0fX3uVjF6i59Od_UdvCCQnztZgtvw';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export default supabase;
