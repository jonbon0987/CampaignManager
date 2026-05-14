// src/lib/auth.ts
// -----------------------------------------------------------
// Auth helpers. Listen for auth state changes via onAuthStateChange().
// -----------------------------------------------------------

import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';

/**
 * Sign in with email and password.
 */
export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) 
    throw error;
}

/**
 * Sign up with email and password.
 */
export async function signUpWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) 
    throw error;
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
export function onAuthStateChange(
  callback: (user: User | null, event?: string) => void
): () => void {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user ?? null, event);
  });
  return () => data.subscription.unsubscribe();
}

/**
 * Send a password reset email. Supabase will redirect to the app with a token.
 */
export async function resetPasswordForEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

/**
 * Update the current user's password. Call this after PASSWORD_RECOVERY event.
 */
export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}