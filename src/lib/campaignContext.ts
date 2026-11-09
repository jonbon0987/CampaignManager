// Shared formatter for the "current campaign data" block that gets embedded
// in AI prompts. Used by both the chat assistant (src/components/AIAssistant)
// and the document-import parse endpoint flow (src/lib/documentImport), so the
// AI always sees the same entity listing / ids regardless of entry point.

import { ruleLine, type HouseRule } from './houseRules';
import type {
  Session, PlayerCharacter, NPC, Location,
  Faction, Hook, LoreEntry, Module, MonsterStatblock, Submodule, Scene,
  Item, ItemHolding, TreasuryEntry, Campaign, SessionPlan,
} from './database.types';
import { itemLine } from './items';
import { formatCoins, formatLine, gpWorth, sumCoins } from './treasury';
import { dateOf, formatWorldDate, type Month } from './calendar';
import { holdersText } from './assistantCampaign';
import { KINDS, KIND_GROUP_LABEL, type RefKind } from './slashMarkdown';

// Truncate a text value and append ellipsis if it exceeds maxLen. The default
// governs the entity field listing the assistant reads (via textFields); it is
// deliberately generous so the assistant can see a field in full and revise it
// in place rather than overwriting from a partial view. The trailing "…" is the
// signal the prompt keys off to know a field is only partially shown.
function truncate(value: string | null | undefined, maxLen = 1500): string | null {
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

// Render a module's submodules and their scenes as an indented tree beneath the
// module line, so the assistant can see the structure that already exists —
// and reuse those ids — before it proposes new sections. Only loaded branches
// appear; the assistant asks for the whole tree up front (loadModuleTree).
function moduleTree(
  moduleId: string,
  submodules: Submodule[],
  scenes: Scene[],
): string {
  const subs = submodules
    .filter(s => s.module_id === moduleId)
    .sort((a, b) => a.sort_order - b.sort_order);
  if (subs.length === 0) return '';

  const lines: string[] = [];
  for (const sub of subs) {
    const summary = truncate(sub.summary, 200);
    lines.push(`    ▸ ${sub.title} (${sub.submodule_type ?? 'other'}) [id:${sub.id}]${summary ? `: ${summary}` : ''}`);
    const subScenes = scenes
      .filter(sc => sc.submodule_id === sub.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    for (const sc of subScenes) {
      const scSummary = truncate(sc.summary, 150);
      lines.push(`      · ${sc.title} (${sc.scene_type ?? 'other'}) [id:${sc.id}]${scSummary ? `: ${scSummary}` : ''}`);
    }
  }
  return '\n' + lines.join('\n');
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
  submodules?: Submodule[];
  scenes?: Scene[];
  monsterStatblocks?: MonsterStatblock[];
  overviewTitle: string;
  overviewPlot: string;
  houseRules?: HouseRule[];
  /** The campaign's own settings, and the world calendar its date is read in. */
  settings?: { campaign: Pick<Campaign, 'rules_edition' | 'levelling' | 'session_repeat' | 'world_date'>; months: Month[]; suffix: string };
  items?: Item[];
  holdings?: ItemHolding[];
  treasury?: TreasuryEntry[];
}): string {
  const submodules = data.submodules ?? [];
  const scenes = data.scenes ?? [];
  // Links show as names, so the model reads who and where rather than ids.
  const byId = <T extends { id: string }>(rows: T[], label: (r: T) => string) => {
    const m = new Map(rows.map(r => [r.id, label(r)]));
    return (id: string) => m.get(id) ?? null;
  };
  const npcName = byId(data.npcs, n => n.name);
  const factionName = byId(data.factions, f => f.name);
  const placeName = byId(data.locations, l => l.name);
  const moduleName = byId(data.modules, m => m.title);
  const threadName = byId(data.hooks, h => h.title);
  const sceneName = byId(data.scenes ?? [], s => s.title);
  const pcName = byId(data.pcs, p => p.character_name);
  const sessionName = byId(data.sessions, s => `session ${s.session_number}`);
  const names = (ids: string[] | null | undefined, name: (id: string) => string | null) =>
    (ids ?? []).map(name).filter(Boolean).join(', ');
  return `Campaign: ${data.overviewTitle || 'Unnamed Campaign'}
Plot summary: ${data.overviewPlot || '(none)'}
${data.settings ? `
${settingsBlock(data.settings)}
` : ''}${data.houseRules?.length ? `
== HOUSE RULES ==
This table plays these instead of the book. Follow them when you answer a rules question or build anything to be played, and say so when one changes the answer.
${data.houseRules.map(r => `  ${r.topic}. ${ruleLine(r)} [id:${r.id}]`).join('\n')}
` : ''}
== CURRENT CAMPAIGN DATA ==

SESSIONS (${data.sessions.length}):
${data.sessions.map(s => `  #${s.session_number}${s.title ? ` "${s.title}"` : ''} (${s.session_date ?? 'no date'}${s.session_time ? ` at ${s.session_time}` : ''}, ${s.status ?? 'done'}): ${s.summary ?? '(no summary)'}${planLine(s.plan, threadName, npcName, sceneName)} [id:${s.id}]${s.status === 'planned' ? textFields(s as unknown as Record<string, unknown>, ['prep_notes']) : ''}`).join('\n') || '  (none)'}

PLAYER CHARACTERS (${data.pcs.length}):
${data.pcs.map(p => `  ${p.character_name} — ${p.race ?? '?'} ${p.class ?? '?'}${p.level ? ` ${p.level}` : ''}, played by ${p.player_name ?? '?'}${p.is_active === false ? ' (inactive)' : ''}${pcStats(p)}${names(p.key_npc_ids, npcName) ? `; key NPCs: ${names(p.key_npc_ids, npcName)}` : ''} [id:${p.id}]${textFields(p as unknown as Record<string, unknown>, ['background', 'story_hooks', 'key_npcs', 'dm_notes'])}`).join('\n') || '  (none)'}

NPCS (${data.npcs.length}):
${data.npcs.map(n => `  ${n.name} (${n.role ?? '?'}, ${names(n.faction_ids, factionName) || n.affiliation || 'no faction'}${n.location_id && placeName(n.location_id) ? `, at ${placeName(n.location_id)}` : ''}, ${n.status}${n.met_by_pcs ? ', met' : ''}${n.disposition ? `, toward the party: ${n.disposition}` : ''}) [id:${n.id}]${textFields(n as unknown as Record<string, unknown>, ['description', 'hooks_motivations', 'dm_notes'])}`).join('\n') || '  (none)'}

LOCATIONS (${data.locations.length}):
${data.locations.map(l => `  ${l.name} — ${l.location_type ?? '?'} in ${l.region ?? '?'}${l.parent_id && placeName(l.parent_id) ? `, inside ${placeName(l.parent_id)}` : ''} [id:${l.id}]${textFields(l as unknown as Record<string, unknown>, ['description', 'history', 'read_aloud', 'dm_notes'])}`).join('\n') || '  (none)'}

FACTIONS (${data.factions.length}):
${data.factions.map(f => `  ${f.name} (${f.faction_type ?? '?'})${names(f.key_figure_ids, npcName) ? `; key figures: ${names(f.key_figure_ids, npcName)}` : ''} [id:${f.id}]${textFields(f as unknown as Record<string, unknown>, ['overview', 'key_figures', 'agenda', 'dm_notes'])}`).join('\n') || '  (none)'}

HOOKS & IDEAS (${data.hooks.length}):
${data.hooks.map(h => `  [${h.state ?? (h.is_active ? 'active' : 'resolved')}] ${h.title} (${h.category ?? '?'})${h.clock_size ? `; clock ${h.clock_filled ?? 0} of ${h.clock_size}${h.clock_label ? `: ${h.clock_label}` : ''}` : ''}${names(h.npc_ids, npcName) ? `; NPCs: ${names(h.npc_ids, npcName)}` : ''}${names(h.faction_ids, factionName) ? `; factions: ${names(h.faction_ids, factionName)}` : ''}${names(h.location_ids, placeName) ? `; places: ${names(h.location_ids, placeName)}` : ''}${h.module_id && moduleName(h.module_id) ? `; chapter: ${moduleName(h.module_id)}` : ''} [id:${h.id}]${textFields(h as unknown as Record<string, unknown>, ['description', 'player_text', 'dm_only_notes'])}`).join('\n') || '  (none)'}

LORE ENTRIES (${data.lore.length}):
${data.lore.map(l => `  ${l.title} (${l.category ?? '?'}) [id:${l.id}]${textFields(l as unknown as Record<string, unknown>, ['content'])}`).join('\n') || '  (none)'}

MODULES (${data.modules.length}) — each module's submodules (▸) and their scenes (·) are listed beneath it:
${data.modules.map(m => `  Ch.${m.chapter ?? '?'}: ${m.title} [${m.status}] [id:${m.id}]${textFields(m as unknown as Record<string, unknown>, ['synopsis', 'dm_notes'])}${moduleTree(m.id, submodules, scenes)}`).join('\n') || '  (none)'}

STAT SHEETS (${data.monsterStatblocks?.length ?? 0}):
${data.monsterStatblocks?.map(s => `  ${s.name} (${s.creature_type ?? '?'}, CR ${s.challenge_rating ?? '?'}) [id:${s.id}]`).join('\n') || '  (none)'}${data.items ? `

ITEMS (${data.items.length}):
${data.items.map(i => {
    const held = holdersText((data.holdings ?? []).filter(h => h.item_id === i.id), data.pcs);
    const kind = itemLine(i);
    return `  ${i.name}${kind ? ` — ${kind}` : ''}${i.value ? `; worth ${i.value}` : ''}; held by ${held || 'nobody'} [id:${i.id}]${textFields(i as unknown as Record<string, unknown>, ['description', 'dm_notes'])}`;
  }).join('\n') || '  (none)'}` : ''}${data.treasury ? `

${treasuryBlock(data.treasury, pcName, sessionName)}` : ''}`;
}

/** The campaign's settings, so the assistant knows what's set and can change it. */
function settingsBlock(s: NonNullable<Parameters<typeof formatCampaignContext>[0]['settings']>): string {
  const date = dateOf(s.campaign.world_date);
  const repeat = s.campaign.session_repeat === 'fortnightly' ? 'every two weeks' : s.campaign.session_repeat === 'weekly' ? 'weekly' : 'no set pattern';
  const levelling = s.campaign.levelling === 'xp' ? 'by XP' : s.campaign.levelling === 'milestone' ? 'at milestones' : 'not set';
  return `== CAMPAIGN SETTINGS ==
  Rules edition: ${s.campaign.rules_edition ?? '2014'}
  Levelling: ${levelling}
  Table meets: ${repeat}
  In-world date: ${date ? formatWorldDate(date, s.months, s.suffix) : 'not set'}
  World calendar, month (days): ${s.months.map(m => `${m.name} (${m.days})`).join(', ')}`;
}

/** "; prep: threads A, B; NPCs C; scenes D", for a session with a plan. */
function planLine(
  plan: SessionPlan | null | undefined,
  thread: (id: string) => string | null,
  npc: (id: string) => string | null,
  scene: (id: string) => string | null,
): string {
  const list = (ids: string[] | undefined, name: (id: string) => string | null) => (ids ?? []).map(name).filter(Boolean).join(', ');
  const parts = [
    ['threads', list(plan?.hook_ids, thread)],
    ['NPCs', list(plan?.npc_ids, npc)],
    ['scenes', list(plan?.scene_ids, scene)],
  ].filter(([, v]) => v).map(([k, v]) => `${k} ${v}`);
  return parts.length ? `; prep: ${parts.join('; ')}` : '';
}

/** "; AC 16, 42 HP, passive Perception 14, …" for the numbers a PC has. */
function pcStats(p: PlayerCharacter): string {
  const parts = [
    p.armor_class != null && `AC ${p.armor_class}`,
    p.max_hp != null && `${p.max_hp} HP`,
    p.passive_perception != null && `passive Perception ${p.passive_perception}`,
    p.passive_insight != null && `passive Insight ${p.passive_insight}`,
    p.passive_investigation != null && `passive Investigation ${p.passive_investigation}`,
    p.spell_save_dc != null && `spell save DC ${p.spell_save_dc}`,
    p.xp != null && `${p.xp.toLocaleString('en-US')} XP`,
    p.sheet_url && `sheet ${p.sheet_url}`,
  ].filter(Boolean);
  return parts.length ? `; ${parts.join(', ')}` : '';
}

/** The party's balance and its latest ledger lines, each with its id. */
function treasuryBlock(
  lines: TreasuryEntry[],
  pc: (id: string) => string | null,
  session: (id: string) => string | null,
): string {
  const balance = sumCoins(lines);
  const shown = lines.slice(0, 15);
  return `TREASURY (${lines.length} ledger line${lines.length === 1 ? '' : 's'}):
  Balance: ${formatCoins(balance) || 'no coin'}${formatCoins(balance) ? ` (worth ${gpWorth(balance).toLocaleString('en-US')} gp)` : ''}
${shown.map(l => {
    const who = l.pc_id ? pc(l.pc_id) : null;
    const when = l.session_id ? session(l.session_id) : null;
    return `  ${formatLine(l) || '0'}${l.note ? ` — ${l.note}` : ''}${who ? `; ${who}` : ''}${when ? `; ${when}` : ''} [id:${l.id}]`;
  }).join('\n')}${lines.length > shown.length ? `\n  (${lines.length - shown.length} older lines not shown)` : ''}`;
}
