// src/lib/recording/chronicleView.ts
// -----------------------------------------------------------
// What a session's chronicle shows once its write-back is applied: what each
// change did to the campaign (read from the applied log, so a new entry links
// to the id it was given) and how the table's talk time was shared.
// Pure, so it is tested without a database (see chronicleView.test.ts).
// -----------------------------------------------------------

import type { EntityKind, SessionField } from './chronicle';
import { effectiveAction, MAIN_TEXT, type AppliedLike, type ProposalLike } from './applyChronicle';

/** One change the write-back made to an entity. */
export interface WrittenItem {
  proposalId: string;
  kind: EntityKind;
  entityId: string | null;
  name: string;
  created: boolean;
  /** The line added to the entity's Session History. */
  entry: string | null;
  /** Text added to its description (or a new entry's description). */
  added: string | null;
  /** Tracked fields the write-back changed, with what they were. */
  changes: { field: 'disposition' | 'status' | 'state'; from: string | null; to: string }[];
  sourceMs: number | null;
  quote: string | null;
}

export interface ChronicleModel {
  byKind: Record<EntityKind, WrittenItem[]>;
  /** The session fields the write-back added to. */
  sessionFields: SessionField[];
  written: number;
  edited: number;
  skipped: number;
}

const TRACKED = ['disposition', 'status', 'state'] as const;

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function buildChronicle(proposals: (ProposalLike & { status: string })[], log: AppliedLike[]): ChronicleModel {
  const byKind: ChronicleModel['byKind'] = { pc: [], npc: [], location: [], faction: [], lore: [], hook: [] };
  const live = log.filter(r => !r.undone_at);
  const sessionFields: SessionField[] = [];
  let written = 0;
  for (const p of proposals) {
    if (p.status !== 'applied') continue;
    written++;
    const a = effectiveAction(p);
    if (a.kind === 'session') {
      if (!sessionFields.includes(a.field)) sessionFields.push(a.field);
      continue;
    }
    const row = live.find(r => r.proposal_id === p.id && r.entity_table !== 'entity_session_entries');
    const created = row?.operation === 'create';
    const before = row?.before ?? null;
    const main = MAIN_TEXT[a.entity_type];
    const changes: WrittenItem['changes'] = [];
    for (const field of TRACKED) {
      const to = str(a.set[field]);
      const from = str(before?.[field]);
      if (to && to !== from) changes.push({ field, from: created ? null : from, to });
    }
    byKind[a.entity_type].push({
      proposalId: p.id,
      kind: a.entity_type,
      entityId: row?.entity_id ?? a.matched_id,
      name: a.name,
      created,
      entry: str(a.entry),
      added: main ? str(created ? a.set[main] : a.append[main]) : null,
      changes,
      sourceMs: p.source_ms,
      quote: p.source_quote,
    });
  }
  return {
    byKind,
    sessionFields,
    written,
    edited: proposals.filter(p => p.edits && p.status === 'applied').length,
    skipped: proposals.filter(p => p.status === 'skipped').length,
  };
}

// --------------- Talk time ---------------

export interface SpokenLine {
  pc_id: string | null;
  is_dm: boolean;
  start_ms: number;
  end_ms: number;
  dropped_as_echo?: boolean;
}

/**
 * Each player character's share of the players' talk time (the DM's lines
 * aren't counted), and the ones who had a quiet night: less than half an
 * even share, when there are at least two players. Pass the players who were
 * there so one who never spoke still counts.
 */
export function talkShare(lines: SpokenLine[], players: string[] = []): { share: Map<string, number>; quiet: Set<string> } {
  const ms = new Map<string, number>(players.map(id => [id, 0]));
  for (const l of lines) {
    if (l.is_dm || !l.pc_id || l.dropped_as_echo) continue;
    ms.set(l.pc_id, (ms.get(l.pc_id) ?? 0) + Math.max(0, l.end_ms - l.start_ms));
  }
  const total = [...ms.values()].reduce((a, b) => a + b, 0);
  const share = new Map<string, number>();
  const quiet = new Set<string>();
  if (!total) return { share, quiet };
  for (const [id, t] of ms) share.set(id, t / total);
  if (ms.size >= 2) for (const [id, s] of share) if (s < 0.5 / ms.size) quiet.add(id);
  return { share, quiet };
}
