// bot/src/messages.ts
// -----------------------------------------------------------
// Discord caps a message at 2,000 characters. A recap is split on paragraph
// breaks, then lines, then words, so no message cuts a sentence mid-word.
// -----------------------------------------------------------

export const DISCORD_LIMIT = 2_000;

export function splitMessage(text: string, limit = DISCORD_LIMIT): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    const window = rest.slice(0, limit + 1);
    let cut = window.lastIndexOf('\n\n');
    if (cut < limit / 2) cut = window.lastIndexOf('\n');
    if (cut < limit / 2) cut = window.lastIndexOf(' ');
    if (cut <= 0) cut = limit;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

export const ANNOUNCE_START = '🔴 **DM Lair is recording this session** for the campaign notes.';
export const ANNOUNCE_STOP = '⏹️ Recording stopped.';

/**
 * The recording notices, for where they're posted: in the voice channel's own
 * chat they need no more, but posted in another channel they say which voice
 * channel is being recorded.
 */
export function announcements(voiceChannel: string | null): { start: string; stop: string } {
  if (!voiceChannel) return { start: ANNOUNCE_START, stop: ANNOUNCE_STOP };
  return {
    start: `🔴 **DM Lair is recording this session** in 🔊 ${voiceChannel} for the campaign notes.`,
    stop: `⏹️ Recording stopped in 🔊 ${voiceChannel}.`,
  };
}
