// Shared formatter for the "current campaign data" block that gets embedded
// in AI prompts. Used by both the chat assistant (src/components/AIAssistant)
// and the document-import parse endpoint flow (src/lib/documentImport), so the
// AI always sees the same entity listing / ids regardless of entry point.

import type {
  Session, PlayerCharacter, NPC, Location,
  Faction, Hook, LoreEntry, Module, MonsterStatblock,
} from './database.types';

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

// ── Compact context block for one-shot generation prompts ──────────────────
// Lighter than formatCampaignContext (no ids / full entity dump). Used by the
// creature and encounter generators so a generated stat block or fight feels
// native to the campaign.

export type GenContextData = {
  overview: { title: string; plotSummary: string };
  sessions: Array<{ session_number: number | null; session_date: string | null; summary: string | null }>;
  lore: Array<{ title: string; category: string | null; content: string | null }>;
  locations: Array<{ name: string; region: string | null; location_type: string | null; description: string | null }>;
};

export function buildCampaignContextBlock(data: GenContextData): string {
  const parts: string[] = ['\n\n== CAMPAIGN CONTEXT ==', `Campaign: ${data.overview.title || 'Unnamed'}`];
  if (data.overview.plotSummary) parts.push(`Plot: ${data.overview.plotSummary}`);
  if (data.sessions.length > 0) {
    parts.push('\nRecent Sessions:');
    data.sessions.slice(-5).forEach(s => {
      if (s.summary) parts.push(`  Session #${s.session_number ?? '?'}: ${s.summary}`);
    });
  }
  if (data.lore.length > 0) {
    parts.push('\nLore:');
    data.lore.slice(0, 10).forEach(l => {
      const snippet = l.content ? l.content.substring(0, 120) + (l.content.length > 120 ? '…' : '') : '';
      parts.push(`  [${l.category ?? 'lore'}] ${l.title}${snippet ? ': ' + snippet : ''}`);
    });
  }
  if (data.locations.length > 0) {
    parts.push('\nLocations:');
    data.locations.slice(0, 10).forEach(l => {
      parts.push(`  ${l.name} (${l.location_type ?? '?'})${l.region ? ` in ${l.region}` : ''}${l.description ? ': ' + l.description.substring(0, 80) + '…' : ''}`);
    });
  }
  parts.push('\nUse this campaign context to make the generated content feel native to this world — reference appropriate locations, lore, and ongoing story threads where fitting.\n');
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
