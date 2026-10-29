import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../supabase', () => ({ supabase: {} }));

import { ChunkedRecorder, type Chunk, type RecorderLike } from './chunker';
import { createMemoryChunkStore, chunkKey, type ChunkStore, type StoredChunk } from './chunkStore';
import { ChunkUploader, chunkFileName } from './uploader';
import { pickRecordingMimeType, uploadMimeType, extensionFor, baseMimeType } from './audio';
import { patchWebmDuration } from './webmDuration';
import type { RecordingChunk, RecordingChunkInsert } from '../database.types';

// ---------------------------------------------------------------------------
// ChunkedRecorder
// ---------------------------------------------------------------------------

class FakeRecorder implements RecorderLike {
  state: RecorderLike['state'] = 'inactive';
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: RecorderLike['ondataavailable'] = null;
  onstop: RecorderLike['onstop'] = null;
  onerror: RecorderLike['onerror'] = null;
  requests = 0;
  start() { this.state = 'recording'; }
  pause() { this.state = 'paused'; }
  resume() { this.state = 'recording'; }
  requestData() { this.requests++; }
  stop() {
    this.state = 'inactive';
    // Like MediaRecorder: the final dataavailable, then stop, asynchronously.
    queueMicrotask(() => { this.emit('final'); this.onstop?.(); });
  }
  emit(text: string) { this.ondataavailable?.({ data: new Blob([text]) }); }
}

function setup() {
  let t = 1_000_000;
  let tick: (() => void) | null = null;
  const rec = new FakeRecorder();
  const chunks: Chunk[] = [];
  const chunker = new ChunkedRecorder(rec, {
    chunkMs: 60_000,
    now: () => t,
    setInterval: (fn) => { tick = fn; return 1; },
    clearInterval: () => { tick = null; },
    onChunk: c => chunks.push(c),
  });
  return {
    rec, chunks, chunker,
    advance: (ms: number) => { t += ms; },
    fireInterval: () => tick?.(),
    intervalActive: () => tick !== null,
  };
}

describe('ChunkedRecorder', () => {
  it('cuts a chunk on each interval with its wall-clock start and audio length', () => {
    const s = setup();
    s.chunker.start();
    s.advance(60_000);
    s.fireInterval();
    s.rec.emit('a');
    s.advance(60_000);
    s.fireInterval();
    s.rec.emit('b');
    expect(s.chunks.map(c => [c.seq, c.startMs, c.durationMs])).toEqual([[0, 0, 60_000], [1, 60_000, 60_000]]);
    expect(s.chunks[0].mimeType).toBe('audio/webm;codecs=opus');
  });

  it('cuts at a pause so each chunk is continuous audio, and resumes on the wall clock', async () => {
    const s = setup();
    s.chunker.start();
    s.advance(10_000);
    s.chunker.pause();
    s.rec.emit('before-pause');
    s.advance(30_000);       // a 30 s break
    s.chunker.resume();
    s.advance(5_000);
    await s.chunker.stop();
    expect(s.chunks.map(c => [c.seq, c.startMs, c.durationMs])).toEqual([[0, 0, 10_000], [1, 40_000, 5_000]]);
    expect(s.chunker.recordedMs).toBe(15_000);
    expect(s.intervalActive()).toBe(false);
  });

  it('does not cut while paused', () => {
    const s = setup();
    s.chunker.start();
    s.chunker.pause();
    s.rec.emit('x');
    const before = s.rec.requests;
    s.fireInterval();
    expect(s.rec.requests).toBe(before);
  });

  it('drops empty data without using up a sequence number', () => {
    const s = setup();
    s.chunker.start();
    s.advance(1_000);
    s.chunker.cut();
    s.rec.ondataavailable?.({ data: new Blob([]) });
    s.advance(1_000);
    s.chunker.cut();
    s.rec.emit('real');
    expect(s.chunks.map(c => c.seq)).toEqual([0]);
    expect(s.chunks[0].startMs).toBe(1_000);
  });
});

// ---------------------------------------------------------------------------
// ChunkUploader
// ---------------------------------------------------------------------------

function stored(seq: number, text: string, overrides: Partial<StoredChunk> = {}): StoredChunk {
  return {
    key: chunkKey('t1', seq), recordingId: 'r1', trackId: 't1', seq,
    blob: new Blob([text], { type: 'audio/webm' }), mimeType: 'audio/webm;codecs=opus',
    startMs: seq * 60_000, durationMs: 60_000, uploaded: false, ...overrides,
  };
}

