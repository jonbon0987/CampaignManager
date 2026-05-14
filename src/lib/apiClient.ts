import { supabase } from './supabase';

/**
 * Returns fetch headers that include the current user's Supabase bearer token.
 * Always include Content-Type: application/json alongside these.
 */
export async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}
