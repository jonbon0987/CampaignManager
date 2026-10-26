import { describe, it, expect, vi, beforeEach } from 'vitest';

// Chainable Supabase mock: from() returns one query builder whose methods chain
// (select/upsert/eq/…) and whose terminals resolve to a settable result. The
// builder is also thenable so `await from().select().order()` (getAll/delete,
// which don't call .single()) resolves too.
vi.mock('./supabase', () => {
  const state = { result: { data: null as unknown, error: null as unknown } };
  const q: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = () => q;
  for (const m of ['select', 'upsert', 'insert', 'update', 'delete', 'eq', 'is', 'order']) q[m] = vi.fn(chain);
  q.single = vi.fn(() => Promise.resolve(state.result));
  q.maybeSingle = vi.fn(() => Promise.resolve(state.result));
  const supabase = {
    from: vi.fn(() => q),
    auth: { getUser: vi.fn() },
    __q: q,
    __set: (result: { data: unknown; error: unknown }) => { state.result = result; },
    then: (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => Promise.resolve(state.result).then(f, r),
  };
  // Attach `then` to the builder itself (kept off the outer object above so it
  // isn't treated as a promise on import).
  (q as unknown as { then: unknown }).then = supabase.then;
  return { supabase };
});

import { supabase } from './supabase';
import { Worlds, NPCs, Sessions, SessionPreps } from './db';

// Test-only handles exposed by the mock above.
const sb = supabase as unknown as {
  from: ReturnType<typeof vi.fn>;
  auth: { getUser: ReturnType<typeof vi.fn> };
  __q: Record<string, ReturnType<typeof vi.fn>>;
  __set: (r: { data: unknown; error: unknown }) => void;
};

beforeEach(() => {
  vi.clearAllMocks();
  sb.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  sb.__set({ data: null, error: null });
});

describe('Worlds.getAll', () => {
  it('selects from the worlds table and returns the rows', async () => {
    sb.__set({ data: [{ id: 'w1' }], error: null });
    const rows = await Worlds.getAll();
    expect(sb.from).toHaveBeenCalledWith('worlds');
    expect(sb.__q.select).toHaveBeenCalledWith('*');
    expect(rows).toEqual([{ id: 'w1' }]);
  });

  it('throws when the query errors', async () => {
    sb.__set({ data: null, error: new Error('db down') });
    await expect(Worlds.getAll()).rejects.toThrow('db down');
  });
});

describe('Worlds.upsert', () => {
  it('injects the current user_id and returns the saved row', async () => {
    sb.__set({ data: { id: 'w1', name: 'Aldermere' }, error: null });
    const out = await Worlds.upsert({ name: 'Aldermere', tagline: 't', era: 'e', calendar: 'c', year: 0 } as never);
    expect(sb.__q.upsert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Aldermere', user_id: 'u1' }));
    expect(out).toEqual({ id: 'w1', name: 'Aldermere' });
  });

  it('throws "Not authenticated" and never writes when there is no user', async () => {
    sb.auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(Worlds.upsert({ name: 'X' } as never)).rejects.toThrow('Not authenticated');
    expect(sb.__q.upsert).not.toHaveBeenCalled();
  });

  it('propagates a write error', async () => {
    sb.__set({ data: null, error: new Error('conflict') });
    await expect(Worlds.upsert({ name: 'X' } as never)).rejects.toThrow('conflict');
  });
});

describe('field-limit validation runs before any auth/DB work', () => {
  it('rejects an over-limit field without calling getUser or from()', async () => {
    const longName = 'x'.repeat(200); // npcs.name limit is 120
    await expect(NPCs.upsert({ name: longName } as never)).rejects.toThrow(/too long/i);
    expect(sb.auth.getUser).not.toHaveBeenCalled();
    expect(sb.from).not.toHaveBeenCalled();
  });
});

describe('Worlds.delete', () => {
  it('deletes the row by id', async () => {
    await Worlds.delete('w1');
    expect(sb.from).toHaveBeenCalledWith('worlds');
    expect(sb.__q.delete).toHaveBeenCalled();
    expect(sb.__q.eq).toHaveBeenCalledWith('id', 'w1');
  });

  it('throws when the delete errors', async () => {
    sb.__set({ data: null, error: new Error('nope') });
    await expect(Worlds.delete('w1')).rejects.toThrow('nope');
  });
});

// Regression: renumbering a session used to upsert on (campaign_id,
// session_number) with the row's id attached, which hit a duplicate-key error
// whether or not the new number was free.
describe.each([
  ['Sessions', Sessions, 'sessions', 'Session 7 already exists'],
  ['SessionPreps', SessionPreps, 'session_prep', 'Prep for session 7 already exists'],
] as const)('%s.upsert', (_name, Table, table, clashMessage) => {
  it('updates by id when editing, so the session number can change', async () => {
    sb.__set({ data: { id: 's1', session_number: 7 }, error: null });
    await Table.upsert({ id: 's1', campaign_id: 'c1', session_number: 7 } as never);
    expect(sb.from).toHaveBeenCalledWith(table);
    expect(sb.__q.update).toHaveBeenCalledWith({ campaign_id: 'c1', session_number: 7, user_id: 'u1' });
    expect(sb.__q.eq).toHaveBeenCalledWith('id', 's1');
    expect(sb.__q.upsert).not.toHaveBeenCalled();
  });

  it('creates or merges by session number when there is no id', async () => {
    sb.__set({ data: { id: 's2' }, error: null });
    await Table.upsert({ campaign_id: 'c1', session_number: 4 } as never);
    expect(sb.__q.upsert).toHaveBeenCalledWith(
      { campaign_id: 'c1', session_number: 4, user_id: 'u1' },
      { onConflict: 'campaign_id,session_number' },
    );
    expect(sb.__q.update).not.toHaveBeenCalled();
  });

  it('explains a genuine number clash instead of a raw duplicate-key error', async () => {
    sb.__set({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } });
    await expect(Table.upsert({ id: 's1', campaign_id: 'c1', session_number: 7 } as never)).rejects.toThrow(clashMessage);
  });
});
