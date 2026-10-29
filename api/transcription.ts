// api/transcription.ts
// -----------------------------------------------------------
// Transcribes a session recording with AssemblyAI.
//
//   POST { recordingId, action: 'start' }  submits every track that hasn't been
//                                          transcribed (or failed) by signed URL
//   POST { recordingId, action: 'poll' }   checks submitted tracks, and saves
//                                          finished ones as transcript lines
//
// The app polls while a recording is transcribing rather than waiting on a
// webhook, so this works the same against a local dev server (which AssemblyAI
// can't reach) as in production. Everything runs as the signed-in user, so
// row-level security applies to every read and write.
// -----------------------------------------------------------

import './_env.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth, userSupabase } from './_auth.js';
import {
  buildKeyterms, findEchoes, utterancesToSegments, type Utterance,
} from '../src/lib/recording/transcript.js';

type Supa = ReturnType<typeof userSupabase>;

const AAI = 'https://api.assemblyai.com/v2/transcript';
const BUCKET = 'session-audio';
const SIGNED_URL_SECONDS = 6 * 3600; // AssemblyAI fetches the audio soon after submit; queues can be slow
const INSERT_BATCH = 500;

interface RecordingRow {
  id: string;
  user_id: string;
  campaign_id: string;
  status: string;
  duration_ms: number | null;
  settings: { tablePcIds?: string[] } | null;
}

interface TrackRow {
  id: string;
  recording_id: string;
  source: 'table' | 'discord' | 'upload';
  label: string | null;
  discord_user_id: string | null;
  pc_id: string | null;
  offset_ms: number;
  storage_path: string | null;
  duration_ms: number | null;
  transcription_status: 'pending' | 'submitted' | 'done' | 'failed';
  transcription_job_id: string | null;
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function apiKey(): string {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) throw new HttpError(503, 'Transcription isn’t set up: ASSEMBLYAI_API_KEY is missing from this environment.');
  return key;
}

