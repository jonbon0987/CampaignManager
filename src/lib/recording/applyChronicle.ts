// src/lib/recording/applyChronicle.ts
// -----------------------------------------------------------
// Applying reviewed chronicle proposals to the campaign, and undoing that.
//
// Every write records what it replaced in chronicle_applied (the row before an
// update; nothing for a create), so "Undo this write-back" can put the
// campaign back exactly. The writer is passed in, so this logic is tested
// without a database (see applyChronicle.test.ts).
// -----------------------------------------------------------

import type { ChronicleAction, EntityChange, EntityKind, SessionField, SessionFieldChange } from './chronicle';

/** What the DM changed on a proposal: the whole edited action replaces the original. */
export interface ProposalEdits { action: ChronicleAction }

export interface ProposalLike {
  id: string;
  action: Record<string, unknown>;
  edits: Record<string, unknown> | null;
  source_ms: number | null;
  source_quote: string | null;
}

export function effectiveAction(p: ProposalLike): ChronicleAction {
  const edited = (p.edits as ProposalEdits | null)?.action;
  return (edited ?? p.action) as unknown as ChronicleAction;
}

// --------------- Retargeting ---------------

// The fields that only make sense when creating an entry, per kind, and the
// text field that new details go into.
const CREATE_ONLY: Record<EntityKind, string[]> = {
  pc: [],
  npc: ['name', 'role'],
  location: ['name', 'location_type'],
  faction: ['name', 'faction_type'],
  lore: ['title', 'category', 'dm_only'],
  hook: ['title', 'category'],
};
export const MAIN_TEXT: Record<EntityKind, string | null> = {
  pc: null, npc: 'description', location: 'description', faction: 'overview', lore: 'content', hook: 'description',
};
const NAME_FIELD: Record<EntityKind, string> = { pc: 'character_name', npc: 'name', location: 'name', faction: 'name', lore: 'title', hook: 'title' };

/**
 * Points an entity change at a different entry. Moving a "new entry" onto an
 * existing one turns its description into text added to that entry; moving an
 * update to "new" makes its added text the new entry's description.
 */
export function retarget(a: EntityChange, matchedId: string | null, name: string): EntityChange {
  const main = MAIN_TEXT[a.entity_type];
  if (matchedId) {
    const set = { ...a.set };
    const append = { ...a.append };
    if (!a.matched_id && main && typeof set[main] === 'string' && set[main]) {
      append[main] = append[main] ? `${set[main]}\n\n${append[main]}` : String(set[main]);
    }
    for (const f of [...CREATE_ONLY[a.entity_type], ...(main ? [main] : [])]) delete set[f];
    return { ...a, matched_id: matchedId, name, set, append };
  }
  const set: EntityChange['set'] = { ...a.set, [NAME_FIELD[a.entity_type]]: name };
  if (main && a.append[main]) set[main] = a.append[main];
  if (a.entity_type === 'npc') set.status = set.status ?? 'active';
  if (a.entity_type === 'lore') set.dm_only = false;
  if (a.entity_type === 'hook') { set.state = set.state ?? 'seed'; set.is_active = set.state !== 'resolved'; }
  return { ...a, matched_id: null, name, set, append: {} };
}

// --------------- Building the write ---------------

const joinText = (before: unknown, added: string) =>
  typeof before === 'string' && before.trim() ? `${before.trim()}\n\n${added}` : added;

/** The full record to write for an entity change, merged onto what's there now. */
export function entityPayload(a: EntityChange, existing: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = existing ? { ...existing } : {};
  Object.assign(out, a.set);
  for (const [field, text] of Object.entries(a.append)) {
    if (text) out[field] = joinText(out[field], text);
  }
  if (!existing && a.entity_type === 'npc') out.faction_ids = out.faction_ids ?? [];
  if (existing) out.id = existing.id;
  return out;
}

/** Session fields add to what the DM already wrote rather than replacing it. */
export function sessionValue(a: SessionFieldChange, session: Record<string, unknown>): string {
  return joinText(session[a.field], a.value);
}

// --------------- Applying ---------------

export type EntityTable = 'sessions' | 'player_characters' | 'npcs' | 'locations' | 'factions' | 'lore_entries' | 'hooks' | 'entity_session_entries';

export const TABLE: Record<EntityKind | 'session', EntityTable> = {
  session: 'sessions', pc: 'player_characters', npc: 'npcs', location: 'locations',
  faction: 'factions', lore: 'lore_entries', hook: 'hooks',
};

export interface ChronicleWriter {
  /** The entity as the campaign has it now (including campaign_id), or null. */
  existing: (kind: EntityKind | 'session', id: string) => Record<string, unknown> | null;
  /** Creates or updates an entity; returns its id. */
  write: (kind: EntityKind | 'session', payload: Record<string, unknown>, before: Record<string, unknown> | null) => Promise<string>;
  remove: (kind: EntityKind, id: string) => Promise<void>;
  addEntry: (entry: { entity_type: EntityKind; entity_id: string; text: string; source_ms: number | null; source_quote: string | null }) => Promise<string>;
  removeEntry: (id: string) => Promise<void>;
  logApplied: (row: { proposal_id: string; entity_table: EntityTable; entity_id: string; operation: 'create' | 'update'; before: Record<string, unknown> | null }) => Promise<void>;
  setStatus: (proposalId: string, status: 'accepted' | 'applied') => Promise<void>;
}

