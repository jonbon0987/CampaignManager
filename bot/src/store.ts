// bot/src/store.ts
// -----------------------------------------------------------
// Everything the bot reads and writes in Supabase. It uses the service-role
// key, which skips row-level security, so every query here is pinned to the
// one DM it runs for (ownerId) and every row it writes carries that user_id.
// Table shapes: migrations 0032 and 0033 (and src/lib/database.types.ts).
// -----------------------------------------------------------

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { BotConfig } from './config.js';
import type { WrittenChunk } from './trackWriter.js';

export const BUCKET = 'session-audio';
export const OGG = 'audio/ogg';

export type DiscordState = 'connecting' | 'recording' | 'finishing' | 'done' | 'failed';

export interface DiscordTarget { guildId: string; channelId: string; channelName: string }

export interface RecordingRow {
  id: string;
  campaign_id: string;
  session_id: string;
  status: string;
  started_at: string;
  paused_at: string | null;
  settings: { discord?: DiscordTarget } & Record<string, unknown>;
  discord_state: DiscordState | null;
}

export interface TrackRow {
  id: string;
  source: string;
  discord_user_id: string | null;
  storage_path: string | null;
}

export interface Speaker { pcId: string | null; isDm: boolean; name: string | null }

export interface PostRow { id: string; channel_id: string; content: string }

export interface GuildSnapshot {
  id: string;
  name: string;
  voice: { id: string; name: string; members: { id: string; name: string; bot?: boolean }[] }[];
  text: { id: string; name: string }[];
}

/** `00007.ogg` — the same naming the app's uploader uses (src/lib/recording/uploader.ts). */
export const chunkFile = (seq: number) => `${String(seq).padStart(5, '0')}.ogg`;

const errText = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e));

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(errText(error));
  return data;
}

export class Store {
  readonly sb: SupabaseClient;
  readonly owner: string;