async function aai(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`${AAI}${path}`, {
    ...init,
    headers: { authorization: apiKey(), 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) throw new HttpError(502, `AssemblyAI: ${String(body.error ?? res.statusText)}`);
  return body;
}

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

// Row-level security hides other users' recordings, so "not found" covers both.
async function loadRecording(sb: Supa, recordingId: string): Promise<RecordingRow> {
  const { data, error } = await sb.from('session_recordings').select('*').eq('id', recordingId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HttpError(404, 'Recording not found.');
  return data as RecordingRow;
}

/** Names from this campaign to help the model spell them. */
async function campaignKeyterms(sb: Supa, campaignId: string): Promise<string[]> {
  const names = async (table: string, col: string) =>
    ((await sb.from(table).select(col).eq('campaign_id', campaignId)).data ?? []) as unknown as Record<string, string | null>[];
  const linked = async (join: string, fk: string, table: string, col: string) => {
    const ids = (((await sb.from(join).select(fk).eq('campaign_id', campaignId)).data ?? []) as unknown as Record<string, string>[]).map(r => r[fk]);
    if (ids.length === 0) return [];
    return ((await sb.from(table).select(col).in('id', ids)).data ?? []) as unknown as Record<string, string | null>[];
  };
  const [pcs, npcs, npcsLinked, locs, locsLinked, factions, lore, loreLinked, hooks] = await Promise.all([
    sb.from('player_characters').select('character_name, player_name').eq('campaign_id', campaignId).then(r => r.data ?? []),
    names('npcs', 'name'), linked('campaign_npcs', 'npc_id', 'npcs', 'name'),
    names('locations', 'name'), linked('campaign_locations', 'location_id', 'locations', 'name'),
    names('factions', 'name'),
    names('lore_entries', 'title'), linked('campaign_lore', 'lore_id', 'lore_entries', 'title'),
    names('hooks', 'title'),
  ]);
  return buildKeyterms([
    ...pcs.flatMap(p => [p.character_name, p.player_name]),
    ...[...npcs, ...npcsLinked].map(r => r.name),
    ...[...locs, ...locsLinked].map(r => r.name),
    ...factions.map(r => r.name),
    ...[...lore, ...loreLinked].map(r => r.title),
    ...hooks.map(r => r.title),
  ]);
}

async function start(sb: Supa, recordingId: string) {
  const rec = await loadRecording(sb, recordingId);
  const tracks = await must(sb.from('recording_tracks').select('*').eq('recording_id', recordingId)) as TrackRow[];
  const toSend = tracks.filter(t => t.storage_path && (t.transcription_status === 'pending' || t.transcription_status === 'failed'));
  if (toSend.length === 0) return;

  const keyterms = await campaignKeyterms(sb, rec.campaign_id).catch(() => []);
  const atTable = Array.isArray(rec.settings?.tablePcIds) ? rec.settings.tablePcIds.length : 0;

  for (const t of toSend) {
    const signed = await must(sb.storage.from(BUCKET).createSignedUrl(t.storage_path!, SIGNED_URL_SECONDS));
    // Speaker labels are what make AssemblyAI return utterances (speaker turns),
    // so they're on even for a Discord track, which is one person.
    const body: Record<string, unknown> = {
      audio_url: signed.signedUrl,
      speaker_labels: true,
      ...(keyterms.length ? { keyterms_prompt: keyterms } : {}),
    };
    if (t.source === 'discord') {
      body.speakers_expected = 1;
    } else if (t.source === 'table' && atTable > 0) {
      // Players plus the DM; allow a couple of guests or voices the DM does in character.
      body.speaker_options = { min_speakers_expected: 1, max_speakers_expected: atTable + 3 };
    }
    const job = await aai('', { method: 'POST', body: JSON.stringify(body) });
    await must(sb.from('recording_tracks').update({ transcription_status: 'submitted', transcription_job_id: String(job.id) }).eq('id', t.id).select());
  }
  await must(sb.from('session_recordings').update({ status: 'processing', status_detail: 'Transcribing…' }).eq('id', recordingId).select());
}

async function poll(sb: Supa, recordingId: string) {
  const rec = await loadRecording(sb, recordingId);
  let tracks = await must(sb.from('recording_tracks').select('*').eq('recording_id', recordingId)) as TrackRow[];

  for (const t of tracks.filter(t => t.transcription_status === 'submitted' && t.transcription_job_id)) {
    const job = await aai(`/${t.transcription_job_id}`);
    if (job.status === 'error') {
      await must(sb.from('recording_tracks').update({ transcription_status: 'failed' }).eq('id', t.id).select());
      await must(sb.from('session_recordings').update({
        status: 'failed', status_detail: `Transcription failed: ${String(job.error ?? 'unknown error')}`.slice(0, 500),
      }).eq('id', recordingId).select());
      continue;
    }
    if (job.status !== 'completed') continue;

    // Claim the track so a second poll running at the same time (another tab)
    // doesn't save the same lines twice. Only the poll whose update matched goes on.
    const audioMs = typeof job.audio_duration === 'number' ? Math.round(job.audio_duration * 1000) : null;
    const claimed = await must(sb.from('recording_tracks').update({
      transcription_status: 'done',
      ...(t.duration_ms == null && audioMs != null ? { duration_ms: audioMs } : {}),
    }).eq('id', t.id).eq('transcription_status', 'submitted').select('id'));
    if (!claimed?.length) continue;

    try {
      const chunks = await must(sb.from('recording_chunks').select('seq, start_ms, duration_ms').eq('track_id', t.id));
      const utterances = (job.utterances ?? []) as Utterance[];
      // A Discord account linked as the DM speaks as the DM.
      const isDm = t.source === 'discord' && t.discord_user_id
        ? !!(await must(sb.from('speaker_links').select('is_dm').eq('campaign_id', rec.campaign_id).eq('discord_user_id', t.discord_user_id).maybeSingle()) as { is_dm: boolean } | null)?.is_dm
        : false;
      const segments = utterancesToSegments(utterances, { ...t, is_dm: isDm }, chunks ?? []);
      await must(sb.from('transcript_segments').delete().eq('track_id', t.id).select('id'));
      for (let i = 0; i < segments.length; i += INSERT_BATCH) {
        await must(sb.from('transcript_segments').insert(segments.slice(i, i + INSERT_BATCH).map(s => ({ ...s, user_id: rec.user_id }))).select('id'));
      }
    } catch (err) {
      // Hand the track back so the next poll saves it again.
      await sb.from('recording_tracks').update({ transcription_status: 'submitted' }).eq('id', t.id);
      throw err;
    }
    if (rec.duration_ms == null && audioMs != null && t.source === 'upload') {
      await must(sb.from('session_recordings').update({ duration_ms: audioMs }).eq('id', recordingId).select());
    }
  }

  tracks = await must(sb.from('recording_tracks').select('*').eq('recording_id', recordingId)) as TrackRow[];
  const audible = tracks.filter(t => t.storage_path);
  if (audible.length > 0 && audible.every(t => t.transcription_status === 'done')) {
    // Every track is in: drop table-mic lines that are just Discord coming out of the speakers.
    const sourceOf = new Map(tracks.map(t => [t.id, t.source]));
    const segs = await must(sb.from('transcript_segments').select('id, track_id, start_ms, text').eq('recording_id', recordingId)) as { id: string; track_id: string; start_ms: number; text: string }[];
    const echoes = findEchoes(segs.map(s => ({ id: s.id, source: sourceOf.get(s.track_id) ?? 'table', start_ms: s.start_ms, text: s.text })));
    for (let i = 0; i < echoes.length; i += INSERT_BATCH) {
      await must(sb.from('transcript_segments').update({ dropped_as_echo: true }).in('id', echoes.slice(i, i + INSERT_BATCH)).select('id'));
    }
    if (rec.status !== 'review' && rec.status !== 'applied') {
      await must(sb.from('session_recordings').update({
        status: 'processing',
        status_detail: `Transcript ready: ${segs.length - echoes.length} lines.`,
      }).eq('id', recordingId).select());
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { recordingId, action } = (req.body ?? {}) as { recordingId?: string; action?: string };
  if (!recordingId || (action !== 'start' && action !== 'poll')) {
    return res.status(400).json({ error: 'Expected { recordingId, action: "start" | "poll" }' });
  }

  const sb = userSupabase(req);
  try {
    if (action === 'start') await start(sb, recordingId);
    else await poll(sb, recordingId);
    const recording = await must(sb.from('session_recordings').select('id, status, status_detail, duration_ms').eq('id', recordingId).single());
    const tracks = await must(sb.from('recording_tracks').select('id, label, source, transcription_status').eq('recording_id', recordingId));
    return res.status(200).json({ recording, tracks });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    console.error('transcription', action, err);
    return res.status(status).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
