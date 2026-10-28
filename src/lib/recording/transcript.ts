// src/lib/recording/transcript.ts
// -----------------------------------------------------------
// Pure helpers for turning a transcription into transcript lines on the
// session's clock. Shared by the browser and the /api/transcription function
// (which resolves modules differently), so this file imports nothing; its
// types mirror the ones in database.types.ts.
// -----------------------------------------------------------

export type TrackSource = 'table' | 'discord' | 'upload';

/** Matches TranscriptSegmentInsert in database.types.ts. */
export interface SegmentInsert {
  recording_id: string;
  track_id: string;
  start_ms: number;
  end_ms: number;
  speaker_label: string | null;
  pc_id: string | null;
  is_dm: boolean;
  text: string;
  dropped_as_echo: boolean;
}

export interface ChunkTiming {
  seq: number;
  start_ms: number;          // wall-clock ms from track start to the chunk's first sample
  duration_ms: number | null; // ms of audio in the chunk
}

/**
 * Maps a time in a track's audio file onto the session clock. A recorded track
 * skips paused time, so its audio is shorter than the wall-clock span; the
 * chunk timings say where each stretch of audio really happened. Tracks with
 * no chunks (uploads) map straight through.
 */
export function audioToSessionMs(audioMs: number, chunks: ChunkTiming[], trackOffsetMs: number): number {
  const sorted = [...chunks].sort((a, b) => a.seq - b.seq);
  let audioBefore = 0;
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const dur = c.duration_ms ?? 0;
    if (audioMs < audioBefore + dur || i === sorted.length - 1) {
      return Math.round(trackOffsetMs + c.start_ms + (audioMs - audioBefore));
    }
    audioBefore += dur;
  }
  return Math.round(trackOffsetMs + audioMs);
}

/** One speaker turn, as AssemblyAI returns it (times in ms of track audio). */
export interface Utterance {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

export interface TrackForTranscript {
  id: string;
  recording_id: string;
  source: TrackSource;
  label: string | null;
  pc_id: string | null;
  offset_ms: number;
}

const MAX_LINE = 8_000; // transcript_segments.text limit

export function utterancesToSegments(utterances: Utterance[], track: TrackForTranscript, chunks: ChunkTiming[]): SegmentInsert[] {
  const out: SegmentInsert[] = [];
  for (const u of utterances) {
    const text = u.text.trim().slice(0, MAX_LINE);
    if (!text) continue;
    out.push({
      recording_id: track.recording_id,
      track_id: track.id,
      start_ms: audioToSessionMs(u.start, chunks, track.offset_ms),
      end_ms: audioToSessionMs(u.end, chunks, track.offset_ms),
      // A Discord track is one person; the table mic and uploads are diarized ("A", "B", …).
      speaker_label: track.source === 'discord' ? (track.label ?? 'Discord') : `Speaker ${u.speaker}`,
      pc_id: track.source === 'discord' ? track.pc_id : null,
      is_dm: false,
      text,
      dropped_as_echo: false,
    });
  }
  return out;
}

// --------------- Echo ---------------

const words = (s: string) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean));

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size);
}

export interface EchoCandidate {
  id: string;
  source: TrackSource;
  start_ms: number;
  text: string;
}

/**
 * Table-mic lines that are the room hearing a Discord player through the
 * speakers. A Discord track is the clean copy, so a table line that says the
 * same thing at about the same moment is dropped. Returns the ids to drop.
 */
export function findEchoes(segments: EchoCandidate[], windowMs = 2_500, threshold = 0.6): string[] {
  const discord = segments.filter(s => s.source === 'discord').map(s => ({ ...s, w: words(s.text) }));
  if (discord.length === 0) return [];
  const drop: string[] = [];
  for (const s of segments) {
    if (s.source !== 'table') continue;
    const w = words(s.text);
    if (w.size < 2) continue; // "yeah" / "okay" match everything
    const echoed = discord.some(d => Math.abs(d.start_ms - s.start_ms) <= windowMs && similarity(w, d.w) >= threshold);
    if (echoed) drop.push(s.id);
  }
  return drop;
}

// --------------- Key terms ---------------

export const MAX_KEYTERMS = 200;   // AssemblyAI's limit on its fallback model
const MAX_TERM_WORDS = 6;

/**
 * Campaign names to bias recognition toward ("Ysolde Varn", "Saltmarsh Gate"),
 * which a speech model would otherwise spell as ordinary words. Earlier names
 * win when there are too many, so pass the most important kinds first.
 */
export function buildKeyterms(names: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw?.replace(/\s+/g, ' ').trim();
    if (!name || name.length > 100) continue;
    if (name.split(' ').length > MAX_TERM_WORDS) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length === MAX_KEYTERMS) break;
  }
  return out;
}
