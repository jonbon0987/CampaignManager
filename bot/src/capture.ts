// bot/src/capture.ts
// -----------------------------------------------------------
// Records one session recording's Discord voice channel: a track per player,
// built by DiscordTrackWriter and uploaded chunk by chunk as it goes, so a
// crash loses at most the last minute. Only players the campaign may record
// (Store.speakers) are subscribed to; anyone else in the channel is never heard.
// -----------------------------------------------------------

import {
  EndBehaviorType, VoiceConnectionStatus, entersState, joinVoiceChannel, type VoiceConnection,
} from '@discordjs/voice';
import type { Client, Guild, VoiceBasedChannel } from 'discord.js';
import { ANNOUNCE_START, ANNOUNCE_STOP } from './messages.js';
import type { RecordingRow, Speaker, Store } from './store.js';
import { DiscordTrackWriter, type WrittenChunk } from './trackWriter.js';

interface PlayerTrack {
  writer: DiscordTrackWriter;
  trackId: Promise<string>;
  /** Uploads run one after another, in order. */
  uploads: Promise<void>;
  parts: Uint8Array[];
  failed: boolean;
}

const RETRIES = [2_000, 5_000, 15_000];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class Capture {
  private connection: VoiceConnection | null = null;
  private channel: VoiceBasedChannel | null = null;
  private players = new Map<string, PlayerTrack>();
  private subscribed = new Set<string>();
  private speakers = new Map<string, Speaker>();
  private paused = false;
  private stopped = false;
  private drops = 0;

  constructor(private readonly client: Client, private readonly store: Store, private recording: RecordingRow, private readonly log: (msg: string) => void) {}

  get id() { return this.recording.id; }

  async start(): Promise<void> {
    const target = this.recording.settings.discord;
    if (!target) throw new Error('This recording has no Discord channel set.');
    const guild: Guild = await this.client.guilds.fetch(target.guildId);
    const channel = await guild.channels.fetch(target.channelId);
    if (!channel?.isVoiceBased()) throw new Error(`The bot can’t see the voice channel ${target.channelName}.`);
    this.channel = channel;
    this.speakers = await this.store.speakers(this.recording.campaign_id);
    this.paused = !!this.recording.paused_at;
    await this.connect();
    await this.store.setDiscord(this.id, 'recording', this.detail());
    await this.channel.send(ANNOUNCE_START).catch(() => this.log('Couldn’t post the recording notice (the bot needs Send Messages in that channel).'));
  }

  /** Brings the capture in line with the recording row (pause, who may be recorded). */
  async sync(row: RecordingRow): Promise<void> {
    this.recording = row;
    const paused = !!row.paused_at;
    if (paused !== this.paused) {
      this.paused = paused;
      if (paused) for (const p of this.players.values()) p.writer.pause();
    }
    const before = [...this.speakers.keys()].sort().join();
    this.speakers = await this.store.speakers(row.campaign_id);
    if ([...this.speakers.keys()].sort().join() !== before) {
      // Someone was linked or withdrew. Stop listening to anyone no longer allowed.
      for (const id of this.subscribed) {
        if (!this.speakers.has(id)) { this.connection?.receiver.subscriptions.get(id)?.destroy(); this.subscribed.delete(id); }
      }
      await this.store.setDiscord(this.id, 'recording', this.detail());
    }
  }

  /** Ends capture, uploads what's left and joins each player's file. */
  async finish(): Promise<string> {
    this.stopped = true;
    await this.store.setDiscord(this.id, 'finishing', 'Saving the Discord audio…');
    for (const p of this.players.values()) p.writer.finish();
    await this.channel?.send(ANNOUNCE_STOP).catch(() => {});
    this.disconnect();
    let saved = 0;
    for (const p of this.players.values()) {
      await p.uploads;
      const trackId = await p.trackId;
      if (!p.parts.length) continue;
      if (p.failed) continue; // left for assembleFromStorage, which rebuilds from what did upload
      await this.store.assembleTrack(this.id, trackId, p.parts, p.writer.audioMs);
      saved++;
    }
    return `${saved} Discord player${saved === 1 ? '' : 's'} recorded${this.drops ? ` · the connection dropped ${this.drops}× and rejoined` : ''}.`;
  }

  /**
   * The bot is quitting mid-session: upload what's held and leave. The
   * recording stays open, so starting the bot again carries on (in new tracks),
   * and the end of the session joins these from storage.
   */
  async suspend(): Promise<void> {
    this.stopped = true;
    for (const p of this.players.values()) p.writer.pause();
    this.disconnect();
    await Promise.all([...this.players.values()].map(p => p.uploads));
    await this.store.setDiscord(this.id, 'recording', 'The bot was stopped. Start it again to keep recording Discord.');
  }

  /** Stops without saving (the recording was deleted). */
  abandon(): void {
    this.stopped = true;
    this.disconnect();
  }

  // --------------- Voice ---------------

  private async connect(): Promise<void> {
    const channel = this.channel!;
    const connection = joinVoiceChannel({
      channelId: channel.id, guildId: channel.guild.id, adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false, selfMute: true,
    });
    this.connection = connection;
    this.subscribed.clear();
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    connection.receiver.speaking.on('start', userId => this.listen(userId));
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      if (this.stopped) return;
      try {
        // Moving channels or a brief network blip reconnects by itself.
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        connection.destroy();
        if (this.stopped) return;
        this.drops++;
        for (const p of this.players.values()) p.writer.pause();
        this.log(`Dropped from ${channel.name}; rejoining.`);
        await this.connect().catch(e => this.store.setDiscord(this.id, 'recording', `Lost the voice connection: ${errText(e)}`));
        await this.store.setDiscord(this.id, 'recording', this.detail()).catch(() => {});
      }
    });
  }

  private disconnect() {
    try { this.connection?.destroy(); } catch { /* already gone */ }
    this.connection = null;
  }

  private listen(userId: string) {
    if (this.stopped || this.subscribed.has(userId) || !this.speakers.has(userId) || !this.connection) return;
    this.subscribed.add(userId);
    const stream = this.connection.receiver.subscribe(userId, { end: { behavior: EndBehaviorType.Manual } });
    stream.on('data', (packet: Buffer) => this.onPacket(userId, new Uint8Array(packet)));
    stream.on('close', () => this.subscribed.delete(userId));
    stream.on('error', e => this.log(`Audio from ${userId}: ${errText(e)}`));
  }

  private onPacket(userId: string, packet: Uint8Array) {
    if (this.paused || this.stopped) return;
    const now = Date.now();
    let p = this.players.get(userId);
    if (!p) p = this.addPlayer(userId, now);
    p.writer.push(packet, now);
  }

  private addPlayer(userId: string, now: number): PlayerTrack {
    const speaker = this.speakers.get(userId)!;
    const member = this.channel?.members.get(userId);
    const label = member?.displayName ?? speaker.name ?? 'Discord player';
    const trackId = this.store.createTrack(this.id, {
      discordUserId: userId, label, pcId: speaker.pcId, offsetMs: now - Date.parse(this.recording.started_at),
    });
    const p: PlayerTrack = {
      writer: new DiscordTrackWriter(now, c => this.queueUpload(p, c)),
      trackId, uploads: Promise.resolve(), parts: [], failed: false,
    };
    trackId.catch(e => { p.failed = true; this.log(`Couldn’t create a track for ${label}: ${errText(e)}`); });
    this.players.set(userId, p);
    this.log(`Recording ${label}.`);
    return p;
  }

  private queueUpload(p: PlayerTrack, c: WrittenChunk) {
    p.parts.push(c.bytes);
    p.uploads = p.uploads.then(async () => {
      const trackId = await p.trackId;
      for (let attempt = 0; ; attempt++) {
        try {
          await this.store.uploadChunk(this.id, trackId, c);
          return;
        } catch (e) {
          if (attempt >= RETRIES.length) {
            p.failed = true;
            this.log(`Gave up uploading chunk ${c.seq}: ${errText(e)}`);
            return;
          }
          await sleep(RETRIES[attempt]);
        }
      }
    }).catch(() => { p.failed = true; });
  }

  private detail(): string {
    const name = this.recording.settings.discord?.channelName ?? 'voice';
    const there = this.channel ? [...this.channel.members.values()].filter(m => !m.user.bot) : [];
    const heard = there.filter(m => this.speakers.has(m.id)).length;
    const left = there.length - heard;
    return `In #${name} · recording ${heard} of ${there.length}${left ? ` (${left} not linked or not agreed)` : ''}${this.paused ? ' · paused' : ''}.`;
  }
}

/**
 * Joins the files of Discord tracks nobody holds in memory: the bot restarted
 * mid-session, or an upload failed and was retried later. Rebuilds them from
 * the chunks that reached storage.
 */
export async function assembleFromStorage(store: Store, recordingId: string): Promise<number> {
  let n = 0;
  for (const t of await store.discordTracks(recordingId)) {
    if (t.storage_path) continue;
    const { bytes, durationMs } = await store.downloadChunks(t.id);
    if (!bytes.length) continue;
    await store.assembleTrack(recordingId, t.id, bytes, durationMs);
    n++;
  }
  return n;
}
