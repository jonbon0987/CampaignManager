import './_env.js';
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';

/**
 * Verifies the Bearer token in the Authorization header against Supabase.
 * Returns the authenticated user's ID, or sends a 401 response and returns null.
 */
export async function requireAuth(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return data.user.id;
}

/**
 * A Supabase client that acts as the signing-in user, so every read and write
 * goes through the same row-level security as the app. Call after requireAuth.
 */
export function userSupabase(req: VercelRequest) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
