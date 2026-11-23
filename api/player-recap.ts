// api/player-recap.ts
// -----------------------------------------------------------
// Writes a session's player recap from its recording: the story as the
// players lived it, a heading per scene and what happened in order, with a few
// lines quoted as spoken. Story only: table talk, dice and anything only the
// DM knows are left out. Then "Moments to remember": three to six fun or
// notable moments, in character or at the table. It's saved on the session as
// a draft for the DM to read and edit; players see it once the DM publishes it.
//
//   POST { recordingId, names?, provider?, onlyIfEmpty? }
//
// names: the campaign's party, people and places by name only (no notes or
// secrets), so names misheard by speech-to-text come out spelled right.
// onlyIfEmpty: the automatic run after transcription. It does nothing when
// the session already has a player recap, so it never replaces the DM's edits.
// -----------------------------------------------------------

import './_env.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth, userSupabase } from './_auth.js';
import { resolveProvider, structuredExtract, friendlyError } from './_ai.js';
import { HttpError, loadTranscript, must } from './_transcript.js';
import { formatTranscript } from '../src/lib/recording/chronicle.js';
import { cleanPlayerRecap, recapMarkdown, MAX_MOMENTS, MAX_QUOTES, MOMENTS_HEADING } from '../src/lib/recording/playerRecap.js';

const MAX_OUTPUT_TOKENS = 16_384;
const MAX_NAMES = 20_000;
// Stop retrying a busy AI in time to answer (maxDuration is 300 s).
const TIME_BUDGET_MS = 260_000;

const SCHEMA = {
  type: 'object',
  properties: {
    scenes: {
      type: 'array',
      description: 'The session’s scenes, in the order they happened.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'A short, evocative title for the scene: a few words, e.g. “The bargain at the Gilded Eel”. Never “Scene 1”.' },
          beats: {
            type: 'array',
            description: 'What happened in this scene, in order, one beat per moment.',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'One or two sentences, past tense, characters by their character names.' },
                source_line: { type: 'integer', description: 'The [n] of the transcript line where this happens.' },
                quote_words: { type: ['string', 'null'], description: 'Rarely: a memorable line spoken in character, copied word for word from line source_line, without quotation marks. Null for most beats.' },
                quote_speaker: { type: ['string', 'null'], description: 'Who said it, by character name; for a DM line spoken as an NPC, that NPC. Null with no quote.' },
              },
              required: ['text', 'source_line', 'quote_words', 'quote_speaker'],
            },
          },
        },
        required: ['title', 'beats'],
      },
    },
    moments: {
      type: 'array',
      description: `Three to ${MAX_MOMENTS} fun or notable moments from the whole session, in the order they happened.`,
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'One sentence: what happened and why it was memorable.' },
          source_line: { type: 'integer', description: 'The [n] of the transcript line where it happens.' },
          quote_words: { type: ['string', 'null'], description: 'When the moment is something said: the line, copied word for word from line source_line, without quotation marks. Otherwise null.' },
          quote_speaker: { type: ['string', 'null'], description: 'Who said it: the character’s name, “the DM” for the DM speaking at the table, or the NPC the DM was voicing. Null with no quote.' },
        },
        required: ['text', 'source_line', 'quote_words', 'quote_speaker'],
      },
    },
  },
  required: ['scenes', 'moments'],
};