export interface ApplyResult {
  applied: string[];
  failed: { id: string; message: string }[];
}

const SESSION_FIELDS: SessionField[] = ['summary', 'combats', 'loot_rewards', 'hooks_notes', 'dm_notes'];

/** Applies accepted proposals in order. One failing doesn't stop the rest. */
export async function applyProposals(proposals: ProposalLike[], w: ChronicleWriter, onProgress?: (done: number, total: number) => void): Promise<ApplyResult> {
  const result: ApplyResult = { applied: [], failed: [] };
  for (const [i, p] of proposals.entries()) {
    onProgress?.(i, proposals.length);
    try {
      const a = effectiveAction(p);
      if (a.kind === 'session') {
        if (!SESSION_FIELDS.includes(a.field)) throw new Error(`Unknown session field "${a.field}".`);
        const session = w.existing('session', a.session_id);
        if (!session) throw new Error('This session no longer exists.');
        await w.write('session', { id: a.session_id, session_number: session.session_number, [a.field]: sessionValue(a, session) }, session);
        await w.logApplied({ proposal_id: p.id, entity_table: 'sessions', entity_id: a.session_id, operation: 'update', before: { id: a.session_id, [a.field]: session[a.field] ?? null } });
      } else {
        const existing = a.matched_id ? w.existing(a.entity_type, a.matched_id) : null;
        if (a.matched_id && !existing) throw new Error(`${a.name || 'That entry'} no longer exists in this campaign.`);
        if (!existing && a.entity_type === 'pc') throw new Error('Player characters aren’t created from a recording.');
        const id = await w.write(a.entity_type, entityPayload(a, existing), existing);
        await w.logApplied({ proposal_id: p.id, entity_table: TABLE[a.entity_type], entity_id: id, operation: existing ? 'update' : 'create', before: existing });
        if (a.entry?.trim()) {
          const entryId = await w.addEntry({ entity_type: a.entity_type, entity_id: id, text: a.entry.trim(), source_ms: p.source_ms, source_quote: p.source_quote });
          await w.logApplied({ proposal_id: p.id, entity_table: 'entity_session_entries', entity_id: entryId, operation: 'create', before: null });
        }
      }
      await w.setStatus(p.id, 'applied');
      result.applied.push(p.id);
    } catch (e) {
      result.failed.push({ id: p.id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}

// --------------- Undo ---------------

export interface AppliedLike {
  id: string;
  proposal_id: string | null;
  entity_table: string;
  entity_id: string;
  operation: 'create' | 'update';
  before: Record<string, unknown> | null;
  undone_at: string | null;
}

const KIND_BY_TABLE: Record<string, EntityKind | 'session'> = Object.fromEntries(
  Object.entries(TABLE).map(([k, t]) => [t, k as EntityKind | 'session']),
);

/**
 * Reverses a write-back, newest first: created rows are deleted and updated
 * rows get their earlier values back. Proposals return to "accepted" so they
 * can be applied again.
 */
export async function undoApplied(
  rows: AppliedLike[],
  w: Pick<ChronicleWriter, 'existing' | 'write' | 'remove' | 'removeEntry' | 'setStatus'> & { markUndone: (id: string) => Promise<void> },
  onProgress?: (done: number, total: number) => void,
): Promise<{ undone: number; failed: { id: string; message: string }[] }> {
  const failed: { id: string; message: string }[] = [];
  let undone = 0;
  const proposals = new Set<string>();
  const todo = [...rows].filter(r => !r.undone_at).reverse();
  for (const [i, r] of todo.entries()) {
    onProgress?.(i, todo.length);
    try {
      if (r.entity_table === 'entity_session_entries') {
        await w.removeEntry(r.entity_id);
      } else {
        const kind = KIND_BY_TABLE[r.entity_table];
        if (!kind) throw new Error(`Unknown table ${r.entity_table}.`);
        if (r.operation === 'create') {
          if (kind === 'session') throw new Error('Sessions aren’t created by a write-back.');
          await w.remove(kind, r.entity_id);
        } else if (r.before) {
          const now = w.existing(kind, r.entity_id);
          // Gone since (deleted by hand): nothing to put back.
          if (now) await w.write(kind, kind === 'session' ? { ...r.before, session_number: now.session_number } : r.before, now);
        }
      }
      await w.markUndone(r.id);
      undone++;
      if (r.proposal_id) proposals.add(r.proposal_id);
    } catch (e) {
      failed.push({ id: r.id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  for (const id of proposals) await w.setStatus(id, 'accepted').catch(() => {});
  return { undone, failed };
}
