// What the assistant can change on a thread beyond its text: a clock and links.
// The model writes these freely, so what it proposes is cleaned before it's
// shown or saved: a size the database would refuse, a count past the end of the
// clock, or an id it made up (uuid arrays have no foreign key to catch that, so
// a bad one would sit there linking nothing). Pure.

import { CLOCK_SIZES, clockOf, stateAfterClock } from './threadClock';

export interface ThreadLinkIds {
  npcs: Iterable<string>;
  locations: Iterable<string>;
  factions: Iterable<string>;
  modules: Iterable<string>;
}

const toInt = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : null;
};

function realIds(v: unknown, known: Iterable<string>): string[] {
  const set = new Set(known);
  return Array.isArray(v) ? [...new Set(v.filter((id): id is string => typeof id === 'string' && set.has(id)))] : [];
}

/**
 * A thread's payload, made safe to write. `payload` is what's proposed: the whole
 * row for a merged update, or just the changes for a card's preview. Fields it
 * doesn't carry stay absent, except what a change to them forces.
 */
export function cleanThreadPayload<T extends Record<string, unknown>>(
  payload: T,
  existing: Record<string, unknown> | null,
  known: ThreadLinkIds,
): T {
  const out: Record<string, unknown> = { ...payload };

  if ('npc_ids' in out) out.npc_ids = realIds(out.npc_ids, known.npcs);
  if ('location_ids' in out) out.location_ids = realIds(out.location_ids, known.locations);
  if ('faction_ids' in out) out.faction_ids = realIds(out.faction_ids, known.factions);
  if ('module_id' in out && out.module_id !== null) {
    const real = typeof out.module_id === 'string' && new Set(known.modules).has(out.module_id);
    if (!real) {
      if (existing && 'module_id' in existing) out.module_id = existing.module_id;
      else delete out.module_id;
    }
  }

  if ('clock_size' in out && out.clock_size !== null) {
    const asked = toInt(out.clock_size);
    if (asked !== null && (CLOCK_SIZES as readonly number[]).includes(asked)) {
      out.clock_size = asked;
    } else if (existing && 'clock_size' in existing) {
      out.clock_size = existing.clock_size; // not a size we have: keep what's there
    } else {
      delete out.clock_size;
    }
  }

  const touched = 'clock_size' in out || 'clock_filled' in out || 'clock_label' in out;
  const size = (('clock_size' in out ? out.clock_size : existing?.clock_size) ?? null) as number | null;
  if (!size) {
    // No clock, so nothing to fill and nothing to name.
    if (touched) {
      out.clock_filled = 0;
      out.clock_label = null;
    }
    return out as T;
  }

  if ('clock_label' in out) {
    const label = typeof out.clock_label === 'string' ? out.clock_label.trim() : '';
    out.clock_label = label || null;
  }

  const filled = Math.min(size, Math.max(0, toInt('clock_filled' in out ? out.clock_filled : existing?.clock_filled) ?? 0));
  if ('clock_filled' in out || 'clock_size' in out) out.clock_filled = filled;

  // A clock that fills here wakes its thread, as it does by hand. One that was
  // already full doesn't: the DM may have set that thread aside on purpose.
  const wasFull = existing ? !!clockOf(existing as Parameters<typeof clockOf>[0])?.full : false;
  const state = out.state ?? existing?.state;
  if (filled >= size && !wasFull && typeof state === 'string') {
    const next = stateAfterClock(state, size, filled);
    if (next !== state) {
      out.state = next;
      out.is_active = next !== 'resolved';
    }
  }
  return out as T;
}

export interface ThreadCardNames {
  npc: (id: string) => string | undefined;
  place: (id: string) => string | undefined;
  faction: (id: string) => string | undefined;
  module: (id: string) => string | undefined;
}

export interface ThreadCardRow { label: string; old?: string; value: string }

const clockText = (r: Record<string, unknown> | null): string | undefined => {
  const c = r ? clockOf(r as Parameters<typeof clockOf>[0]) : null;
  return c ? `${c.filled} of ${c.size}${c.label ? `: ${c.label}` : ''}` : undefined;
};

const nameList = (ids: unknown, name: (id: string) => string | undefined): string | undefined => {
  const names = Array.isArray(ids) ? ids.map(id => name(String(id))).filter(Boolean) : [];
  return names.length ? names.join(', ') : undefined;
};

/** The rows a thread's approval card shows for its clock and links, by name, and only where they change. */
export function threadCardRows(
  existing: Record<string, unknown> | null,
  payload: Record<string, unknown>,
  names: ThreadCardNames,
): ThreadCardRow[] {
  const rows: ThreadCardRow[] = [];
  const row = (label: string, old: string | undefined, value: string | undefined) => {
    if (old !== value) rows.push({ label, old, value: value ?? '—' });
  };
  if ('clock_size' in payload || 'clock_filled' in payload || 'clock_label' in payload) {
    row('Clock', clockText(existing), clockText({ ...existing, ...payload }));
  }
  const links: [string, string, (id: string) => string | undefined][] = [
    ['npc_ids', 'People', names.npc], ['location_ids', 'Places', names.place], ['faction_ids', 'Factions', names.faction],
  ];
  for (const [key, label, name] of links) {
    if (key in payload) row(label, nameList(existing?.[key], name), nameList(payload[key], name));
  }
  if ('module_id' in payload) {
    const of = (v: unknown) => (typeof v === 'string' ? names.module(v) : undefined);
    row('Chapter', of(existing?.module_id), of(payload.module_id));
  }
  return rows;
}
