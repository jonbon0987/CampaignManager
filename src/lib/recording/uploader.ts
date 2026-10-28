// src/lib/recording/uploader.ts
// -----------------------------------------------------------
// Moves recorded chunks from this device to the session-audio bucket, and
// joins a track's chunks into one file when the session ends.
//
// Uploads run one at a time in chunk order. A failure stops the queue and
// retries with backoff (or right away when the browser comes back online);
// chunks stay on the device until the joined file is safely stored.
// -----------------------------------------------------------

import { sessionAudioPath } from '../db';
import type { RecordingChunk, RecordingChunkInsert } from '../database.types';
import { baseMimeType, extensionFor } from './audio';
import type { ChunkStore, StoredChunk } from './chunkStore';

export interface UploaderDeps {
  userId: string;
  store: ChunkStore;
  uploadAudio: (path: string, blob: Blob, contentType: string) => Promise<void>;
  saveChunkRow: (row: RecordingChunkInsert) => Promise<unknown>;
  listChunkRows: (trackId: string) => Promise<RecordingChunk[]>;
  fetchAudio: (path: string) => Promise<Blob>;
  /** Writes the total length into the joined file's header, where the format needs it. */
  writeDuration?: (blob: Blob, durationMs: number) => Promise<Blob>;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

export interface UploaderStatus {
  pending: number;        // chunks on this device not yet uploaded
  error: string | null;   // last upload failure, cleared on the next success
}

const RETRY_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

export const chunkFileName = (seq: number, mime: string) => `${String(seq).padStart(5, '0')}.${extensionFor(mime)}`;

export class ChunkUploader {
  private readonly deps: UploaderDeps;
  private running: Promise<void> | null = null;
  private failures = 0;
  private retryTimer: unknown = null;
  private listeners = new Set<(s: UploaderStatus) => void>();
  private status: UploaderStatus = { pending: 0, error: null };

  constructor(deps: UploaderDeps) {
    this.deps = deps;
  }

  subscribe(fn: (s: UploaderStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => { this.listeners.delete(fn); };
  }

  getStatus(): UploaderStatus { return this.status; }

  /**
   * Uploads every pending chunk. A call while a run is in progress makes that
   * run look again for chunks added since it started, and resolves with it.
   */
  drain(): Promise<void> {
    if (this.running) { this.rerun = true; return this.running; }
    this.clearRetry();
    this.running = (async () => {
      do {
        this.rerun = false;
        if (!(await this.run())) break;
      } while (this.rerun);
    })().finally(() => { this.running = null; });
    return this.running;
  }
  private rerun = false;

  /** Cancels any scheduled retry (e.g. when the recording is discarded). */
  dispose(): void {
    this.clearRetry();
    this.listeners.clear();
  }

  /** One pass over the pending chunks. Returns false if an upload failed. */
  private async run(): Promise<boolean> {
    let pending = (await this.deps.store.all()).filter(c => !c.uploaded);
    this.setStatus({ pending: pending.length });
    while (pending.length > 0) {
      const chunk = pending[0];
      try {
        await this.uploadOne(chunk);
      } catch (err) {
        this.failures++;
        this.setStatus({ error: err instanceof Error ? err.message : String(err) });
        this.scheduleRetry();
        return false;
      }
      this.failures = 0;
      pending = pending.slice(1);
      this.setStatus({ pending: pending.length, error: null });
    }
    return true;
  }

  private async uploadOne(c: StoredChunk): Promise<void> {
    const path = sessionAudioPath(this.deps.userId, c.recordingId, c.trackId, chunkFileName(c.seq, c.mimeType));
    await this.deps.uploadAudio(path, c.blob, baseMimeType(c.mimeType));
    await this.deps.saveChunkRow({
      track_id: c.trackId,
      seq: c.seq,
      storage_path: path,
      start_ms: Math.round(c.startMs),
      duration_ms: Math.round(c.durationMs),
      byte_size: c.blob.size,
    });
    await this.deps.store.markUploaded(c.key);
  }

  private scheduleRetry(): void {
    const delay = RETRY_MS[Math.min(this.failures - 1, RETRY_MS.length - 1)];
    const set = this.deps.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
    this.retryTimer = set(() => { this.retryTimer = null; void this.drain(); }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer === null) return;
    const clear = this.deps.clearTimeout ?? (h => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>));
    clear(this.retryTimer);
    this.retryTimer = null;
  }

  private setStatus(patch: Partial<UploaderStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const fn of this.listeners) fn(this.status);
  }

  /**
   * Joins a track's chunks into one file and stores it. Chunks still on this
   * device are used directly; any that aren't (recorded before a crash on
   * another device, or cleared site data) are fetched back from storage.
   * Returns null when the track recorded nothing.
   */
  async joinTrack(recordingId: string, trackId: string, mimeType: string): Promise<{ path: string; durationMs: number; bytes: number } | null> {
    await this.drain();
    const local = (await this.deps.store.all()).filter(c => c.trackId === trackId);
    if (local.some(c => !c.uploaded)) {
      throw new Error('Some audio is still waiting to upload. Check your connection and try again.');
    }
    const rows = (await this.deps.listChunkRows(trackId)).sort((a, b) => a.seq - b.seq);
    if (rows.length === 0) return null;

    const bySeq = new Map(local.map(c => [c.seq, c.blob]));
    const blobs: Blob[] = [];
    for (const row of rows) blobs.push(bySeq.get(row.seq) ?? await this.deps.fetchAudio(row.storage_path));

    const type = baseMimeType(mimeType);
    const durationMs = rows.reduce((sum, r) => sum + (r.duration_ms ?? 0), 0);
    let full = new Blob(blobs, { type });
    // A file without its length still plays and transcribes, so a failure here isn't fatal.
    if (this.deps.writeDuration) full = await this.deps.writeDuration(full, durationMs).catch(() => full);
    const path = sessionAudioPath(this.deps.userId, recordingId, trackId, `full.${extensionFor(type)}`);
    await this.deps.uploadAudio(path, full, type);
    await this.deps.store.removeTrack(trackId);
    return { path, durationMs, bytes: full.size };
  }
}
