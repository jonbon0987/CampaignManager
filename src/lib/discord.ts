// src/lib/discord.ts
// -----------------------------------------------------------
// Helpers for the Discord side of recordings (the bot itself lives in bot/).
// -----------------------------------------------------------

import type { DiscordBotPresence, DiscordMember, DiscordTarget } from './database.types';

/** Every voice channel the bot can join, as "Server · #channel". */
export function voiceChannels(presence: DiscordBotPresence | null): (DiscordTarget & { label: string; members: DiscordMember[] })[] {
  return (presence?.guilds ?? []).flatMap(g => g.voice.map(v => ({
    guildId: g.id, channelId: v.id, channelName: v.name, members: v.members,
    label: `${g.name} · #${v.name}`,
  })));
}

const LAST_CHANNEL = (campaignId: string) => `cm-discord-channel:${campaignId}`;
export function rememberedChannel(campaignId: string | null): string | null {
  if (!campaignId) return null;
  try { return localStorage.getItem(LAST_CHANNEL(campaignId)); } catch { return null; }
}
export function rememberChannel(campaignId: string | null, channelId: string | null) {
  if (!campaignId) return;
  try {
    if (channelId) localStorage.setItem(LAST_CHANNEL(campaignId), channelId);
    else localStorage.removeItem(LAST_CHANNEL(campaignId));
  } catch { /* private mode: just don't remember */ }
}

/** All text channels the bot can post in, as "Server · #channel". */
export function textChannels(presence: DiscordBotPresence | null): { id: string; label: string }[] {
  return (presence?.guilds ?? []).flatMap(g => g.text.map(t => ({ id: t.id, label: `${g.name} · #${t.name}` })));
}

/** `@[Brenna](npc:…)` → `Brenna`: Discord can't open the app's links. */
export const refsToText = (md: string) => md.replace(/@\[([^\]]+)\]\([a-z]+:[^)\s]+\)/g, '$1');

/**
 * The recap players see: what happened, what they got, and what's still open.
 * DM notes and combats are left out.
 */
export function playerRecap(session: { session_number: number; session_date: string | null; summary: string | null; loot_rewards: string | null; hooks_notes: string | null }): string {
  const date = session.session_date
    ? new Date(`${session.session_date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    : null;
  const parts = [`**Session ${session.session_number}${date ? ` · ${date}` : ''}**`];
  if (session.summary?.trim()) parts.push(refsToText(session.summary.trim()));
  if (session.loot_rewards?.trim()) parts.push(`**Loot & rewards**\n${refsToText(session.loot_rewards.trim())}`);
  if (session.hooks_notes?.trim()) parts.push(`**Left open for next time**\n${refsToText(session.hooks_notes.trim())}`);
  return parts.join('\n\n');
}
