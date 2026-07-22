import { describe, it, expect } from 'vitest';
import { errorMessage } from './errors';

describe('errorMessage', () => {
  it('reads the message off an Error instance', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('surfaces a Supabase/PostgrestError plain object with code', () => {
    const pgError = {
      message: 'invalid input value for enum npc_status: "alive"',
      details: null,
      hint: null,
      code: '22P02',
    };
    expect(errorMessage(pgError)).toBe('invalid input value for enum npc_status: "alive" (22P02)');
  });

  it('joins message, details, and hint when present', () => {
    const pgError = {
      message: 'null value violates not-null constraint',
      details: 'Failing row contains (…)',
      hint: 'Provide a name',
      code: '23502',
    };
    expect(errorMessage(pgError)).toBe(
      'null value violates not-null constraint — Failing row contains (…) — Provide a name (23502)',
    );
  });

  it('passes through a thrown string', () => {
    expect(errorMessage('literal error')).toBe('literal error');
  });

  it('falls back for shapeless values', () => {
    expect(errorMessage(undefined)).toBe('Something went wrong');
    expect(errorMessage({}, 'Unknown error')).toBe('Unknown error');
  });
});
