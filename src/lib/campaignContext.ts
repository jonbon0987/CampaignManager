// Shared formatter for the "current campaign data" block that gets embedded
// in AI prompts. Used by both the chat assistant (src/components/AIAssistant)
// and the document-import parse endpoint flow (src/lib/documentImport), so the
// AI always sees the same entity listing / ids regardless of entry point.

import type {
  Session, PlayerCharacter, NPC, Location,
  Faction, Hook, LoreEntry, Module, MonsterStatblock,
} from './database.types';
import { KINDS, KIND_GROUP_LABEL, type RefKind } from './slashMarkdown';

// Truncate a text value and append ellipsis if it exceeds maxLen.
function truncate(value: string | null | undefined, maxLen = 500): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen) + '…';
}

// Format non-null text fields as indented lines beneath an entity listing.
function textFields(entity: Record<string, unknown>, keys: string[]): string {
  const lines: string[] = [];
  for (const key of keys) {
    const val = truncate(entity[key] as string | null | undefined);
    if (val) lines.push(`    ${key}: "${val}"`);
  }
  return lines.length ? '\n' + lines.join('\n') : '';
}

// ── Selective, hand-picked context block ───────────────────────────────────
// Powers the "modular" AI generators: instead of dumping a fixed slice of the
// campaign, the DM picks exactly which entities matter, and each one is
// rendered here with its kind, subtitle, meta tags, and a truncated
// description. Pure so it can be unit-tested; callers resolve their selected
// {kind,id} refs into SelectedEntity via the EntityRefContext detail map.

export interface SelectedEntity {
  kind: RefKind;
  id: string;
  label: string;
  sub: string;      // short qualifier (role, type, CR, …)
  desc: string;     // plain-text description (already stripped of markdown)
  meta: string[];   // extra tags (status, region, category, …)
}

export function buildSelectedContextBlock(
  entities: SelectedEntity[],
  overview: { title: string; plotSummary: string },
): string {
  if (entities.length === 0) return '';

  const parts: string[] = ['\n\n== SELECTED CONTEXT =='];
  parts.push(`Setting: ${overview.title?.trim() || 'Unnamed'}`);
  if (overview.plotSummary?.trim()) parts.push(`Plot: ${overview.plotSummary.trim()}`);

  // Group by kind, preserving the canonical KINDS order.
  const byKind = new Map<RefKind, SelectedEntity[]>();
  for (const e of entities) {
    const bucket = byKind.get(e.kind) ?? [];
    bucket.push(e);
    byKind.set(e.kind, bucket);
  }

  for (const kind of KINDS) {
    const bucket = byKind.get(kind);
    if (!bucket?.length) continue;
    parts.push(`\n${KIND_GROUP_LABEL[kind]}:`);
    for (const e of bucket) {
      const sub = e.sub?.trim() ? ` (${e.sub.trim()})` : '';
      const meta = e.meta.filter(m => m?.trim()).join(', ');
      const metaClause = meta ? ` [${meta}]` : '';
      const desc = truncate(e.desc, 400);
      const descClause = desc ? `: ${desc}` : '';
      parts.push(`  ${e.label}${sub}${metaClause}${descClause}`);
    }
  }

  parts.push('\nUse this selected campaign context to make the generated content feel native to this world — weave in the referenced NPCs, threads, locations, factions, and lore where fitting.\n');
  return parts.join('\n');
}

// ── Baseline campaign context (no hand-picked entities) ─────────────────────
// Fallback for the campaign encounter generator when the DM selects nothing:
// the fight should still feel native to the ongoing story, so ground it in the
// campaign overview, recent session recaps, active threads, and a few notable
// locations. Pure / unit-testable.

export type DefaultContextData = {
  overview: { title: string; plotSummary: string };
  sessions: Array<{ session_number: number | null; summary: string | null }>;
  hooks: Array<{ title: string; category: string | null; description: string | null; is_active: boolean }>;
  locations: Array<{ name: string; location_type: string | null; region: string | null }>;
};

