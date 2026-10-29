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

export const ANNOUNCE_START = '🔴 **DM Lair is recording this session** for the campaign notes. Only players who’ve agreed are recorded; ask the DM to stop at any time.';
export const ANNOUNCE_STOP = '⏹️ Recording stopped.';