  constructor(cfg: BotConfig) {
    this.sb = createClient(cfg.supabaseUrl, cfg.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    this.owner = cfg.ownerId;
  }

  path(recordingId: string, trackId: string, file: string) {
    return `${this.owner}/${recordingId}/${trackId}/${file}`;
  }

  // --------------- Presence ---------------

  async heartbeat(botTag: string, guilds: GuildSnapshot[]) {
    await must(this.sb.from('discord_bot_presence').upsert(
      { user_id: this.owner, bot_tag: botTag.slice(0, 120), heartbeat_at: new Date().toISOString(), guilds },
      { onConflict: 'user_id' },
    ).select('id'));
  }

  // --------------- Recordings ---------------

  /** Recordings that want Discord and aren't finished with it yet. */
  async activeRecordings(): Promise<RecordingRow[]> {
    return (await must(this.sb.from('session_recordings')
      .select('id, campaign_id, session_id, status, started_at, paused_at, settings, discord_state')
      .eq('user_id', this.owner)
      .in('discord_state', ['connecting', 'recording', 'finishing'])) ?? []) as RecordingRow[];
  }

  async recording(id: string): Promise<RecordingRow | null> {
    return must(this.sb.from('session_recordings')
      .select('id, campaign_id, session_id, status, started_at, paused_at, settings, discord_state')
      .eq('user_id', this.owner).eq('id', id).maybeSingle());
  }

  async setDiscord(id: string, state: DiscordState, detail: string | null) {
    await must(this.sb.from('session_recordings')
      .update({ discord_state: state, discord_detail: detail?.slice(0, 500) ?? null })
      .eq('user_id', this.owner).eq('id', id).select('id'));
  }

  /**
   * The Discord accounts this campaign may record: linked to a player character
   * whose player has agreed (and not withdrawn), or linked as the DM.
   */
  async speakers(campaignId: string): Promise<Map<string, Speaker>> {
    const [links, consents] = await Promise.all([
      must(this.sb.from('speaker_links').select('discord_user_id, discord_username, pc_id, is_dm').eq('user_id', this.owner).eq('campaign_id', campaignId)),
      must(this.sb.from('player_consents').select('pc_id, revoked_at').eq('user_id', this.owner).eq('campaign_id', campaignId)),
    ]) as [{ discord_user_id: string; discord_username: string | null; pc_id: string | null; is_dm: boolean }[], { pc_id: string; revoked_at: string | null }[]];
    const agreed = new Set(consents.filter(c => !c.revoked_at).map(c => c.pc_id));
    const out = new Map<string, Speaker>();
    for (const l of links) {
      if (l.is_dm || (l.pc_id && agreed.has(l.pc_id))) out.set(l.discord_user_id, { pcId: l.pc_id, isDm: l.is_dm, name: l.discord_username });
    }
    return out;
  }

  // --------------- Tracks and audio ---------------

  async createTrack(recordingId: string, t: { discordUserId: string; label: string; pcId: string | null; offsetMs: number }): Promise<string> {
    const row = await must(this.sb.from('recording_tracks').insert({
      user_id: this.owner, recording_id: recordingId, source: 'discord', label: t.label.slice(0, 120),
      discord_user_id: t.discordUserId, pc_id: t.pcId, offset_ms: Math.max(0, Math.round(t.offsetMs)), mime_type: OGG,
    }).select('id').single()) as { id: string };
    return row.id;
  }

  async discordTracks(recordingId: string): Promise<TrackRow[]> {
    return (await must(this.sb.from('recording_tracks').select('id, source, discord_user_id, storage_path')
      .eq('user_id', this.owner).eq('recording_id', recordingId).eq('source', 'discord')) ?? []) as TrackRow[];
  }

  async uploadChunk(recordingId: string, trackId: string, c: WrittenChunk) {
    const path = this.path(recordingId, trackId, chunkFile(c.seq));
    await must(this.sb.storage.from(BUCKET).upload(path, new Blob([c.bytes.slice()], { type: OGG }), { contentType: OGG, upsert: true }));
    await must(this.sb.from('recording_chunks').upsert({
      user_id: this.owner, track_id: trackId, seq: c.seq, storage_path: path,
      start_ms: c.startMs, duration_ms: c.durationMs, byte_size: c.bytes.length,
    }, { onConflict: 'track_id,seq' }).select('id'));
  }

  /** A track's chunks from storage, in order, with their total audio length. */
  async downloadChunks(trackId: string): Promise<{ bytes: Uint8Array[]; durationMs: number }> {
    const rows = await must(this.sb.from('recording_chunks').select('seq, storage_path, duration_ms')
      .eq('user_id', this.owner).eq('track_id', trackId).order('seq')) as { seq: number; storage_path: string; duration_ms: number | null }[];
    const bytes: Uint8Array[] = [];
    for (const r of rows) {
      const blob = await must(this.sb.storage.from(BUCKET).download(r.storage_path)) as Blob;
      bytes.push(new Uint8Array(await blob.arrayBuffer()));
    }
    return { bytes, durationMs: rows.reduce((n, r) => n + (r.duration_ms ?? 0), 0) };
  }

  /** Stores the joined file and marks the track ready to transcribe. */
  async assembleTrack(recordingId: string, trackId: string, parts: Uint8Array[], durationMs: number) {
    const path = this.path(recordingId, trackId, 'full.ogg');
    await must(this.sb.storage.from(BUCKET).upload(path, new Blob(parts.map(p => p.slice()), { type: OGG }), { contentType: OGG, upsert: true }));
    await must(this.sb.from('recording_tracks').update({ storage_path: path, duration_ms: durationMs, mime_type: OGG })
      .eq('user_id', this.owner).eq('id', trackId).select('id'));
  }

  // --------------- Outbox ---------------

  async pendingPosts(): Promise<PostRow[]> {
    return (await must(this.sb.from('discord_posts').select('id, channel_id, content')
      .eq('user_id', this.owner).eq('status', 'pending').order('created_at').limit(10)) ?? []) as PostRow[];
  }

  async markPost(id: string, ok: boolean, error?: string) {
    await must(this.sb.from('discord_posts').update(ok
      ? { status: 'sent', sent_at: new Date().toISOString(), error: null }
      : { status: 'failed', error: (error ?? 'Couldn’t send').slice(0, 500) },
    ).eq('user_id', this.owner).eq('id', id).select('id'));
  }
}
