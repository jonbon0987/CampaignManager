// api/_transcript.ts
// -----------------------------------------------------------
// A recording's transcript, read as the signed-in user (under row-level
// security) for the endpoints that write from it: the chronicle and the
// player recap. Each line is named by who spoke: the DM, a PC as
// "Character (Player)", or the label speech-to-text gave an unknown voice.
// -----------------------------------------------------------

import type { userSupabase } from './_auth.js';
import { clockLabel, type TranscriptLine } from '../src/lib/recording/chronicle.js';

type Supa = ReturnType<typeof userSupabase>;

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

export interface Transcript {
  lines: TranscriptLine[];
  /** The moments the DM marked while playing, one "- h:mm:ss label" per line; '' for none. */
  moments: string;
  pcs: { id: string; character_name: string; player_name: string | null }[];
}

/** The recording's transcript in order, without echoes. Throws a 409 when there's none yet. */
export async function loadTranscript(sb: Supa, recordingId: string, campaignId: string): Promise<Transcript> {
  const [segments, pcs, moments] = await Promise.all([
    must(sb.from('transcript_segments').select('start_ms, speaker_label, pc_id, is_dm, text').eq('recording_id', recordingId).eq('dropped_as_echo', false).order('start_ms')),
    must(sb.from('player_characters').select('id, character_name, player_name').eq('campaign_id', campaignId)),
    must(sb.from('recording_moments').select('at_ms, label').eq('recording_id', recordingId).order('at_ms')),
  ]);
  if (segments.length === 0) throw new HttpError(409, 'This recording has no transcript yet.');

  const pcList = pcs as Transcript['pcs'];
  const pcById = new Map(pcList.map(p => [p.id, p]));
  const lines: TranscriptLine[] = (segments as { start_ms: number; speaker_label: string | null; pc_id: string | null; is_dm: boolean; text: string }[]).map(s => {
    const pc = s.pc_id ? pcById.get(s.pc_id) : undefined;
    const speaker = s.is_dm ? 'DM' : pc ? (pc.player_name ? `${pc.character_name} (${pc.player_name})` : pc.character_name) : s.speaker_label ?? 'Unknown';
    return { start_ms: s.start_ms, speaker, text: s.text };
  });
  const momentText = (moments as { at_ms: number; label: string | null }[])
    .map(m => `- ${clockLabel(m.at_ms)}${m.label ? ` ${m.label}` : ''}`).join('\n');
  return { lines, moments: momentText, pcs: pcList };
}
