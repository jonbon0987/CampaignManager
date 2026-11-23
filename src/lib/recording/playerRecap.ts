// src/lib/recording/playerRecap.ts
// -----------------------------------------------------------
// The player recap: a longer telling of a session for the players, written by
// the assistant from the recording (api/player-recap). A heading per scene,
// then what happened in order, one line each, with a few lines quoted as they
// were spoken. Story only: no table talk, no dice, nothing only the DM knows.
//
// The AI returns scenes and beats, each beat citing its transcript line; this
// turns them into the Markdown the DM edits and players read, and keeps a
// quote only when its words really are in the line it cites.
//
// Shared by /api/player-recap and the app, so it imports nothing.
// -----------------------------------------------------------

/** A transcript line (see TranscriptLine in ./chronicle): only its words are read here. */
type TranscriptLine = { text: string };

export interface RecapQuote { speaker: string; words: string }
export interface RecapBeat { text: string; quote: RecapQuote | null; source_line: number | null }
export interface RecapScene { title: string; beats: RecapBeat[] }

/** At most this many quotes in a recap: a few memorable lines, not a script. */
export const MAX_QUOTES = 6;

const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** Words only, lower case: "“You’ll not—” she said." → "you ll not she said". */
export const matchable = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * True when a quote's words were said on the line it cites, or the line either
 * side (one sentence is often split across two). Speech-to-text punctuation
 * and capitals don't matter; the words and their order do.
 */
export function quoteSaid(words: string, line: number | null, lines: TranscriptLine[]): boolean {
  const said = matchable(words);
  if (!said || line == null || line < 1 || line > lines.length) return false;
  const around = lines.slice(Math.max(0, line - 2), Math.min(lines.length, line + 1)).map(l => l.text).join(' ');
  return ` ${matchable(around)} `.includes(` ${said} `);
}

/** "Kutter (Sam)" → "Kutter": players are named by their characters. */
const characterName = (speaker: string) => speaker.replace(/\s*\([^)]*\)\s*$/, '').trim();

/**
 * What the AI returned, made safe to show: scenes with a title and at least one
 * beat, quotes only where the transcript has them (and no more than
 * MAX_QUOTES), and nobody quoted as "DM" or an unknown speaker.
 */
export function cleanPlayerRecap(raw: unknown, lines: TranscriptLine[]): RecapScene[] {
  const scenes = (raw as { scenes?: unknown } | null)?.scenes;
  if (!Array.isArray(scenes)) return [];
  let quotes = 0;
  const out: RecapScene[] = [];
  for (const s of scenes) {
    const title = str((s as { title?: unknown })?.title);
    const rawBeats = (s as { beats?: unknown })?.beats;
    const beats: RecapBeat[] = [];
    for (const b of Array.isArray(rawBeats) ? rawBeats : []) {
      const text = str((b as { text?: unknown })?.text);
      if (!text) continue;
      const n = (b as { source_line?: unknown })?.source_line;
      const source_line = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null;
      const q = (b as { quote?: unknown })?.quote as { speaker?: unknown; words?: unknown } | null | undefined;
      const words = str(q?.words).replace(/^["“”'‘’]+|["“”'‘’]+$/g, '').trim();
      const speaker = characterName(str(q?.speaker));
      const keep = !!words && !!speaker && !/^(dm|unknown|speaker [a-z0-9]+)$/i.test(speaker)
        && quotes < MAX_QUOTES && quoteSaid(words, source_line, lines);
      if (keep) quotes++;
      beats.push({ text, quote: keep ? { speaker, words } : null, source_line });
    }
    if (beats.length) out.push({ title: title || `Scene ${out.length + 1}`, beats });
  }
  return out;
}

/** The recap as Markdown: "### Scene", then "- beat", a quote under its beat. */
export function recapMarkdown(scenes: RecapScene[]): string {
  return scenes.map(s => [
    `### ${s.title}`,
    '',
    ...s.beats.map(b => (b.quote ? `- ${b.text}\n  > “${b.quote.words}” — ${b.quote.speaker}` : `- ${b.text}`)),
  ].join('\n')).join('\n\n');
}

/**
 * The recap as plain text, for pasting where Markdown doesn't show (a text
 * message, an email): headings on their own line, bullets as •, quotes
 * indented under their beat, emphasis marks dropped.
 */
export function recapPlainText(markdown: string, heading?: string): string {
  const body = markdown
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => {
      const h = /^#{1,6}\s+(.*)$/.exec(line);
      if (h) return h[1].toUpperCase();
      const q = /^\s*>\s?(.*)$/.exec(line);
      if (q) return `    ${q[1]}`;
      const li = /^(\s*)[-*+]\s+(.*)$/.exec(line);
      if (li) return `${li[1]}• ${li[2]}`;
      return line;
    })
    .join('\n')
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, '$1$2')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1$2')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return heading ? `${heading}\n\n${body}` : body;
}

/** "Session 4 · The Drowned Bell", for a heading over the recap. */
export function recapHeading(session: { session_number: number; title: string | null }): string {
  return `Session ${session.session_number}${session.title?.trim() ? ` · ${session.title.trim()}` : ''}`;
}

/** "session-4-the-drowned-bell-recap.md" */
export function recapFileName(session: { session_number: number; title: string | null }, ext: string): string {
  const slug = (session.title ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `session-${session.session_number}${slug ? `-${slug}` : ''}-recap.${ext}`;
}

/**
 * Splits a recap into posts of at most `max` characters, between scenes where
 * it can, then between lines; a single line too long for a post is cut.
 */
export function splitRecap(text: string, max: number): string[] {
  const posts: string[] = [];
  let current = '';
  const push = (piece: string, sep: string) => {
    if (!current) { current = piece; return; }
    if (current.length + sep.length + piece.length <= max) { current += sep + piece; return; }
    posts.push(current);
    current = piece;
  };
  for (const block of text.trim().split(/\n{2,}(?=#{1,6}\s)/)) {
    if (block.length <= max) { push(block, '\n\n'); continue; }
    let sep = '\n\n';
    for (const line of block.split('\n')) {
      for (let i = 0; i < Math.max(1, line.length); i += max) { push(line.slice(i, i + max), sep); sep = '\n'; }
    }
  }
  if (current) posts.push(current);
  return posts;
}

/**
 * The campaign's names for the player recap to spell by: the party, people,
 * places and factions, by name only. Nothing else about them goes, so no note
 * or secret can find its way into what players read.
 */
export function recapNames(data: {
  pcs: { character_name: string; race?: string | null; class?: string | null; is_active?: boolean | null }[];
  npcs: { name: string }[];
  locations: { name: string }[];
  factions: { name: string }[];
}): string {
  const list = (items: { name: string }[]) => [...new Set(items.map(i => i.name?.trim()).filter(Boolean))].join(', ');
  const party = data.pcs
    .filter(p => p.is_active !== false && p.character_name?.trim())
    .map(p => {
      const what = [p.race, p.class].map(v => v?.trim()).filter(Boolean).join(' ');
      return what ? `${p.character_name.trim()} (${what})` : p.character_name.trim();
    })
    .join(', ');
  return [
    ['The party', party],
    ['People', list(data.npcs)],
    ['Places', list(data.locations)],
    ['Factions', list(data.factions)],
  ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
}
