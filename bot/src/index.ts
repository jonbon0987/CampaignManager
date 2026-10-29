// bot/src/index.ts
// -----------------------------------------------------------
// DM Lair's Discord bot. Run it on the machine you play from:
//
//   npm run bot
//
// It never talks to the app directly. Every few seconds it:
//   * reports that it's alive and which channels it can see (discord_bot_presence),
//   * starts, pauses, resumes or finishes capture for recordings that asked for
//     a Discord channel (session_recordings.settings.discord / discord_state),
//   * sends any messages the app queued (discord_posts).
// -----------------------------------------------------------

import { ChannelType, Client, Events, GatewayIntentBits, type Guild } from 'discord.js';
import { Capture, assembleFromStorage } from './capture.js';
import { loadConfig } from './config.js';
import { splitMessage } from './messages.js';
import { Store, type GuildSnapshot, type RecordingRow } from './store.js';

const RECORDINGS_EVERY_MS = 2_000;
const HEARTBEAT_EVERY_MS = 15_000;
const POSTS_EVERY_MS = 5_000;

const log = (msg: string) => console.log(`${new Date().toLocaleTimeString()}  ${msg}`);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const cfg = (() => {
  try {
    return loadConfig();
  } catch (e) {
    console.error(errText(e));
    process.exit(1);
  }
})();
const store = new Store(cfg);
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const captures = new Map<string, Capture>();

// --------------- Presence ---------------

function snapshot(guild: Guild): GuildSnapshot {
  const me = guild.members.me;
  const channels = [...guild.channels.cache.values()];
  return {
    id: guild.id,
    name: guild.name,
    voice: channels
      .filter(c => c.isVoiceBased() && (!me || c.permissionsFor(me)?.has('Connect')))
      .map(c => ({
        id: c.id,
        name: c.name,
        members: c.isVoiceBased() ? [...c.members.values()].map(m => ({ id: m.id, name: m.displayName, ...(m.user.bot ? { bot: true } : {}) })) : [],
      })),
    text: channels
      .filter(c => c.type === ChannelType.GuildText && (!me || c.permissionsFor(me)?.has('SendMessages')))
      .map(c => ({ id: c.id, name: c.name })),
  };
}

let beatTimer: NodeJS.Timeout | null = null;
async function heartbeat() {
  try {
    await store.heartbeat(client.user?.tag ?? 'DM Lair bot', [...client.guilds.cache.values()].map(snapshot));
  } catch (e) {
    log(`Couldn’t report to DM Lair: ${errText(e)}`);
  }
}
/** Someone joined or left a channel: tell the app soon, not at the next beat. */
function heartbeatSoon() {
  if (beatTimer) clearTimeout(beatTimer);
  beatTimer = setTimeout(() => { beatTimer = null; void heartbeat(); }, 1_000);
}

// --------------- Recordings ---------------

async function finish(cap: Capture | undefined, rec: RecordingRow) {
  await store.setDiscord(rec.id, 'finishing', 'Saving the Discord audio…');
  let detail = cap ? await cap.finish() : '';
  const recovered = await assembleFromStorage(store, rec.id);
  if (!cap) detail = recovered ? `${recovered} Discord track${recovered === 1 ? '' : 's'} rebuilt from what was uploaded.` : 'Nothing was recorded on Discord.';
  await store.setDiscord(rec.id, 'done', detail);
  log(`Finished ${rec.id}: ${detail}`);
}

let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const active = await store.activeRecordings();
    const seen = new Set(active.map(r => r.id));
    for (const rec of active) {
      const cap = captures.get(rec.id);
      try {
        if (rec.status === 'recording') {
          if (!cap) {
            const next = new Capture(client, store, rec, log);
            captures.set(rec.id, next);
            log(`Joining ${rec.settings.discord?.channelName ?? 'voice'} for recording ${rec.id}.`);
            await next.start();
          } else {
            await cap.sync(rec);
          }
        } else {
          captures.delete(rec.id);
          await finish(cap, rec);
        }
      } catch (e) {
        captures.delete(rec.id);
        cap?.abandon();
        log(`Recording ${rec.id}: ${errText(e)}`);
        await store.setDiscord(rec.id, 'failed', errText(e)).catch(() => {});
      }
    }
    // A capture whose recording vanished was deleted (Discard): drop it.
    for (const [id, cap] of captures) {
      if (seen.has(id)) continue;
      const rec = await store.recording(id);
      if (!rec) { cap.abandon(); captures.delete(id); log(`Recording ${id} was deleted; stopped.`); }
    }
  } catch (e) {
    log(`Checking recordings failed: ${errText(e)}`);
  } finally {
    busy = false;
  }
}

// --------------- Outbox ---------------

let posting = false;
async function sendPosts() {
  if (posting) return;
  posting = true;
  try {
    for (const post of await store.pendingPosts()) {
      try {
        const channel = await client.channels.fetch(post.channel_id);
        if (!channel?.isSendable()) throw new Error('The bot can’t post in that channel.');
        for (const part of splitMessage(post.content)) await channel.send(part);
        await store.markPost(post.id, true);
        log(`Posted a recap to #${'name' in channel ? channel.name : post.channel_id}.`);
      } catch (e) {
        await store.markPost(post.id, false, errText(e));
      }
    }
  } catch (e) {
    log(`Checking queued posts failed: ${errText(e)}`);
  } finally {
    posting = false;
  }
}

// --------------- Start ---------------

client.once(Events.ClientReady, async c => {
  log(`Signed in to Discord as ${c.user.tag}, in ${c.guilds.cache.size} server${c.guilds.cache.size === 1 ? '' : 's'}.`);
  if (c.guilds.cache.size === 0) log('Invite the bot to your server first (see bot/README.md).');
  await heartbeat();
  setInterval(() => void heartbeat(), HEARTBEAT_EVERY_MS);
  setInterval(() => void tick(), RECORDINGS_EVERY_MS);
  setInterval(() => void sendPosts(), POSTS_EVERY_MS);
  void tick();
});
client.on(Events.VoiceStateUpdate, heartbeatSoon);
client.on(Events.ChannelCreate, heartbeatSoon);
client.on(Events.ChannelDelete, heartbeatSoon);
client.on(Events.GuildCreate, heartbeatSoon);
client.on(Events.GuildDelete, heartbeatSoon);

// Ctrl-C: upload what's held so no audio is stranded in memory. Recordings
// stay open; starting the bot again picks them back up.
let quitting = false;
async function shutdown() {
  if (quitting) process.exit(1);
  quitting = true;
  log('Uploading what’s been recorded before quitting…');
  await Promise.all([...captures.values()].map(cap => cap.suspend().catch(e => log(errText(e)))));
  client.destroy();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await client.login(cfg.discordToken);