export function buildDefaultCampaignContextBlock(data: DefaultContextData): string {
  const parts: string[] = ['\n\n== CAMPAIGN CONTEXT =='];
  parts.push(`Campaign: ${data.overview.title?.trim() || 'Unnamed'}`);
  if (data.overview.plotSummary?.trim()) parts.push(`Plot: ${data.overview.plotSummary.trim()}`);

  const recentSessions = data.sessions.filter(s => s.summary?.trim()).slice(-5);
  if (recentSessions.length) {
    parts.push('\nRecent Sessions:');
    recentSessions.forEach(s => parts.push(`  Session #${s.session_number ?? '?'}: ${truncate(s.summary, 300)}`));
  }

  const activeThreads = data.hooks.filter(h => h.is_active).slice(0, 8);
  if (activeThreads.length) {
    parts.push('\nActive Threads:');
    activeThreads.forEach(h => {
      const desc = truncate(h.description, 200);
      parts.push(`  ${h.title}${h.category ? ` (${h.category})` : ''}${desc ? `: ${desc}` : ''}`);
    });
  }

  const locations = data.locations.slice(0, 8);
  if (locations.length) {
    parts.push('\nNotable Locations:');
    locations.forEach(l => parts.push(`  ${l.name}${l.location_type ? ` (${l.location_type})` : ''}${l.region ? ` in ${l.region}` : ''}`));
  }

  parts.push('\nNo specific entities were selected — use this general campaign context to make the encounter feel native to the ongoing story.\n');
  return parts.join('\n');
}

export function formatCampaignContext(data: {
  sessions: Session[];
  pcs: PlayerCharacter[];
  npcs: NPC[];
  locations: Location[];
  factions: Faction[];
  hooks: Hook[];
  lore: LoreEntry[];
  modules: Module[];
  monsterStatblocks?: MonsterStatblock[];
  overviewTitle: string;
  overviewPlot: string;
}): string {
  return `Campaign: ${data.overviewTitle || 'Unnamed Campaign'}
Plot summary: ${data.overviewPlot || '(none)'}

== CURRENT CAMPAIGN DATA ==

SESSIONS (${data.sessions.length}):
${data.sessions.map(s => `  #${s.session_number} (${s.session_date ?? 'no date'}): ${s.summary ?? '(no summary)'} [id:${s.id}]`).join('\n') || '  (none)'}

PLAYER CHARACTERS (${data.pcs.length}):
${data.pcs.map(p => `  ${p.character_name} — ${p.race ?? '?'} ${p.class ?? '?'}, played by ${p.player_name ?? '?'} [id:${p.id}]${textFields(p as unknown as Record<string, unknown>, ['background', 'story_hooks', 'key_npcs', 'dm_notes'])}`).join('\n') || '  (none)'}

NPCS (${data.npcs.length}):
${data.npcs.map(n => `  ${n.name} (${n.role ?? '?'}, ${n.affiliation ?? '?'}, ${n.status}${n.met_by_pcs ? ', met' : ''}) [id:${n.id}]${textFields(n as unknown as Record<string, unknown>, ['description', 'hooks_motivations', 'dm_notes'])}`).join('\n') || '  (none)'}

LOCATIONS (${data.locations.length}):
${data.locations.map(l => `  ${l.name} — ${l.location_type ?? '?'} in ${l.region ?? '?'} [id:${l.id}]${textFields(l as unknown as Record<string, unknown>, ['description', 'history', 'dm_notes'])}`).join('\n') || '  (none)'}

FACTIONS (${data.factions.length}):
${data.factions.map(f => `  ${f.name} (${f.faction_type ?? '?'}) [id:${f.id}]${textFields(f as unknown as Record<string, unknown>, ['overview', 'key_figures', 'agenda', 'dm_notes'])}`).join('\n') || '  (none)'}

HOOKS & IDEAS (${data.hooks.length}):
${data.hooks.map(h => `  [${h.is_active ? 'active' : 'resolved'}] ${h.title} (${h.category ?? '?'}) [id:${h.id}]${textFields(h as unknown as Record<string, unknown>, ['description', 'dm_only_notes'])}`).join('\n') || '  (none)'}

LORE ENTRIES (${data.lore.length}):
${data.lore.map(l => `  ${l.title} (${l.category ?? '?'}) [id:${l.id}]${textFields(l as unknown as Record<string, unknown>, ['content'])}`).join('\n') || '  (none)'}

MODULES (${data.modules.length}):
${data.modules.map(m => `  Ch.${m.chapter ?? '?'}: ${m.title} [${m.status}] [id:${m.id}]${textFields(m as unknown as Record<string, unknown>, ['synopsis', 'dm_notes'])}`).join('\n') || '  (none)'}

STAT SHEETS (${data.monsterStatblocks?.length ?? 0}):
${data.monsterStatblocks?.map(s => `  ${s.name} (${s.creature_type ?? '?'}, CR ${s.challenge_rating ?? '?'}) [id:${s.id}]`).join('\n') || '  (none)'}`;
}
