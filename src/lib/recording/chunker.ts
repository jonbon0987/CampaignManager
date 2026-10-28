// src/lib/recording/chunker.ts
// -----------------------------------------------------------
// Cuts one continuous recording into ~1-minute chunks.
//
// Chunks are cut by calling requestData() on a timer rather than with
// MediaRecorder's own timeslice, so every chunk boundary is one we chose and we
// always know which wall-clock moment a chunk starts at. Pausing cuts a chunk
// first, so each chunk holds continuous audio: its start_ms is the wall-clock
// time (relative to the track start) of its first sample, and duration_ms is
// how much audio it holds. Together they let transcript times be mapped back
// onto the session's clock even across pauses.
//
// All chunks from one recorder concatenate into a single playable file (only
// the first carries the container header), which is how a track is joined when
// the session ends.
// -----------------------------------------------------------

export const CHUNK_MS = 60_000;

/** The slice of MediaRecorder this needs — lets tests drive it with a fake. */
export interface RecorderLike {
  state: 'inactive' | 'recording' | 'paused';
  mimeType: string;
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  requestData(): void;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
}

export interface Chunk {
  seq: number;
  blob: Blob;
  startMs: number;    // wall-clock ms from track start to the chunk's first sample
  durationMs: number; // ms of audio in the chunk
  mimeType: string;
}

interface Pending { startMs: number; durationMs: number }

export interface ChunkerOptions {
  chunkMs?: number;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  onChunk: (chunk: Chunk) => void;
  onError?: (err: unknown) => void;
}

export class ChunkedRecorder {
  private readonly rec: RecorderLike;
  private readonly opts: Required<Omit<ChunkerOptions, 'onError'>> & Pick<ChunkerOptions, 'onError'>;
  private trackStart = 0;
  private chunkStartMs = 0;     // wall-clock start of the chunk being recorded
  private chunkActiveMs = 0;    // audio already banked in this chunk before the current stretch
  private activeSince: number | null = null; // when the current unpaused stretch began
  private pending: Pending[] = [];
  private seq = 0;
  private timer: unknown = null;
  private stopped: Promise<void> | null = null;

  constructor(rec: RecorderLike, opts: ChunkerOptions) {
    this.rec = rec;
    this.opts = {
      chunkMs: CHUNK_MS,
      now: () => Date.now(),
      setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
      clearInterval: (h) => globalThis.clearInterval(h as ReturnType<typeof setInterval>),
      ...opts,
    };
    rec.ondataavailable = (e) => this.handleData(e.data);
    rec.onerror = (e) => this.opts.onError?.(e);
  }

  get state() { return this.rec.state; }

  /** ms of audio captured so far, excluding paused time. */
  get recordedMs(): number {
    return this.bankedMs + this.currentChunkMs();
  }
  private bankedMs = 0;

  start(): void {
    this.trackStart = this.opts.now();
    this.chunkStartMs = 0;
    this.chunkActiveMs = 0;
    this.activeSince = this.trackStart;
    this.rec.start();
    this.timer = this.opts.setInterval(() => this.cut(), this.opts.chunkMs);
  }

  pause(): void {
    if (this.rec.state !== 'recording') return;
    this.cut();
    this.rec.pause();
    this.activeSince = null;
  }

  resume(): void {
    if (this.rec.state !== 'paused') return;
    this.rec.resume();
    const now = this.opts.now();
    this.chunkStartMs = now - this.trackStart;
    this.activeSince = now;
  }

  /** Stops recording; resolves once the final chunk has been emitted. */
  stop(): Promise<void> {
    if (this.stopped) return this.stopped;
    if (this.timer !== null) this.opts.clearInterval(this.timer);
    this.timer = null;
    this.stopped = new Promise<void>((resolve) => {
      if (this.rec.state === 'inactive') { resolve(); return; }
      this.rec.onstop = () => resolve();
      this.queueCurrent();
      this.activeSince = null;
      this.rec.stop();
    });
    return this.stopped;
  }

  /** Closes the current chunk and starts the next one. No-op while paused. */
  cut(): void {
    if (this.rec.state !== 'recording') return;
    this.queueCurrent();
    this.rec.requestData();
    const now = this.opts.now();
    this.chunkStartMs = now - this.trackStart;
    this.activeSince = now;
  }

  private currentChunkMs(): number {
    return this.chunkActiveMs + (this.activeSince === null ? 0 : this.opts.now() - this.activeSince);
  }

  private queueCurrent(): void {
    const durationMs = this.currentChunkMs();
    this.pending.push({ startMs: this.chunkStartMs, durationMs });
    this.bankedMs += durationMs;
    this.chunkActiveMs = 0;
  }

  private handleData(blob: Blob): void {
    const meta = this.pending.shift();
    // An empty blob (e.g. requestData right after a pause) carries no audio.
    if (!meta || blob.size === 0) return;
    this.opts.onChunk({
      seq: this.seq++,
      blob,
      startMs: meta.startMs,
      durationMs: meta.durationMs,
      mimeType: this.rec.mimeType,
    });
  }
}
