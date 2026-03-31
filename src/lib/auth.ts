// src/lib/auth.ts
// -----------------------------------------------------------
// GitHub OAuth helpers. Call signInWithGitHub() on button click.
// Listen for auth state changes anywhere via onAuthStateChange().
// -----------------------------------------------------------

import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';

/**
 * Redirect the user to GitHub for OAuth.
 * Supabase handles the callback automatically.
 */
export async function signInWithGitHub(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      // After GitHub auth, Supabase will redirect here.
      // Change to your prod URL when deploying.
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
}

/**
 * Sign the current user out.
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Get the currently authenticated user (or null if not logged in).
 */
export async function getCurrentUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

/**
 * Subscribe to auth state changes.
 * Returns an unsubscribe function — call it in your cleanup effect.
 *
 * @example
 * const unsubscribe = onAuthStateChange((user) => setUser(user));
 * return () => unsubscribe();
 */
export function onAuthStateChange(callback: (user: User | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}