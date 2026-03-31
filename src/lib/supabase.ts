// src/lib/supabase.ts
// -----------------------------------------------------------
// Supabase client singleton.
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.
// -----------------------------------------------------------

import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);