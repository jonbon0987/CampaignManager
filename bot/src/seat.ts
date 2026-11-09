// bot/src/seat.ts
// -----------------------------------------------------------
// The bot sitting in a voice channel outside a recording, because the DM asked
// it to from the app. It joins deafened and muted: it hears and says nothing.
// A recording takes the voice connection for itself, so the helper leaves the
// seat before one starts and comes back to it after (see helper.ts).
// -----------------------------------------------------------

import { VoiceConnectionStatus, entersState, joinVoiceChannel, type VoiceConnection } from '@discordjs/voice';
import type { Client } from 'discord.js';
import type { VoiceTarget } from './helper.js';

export class Seat {
  target: VoiceTarget | null = null;
  private connection: VoiceConnection | null = null;

  constructor(private readonly log: (msg: string) => void) {}

  /** Goes to `target`, moving from wherever it was. Throws if it can't get in. */
  async go(client: Client, target: VoiceTarget): Promise<void> {
    this.leave();
    const guild = await client.guilds.fetch(target.guildId);
    const channel = await guild.channels.fetch(target.channelId).catch(() => null);
    if (!channel?.isVoiceBased()) throw new Error(`The bot can’t see #${target.channelName}.`);
    const connection = joinVoiceChannel({
      channelId: channel.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true, selfMute: true,
    });
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch {
      connection.destroy();
      throw new Error(`Couldn’t connect to #${target.channelName}; check the bot may Connect there.`);
    }
    this.connection = connection;
    this.target = { ...target, channelName: channel.name };
    this.log(`Sitting in #${channel.name}.`);
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Moved by someone, or a blip: it reconnects by itself.
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        // Kicked or gone for good: let go, and the helper puts it back if the DM still wants it there.
        if (this.connection === connection) { this.connection = null; this.target = null; }
        try { connection.destroy(); } catch { /* already gone */ }
      }
    });
  }

  leave(): void {
    if (!this.connection) { this.target = null; return; }
    const name = this.target?.channelName;
    try { this.connection.destroy(); } catch { /* already gone */ }
    this.connection = null;
    this.target = null;
    if (name) this.log(`Left #${name}.`);
  }
}
