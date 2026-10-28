// src/lib/recording/chronicle.ts
// -----------------------------------------------------------
// Turning a session transcript into the chronicle: the proposed changes the
// DM reviews before anything is written to the campaign.
//
// The AI reads a numbered transcript and returns small, typed items (a PC's
// part in the session, an NPC interaction, a thread that moved…), each citing
// the transcript line it came from. This file turns those items into
// proposals — validating ids against the campaign and taking each quote, time
// and speaker from the real transcript line, so a source can't be invented.
//
// Shared by /api/chronicle and the review screen, so it imports nothing.
// -----------------------------------------------------------

// --------------- Proposal actions (stored in chronicle_proposals.action) ---------------

export type EntityKind = 'pc' | 'npc' | 'location' | 'faction' | 'lore' | 'hook';
export type SessionField = 'summary' | 'combats' | 'loot_rewards' | 'hooks_notes' | 'dm_notes';
export type ChronicleGroup = 'session' | 'pcs' | 'npcs' | 'locations' | 'lore' | 'factions' | 'threads' | 'loot';

/** A change to one campaign entity, plus the line it gets in its Session History. */
export interface EntityChange {
  kind: 'entity';
  entity_type: EntityKind;
  matched_id: string | null;      // null = create a new entry
  name: string;                   // what the DM sees on the card
  set: Record<string, string | boolean | null>; // fields replaced (disposition, state, a new entry's fields)
  append: Record<string, string>; // text added to the end of a field (new details in a description)
  entry: string | null;           // this entity's Session History line
  reasoning: string;
  confidence: number;
}

/** A field of the session record (its recap, combats, loot…). */
export interface SessionFieldChange {
  kind: 'session';
  session_id: string;
  field: SessionField;
  value: string;
  reasoning: string;
  confidence: number;
}

export type ChronicleAction = EntityChange | SessionFieldChange;

export interface ProposalDraft {
  group_key: ChronicleGroup;
  action: ChronicleAction;
  source_ms: number | null;
  source_quote: string | null;
  source_speaker: string | null;
  sort_order: number;
}

// --------------- The transcript the AI reads ---------------

export interface TranscriptLine {
  start_ms: number;
  speaker: string;  // "DM", "Kutter (Sam)", "Speaker C"
  text: string;
}

export function clockLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** "[12] 0:04:31 Kutter (Sam): I ask him straight…" — the line number is what items cite. */
export function formatTranscript(lines: TranscriptLine[]): string {
  return lines.map((l, i) => `[${i + 1}] ${clockLabel(l.start_ms)} ${l.speaker}: ${l.text}`).join('\n');
}

// --------------- What the AI returns ---------------

interface Sourced { source_line?: number | null; confidence?: number | null; reasoning?: string | null }

export type ChronicleItem =
  | ({ kind: 'summary'; text: string } & Sourced)
  | ({ kind: 'combats'; text: string } & Sourced)
  | ({ kind: 'loot'; text: string } & Sourced)
  | ({ kind: 'left_open'; text: string } & Sourced)
  | ({ kind: 'dm_asides'; text: string } & Sourced)
  | ({ kind: 'pc'; pc_id: string; did: string } & Sourced)
  | ({ kind: 'npc'; matched_id: string | null; name: string; role?: string | null; description?: string | null;
       disposition?: string | null; status?: 'active' | 'deceased' | 'unknown' | null; interaction: string } & Sourced)
  | ({ kind: 'faction'; matched_id: string | null; name: string; faction_type?: string | null; learned: string } & Sourced)
  | ({ kind: 'location'; matched_id: string | null; name: string; location_type?: string | null; description?: string | null;
       happened: string } & Sourced)
  | ({ kind: 'lore'; matched_id: string | null; title: string; category?: string | null; revealed: string } & Sourced)
  | ({ kind: 'thread'; matched_id: string | null; title: string; category?: string | null;
       new_state?: 'seed' | 'active' | 'cold' | 'resolved' | null; development: string } & Sourced);

/** Ids that exist in this campaign, per kind — anything else the AI cites is treated as new (or dropped, for PCs). */
export type KnownIds = Record<EntityKind, Set<string>>;

