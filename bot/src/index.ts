// bot/src/index.ts
// -----------------------------------------------------------
// DM Lair's Discord bot, run as a helper that takes its orders from the app.
// On a Mac it starts at login (`npm run bot:install`); `npm run bot` runs the
// same thing in a terminal.
//
// It never talks to the app directly: both read and write Supabase rows, so the
// app's buttons work wherever this runs. Every couple of seconds it:
//   * reads what the DM asked for (discord_bot_control): signed in or out, and
//     which voice channel to sit in, and does it (helper.ts decides);
//   * starts, pauses, resumes or finishes capture for recordings that asked for
//     a Discord channel (session_recordings.settings.discord / discord_state);
//   * sends any messages the app queued (discord_posts).
// And it reports how it stands (discord_bot_presence).
// -----------------------------------------------------------

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChannelType, Client, Events, GatewayIntentBits, type Guild } from 'discord.js';
import { Capture, assembleFromStorage } from './capture.js';
import { loadConfig } from './config.js';
import { plan, type VoiceTarget } from './helper.js';
import { splitMessage } from './messages.js';
import { Seat } from './seat.js';
import { Store, type GuildSnapshot, type PresenceStatus, type RecordingRow } from './store.js';

const LOOP_EVERY_MS = 2_000;
const REPORT_EVERY_MS = 15_000;
const POSTS_EVERY_MS = 5_000;
/** After a failed sign-in or join, wait this long before trying the same thing again. */
const RETRY_AFTER_MS = 60_000;
const READY_TIMEOUT_MS = 30_000;

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

// --------------- One at a time ---------------

// Two copies signed in with one token fight over the voice connection. If the
// login helper is already running, a second start (say, `npm run bot` by habit)
// says so and leaves it be.
const lockDir = join(tmpdir(), 'dm-lair');
const lockFile = join(lockDir, 'discord-bot.pid');
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
try {
  const pid = Number(readFileSync(lockFile, 'utf8'));
  if (pid && pid !== process.pid && alive(pid)) {
    console.log(`The DM Lair bot is already running (process ${pid}), probably as the login helper. Use the app to sign it in and out.`);
    process.exit(0);
  }
} catch { /* no lock: nothing running */ }
mkdirSync(lockDir, { recursive: true });
writeFileSync(lockFile, String(process.pid));

const store = new Store(cfg);
const seat = new Seat(log);
const captures = new Map<string, Capture>();

let client: Client | null = null;
let status: PresenceStatus = 'offline';
let detail: string | null = null;
/**
 * When the last sign-in or join failed, so it isn't retried every two seconds,
 * and what the DM had asked at the time: asking again means try again now.
 */
let signInFailed: { at: number; asked: string | null | undefined } | null = null;
let seatFailed: { key: string; at: number; asked: string | null | undefined } | null = null;
const waiting = (f: { at: number; asked: string | null | undefined } | null, asked: string | null | undefined) =>
  !!f && f.asked === asked && Date.now() - f.at < RETRY_AFTER_MS;

// --------------- Reporting ---------------

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

async function report() {
  try {
    await store.report({
      status, voice: seat.target, detail,
      signedIn: client?.isReady() ? { botTag: client.user.tag, guilds: [...client.guilds.cache.values()].map(snapshot) } : undefined,
    });
  } catch (e) {
    log(`Couldn’t report to DM Lair: ${errText(e)}`);
  }
}
let reportTimer: NodeJS.Timeout | null = null;
/** Something changed (someone joined a channel, it signed in): tell the app soon, not at the next beat. */
function reportSoon() {
  if (reportTimer) clearTimeout(reportTimer);
  reportTimer = setTimeout(() => { reportTimer = null; void report(); }, 1_000);
}

// --------------- Signing in and out ---------------

async function signIn(asked: string | null | undefined) {
  status = 'connecting';
  detail = null;
  await report();
  const next = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
  try {
    const ready = new Promise<void>((resolve, reject) => {
      next.once(Events.ClientReady, () => resolve());
      setTimeout(() => reject(new Error('Discord didn’t answer in time.')), READY_TIMEOUT_MS);
    });
    await next.login(cfg.discordToken);
    await ready;
  } catch (e) {
    void next.destroy();
    status = 'error';
    detail = `Couldn’t sign in to Discord: ${errText(e)}`;
    signInFailed = { at: Date.now(), asked };
    log(detail);
    await report();
    return;
  }
  for (const ev of [Events.VoiceStateUpdate, Events.ChannelCreate, Events.ChannelDelete, Events.GuildCreate, Events.GuildDelete] as const) {
    next.on(ev, reportSoon);
  }
  client = next;
  status = 'online';
  signInFailed = null;
  const servers = next.guilds.cache.size;
  log(`Signed in to Discord as ${next.user?.tag}, in ${servers} server${servers === 1 ? '' : 's'}.`);
  detail = servers === 0 ? 'Not in any server yet: invite the bot first (see bot/README.md).' : null;
  await report();
}

