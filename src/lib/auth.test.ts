import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the supabase client so auth helpers can be tested without env/network.
vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
    },
  },
}));

import { supabase } from './supabase';
import {
  signInWithEmail, signUpWithEmail, signOut, getCurrentUser,
  onAuthStateChange, resetPasswordForEmail, updatePassword,
} from './auth';

const auth = vi.mocked(supabase.auth, true);

beforeEach(() => vi.clearAllMocks());

describe('signInWithEmail', () => {
  it('calls signInWithPassword with the credentials', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null } as never);
    await signInWithEmail('a@b.com', 'pw');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pw' });
  });

  it('throws when supabase returns an error', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: new Error('bad creds') } as never);
    await expect(signInWithEmail('a@b.com', 'pw')).rejects.toThrow('bad creds');
  });
});

describe('signUpWithEmail', () => {
  it('calls signUp with the credentials', async () => {
    auth.signUp.mockResolvedValue({ error: null } as never);
    await signUpWithEmail('a@b.com', 'pw');
    expect(auth.signUp).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pw' });
  });

  it('throws on error', async () => {
    auth.signUp.mockResolvedValue({ error: new Error('exists') } as never);
    await expect(signUpWithEmail('a@b.com', 'pw')).rejects.toThrow('exists');
  });
});

describe('signOut', () => {
  it('resolves on success and throws on error', async () => {
    auth.signOut.mockResolvedValue({ error: null } as never);
    await expect(signOut()).resolves.toBeUndefined();

    auth.signOut.mockResolvedValue({ error: new Error('fail') } as never);
    await expect(signOut()).rejects.toThrow('fail');
  });
});

describe('getCurrentUser', () => {
  it('returns the user from the session', async () => {
    const user = { id: 'u1' };
    auth.getUser.mockResolvedValue({ data: { user } } as never);
    expect(await getCurrentUser()).toBe(user);
  });

  it('returns null when logged out', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } } as never);
    expect(await getCurrentUser()).toBeNull();
  });
});

describe('onAuthStateChange', () => {
  it('forwards the session user + event to the callback and returns an unsubscribe', () => {
    const unsubscribe = vi.fn();
    let handler!: (event: string, session: unknown) => void;
    auth.onAuthStateChange.mockImplementation((cb: never) => {
      handler = cb as unknown as typeof handler;
      return { data: { subscription: { unsubscribe } } } as never;
    });

    const cb = vi.fn();
    const off = onAuthStateChange(cb);

    handler('SIGNED_IN', { user: { id: 'u1' } });
    expect(cb).toHaveBeenCalledWith({ id: 'u1' }, 'SIGNED_IN');

    handler('SIGNED_OUT', null);
    expect(cb).toHaveBeenCalledWith(null, 'SIGNED_OUT');

    off();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('resetPasswordForEmail', () => {
  it('sends the reset with a redirect back to the app origin', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null } as never);
    await resetPasswordForEmail('a@b.com');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.com', { redirectTo: window.location.origin });
  });

  it('throws on error', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: new Error('no user') } as never);
    await expect(resetPasswordForEmail('a@b.com')).rejects.toThrow('no user');
  });
});

describe('updatePassword', () => {
  it('updates the user password', async () => {
    auth.updateUser.mockResolvedValue({ error: null } as never);
    await updatePassword('newpw');
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'newpw' });
  });

  it('throws on error', async () => {
    auth.updateUser.mockResolvedValue({ error: new Error('weak') } as never);
    await expect(updatePassword('x')).rejects.toThrow('weak');
  });
});