function uploaderSetup(store: ChunkStore = createMemoryChunkStore()) {
  const uploaded = new Map<string, Blob>();
  const rows: RecordingChunkInsert[] = [];
  const timers: (() => void)[] = [];
  const uploadAudio = vi.fn(async (path: string, blob: Blob) => { uploaded.set(path, blob); });
  const deps = {
    userId: 'u1',
    store,
    uploadAudio,
    saveChunkRow: vi.fn(async (row: RecordingChunkInsert) => { rows.push(row); }),
    listChunkRows: vi.fn(async (trackId: string) => rows.filter(r => r.track_id === trackId) as RecordingChunk[]),
    fetchAudio: vi.fn(async (path: string) => uploaded.get(path) ?? new Blob([])),
    setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
  };
  return { uploader: new ChunkUploader(deps), deps, uploaded, rows, timers, store };
}

describe('ChunkUploader.drain', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads pending chunks in order under the user’s folder and records each one', async () => {
    const s = uploaderSetup();
    await s.store.put(stored(1, 'b'));
    await s.store.put(stored(0, 'a'));
    await s.uploader.drain();
    expect(s.deps.uploadAudio.mock.calls.map(c => c[0])).toEqual(['u1/r1/t1/00000.webm', 'u1/r1/t1/00001.webm']);
    expect(s.deps.uploadAudio.mock.calls[0][2]).toBe('audio/webm');
    expect(s.rows[1]).toMatchObject({ track_id: 't1', seq: 1, start_ms: 60_000, duration_ms: 60_000, byte_size: 1 });
    expect((await s.store.all()).every(c => c.uploaded)).toBe(true);
    expect(s.uploader.getStatus()).toEqual({ pending: 0, error: null });
  });

  it('keeps a failed chunk, reports the error, and retries later', async () => {
    const s = uploaderSetup();
    s.deps.uploadAudio.mockRejectedValueOnce(new Error('offline'));
    await s.store.put(stored(0, 'a'));
    await s.uploader.drain();
    expect(s.uploader.getStatus()).toEqual({ pending: 1, error: 'offline' });
    expect((await s.store.all())[0].uploaded).toBe(false);
    expect(s.timers).toHaveLength(1);

    s.timers[0]();
    await s.uploader.drain();
    expect(s.uploader.getStatus()).toEqual({ pending: 0, error: null });
  });

  it('picks up a chunk saved while an upload run was already going', async () => {
    const s = uploaderSetup();
    await s.store.put(stored(0, 'a'));
    let release!: () => void;
    s.deps.uploadAudio.mockImplementationOnce(async () => { await new Promise<void>(r => { release = r; }); });
    const first = s.uploader.drain();
    await new Promise(r => setTimeout(r, 0));
    await s.store.put(stored(1, 'b'));
    const second = s.uploader.drain();
    release();
    await Promise.all([first, second]);
    expect((await s.store.all()).every(c => c.uploaded)).toBe(true);
  });
});