const GROUP_ORDER: ChronicleGroup[] = ['session', 'pcs', 'npcs', 'locations', 'lore', 'factions', 'threads', 'loot'];
const QUOTE_MAX = 300;
const THREAD_STATES = new Set(['seed', 'active', 'cold', 'resolved']);
const NPC_STATUSES = new Set(['active', 'deceased', 'unknown']);
const HOOK_CATEGORIES = new Set(['main_plot', 'side_quest', 'character_arc', 'faction']);

const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+\n/g, '\n').trim() : '');
const orNull = (v: unknown): string | null => clean(v) || null;

export function normalizeConfidence(raw: unknown): number {
  if (raw == null || raw === '') return 0.7;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0.7;
  return Math.min(1, Math.max(0, n >= 2 ? n / 100 : n));
}

/**
 * Turns the AI's items into proposal drafts. Items that are empty, cite a PC
 * that isn't in the campaign, or don't fit any kind are dropped; a matched_id
 * that isn't a real entity of that kind becomes a new entry instead.
 */
export function itemsToProposals(
  items: unknown[],
  ctx: {
    sessionId: string;
    lines: TranscriptLine[];
    known: KnownIds;
    pcNames: Map<string, string>;
    /** Current field values of existing entities, by id — a change to the value it already has is dropped. */
    current?: Map<string, Record<string, unknown>>;
  },
): ProposalDraft[] {
  const drafts: Omit<ProposalDraft, 'sort_order'>[] = [];

  const source = (line: unknown) => {
    const n = typeof line === 'number' ? Math.round(line) : Number(line);
    const l = Number.isFinite(n) ? ctx.lines[n - 1] : undefined;
    return l
      ? { source_ms: l.start_ms, source_quote: l.text.length > QUOTE_MAX ? `${l.text.slice(0, QUOTE_MAX - 1)}…` : l.text, source_speaker: l.speaker }
      : { source_ms: null, source_quote: null, source_speaker: null };
  };
  const matched = (kind: EntityKind, id: unknown) => (typeof id === 'string' && ctx.known[kind].has(id) ? id : null);
  const meta = (it: Sourced) => ({ reasoning: clean(it.reasoning), confidence: normalizeConfidence(it.confidence) });

  const session = (field: SessionField, group: ChronicleGroup, it: Sourced & { text?: unknown }) => {
    const value = clean(it.text);
    if (!value) return;
    drafts.push({ group_key: group, action: { kind: 'session', session_id: ctx.sessionId, field, value, ...meta(it) }, ...source(it.source_line) });
  };
  const entity = (group: ChronicleGroup, it: Sourced, change: Omit<EntityChange, 'kind' | 'reasoning' | 'confidence'>) => {
    // Drop empty values so "no change" never overwrites a field with blank, and
    // values the entity already has (re-marking an active thread active).
    const now = change.matched_id ? ctx.current?.get(change.matched_id) : undefined;
    const set = Object.fromEntries(Object.entries(change.set).filter(([f, v]) => v !== null && v !== '' && !(now && now[f] === v)));
    const append = Object.fromEntries(Object.entries(change.append).filter(([, v]) => v));
    if (!change.name || (!change.entry && !Object.keys(set).length && !Object.keys(append).length)) return;
    drafts.push({ group_key: group, action: { kind: 'entity', ...change, set, append, ...meta(it) }, ...source(it.source_line) });
  };

  // Several items for one existing entity (an NPC met twice) become one card.
  const seen = new Map<string, number>();
  const mergeInto = (key: string | null, add: () => void) => {
    if (key && seen.has(key)) {
      const before = drafts.length;
      add();
      if (drafts.length === before) return;
      const extra = drafts.pop()!.action as EntityChange;
      const into = drafts[seen.get(key)!].action as EntityChange;
      into.entry = [into.entry, extra.entry].filter(Boolean).join(' ') || null;
      into.set = { ...into.set, ...extra.set };
      for (const [f, t] of Object.entries(extra.append)) into.append[f] = into.append[f] ? `${into.append[f]}\n\n${t}` : t;
      into.confidence = Math.min(into.confidence, extra.confidence);
      return;
    }
    const before = drafts.length;
    add();
    if (key && drafts.length > before) seen.set(key, drafts.length - 1);
  };

  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const it = raw as ChronicleItem;
    switch (it.kind) {
      case 'summary': session('summary', 'session', it); break;
      case 'combats': session('combats', 'session', it); break;
      case 'left_open': session('hooks_notes', 'session', it); break;
      case 'dm_asides': session('dm_notes', 'session', it); break;
      case 'loot': session('loot_rewards', 'loot', it); break;

      case 'pc': {
        const id = matched('pc', it.pc_id);
        if (!id) break;
        mergeInto(`pc:${id}`, () => entity('pcs', it, { entity_type: 'pc', matched_id: id, name: ctx.pcNames.get(id) ?? 'Player character', set: {}, append: {}, entry: orNull(it.did) }));
        break;
      }
      case 'npc': {
        const id = matched('npc', it.matched_id);
        const status = it.status && NPC_STATUSES.has(it.status) ? it.status : null;
        mergeInto(id && `npc:${id}`, () => entity('npcs', it, {
          entity_type: 'npc', matched_id: id, name: clean(it.name), entry: orNull(it.interaction),
          set: id
            ? { disposition: orNull(it.disposition), status, met_by_pcs: true }
            : { name: clean(it.name), role: orNull(it.role), description: orNull(it.description), disposition: orNull(it.disposition), status: status ?? 'active', met_by_pcs: true },
          append: id ? { description: clean(it.description) } : {},
        }));
        break;
      }
      case 'faction': {
        const id = matched('faction', it.matched_id);
        mergeInto(id && `faction:${id}`, () => entity('factions', it, {
          entity_type: 'faction', matched_id: id, name: clean(it.name), entry: orNull(it.learned),
          set: id ? {} : { name: clean(it.name), faction_type: orNull(it.faction_type), overview: orNull(it.learned) },
          append: {},
        }));
        break;
      }
      case 'location': {
        const id = matched('location', it.matched_id);
        mergeInto(id && `location:${id}`, () => entity('locations', it, {
          entity_type: 'location', matched_id: id, name: clean(it.name), entry: orNull(it.happened),
          set: id ? {} : { name: clean(it.name), location_type: orNull(it.location_type), description: orNull(it.description) },
          append: id ? { description: clean(it.description) } : {},
        }));
        break;
      }
      case 'lore': {
        const id = matched('lore', it.matched_id);
        mergeInto(id && `lore:${id}`, () => entity('lore', it, {
          entity_type: 'lore', matched_id: id, name: clean(it.title), entry: orNull(it.revealed),
          set: id ? {} : { title: clean(it.title), category: orNull(it.category), content: orNull(it.revealed), dm_only: false },
          append: {},
        }));
        break;
      }
      case 'thread': {
        const id = matched('hook', it.matched_id);
        const state = it.new_state && THREAD_STATES.has(it.new_state) ? it.new_state : null;
        const category = it.category && HOOK_CATEGORIES.has(it.category) ? it.category : null;
        mergeInto(id && `hook:${id}`, () => entity('threads', it, {
          entity_type: 'hook', matched_id: id, name: clean(it.title), entry: orNull(it.development),
          set: id
            ? { state, ...(state ? { is_active: state !== 'resolved' } : {}) }
            : { title: clean(it.title), category, description: orNull(it.development), state: state ?? 'seed', is_active: state !== 'resolved' },
          append: id ? { description: clean(it.development) } : {},
        }));
        break;
      }
    }
  }

  // Stable order: by group, then by when it happened in the session.
  return drafts
    .map((d, i) => ({ d, i }))
    .sort((a, b) =>
      GROUP_ORDER.indexOf(a.d.group_key) - GROUP_ORDER.indexOf(b.d.group_key)
      || (a.d.source_ms ?? Infinity) - (b.d.source_ms ?? Infinity)
      || a.i - b.i)
    .map(({ d }, i) => ({ ...d, sort_order: i }));
}
