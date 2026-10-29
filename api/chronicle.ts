// api/chronicle.ts
// -----------------------------------------------------------
// Writes a session's chronicle from its transcript: a recap, what each PC did,
// NPC interactions, places, lore, threads and loot — saved as proposals the DM
// reviews before anything changes in the campaign.
//
//   POST { recordingId, campaignContext, settings?, provider?, missingOnly? }
//
// The transcript is read here (as the signed-in user, under row-level
// security) and numbered; the AI cites line numbers, and the quotes and times
// on each proposal come from those real lines (src/lib/recording/chronicle.ts).
// Three focused passes write it: in parallel on Claude, one after another on
// Gemini, whose free tier counts input tokens per minute and each pass sends
// the whole campaign. A pass that still fails is remembered in
// settings.chronicleMissing, and { missingOnly: true } writes just those,
// keeping the proposals already made.
// -----------------------------------------------------------

import './_env.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth, userSupabase } from './_auth.js';
import { resolveProvider, structuredExtract, friendlyError, type AIProvider } from './_ai.js';
import {
  formatTranscript, itemsToProposals, clockLabel, entityKey, mergeEntityChange, partsLabel,
  type ChronicleAction, type ChroniclePart, type EntityChange, type KnownIds, type ProposalDraft, type TranscriptLine,
} from '../src/lib/recording/chronicle.js';

type Supa = ReturnType<typeof userSupabase>;
type Depth = 'brief' | 'standard' | 'thorough';

interface Settings { depth?: Depth; dropTableTalk?: boolean; asidesToDmNotes?: boolean }

const MAX_OUTPUT_TOKENS = 16_384;
const INSERT_BATCH = 200;
// Stop retrying a busy AI in time to save what was written (maxDuration is 300 s).
const TIME_BUDGET_MS = 260_000;

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

// --------------- Schema ---------------

const sourced = {
  source_line: { type: 'integer', description: 'The [n] number of the transcript line where this happens or is best shown.' },
  confidence: { type: 'number', description: '0–1. Above 0.85: stated plainly at the table. Below 0.7: inferred; the DM should check it.' },
  reasoning: { type: 'string', description: 'One short sentence: why this, and for a match, why that entry.' },
};
const item = (kind: string, props: Record<string, unknown>, required: string[]) => ({
  type: 'object',
  properties: { kind: { type: 'string', enum: [kind] }, ...props, ...sourced },
  required: ['kind', ...required, 'source_line', 'confidence'],
});
const text = (description: string) => ({ type: 'string', description });
const maybe = (description: string) => ({ type: ['string', 'null'], description });
const matchedId = { type: ['string', 'null'], description: 'The [id:…] of the existing entry this is, or null if it is new. Never invent an id.' };

interface Pass {
  key: ChroniclePart;
  label: string;
  focus: string;
  items: Record<string, unknown>[];
}

