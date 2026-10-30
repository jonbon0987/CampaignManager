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
  const bucket = {
    upload: vi.fn(() => Promise.resolve({ data: {}, error: null })),
    createSignedUrl: vi.fn(() => Promise.resolve({ data: { signedUrl: 'https://signed' }, error: null })),
    remove: vi.fn(() => Promise.resolve({ data: [], error: null })),
  };
  const supabase = {
    from: vi.fn(() => q),
    storage: { from: vi.fn(() => bucket), __bucket: bucket },
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
import {
  Worlds, NPCs, Sessions,
  RecordingChunks, TranscriptSegments, SpeakerLinks, PlayerConsents, ChronicleProposals,
  SessionAudio, sessionAudioPath, SESSION_AUDIO_BUCKET,
} from './db';

// Test-only handles exposed by the mock above.
const sb = supabase as unknown as {
  from: ReturnType<typeof vi.fn>;
  storage: { from: ReturnType<typeof vi.fn>; __bucket: Record<string, ReturnType<typeof vi.fn>> };
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

// ---------------------------------------------------------------------------
// Session recording
// ---------------------------------------------------------------------------

describe('RecordingChunks.save', () => {
  it('upserts on (track_id, seq) so a re-sent chunk replaces the earlier row', async () => {
    sb.__set({ data: { id: 'c1' }, error: null });
    await RecordingChunks.save({ track_id: 't1', seq: 3, storage_path: 'u1/r1/t1/0003.webm', start_ms: 900_000, duration_ms: 300_000, byte_size: 1024 });
    expect(sb.from).toHaveBeenCalledWith('recording_chunks');
    expect(sb.__q.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ track_id: 't1', seq: 3, user_id: 'u1' }),
      { onConflict: 'track_id,seq' },
    );
  });
});

describe('TranscriptSegments.insertMany', () => {
  const seg = { recording_id: 'r1', track_id: 't1', start_ms: 0, end_ms: 1000, speaker_label: 'A', pc_id: null, is_dm: false, text: 'Hello', dropped_as_echo: false };

  it('injects user_id into every row', async () => {
    sb.__set({ data: [{ id: 's1' }, { id: 's2' }], error: null });
    await TranscriptSegments.insertMany([seg, { ...seg, start_ms: 1000 }]);
    expect(sb.__q.insert).toHaveBeenCalledWith([
      expect.objectContaining({ user_id: 'u1', start_ms: 0 }),
      expect.objectContaining({ user_id: 'u1', start_ms: 1000 }),
    ]);
  });

  it('skips the round trip for an empty batch', async () => {
    expect(await TranscriptSegments.insertMany([])).toEqual([]);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('rejects a line over the length limit before writing', async () => {
    await expect(TranscriptSegments.insertMany([{ ...seg, text: 'x'.repeat(8_001) }])).rejects.toThrow(/too long/);
    expect(sb.__q.insert).not.toHaveBeenCalled();
  });
});

describe('SpeakerLinks.save', () => {
  it('upserts on (campaign_id, discord_user_id)', async () => {
    sb.__set({ data: { id: 'l1' }, error: null });
    await SpeakerLinks.save({ campaign_id: 'c1', discord_user_id: '123', discord_username: 'dana', pc_id: 'pc1', is_dm: false });
    expect(sb.__q.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ campaign_id: 'c1', discord_user_id: '123', user_id: 'u1' }),
      { onConflict: 'campaign_id,discord_user_id' },
    );
  });
});

describe('PlayerConsents', () => {
  it('grant clears an earlier withdrawal', async () => {
    sb.__set({ data: { id: 'pc-c1' }, error: null });
    await PlayerConsents.grant({ campaign_id: 'c1', pc_id: 'pc1', method: 'discord' });
    expect(sb.__q.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ pc_id: 'pc1', revoked_at: null, consented_at: expect.any(String), user_id: 'u1' }),
      { onConflict: 'campaign_id,pc_id' },
    );
  });

  it('revoke stamps revoked_at on that row', async () => {
    sb.__set({ data: { id: 'pc-c1' }, error: null });
    await PlayerConsents.revoke('pc-c1');
    expect(sb.__q.update).toHaveBeenCalledWith({ revoked_at: expect.any(String) });
    expect(sb.__q.eq).toHaveBeenCalledWith('id', 'pc-c1');
  });
});

describe('ChronicleProposals.update', () => {
  it('updates the proposal by id with only the patched fields', async () => {
    sb.__set({ data: { id: 'p1', status: 'accepted' }, error: null });
    await ChronicleProposals.update('p1', { status: 'accepted', edits: { text: 'Edited' } });
    expect(sb.from).toHaveBeenCalledWith('chronicle_proposals');
    expect(sb.__q.update).toHaveBeenCalledWith({ status: 'accepted', edits: { text: 'Edited' } });
    expect(sb.__q.eq).toHaveBeenCalledWith('id', 'p1');
  });
});

describe('sessionAudioPath', () => {
  it('puts the user id first, which the bucket policy requires', () => {
    expect(sessionAudioPath('u1', 'r1', 't1', '0001.webm')).toBe('u1/r1/t1/0001.webm');
  });

  it('rejects file names that could escape the folder', () => {
    expect(() => sessionAudioPath('u1', 'r1', 't1', '../x.webm')).toThrow();
    expect(() => sessionAudioPath('u1', 'r1', 't1', 'a/b.webm')).toThrow();
    expect(() => sessionAudioPath('', 'r1', 't1', 'a.webm')).toThrow();
  });
});

describe('SessionAudio', () => {
  it('uploads into the session-audio bucket, overwriting a partial retry', async () => {
    const blob = new Blob(['x'], { type: 'audio/webm' });
    await SessionAudio.upload('u1/r1/t1/0001.webm', blob, 'audio/webm');
    expect(sb.storage.from).toHaveBeenCalledWith(SESSION_AUDIO_BUCKET);
    expect(sb.storage.__bucket.upload).toHaveBeenCalledWith('u1/r1/t1/0001.webm', blob, { contentType: 'audio/webm', upsert: true });
  });

  it('re-types a mislabelled file so the bucket sees an audio type', async () => {
    const file = new Blob(['x'], { type: 'video/webm' });
    await SessionAudio.upload('u1/r1/t1/full.webm', file, 'audio/webm');
    const sent = sb.storage.__bucket.upload.mock.calls[0][1] as Blob;
    expect(sent.type).toBe('audio/webm');
    expect(await sent.text()).toBe('x');
  });

  it('returns a signed url', async () => {
    expect(await SessionAudio.signedUrl('u1/r1/t1/full.webm')).toBe('https://signed');
  });

  it('skips remove for an empty list', async () => {
    await SessionAudio.remove([]);
    expect(sb.storage.__bucket.remove).not.toHaveBeenCalled();
  });
});
