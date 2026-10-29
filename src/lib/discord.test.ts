import { describe, it, expect } from 'vitest';
import { playerRecap, refsToText, textChannels, voiceChannels } from './discord';
import type { DiscordBotPresence } from './database.types';

const presence = {
  guilds: [{ id: 'g', name: 'The Lair', voice: [{ id: 'v', name: 'session-voice', members: [{ id: 'u', name: 'dana' }] }], text: [{ id: 't', name: 'recaps' }] }],
} as unknown as DiscordBotPresence;

describe('discord helpers', () => {
  it('lists the channels the bot can see', () => {
    expect(voiceChannels(presence)).toEqual([{ guildId: 'g', channelId: 'v', channelName: 'session-voice', members: [{ id: 'u', name: 'dana' }], label: 'The Lair · #session-voice' }]);
    expect(textChannels(presence)).toEqual([{ id: 't', label: 'The Lair · #recaps' }]);
    expect(voiceChannels(null)).toEqual([]);
  });

  it('turns app links into plain names', () => {
    expect(refsToText('Met @[Brenna Coldwater](npc:123e4567) at @[the docks](location:abc).')).toBe('Met Brenna Coldwater at the docks.');
  });

  it('writes a player recap without the DM’s notes or combats', () => {
    const recap = playerRecap({ session_number: 4, session_date: '2026-10-27', summary: 'Met @[Brenna](npc:1).', loot_rewards: '- A sealed letter', hooks_notes: '- Who sealed it?' });
    expect(recap).toMatch(/^\*\*Session 4 · .+October 27\*\*/);
    expect(recap).toContain('Met Brenna.');
    expect(recap).toContain('**Loot & rewards**\n- A sealed letter');
    expect(recap).toContain('**Left open for next time**\n- Who sealed it?');
    expect(playerRecap({ session_number: 1, session_date: null, summary: null, loot_rewards: null, hooks_notes: null })).toBe('**Session 1**');
  });
});
