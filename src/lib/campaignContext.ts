// Shared formatter for the "current campaign data" block that gets embedded
// in AI prompts. Used by both the chat assistant (src/components/AIAssistant)
// and the document-import parse endpoint flow (src/lib/documentImport), so the
// AI always sees the same entity listing / ids regardless of entry point.

import type {
  Session, PlayerCharacter, NPC, Location,
  Faction, Hook, LoreEntry, Module,
} from './database.types';

export function formatCampaignContext(data: {
  sessions: Session[];
  pcs: PlayerCharacter[];
  npcs: NPC[];
  locations: Location[];
  factions: Faction[];
  hooks: Hook[];
  lore: LoreEntry[];
  modules: Module[];
  overviewTitle: string;
  overviewPlot: string;
}): string {
  return `Campaign: ${data.overviewTitle || 'Unnamed Campaign'}
Plot summary: ${data.overviewPlot || '(none)'}

== CURRENT CAMPAIGN DATA ==

SESSIONS (${data.sessions.length}):
${data.sessions.map(s => `  #${s.session_number} (${s.session_date ?? 'no date'}): ${s.summary ?? '(no summary)'} [id:${s.id}]`).join('\n') || '  (none)'}

PLAYER CHARACTERS (${data.pcs.length}):
${data.pcs.map(p => `  ${p.character_name} — ${p.race ?? '?'} ${p.class ?? '?'}, played by ${p.player_name ?? '?'} [id:${p.id}]`).join('\n') || '  (none)'}

NPCS (${data.npcs.length}):
${data.npcs.map(n => `  ${n.name} (${n.role ?? '?'}, ${n.affiliation ?? '?'}, ${n.status}${n.met_by_pcs ? ', met' : ''}) [id:${n.id}]`).join('\n') || '  (none)'}

LOCATIONS (${data.locations.length}):
${data.locations.map(l => `  ${l.name} — ${l.location_type ?? '?'} in ${l.region ?? '?'} [id:${l.id}]`).join('\n') || '  (none)'}

FACTIONS (${data.factions.length}):
${data.factions.map(f => `  ${f.name} (${f.faction_type ?? '?'}) [id:${f.id}]`).join('\n') || '  (none)'}

HOOKS & IDEAS (${data.hooks.length}):
${data.hooks.map(h => `  [${h.is_active ? 'active' : 'resolved'}] ${h.title} (${h.category ?? '?'}) [id:${h.id}]`).join('\n') || '  (none)'}

LORE ENTRIES (${data.lore.length}):
${data.lore.map(l => `  ${l.title} (${l.category ?? '?'}) [id:${l.id}]`).join('\n') || '  (none)'}

MODULES (${data.modules.length}):
${data.modules.map(m => `  Ch.${m.chapter ?? '?'}: ${m.title} [${m.status}] [id:${m.id}]`).join('\n') || '  (none)'}`;
}