function passes(settings: Settings): Pass[] {
  const session: Record<string, unknown>[] = [
    item('summary', { text: text('The recap of what happened in the story this session, in order. Past tense, third person, characters by name. Markdown paragraphs.') }, ['text']),
    item('combats', { text: text('Each fight: who fought what, notable moments, and how it ended.') }, ['text']),
    item('loot', { text: text('Items, gold and rewards gained, and who took them. Markdown list.') }, ['text']),
    item('left_open', { text: text('What is unresolved going into next session: open questions, pending decisions, cliffhangers. Markdown list.') }, ['text']),
    item('pc', { pc_id: text('The [id:…] of the player character.'), did: text('What this character did this session that matters: choices, discoveries, rolls that changed things. 1–3 sentences.') }, ['pc_id', 'did']),
  ];
  if (settings.asidesToDmNotes !== false) {
    session.push(item('dm_asides', { text: text('Things the DM said as an aside rather than to the table — secrets, plans, reminders to self. Markdown list.') }, ['text']));
  }
  return [
    {
      key: 'session',
      label: 'session & party',
      focus: 'Write the session record: one summary item; a combats item only if there was a fight; a loot item only if something was gained; a left_open item; and one pc item for each player character who did something notable.'
        + (settings.asidesToDmNotes !== false ? ' Add a dm_asides item only if the DM made asides meant for themself.' : ''),
      items: session,
    },
    {
      key: 'people',
      label: 'people & factions',
      focus: 'One npc item for each non-player character the party met, talked to, fought, or learned about this session, and one faction item for each faction that came up.',
      items: [
        item('npc', {
          matched_id: matchedId,
          name: text('The NPC’s name as the campaign spells it, or as said at the table if new.'),
          role: maybe('New NPCs only: their role or occupation.'),
          description: maybe('Lasting facts about who this NPC is: appearance, role, background, a secret revealed. Never what they did or said this session (that is the interaction). New NPCs: a short description. Existing NPCs: null unless something new about them was revealed.'),
          disposition: maybe('Their attitude toward the party in a few words, only if it was established or changed this session; else null.'),
          status: { type: ['string', 'null'], enum: ['active', 'deceased', 'unknown', null], description: 'Only if it changed this session (e.g. they died); else null.' },
          interaction: text('What happened between this NPC and the party this session. 1–2 sentences.'),
        }, ['matched_id', 'name', 'interaction']),
        item('faction', {
          matched_id: matchedId,
          name: text('The faction’s name.'),
          faction_type: maybe('New factions only: guild, government, religious, criminal, military, arcane, merchant or other.'),
          learned: text('What the party learned about or did with this faction this session. 1–2 sentences.'),
        }, ['matched_id', 'name', 'learned']),
      ],
    },
    {
      key: 'places',
      label: 'places, lore & threads',
      focus: 'One location item for each place the party went to or learned about, one lore item for each piece of setting knowledge revealed to the players, and one thread item for each plot thread that moved.'
        + ' Lore is knowledge about the world (history, legends, religion, magic, how things work) — never events of this session, where someone is, or a mystery the party is pursuing; those are threads.'
        + ' Match an existing thread only when this session’s events clearly belong to its storyline; a shared theme is not enough, and a thread whose description says nothing about these events is not a match. When unsure, propose a new thread and let the DM merge it.',
      items: [
        item('location', {
          matched_id: matchedId,
          name: text('The place’s name.'),
          location_type: maybe('New places only: city, dungeon, tavern, wilderness, etc.'),
          description: maybe('Lasting facts about the place itself, never what the party did there (that is what happened). New places: a short description. Existing places: null unless something new about the place was revealed.'),
          happened: text('What the party did or found there this session. 1–2 sentences.'),
        }, ['matched_id', 'name', 'happened']),
        item('lore', {
          matched_id: matchedId,
          title: text('The lore entry’s title.'),
          category: maybe('New entries only: history, religion, magic, legend, etc.'),
          revealed: text('What the players learned this session. 1–3 sentences.'),
        }, ['matched_id', 'title', 'revealed']),
        item('thread', {
          matched_id: matchedId,
          title: text('The thread’s title. Match existing threads by storyline even if worded differently.'),
          category: { type: ['string', 'null'], enum: ['main_plot', 'side_quest', 'character_arc', 'faction', null], description: 'New threads only.' },
          new_state: { type: ['string', 'null'], enum: ['seed', 'active', 'cold', 'resolved', null], description: 'Only if its state changed from the one shown in the campaign data: active when the party takes it up, resolved when it concludes, cold when dropped. Else null.' },
          development: text('How this thread developed this session. 1–2 sentences.'),
        }, ['matched_id', 'title', 'development']),
      ],
    },
  ];
}

const DEPTH: Record<Depth, string> = {
  brief: 'Keep it brief: a one-paragraph summary, and only the people, places and threads that mattered to the story.',
  standard: 'A summary of two to four paragraphs. Include every named person, place and thread that played a part.',
  thorough: 'Be thorough: a detailed summary, a paragraph per scene. Include every named person, place, faction, piece of lore and thread, even minor ones.',
};