describe('ChunkUploader.joinTrack', () => {
  it('joins chunks in order, fetching any no longer on the device', async () => {
    const s = uploaderSetup();
    await s.store.put(stored(0, 'aa'));
    await s.store.put(stored(1, 'bb'));
    await s.store.put(stored(2, 'cc'));
    await s.uploader.drain();
    await s.store.removeTrack('t1');
    await s.store.put(stored(0, 'aa', { uploaded: true }));
    await s.store.put(stored(2, 'cc', { uploaded: true }));

    const joined = await s.uploader.joinTrack('r1', 't1', 'audio/webm;codecs=opus');
    expect(joined).toEqual({ path: 'u1/r1/t1/full.webm', durationMs: 180_000, bytes: 6 });
    expect(await s.uploaded.get('u1/r1/t1/full.webm')!.text()).toBe('aabbcc');
    expect(s.deps.fetchAudio).toHaveBeenCalledWith('u1/r1/t1/00001.webm');
    expect(await s.store.all()).toEqual([]);
  });

  it('refuses to join while audio is still waiting to upload', async () => {
    const s = uploaderSetup();
    s.deps.uploadAudio.mockRejectedValue(new Error('offline'));
    await s.store.put(stored(0, 'a'));
    await expect(s.uploader.joinTrack('r1', 't1', 'audio/webm')).rejects.toThrow(/still waiting to upload/);
  });

  it('writes the total length into the joined file, keeping the original if that fails', async () => {
    const s = uploaderSetup();
    const tagged = new Blob(['with-duration'], { type: 'audio/webm' });
    const deps = { ...s.deps, writeDuration: vi.fn(async () => tagged) };
    const uploader = new ChunkUploader(deps);
    await s.store.put(stored(0, 'aa'));
    await uploader.joinTrack('r1', 't1', 'audio/webm');
    expect(deps.writeDuration).toHaveBeenCalledWith(expect.any(Blob), 60_000);
    expect(s.uploaded.get('u1/r1/t1/full.webm')).toBe(tagged);

    const s2 = uploaderSetup();
    const failing = new ChunkUploader({ ...s2.deps, writeDuration: vi.fn(async () => { throw new Error('bad header'); }) });
    await s2.store.put(stored(0, 'bb'));
    await failing.joinTrack('r1', 't1', 'audio/webm');
    expect(await s2.uploaded.get('u1/r1/t1/full.webm')!.text()).toBe('bb');
  });

  it('returns null for a track that recorded nothing', async () => {
    const s = uploaderSetup();
    expect(await s.uploader.joinTrack('r1', 't1', 'audio/webm')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Audio helpers
// ---------------------------------------------------------------------------

describe('audio helpers', () => {
  it('prefers webm/opus and falls back to mp4 (Safari)', () => {
    expect(pickRecordingMimeType(() => true)).toBe('audio/webm;codecs=opus');
    expect(pickRecordingMimeType(t => t === 'audio/mp4')).toBe('audio/mp4');
    expect(pickRecordingMimeType(() => false)).toBe('');
  });

  it('maps types to bare types and extensions', () => {
    expect(baseMimeType('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(extensionFor('audio/mp4')).toBe('m4a');
    expect(chunkFileName(7, 'audio/mp4')).toBe('00007.m4a');
  });

  it('types uploads by extension first and rejects non-audio', () => {
    expect(uploadMimeType({ name: 'session.webm', type: 'video/webm' })).toBe('audio/webm');
    expect(uploadMimeType({ name: 'Session 14.M4A', type: '' })).toBe('audio/mp4');
    expect(uploadMimeType({ name: 'notes', type: 'audio/mpeg' })).toBe('audio/mpeg');
    expect(uploadMimeType({ name: 'map.png', type: 'image/png' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// webm duration
// ---------------------------------------------------------------------------

describe('patchWebmDuration', () => {
  // EBML header, Segment (unknown size), Info with TimecodeScale = 1,000,000 and
  // a 4-byte Duration of 1.0 (Chrome's placeholder), then the first Cluster.
  const header = (duration: number[] | null, scale = [0x0f, 0x42, 0x40]) => new Uint8Array([
    0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x42, 0x82, 0x81, 0x77,
    0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0x15, 0x49, 0xa9, 0x66, 0x8c,
    0x2a, 0xd7, 0xb1, 0x80 | scale.length, ...scale,
    ...(duration ?? []),
    0x1f, 0x43, 0xb6, 0x75, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    // audio data that happens to contain the Duration id
    0x44, 0x89, 0x84, 0x00, 0x00, 0x00, 0x00,
  ]);
  const read32 = (b: Uint8Array, at: number) => new DataView(b.buffer).getFloat32(at);

  it('overwrites Chrome’s 1 ms placeholder with the real length', () => {
    const head = header([0x44, 0x89, 0x84, 0x3f, 0x80, 0x00, 0x00]);
    const at = 33 + 3;
    expect(read32(head, at)).toBe(1);
    const out = patchWebmDuration(head, 60_007)!;
    expect(read32(out, at)).toBe(60_007);
    expect(out.length).toBe(head.length);
    expect(read32(head, at)).toBe(1); // input untouched
  });

  it('converts to ticks when the timecode scale isn’t 1 ms', () => {
    const head = header([0x44, 0x89, 0x88, 0, 0, 0, 0, 0, 0, 0, 0], [0x03, 0xe8]); // 1 µs ticks
    const out = patchWebmDuration(head, 2_000)!;
    expect(new DataView(out.buffer).getFloat64(32 + 3)).toBe(2_000_000);
  });

  it('returns null when the header has no Duration, ignoring look-alikes in the audio', () => {
    expect(patchWebmDuration(header(null), 5_000)).toBeNull();
  });
});
