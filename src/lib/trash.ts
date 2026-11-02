// What undo and "Recently deleted" know about each kind of record: what the app
// calls it, and how to name one from its deleted row. Deletes of anything not
// listed here (links, transcript lines, a share switched off) are kept too,
// so a restore can bring them back with their parent, but aren't listed.

import type { DeletedItem } from './database.types';

/** Fired when deleted records come back, so every loaded list reloads. */
export const RESTORED_EVENT = 'records-restored';

export function announceRestored(): void {
  window.dispatchEvent(new Event(RESTORED_EVENT));
}

type Row = DeletedItem['data'];
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const named = (d: Row) => text(d.name) || text(d.title);
const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const KINDS: Record<string, { noun: string; label: (d: Row) => string }> = {
  worlds: { noun: 'World', label: named },
  campaigns: { noun: 'Campaign', label: d => text(d.title) || text(d.name) },
  sessions: { noun: 'Session', label: d => text(d.title) || `Session ${d.session_number}` },
  player_characters: { noun: 'Character', label: d => text(d.character_name) },
  npcs: { noun: 'NPC', label: named },
  locations: { noun: 'Place', label: named },
  factions: { noun: 'Faction', label: named },
  hooks: { noun: 'Thread', label: named },
  ideas: { noun: 'Idea', label: d => clip(text(d.text)) },
  lore_entries: { noun: 'Lore', label: named },
  timeline_events: { noun: 'Timeline event', label: named },
  modules: { noun: 'Module', label: named },
  submodules: { noun: 'Submodule', label: named },
  scenes: { noun: 'Scene', label: named },
  handouts: { noun: 'Handout', label: named },
  items: { noun: 'Item', label: named },
  monster_statblocks: { noun: 'Stat sheet', label: named },
  encounters: { noun: 'Encounter', label: named },
  random_encounter_tables: { noun: 'Random table', label: named },
  character_relationships: { noun: 'Relationship', label: d => text(d.label) || text(d.relationship_type) },
};

/** How the list names a delete, or null for one it doesn't show. */
export function describeDeleted(item: Pick<DeletedItem, 'table_name' | 'data'>): { noun: string; label: string } | null {
  const kind = KINDS[item.table_name];
  if (!kind) return null;
  return { noun: kind.noun, label: kind.label(item.data) || `Untitled ${kind.noun.toLowerCase()}` };
}

/** A restore's refusal, in words: a raw constraint name means nothing to a DM. */
export function restoreErrorMessage(message: string): string {
  if (message.includes('sessions_campaign_id_session_number_key')) {
    return 'Can’t restore it: a newer session has its number. Renumber that one, then restore this.';
  }
  if (message.includes('duplicate key')) return 'Can’t restore it: something newer has taken its place.';
  return message;
}

/** "just now", "5 minutes ago", "yesterday", "3 days ago". */
export function deletedWhen(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