function systemPrompt(campaignContext: string, pass: Pass, settings: Settings, moments: string): string {
  return `You write the chronicle of a tabletop RPG session from its transcript, and propose updates to the campaign's records. The DM reviews every proposal before anything changes.

${campaignContext}

== THE TRANSCRIPT ==

Each line is "[n] h:mm:ss Speaker: words". The DM narrates and voices every NPC: a DM line spoken in character is that NPC talking. Players speak as their characters; the speaker shows "Character (Player)". A speaker like "Speaker C" hasn't been identified — work out who it is from context if you can.
Speech-to-text misspells names. Match a misheard name to the campaign entry it sounds like ("Gorvel Iron Hand" is Gorval Ironhand).${settings.dropTableTalk !== false ? '\nIgnore out-of-character table talk: rules lookups, snacks, scheduling, jokes about real life. Only the story counts.' : ''}${moments ? `\n\nThe DM marked these moments while playing; give them weight:\n${moments}` : ''}

== YOUR TASK ==

${pass.focus}
${DEPTH[settings.depth ?? 'thorough']}

== RULES ==

1. Only what happened in this session. Don't restate background the campaign data already has.
2. matched_id: the [id:…] of the existing entry when the transcript refers to one, even under a different spelling or a nickname. null only for something genuinely new. Never invent an id.
3. source_line: the [n] of the line where it happens or is best shown. Every item needs one.
4. confidence: honest, 0–1. The DM uses it to decide what to check. A match resting on little evidence is low confidence.
5. Don't invent anything the transcript doesn't support. Leave optional fields null rather than guessing.
6. Write plainly and concisely — the DM reads these on review cards. Refer to characters by their character name, never the player's.

Return your items in the "actions" array of the propose_import_actions tool.`;
}

async function runPass(provider: AIProvider, campaignContext: string, transcript: string, pass: Pass, settings: Settings, moments: string, retryUntil?: number): Promise<unknown[]> {
  const schema = {
    type: 'object',
    properties: { actions: { type: 'array', items: { anyOf: pass.items } } },
    required: ['actions'],
  };
  const result = await structuredExtract({
    provider,
    system: systemPrompt(campaignContext, pass, settings, moments),
    userContent: `Session transcript:\n\n${transcript}`,
    schema,
    schemaDescription: `Propose the ${pass.label} part of the session chronicle.`,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    retryUntil,
  });
  const actions = (result as { actions?: unknown[] })?.actions;
  return Array.isArray(actions) ? actions : [];
}

// --------------- Campaign data ---------------

/** Which ids exist per kind, and the current values of the fields a change can set. */
async function campaignState(sb: Supa, campaignId: string): Promise<{ known: KnownIds; current: Map<string, Record<string, unknown>> }> {
  const rows = async (table: string, cols: string) =>
    ((await sb.from(table).select(cols).eq('campaign_id', campaignId)).data ?? []) as unknown as Record<string, unknown>[];
  const linked = async (join: string, fk: string, table: string, cols: string) => {
    const ids = (((await sb.from(join).select(fk).eq('campaign_id', campaignId)).data ?? []) as unknown as Record<string, string>[]).map(r => r[fk]);
    return ids.length ? (((await sb.from(table).select(cols).in('id', ids)).data ?? []) as unknown as Record<string, unknown>[]) : [];
  };
  const npcCols = 'id, status, disposition, met_by_pcs';
  const [pc, npc, npcLinked, location, locationLinked, faction, lore, loreLinked, hook] = await Promise.all([
    rows('player_characters', 'id'), rows('npcs', npcCols), linked('campaign_npcs', 'npc_id', 'npcs', npcCols),
    rows('locations', 'id'), linked('campaign_locations', 'location_id', 'locations', 'id'),
    rows('factions', 'id'), rows('lore_entries', 'id'), linked('campaign_lore', 'lore_id', 'lore_entries', 'id'),
    rows('hooks', 'id, state, is_active'),
  ]);
  const ids = (...lists: Record<string, unknown>[][]) => new Set(lists.flat().map(r => String(r.id)));
  const current = new Map<string, Record<string, unknown>>();
  for (const r of [...npc, ...npcLinked, ...hook]) current.set(String(r.id), r);
  return {
    known: {
      pc: ids(pc), npc: ids(npc, npcLinked), location: ids(location, locationLinked),
      faction: ids(faction), lore: ids(lore, loreLinked), hook: ids(hook),
    },
    current,
  };
}