async function signOut() {
  seat.leave();
  const was = client;
  client = null;
  status = 'offline';
  detail = null;
  if (was) await was.destroy();
  log('Signed out of Discord.');
  await report();
}

// --------------- Recordings ---------------

async function finish(cap: Capture | undefined, rec: RecordingRow) {
  await store.setDiscord(rec.id, 'finishing', 'Saving the Discord audio…');
  let text = cap ? await cap.finish() : '';
  const recovered = await assembleFromStorage(store, rec.id);
  if (!cap) text = recovered ? `${recovered} Discord track${recovered === 1 ? '' : 's'} rebuilt from what was uploaded.` : 'Nothing was recorded on Discord.';
  await store.setDiscord(rec.id, 'done', text);
  log(`Finished ${rec.id}: ${text}`);
}

async function runRecordings(signedIn: Client, active: RecordingRow[]) {
  const seen = new Set(active.map(r => r.id));
  for (const rec of active) {
    const cap = captures.get(rec.id);
    try {
      if (rec.status === 'recording') {
        if (!cap) {
          const next = new Capture(signedIn, store, rec, log);
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
}

// --------------- The loop ---------------

const seatKey = (t: VoiceTarget) => `${t.guildId}/${t.channelId}`;

let busy = false;
async function loop() {
  if (busy) return;
  busy = true;
  try {
    const [control, active] = await Promise.all([store.control(), store.activeRecordings()]);
    const before = { status, seat: seat.target ? seatKey(seat.target) : null, detail };
    const next = plan(control, { signedIn: !!client, activeRecordings: active.length, capturing: captures.size, seat: seat.target });

    if (next.signIn && !waiting(signInFailed, control.updatedAt)) await signIn(control.updatedAt);
    if (next.signOut) await signOut();

    if (client) {
      // The seat moves before recordings run: a recording that's about to start needs the connection.
      if (next.seat === null) seat.leave();
      else if (next.seat) {
        const key = seatKey(next.seat);
        if (!(seatFailed?.key === key && waiting(seatFailed, control.updatedAt))) {
          try {
            await seat.go(client, next.seat);
            seatFailed = null;
          } catch (e) {
            seatFailed = { key, at: Date.now(), asked: control.updatedAt };
            log(errText(e));
            detail = errText(e);
          }
        }
      }
      await runRecordings(client, active);
      if (!seatFailed && status === 'online') detail = next.detail;
    } else if (status !== 'error') {
      detail = next.detail;
    }

    const after = { status, seat: seat.target ? seatKey(seat.target) : null, detail };
    if (JSON.stringify(before) !== JSON.stringify(after)) reportSoon();
  } catch (e) {
    log(`Checking for work failed: ${errText(e)}`);
  } finally {
    busy = false;
  }
}

// --------------- Outbox ---------------

let posting = false;
async function sendPosts() {
  if (posting || !client) return;
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

// --------------- Start and stop ---------------

log('DM Lair bot helper started. Waiting for the app.');
await report();
setInterval(() => void report(), REPORT_EVERY_MS);
setInterval(() => void loop(), LOOP_EVERY_MS);
setInterval(() => void sendPosts(), POSTS_EVERY_MS);
void loop();

// Stopped (Ctrl-C, or the login helper being unloaded): upload what's held so
// no audio is stranded in memory. Recordings stay open; starting the bot again
// picks them back up.
let quitting = false;
async function shutdown() {
  if (quitting) process.exit(1);
  quitting = true;
  log('Uploading what’s been recorded before quitting…');
  await Promise.all([...captures.values()].map(cap => cap.suspend().catch(e => log(errText(e)))));
  seat.leave();
  await client?.destroy();
  await store.quit().catch(() => {});
  try { if (readFileSync(lockFile, 'utf8') === String(process.pid)) rmSync(lockFile); } catch { /* gone */ }
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