function systemPrompt(names: string, moments: string): string {
  return `You write a player recap of a tabletop RPG session from its transcript: the story of the session as the players lived it, told in order, for them to read after the game.
${names ? `\n== NAMES IN THIS CAMPAIGN ==\n\nFor spelling only. Call people and places what they were called at the table: if the party never learned a name, don't use it.\n\n${names}\n` : ''}
== THE TRANSCRIPT ==

Each line is "[n] h:mm:ss Speaker: words". The DM narrates and voices every NPC: a DM line spoken in character is that NPC talking. Players speak as their characters; the speaker shows "Character (Player)". A speaker like "Speaker C" hasn't been identified; work out who it is from context if you can.
Speech-to-text misspells names. Use the spelling from the names above when a misheard name is clearly one of them.${moments ? `\n\nThe DM marked these moments while playing; make sure they're in the recap:\n${moments}` : ''}

== WHAT TO WRITE ==

Split the session into scenes. A new scene starts when the place, the time or the situation changes: the party travels, a fight breaks out, a conversation with someone new begins, they rest.
Under each scene, its beats: what happened, in the order it happened, one or two sentences each. Be detailed. Include every decision the party made, everything they found or learned, each conversation that mattered and what was said, how each fight went and how it ended, and what came of it all. Someone who missed the session should be able to follow everything from this.
Write in the past tense and the third person, plainly and vividly, and name characters by their character names.
A few beats carry a quote: a memorable line spoken in character, copied word for word from the line the beat cites. At most one per scene and no more than ${MAX_QUOTES} in all; most beats have none. Pick lines with character, such as a threat, a joke made in character, a promise, or a reveal.

== ${MOMENTS_HEADING.toUpperCase()} ==

Then pick three to ${MAX_MOMENTS} of the session's most fun or notable moments for the "moments" array: the ones the table will still be talking about. They can be in character (a ridiculous plan, a perfect one-liner, a reckless gamble that paid off) or at the table (a big laugh, a natural 20 or a natural 1 at exactly the right or wrong time, a rules mix-up everyone enjoyed). One sentence each, in the order they happened. When the moment is something said, quote it word for word from the line it cites. A moment can be something from the scenes; say why it was memorable rather than retelling it.
Here, and only here, dice can come up: name a natural 20 or a natural 1, but no other numbers. Still no players' real names: say "Kutter's player", not their name. Nothing only the DM knows.

== LEAVE OUT (of the scenes) ==

- Table talk: rules questions, dice, numbers and mechanics (no rolls, damage, hit points, DCs or spell slots; say "the arrow found its mark", not "rolled a 17"), snacks, breaks, scheduling, and jokes about real life.
- Anything the characters couldn't know: the DM's asides about what's behind the screen, a creature's statistics, plans or secrets that weren't revealed at the table.
- The players' real names.
- Anything the transcript doesn't support. Don't invent, and don't add morals or hints about what comes next.

Return the scenes in the "scenes" array and the moments in the "moments" array.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const startedAt = Date.now();
  const body = (req.body ?? {}) as { recordingId?: string; names?: string; provider?: string; onlyIfEmpty?: boolean };
  if (!body.recordingId) return res.status(400).json({ error: 'Expected { recordingId }' });
  const sb = userSupabase(req);

  try {
    const { data: rec } = await sb.from('session_recordings').select('id, session_id, campaign_id').eq('id', body.recordingId).maybeSingle();
    if (!rec) throw new HttpError(404, 'Recording not found.');
    const session = await must(sb.from('sessions').select('id, player_recap').eq('id', rec.session_id).maybeSingle()) as { id: string; player_recap: string | null };
    if (!session) throw new HttpError(404, 'Session not found.');
    if (body.onlyIfEmpty && session.player_recap?.trim()) {
      return res.status(200).json({ skipped: true, recap: session.player_recap });
    }

    const { lines, moments } = await loadTranscript(sb, rec.id, rec.campaign_id);
    const raw = await structuredExtract({
      provider: resolveProvider(body.provider),
      system: systemPrompt(typeof body.names === 'string' ? body.names.slice(0, MAX_NAMES) : '', moments),
      userContent: `Session transcript:\n\n${formatTranscript(lines)}`,
      schema: SCHEMA,
      schemaDescription: 'The player recap: the session’s scenes and what happened in each, then its moments to remember.',
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      retryUntil: startedAt + TIME_BUDGET_MS,
    });
    // The schema keeps a quote's words and speaker side by side; the recap keeps them together.
    const withQuote = (b: unknown) => {
      const { quote_words, quote_speaker, ...rest } = b as { quote_words?: string | null; quote_speaker?: string | null };
      return { ...rest, quote: quote_words ? { words: quote_words, speaker: quote_speaker } : null };
    };
    const out = raw as { scenes?: unknown[]; moments?: unknown[] } | null;
    const content = cleanPlayerRecap({
      scenes: (out?.scenes ?? []).map(s => ({ ...(s as object), beats: ((s as { beats?: unknown[] })?.beats ?? []).map(withQuote) })),
      moments: (out?.moments ?? []).map(withQuote),
    }, lines);
    if (!content.scenes.length) throw new HttpError(502, 'The assistant didn’t write a recap. Try again.');

    const recap = recapMarkdown(content);
    // A fresh recap is a draft again, even over a published one: players see it once the DM has read it.
    let write = sb.from('sessions').update({ player_recap: recap, player_recap_status: 'draft' }).eq('id', session.id);
    if (body.onlyIfEmpty) write = write.or('player_recap.is.null,player_recap.eq.');
    const saved = await must(write.select('id'));
    if (body.onlyIfEmpty && (saved as unknown[]).length === 0) {
      // Written by hand while this ran: keep the DM's.
      return res.status(200).json({ skipped: true });
    }
    return res.status(200).json({ recap, status: 'draft' });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : friendlyError(err);
    console.error('player-recap', err);
    return res.status(status).json({ error: message });
  }
}