// --------------- Handler ---------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const startedAt = Date.now();
  const body = (req.body ?? {}) as { recordingId?: string; campaignContext?: string; settings?: Settings; provider?: string; missingOnly?: boolean };
  if (!body.recordingId || typeof body.campaignContext !== 'string') {
    return res.status(400).json({ error: 'Expected { recordingId, campaignContext }' });
  }
  const settings: Settings = {
    depth: body.settings?.depth && body.settings.depth in DEPTH ? body.settings.depth : 'thorough',
    dropTableTalk: body.settings?.dropTableTalk !== false,
    asidesToDmNotes: body.settings?.asidesToDmNotes !== false,
  };
  const sb = userSupabase(req);
  const recordingId = body.recordingId;

  const { data: rec } = await sb.from('session_recordings').select('*').eq('id', recordingId).maybeSingle();
  if (!rec) return res.status(404).json({ error: 'Recording not found.' });

  const setDetail = (patch: Record<string, unknown>) => sb.from('session_recordings').update(patch).eq('id', recordingId);

  try {
    const [segments, pcs, moments] = await Promise.all([
      must(sb.from('transcript_segments').select('start_ms, speaker_label, pc_id, is_dm, text').eq('recording_id', recordingId).eq('dropped_as_echo', false).order('start_ms')),
      must(sb.from('player_characters').select('id, character_name, player_name').eq('campaign_id', rec.campaign_id)),
      must(sb.from('recording_moments').select('at_ms, label').eq('recording_id', recordingId).order('at_ms')),
    ]);
    if (segments.length === 0) throw new HttpError(409, 'This recording has no transcript yet.');

    const pcById = new Map((pcs as { id: string; character_name: string; player_name: string | null }[]).map(p => [p.id, p]));
    const lines: TranscriptLine[] = (segments as { start_ms: number; speaker_label: string | null; pc_id: string | null; is_dm: boolean; text: string }[]).map(s => {
      const pc = s.pc_id ? pcById.get(s.pc_id) : undefined;
      const speaker = s.is_dm ? 'DM' : pc ? (pc.player_name ? `${pc.character_name} (${pc.player_name})` : pc.character_name) : s.speaker_label ?? 'Unknown';
      return { start_ms: s.start_ms, speaker, text: s.text };
    });
    const momentText = (moments as { at_ms: number; label: string | null }[])
      .map(m => `- ${clockLabel(m.at_ms)}${m.label ? ` ${m.label}` : ''}`).join('\n');

    const missing: ChroniclePart[] = rec.settings?.chronicleMissing ?? [];
    const toRun = body.missingOnly && missing.length ? passes(settings).filter(p => missing.includes(p.key)) : passes(settings);
    const partial = toRun.length < passes(settings).length;
    await setDetail({ status_detail: partial ? `Writing ${partsLabel(toRun.map(p => p.key)).toLowerCase()}…` : 'Writing the chronicle…' });

    const provider = resolveProvider(body.provider);
    const transcript = formatTranscript(lines);
    const run = (p: Pass, retryUntil?: number) => runPass(provider, body.campaignContext!, transcript, p, settings, momentText, retryUntil);
    let results: PromiseSettledResult<unknown[]>[];
    if (provider === 'gemini') {
      // One at a time, each pass sharing what's left of the time budget.
      results = [];
      for (const [i, p] of toRun.entries()) {
        const left = startedAt + TIME_BUDGET_MS - Date.now();
        results.push(await run(p, Date.now() + left / (toRun.length - i)).then(
          value => ({ status: 'fulfilled' as const, value }),
          reason => ({ status: 'rejected' as const, reason }),
        ));
      }
    } else {
      results = await Promise.allSettled(toRun.map(p => run(p)));
    }
    const failedParts = toRun.filter((_, i) => results[i].status === 'rejected').map(p => p.key);
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    failures.forEach((f, i) => console.error(`chronicle: ${failedParts[i]} part failed`, f.reason));
    if (failures.length === results.length) throw failures[0].reason;

    const items = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
    const { known, current } = await campaignState(sb, rec.campaign_id);
    const drafts = itemsToProposals(items, {
      sessionId: rec.session_id,
      lines,
      known,
      current,
      pcNames: new Map([...pcById.values()].map(p => [p.id, p.character_name])),
    });

    let toInsert: ProposalDraft[] = drafts;
    let kept = 0;
    if (partial) {
      // Filling in missing parts keeps what's there; a change to an entity
      // that already has a card is added to that card.
      const existing = await must(sb.from('chronicle_proposals').select('id, action, sort_order, status').eq('recording_id', recordingId)) as
        { id: string; action: ChronicleAction; sort_order: number; status: string }[];
      kept = existing.filter(e => e.status !== 'applied').length;
      const open = new Map(existing.filter(e => e.status === 'pending' && e.action.kind === 'entity').map(e => [entityKey(e.action as EntityChange), e]));
      const next = Math.max(-1, ...existing.map(e => e.sort_order)) + 1;
      toInsert = [];
      for (const d of drafts) {
        const into = d.action.kind === 'entity' ? open.get(entityKey(d.action)) : undefined;
        if (into) {
          await must(sb.from('chronicle_proposals').update({ action: mergeEntityChange(into.action as EntityChange, d.action as EntityChange) }).eq('id', into.id).select('id'));
        } else {
          toInsert.push({ ...d, sort_order: next + d.sort_order });
        }
      }
    } else {
      // A rewrite replaces the earlier proposals, except any already applied.
      await must(sb.from('chronicle_proposals').delete().eq('recording_id', recordingId).neq('status', 'applied').select('id'));
    }
    for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
      await must(sb.from('chronicle_proposals').insert(toInsert.slice(i, i + INSERT_BATCH).map(d => ({
        ...d, user_id: userId, recording_id: recordingId, campaign_id: rec.campaign_id,
      }))).select('id'));
    }

    const count = kept + toInsert.length;
    const { chronicleMissing: _previous, ...savedSettings } = rec.settings ?? {};
    void _previous;
    const nextSettings = { ...savedSettings, ...settings, ...(failedParts.length ? { chronicleMissing: failedParts } : {}) };
    // "Gemini is temporarily unavailable." — the first sentence says enough on a status line.
    const why = friendlyError(failures[0]?.reason).split(/(?<=\.)\s/)[0].replace(/\.$/, '');
    const detail = `${count} proposed change${count === 1 ? '' : 's'} ready to review.`
      + (failedParts.length ? ` ${partsLabel(failedParts)} couldn’t be written (${why}). Fill ${failedParts.length > 1 ? 'them' : 'it'} in when it’s less busy.` : '');
    await must(setDetail({ status: 'review', status_detail: detail.slice(0, 500), settings: nextSettings }).select('id'));
    return res.status(200).json({ count, status: 'review', status_detail: detail, settings: nextSettings });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : friendlyError(err);
    console.error('chronicle', err);
    await setDetail({ status_detail: `Couldn’t write the chronicle: ${message}`.slice(0, 500) });
    return res.status(status).json({ error: message });
  }
}
