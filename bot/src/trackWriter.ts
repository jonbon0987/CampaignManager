// bot/src/trackWriter.ts
// -----------------------------------------------------------
// Turns one Discord player's Opus packets into the chunks the app's recording
// pipeline already understands (recording_chunks: a stretch of continuous
// audio placed on the track's clock by start_ms, lasting duration_ms).
//
// Discord only sends audio while someone talks. Short gaps are filled with
// silence so a sentence stays one stretch; a long gap ends the chunk, and the
// next one starts where the talking resumes, so hours of quiet are never
// stored or sent for transcription. All chunks are pieces of one continuous
// Ogg stream: joined end to end they make the track's full file.
// -----------------------------------------------------------

import { OggOpusMuxer, OPUS_SILENCE, SAMPLES_PER_MS, opusPacketSamples } from './ogg.js';

export interface WrittenChunk {
  seq: number;
  bytes: Uint8Array;
  /** Track-clock ms where this chunk's first sample belongs. */
  startMs: number;
  /** ms of audio in the chunk. */
  durationMs: number;
}

export interface TrackWriterOptions {
  /** A silence longer than this ends the chunk instead of being stored. */
  cutGapMs?: number;
  /** Lateness up to this is network jitter, not silence. */
  jitterMs?: number;
  /** Chunks close after this much audio, so a crash loses at most this. */
  maxChunkMs?: number;
}

const FRAME_MS = 20;

export class DiscordTrackWriter {
  private readonly muxer: OggOpusMuxer;
  private readonly cutGapMs: number;
  private readonly jitterMs: number;
  private readonly maxChunkMs: number;
  private open: { seq: number; startMs: number; samples: number } | null = null;
  /** Where the next frame goes on the track clock; null after a cut or pause. */
  private cursor: number | null = null;
  private nextSeq = 0;
  private headersWritten = false;

  /** `startedAt` is the wall-clock ms the track starts (its first packet). */
  constructor(readonly startedAt: number, private readonly onChunk: (c: WrittenChunk) => void, opts: TrackWriterOptions = {}) {
    this.muxer = new OggOpusMuxer();
    this.cutGapMs = opts.cutGapMs ?? 8_000;
    this.jitterMs = opts.jitterMs ?? 60;
    this.maxChunkMs = opts.maxChunkMs ?? 60_000;
  }

  /** ms of audio written so far. */
  get audioMs(): number { return Math.round(this.muxer.samples / SAMPLES_PER_MS); }

  /** Adds a packet that arrived at wall-clock `atMs`. */
  push(packet: Uint8Array, atMs: number): void {
    const rel = atMs - this.startedAt;
    if (this.cursor !== null) {
      const gap = rel - this.cursor;
      if (gap > this.cutGapMs) {
        this.closeChunk(false);
        this.cursor = null;
      } else if (gap > this.jitterMs) {
        this.ensureOpen();
        for (let n = Math.floor(gap / FRAME_MS); n > 0; n--) this.write(OPUS_SILENCE);
      }
    }
    if (this.cursor === null) this.cursor = Math.max(0, rel);
    this.ensureOpen();
    this.write(packet);
    if (this.open && this.open.samples / SAMPLES_PER_MS >= this.maxChunkMs) this.closeChunk(false);
  }

  /** Stops the current stretch: what comes after a pause starts a new chunk. */
  pause(): void {
    this.closeChunk(false);
    this.cursor = null;
  }

  /** Writes out whatever is left, marking the end of the stream. */
  finish(): void {
    this.closeChunk(true);
    this.cursor = null;
  }

  private ensureOpen() {
    if (this.open) return;
    this.open = { seq: this.nextSeq++, startMs: Math.round(this.cursor ?? 0), samples: 0 };
  }

  private write(packet: Uint8Array) {
    const samples = opusPacketSamples(packet);
    this.muxer.add(packet);
    this.open!.samples += samples;
    this.cursor = (this.cursor ?? 0) + samples / SAMPLES_PER_MS;
  }

  private closeChunk(end: boolean) {
    const c = this.open;
    if (!c || c.samples === 0) return;
    this.open = null;
    const head = this.headersWritten ? null : this.muxer.headers();
    this.headersWritten = true;
    const pages = this.muxer.flush(end);
    const bytes = head ? new Uint8Array(head.length + pages.length) : pages;
    if (head) { bytes.set(head); bytes.set(pages, head.length); }
    this.onChunk({ seq: c.seq, bytes, startMs: c.startMs, durationMs: Math.round(c.samples / SAMPLES_PER_MS) });
  }
}
