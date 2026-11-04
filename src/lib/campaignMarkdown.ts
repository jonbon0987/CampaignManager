// A campaign as readable Markdown, one file per part (Party, Cast, Places…),
// for the backup zip. Mentions become plain names and pictures are linked by
// where they sit in the zip. Nothing here touches the network.

import { refsToNames } from './slashMarkdown';
import { clockOf } from './threadClock';
import { dateOf, formatSpan, monthsOf, yearSuffix } from './calendar';
import { formatSessionDate, localToday, planIds, sessionName, STATUS_LABEL } from './sessionLifecycle';
import { holderName, itemLine } from './items';
import { normalizeDie, parseEntries, weightedRanges } from './randomEncounter';
import type {
  Campaign, CharacterRelationship, Encounter, EncounterCombatant, EntitySessionEntry, Faction, Handout, Hook, Idea, Item,
  ItemHolding, Location, LoreEntry, Module, ModuleDependency, ModuleSheet, MonsterStatblock, NPC, PlayerCharacter,
  RandomEncounterTable, RecordingMoment, Scene, Session, SessionRecording, Submodule, TranscriptSegment,
} from './database.types';

export interface ExportTables {
  player_characters: PlayerCharacter[];
  npcs: NPC[];
  factions: Faction[];
  locations: Location[];
  lore_entries: LoreEntry[];
  hooks: Hook[];
  ideas: Idea[];
  modules: Module[];
  module_dependencies: ModuleDependency[];
  module_sheets: ModuleSheet[];
  submodules: Submodule[];
  scenes: Scene[];
  sessions: Session[];
  encounters: Encounter[];
  monster_statblocks: MonsterStatblock[];
  random_encounter_tables: RandomEncounterTable[];
  items: Item[];
  item_holdings: ItemHolding[];
  handouts: Handout[];
  character_relationships: CharacterRelationship[];
  entity_session_entries: EntitySessionEntry[];
  session_recordings: SessionRecording[];
  transcript_segments: TranscriptSegment[];
  recording_moments: RecordingMoment[];
}

export interface ExportWorld {
  id: string;
  name: string;
  era: string | null;
  calendar: string | null;
  year: number | null;
  calendar_months: unknown;
}

export interface CampaignExport {
  exportedAt: string;
  campaign: Campaign;
  world: ExportWorld | null;
  /** The campaign's own records, by table. */
  tables: ExportTables;
  /** World canon the campaign links to, kept apart from its own records. */
  canon: { npcs: NPC[]; locations: Location[]; lore_entries: LoreEntry[] };
}

/** campaign.json: every field of every record, as stored, for programs and a later restore. */
export function exportJson(data: CampaignExport): string {
  return JSON.stringify({ format: 'campaign-manager-export', version: 1, ...data }, null, 2);
}

// --------------- names and paths ---------------

export function slug(text: string | null | undefined, fallback = 'untitled'): string {
  const s = (text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return s || fallback;
}

const extOf = (path: string) => /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? 'img';

/** Every picture the campaign uses: its storage path → where it goes in the zip. */
export function picturePaths(data: CampaignExport): Map<string, string> {
  const t = data.tables;
  const out = new Map<string, string>();
  const used = new Set<string>();
  const add = (folder: string, name: string | null | undefined, path: string | null | undefined) => {
    if (!path || out.has(path)) return;
    const base = `pictures/${folder}/${slug(name, 'picture')}`;
    let file = `${base}.${extOf(path)}`;
    for (let n = 2; used.has(file); n++) file = `${base}-${n}.${extOf(path)}`;
    used.add(file);
    out.set(path, file);
  };
  for (const p of t.player_characters) add('party', p.character_name, p.portrait_path);
  for (const n of [...t.npcs, ...data.canon.npcs]) add('cast', n.name, n.portrait_path);
  for (const l of [...t.locations, ...data.canon.locations]) add('places', l.name, l.map_path);
  for (const i of t.items) add('items', i.name, i.image_path);
  for (const h of t.handouts) add('handouts', h.title, h.image_path);
  return out;
}

const transcriptFile = (s: Pick<Session, 'session_number'>) => `transcripts/session-${String(s.session_number).padStart(2, '0')}.md`;

// --------------- a small Markdown writer ---------------

const clean = (md: string | null | undefined) => refsToNames(md ?? '').trim();
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

class Md {
  private out: string[] = [];
  h(level: number, text: string) { this.out.push(`${'#'.repeat(level)} ${oneLine(text)}`, ''); return this; }
  /** A line of facts in italics: "Wizard 5 · AC 15". Blank parts are left out. */
  meta(parts: (string | number | null | undefined | false)[]) {
    const s = parts.filter(p => p !== null && p !== undefined && p !== false && String(p).trim() !== '').join(' · ');
    if (s) this.out.push(`*${oneLine(s)}*`, '');
    return this;
  }
  para(md: string | null | undefined) { const t = clean(md); if (t) this.out.push(t, ''); return this; }
  section(label: string, md: string | null | undefined) { const t = clean(md); if (t) this.out.push(`**${label}**`, '', t, ''); return this; }
  quote(label: string, md: string | null | undefined) {
    const t = clean(md);
    if (t) this.out.push(`**${label}**`, '', t.split('\n').map(l => (l.trim() ? `> ${l}` : '>')).join('\n'), '');
    return this;
  }
  list(label: string | null, items: string[]) {
    if (items.length === 0) return this;
    if (label) this.out.push(`**${label}**`, '');
    this.out.push(...items.map(i => `- ${oneLine(i)}`), '');
    return this;
  }
  image(alt: string, path: string | undefined) { if (path) this.out.push(`![${oneLine(alt).replace(/[[\]]/g, '')}](${path})`, ''); return this; }
  raw(lines: string[]) { this.out.push(...lines, ''); return this; }
  rule() { this.out.push('---', ''); return this; }
  toString() { return `${this.out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`; }
}

// --------------- the files ---------------

type Pics = Map<string, string>;

/** Name lookups shared by every file. */
function namesOf(data: CampaignExport) {
  const t = data.tables;
  const map = <T extends { id: string }>(rows: T[], name: (r: T) => string) => new Map(rows.map(r => [r.id, name(r)]));
  return {
    pc: map(t.player_characters, p => p.character_name || 'Unnamed character'),
    npc: map([...t.npcs, ...data.canon.npcs], n => n.name || 'Unnamed NPC'),
    faction: map(t.factions, f => f.name || 'Unnamed faction'),
    place: map([...t.locations, ...data.canon.locations], l => l.name || 'Unnamed place'),
    hook: map(t.hooks, h => h.title || 'Untitled thread'),
    scene: map(t.scenes, s => s.title || 'Untitled scene'),
    module: map(t.modules, m => m.title || 'Untitled module'),
    session: map(t.sessions, s => sessionName(s)),
    encounter: map(t.encounters, e => e.name || 'Untitled encounter'),
    statblock: map(t.monster_statblocks, s => s.name || 'Unnamed creature'),
  };
}
type Names = ReturnType<typeof namesOf>;
const pick = (m: Map<string, string>, ids: (string | null | undefined)[] | null | undefined) =>
  (ids ?? []).flatMap(id => (id && m.has(id) ? [m.get(id)!] : []));
const byName = <T>(name: (r: T) => string) => (a: T, b: T) => name(a).localeCompare(name(b), undefined, { sensitivity: 'base', numeric: true });

function history(md: Md, entries: EntitySessionEntry[], names: Names) {
  md.list('History', entries.map(e => `${e.session_id ? `${names.session.get(e.session_id) ?? 'A session'}: ` : ''}${clean(e.text)}`));
}

function readme(data: CampaignExport, counts: [string, string, number][], pictures: number, missingPictures: number): string {
  const c = data.campaign;
  const md = new Md().h(1, c.title?.trim() || c.name || 'Campaign');
  md.meta([data.world ? `In ${data.world.name}` : null, c.status, `Exported ${localToday(new Date(data.exportedAt))}`]);
  md.para(c.description).section('The story so far', c.plot_summary).section('The world', c.world_info).section('Major characters', c.major_characters);
  md.list('In this backup', [
    ...counts.filter(([, , n]) => n > 0).map(([file, label, n]) => `[${label}](${file}): ${n}`),
    '`campaign.json`: every field of every record, as stored, for programs and a later restore.',
    ...(pictures > 0 ? [`\`pictures/\`: portraits, maps, item pictures and handouts (${pictures} picture${pictures === 1 ? '' : 's'}).`] : []),
  ]);
  md.para('Audio recordings are not included; their transcripts are, in `transcripts/`.');
  if (missingPictures > 0) md.para(`${missingPictures} picture${missingPictures === 1 ? '' : 's'} couldn’t be fetched and ${missingPictures === 1 ? 'is' : 'are'} missing.`);
  return md.toString();
}

function party(data: CampaignExport, names: Names, pics: Pics): string {
  const t = data.tables;
  const md = new Md().h(1, 'Party');
  const holdingLine = (h: ItemHolding) => {
    const item = t.items.find(i => i.id === h.item_id);
    return item ? `${item.name}${h.quantity > 1 ? ` ×${h.quantity}` : ''}${h.attuned ? ' (attuned)' : ''}${h.note ? `: ${h.note}` : ''}` : null;
  };
  for (const p of [...t.player_characters].sort((a, b) => Number(b.is_active) - Number(a.is_active) || byName<PlayerCharacter>(x => x.character_name)(a, b))) {
    md.h(2, names.pc.get(p.id)!);
    md.meta([[p.race, p.class].filter(Boolean).join(' '), p.level ? `level ${p.level}` : null, p.player_name ? `played by ${p.player_name}` : null, p.is_active ? null : 'no longer playing']);
    md.meta([p.armor_class ? `AC ${p.armor_class}` : null, p.max_hp ? `HP ${p.max_hp}` : null, ...pick(names.faction, p.faction_ids)]);
    md.image(`Portrait of ${names.pc.get(p.id)}`, pics.get(p.portrait_path ?? ''));
    md.section('Background', p.background).section('Story hooks', p.story_hooks);
    md.list('Key NPCs', pick(names.npc, p.key_npc_ids));
    md.section('Key NPCs (written before links)', p.key_npcs);
    md.list('Carrying', t.item_holdings.filter(h => h.pc_id === p.id).flatMap(h => holdingLine(h) ?? []));
    history(md, t.entity_session_entries.filter(e => e.entity_type === 'pc' && e.entity_id === p.id), names);
    md.section('DM notes', p.dm_notes);
  }
  const stash = t.item_holdings.filter(h => !h.pc_id).flatMap(h => holdingLine(h) ?? []);
  if (stash.length) md.h(2, 'The party’s stash').list(null, stash);
  return md.toString();
}

function cast(data: CampaignExport, names: Names, pics: Pics): string {
  const t = data.tables;
  const canonIds = new Set(data.canon.npcs.map(n => n.id));
  const all = [...t.npcs, ...data.canon.npcs].sort(byName<NPC>(n => n.name));
  const md = new Md().h(1, 'Cast');
  md.meta([`${all.length} ${all.length === 1 ? 'person' : 'people'}`, canonIds.size ? `${canonIds.size} from the world’s canon` : null]);
  for (const n of all) {
    md.h(2, names.npc.get(n.id)!);
    md.meta([n.role, n.status, n.disposition, ...pick(names.faction, n.faction_ids), n.location_id ? `at ${names.place.get(n.location_id) ?? 'a place'}` : null,
      n.met_by_pcs ? 'met by the party' : null, canonIds.has(n.id) ? 'world canon' : null]);
    md.image(`Portrait of ${names.npc.get(n.id)}`, pics.get(n.portrait_path ?? ''));
    md.section('Description', n.description).section('Hooks and motivations', n.hooks_motivations);
    if (!n.location_id) md.section('Where', n.location);
    if (!n.faction_ids?.length) md.section('Affiliation', n.affiliation);
    if (n.statblock_id && names.statblock.has(n.statblock_id)) md.meta([`Stat sheet: ${names.statblock.get(n.statblock_id)}`]);
    history(md, t.entity_session_entries.filter(e => e.entity_type === 'npc' && e.entity_id === n.id), names);
    md.section('DM notes', n.dm_notes);
  }
  const who = (kind: string, id: string) => (kind === 'pc' ? names.pc : kind === 'faction' ? names.faction : names.npc).get(id) ?? 'someone since deleted';
  const ties = t.character_relationships.map(r => `${who(r.from_kind, r.from_id)} → ${who(r.to_kind, r.to_id)}: ${r.relationship_type}${r.label ? ` (${r.label})` : ''}`);
  if (ties.length) md.h(2, 'Relationships').list(null, ties);
  return md.toString();
}

function factions(data: CampaignExport, names: Names): string {
  const t = data.tables;
  const md = new Md().h(1, 'Factions');
  for (const f of [...t.factions].sort(byName<Faction>(x => x.name))) {
    md.h(2, names.faction.get(f.id)!).meta([f.faction_type]);
    md.section('Overview', f.overview).section('Agenda', f.agenda);
    md.list('Key figures', pick(names.npc, f.key_figure_ids));
    if (!f.key_figure_ids?.length) md.section('Key figures', f.key_figures);
    md.list('Members', [...t.npcs, ...data.canon.npcs].filter(n => n.faction_ids?.includes(f.id)).map(n => names.npc.get(n.id)!));
    history(md, t.entity_session_entries.filter(e => e.entity_type === 'faction' && e.entity_id === f.id), names);
    md.section('DM notes', f.dm_notes);
  }
  return md.toString();
}

function places(data: CampaignExport, names: Names, pics: Pics): string {
  const t = data.tables;
  const canonIds = new Set(data.canon.locations.map(l => l.id));
  const all = [...t.locations, ...data.canon.locations];
  const md = new Md().h(1, 'Places');
  for (const l of all.sort(byName<Location>(x => x.name))) {
    md.h(2, names.place.get(l.id)!);
    md.meta([l.location_type, l.region, l.population ? `population ${l.population}` : null, l.status,
      l.parent_id ? `within ${names.place.get(l.parent_id) ?? 'a place'}` : null, canonIds.has(l.id) ? 'world canon' : null]);
    md.image(`Map of ${names.place.get(l.id)}`, pics.get(l.map_path ?? ''));
    md.section('Description', l.description).quote('Read aloud', l.read_aloud).section('History', l.history);
    md.list('Places within', all.filter(c => c.parent_id === l.id).map(c => names.place.get(c.id)!));
    md.list('People here', [...t.npcs, ...data.canon.npcs].filter(n => n.location_id === l.id).map(n => names.npc.get(n.id)!));
    history(md, t.entity_session_entries.filter(e => e.entity_type === 'location' && e.entity_id === l.id), names);
    md.section('DM notes', l.dm_notes);
  }
  return md.toString();
}

function lore(data: CampaignExport): string {
  const canonIds = new Set(data.canon.lore_entries.map(e => e.id));
  const all = [...data.tables.lore_entries, ...data.canon.lore_entries];
  const md = new Md().h(1, 'Lore');
  const categories = [...new Set(all.map(e => e.category?.trim() || 'Uncategorized'))].sort((a, b) => a.localeCompare(b));
  for (const cat of categories) {
    md.h(2, cat);
    for (const e of all.filter(x => (x.category?.trim() || 'Uncategorized') === cat).sort(byName<LoreEntry>(x => x.title))) {
      md.h(3, e.title || 'Untitled entry').meta([e.dm_only ? 'secret: DM only' : null, canonIds.has(e.id) ? 'world canon' : null]).para(e.content);
    }
  }
  return md.toString();
}

const THREAD_STATES: [string, string][] = [['active', 'Active'], ['seed', 'Seeds'], ['cold', 'Gone cold'], ['resolved', 'Resolved']];
const threadState = (h: Hook) => h.state ?? (h.is_active ? 'active' : 'resolved');

function threads(data: CampaignExport, names: Names): string {
  const t = data.tables;
  const md = new Md().h(1, 'Threads');
  if (t.ideas.length) md.h(2, 'Inbox').list(null, t.ideas.map(i => `${clean(i.text)}${i.tag ? ` (${i.tag})` : ''}`));
  for (const [state, label] of THREAD_STATES) {
    const rows = t.hooks.filter(h => threadState(h) === state);
    if (rows.length === 0) continue;
    md.h(2, label);
    for (const h of rows.sort(byName<Hook>(x => x.title))) {
      const clock = clockOf(h);
      md.h(3, names.hook.get(h.id)!).meta([h.category?.replace(/_/g, ' '), clock && `clock ${clock.filled} of ${clock.size}${clock.label ? `: ${clock.label}` : ''}`]).para(h.description);
      md.list('Linked', [
        ...pick(names.npc, h.npc_ids), ...pick(names.place, h.location_ids), ...pick(names.faction, h.faction_ids), ...pick(names.module, [h.module_id]),
      ]);
      history(md, t.entity_session_entries.filter(e => e.entity_type === 'hook' && e.entity_id === h.id), names);
      md.section('DM notes', h.dm_only_notes);
    }
  }
  return md.toString();
}

function modules(data: CampaignExport, names: Names, pics: Pics): string {
  const t = data.tables;
  const md = new Md().h(1, 'Modules');
  const order = (a: Module, b: Module) => (a.chapter ?? '').localeCompare(b.chapter ?? '', undefined, { numeric: true }) || byName<Module>(m => m.title)(a, b);
  for (const m of [...t.modules].sort(order)) {
    md.h(2, `${m.chapter ? `${m.chapter} · ` : ''}${names.module.get(m.id)}`);
    md.meta([m.status, m.node_role === 'start' ? 'opening mission' : m.node_role === 'boss' ? 'finale' : null,
      m.played_session ? `played in session ${m.played_session}` : null, m.faction_id ? names.faction.get(m.faction_id) : null]);
    md.list('Needs first', t.module_dependencies.filter(d => d.dependent_id === m.id).flatMap(d => pick(names.module, [d.prerequisite_id])));
    md.section('Synopsis', m.synopsis).section('Encounters', m.encounters).section('Rewards', m.rewards).section('DM notes', m.dm_notes);
    for (const sh of t.module_sheets.filter(s => s.module_id === m.id).sort((a, b) => a.sort_order - b.sort_order)) {
      md.section(`Sheet: ${sh.title || 'Untitled'}`, sh.content).section('Sheet DM notes', sh.dm_notes);
    }
    for (const sub of t.submodules.filter(s => s.module_id === m.id).sort((a, b) => a.sort_order - b.sort_order)) {
      md.h(3, sub.title || 'Untitled part').meta([sub.submodule_type]);
      md.section('Summary', sub.summary).para(sub.content).section('DM notes', sub.dm_notes);
      for (const sc of t.scenes.filter(s => s.submodule_id === sub.id).sort((a, b) => a.sort_order - b.sort_order)) {
        md.h(4, names.scene.get(sc.id)!).meta([sc.scene_type]);
        md.section('Summary', sc.summary).quote('Read aloud', sc.read_aloud).para(sc.content).section('DM notes', sc.dm_notes);
        for (const h of t.handouts.filter(x => x.scene_id === sc.id).sort((a, b) => a.sort_order - b.sort_order)) {
          md.image(`Handout: ${h.title || 'untitled'}`, pics.get(h.image_path ?? ''));
        }
      }
    }
  }
  return md.toString();
}

function sessions(data: CampaignExport, names: Names, transcripts: Set<string>): string {
  const t = data.tables;
  const months = monthsOf(data.world?.calendar_months);
  const suffix = yearSuffix(data.world?.calendar);
  const md = new Md().h(1, 'Sessions');
  for (const s of [...t.sessions].sort((a, b) => a.session_number - b.session_number)) {
    const start = dateOf(s.world_start);
    md.h(2, names.session.get(s.id)!);
    md.meta([STATUS_LABEL[s.status] ?? s.status, s.session_date ? formatSessionDate(s.session_date) : null,
      start ? `in the world ${formatSpan(start, dateOf(s.world_end), months, suffix)}` : null]);
    md.section('Recap', s.summary).section('Combat', s.combats).section('Loot and rewards', s.loot_rewards);
    md.list('Handed out', t.item_holdings.filter(h => h.session_id === s.id).flatMap(h => {
      const item = t.items.find(i => i.id === h.item_id);
      return item ? [`${item.name}${h.quantity > 1 ? ` ×${h.quantity}` : ''} to ${holderName(h, t.player_characters)}`] : [];
    }));
    md.section('Left open', s.hooks_notes);
    md.list('Agenda', pick(names.scene, planIds(s.plan, 'agenda')));
    md.list('Threads to dangle', pick(names.hook, planIds(s.plan, 'threads')));
    md.list('Encounters', pick(names.encounter, planIds(s.plan, 'encounters')));
    md.list('Likely NPCs', pick(names.npc, planIds(s.plan, 'npcs')));
    md.section('Prep notes', s.prep_notes).section('DM notes', s.dm_notes);
    if (transcripts.has(s.id)) md.para(`[Transcript](${transcriptFile(s)})`);
  }
  return md.toString();
}

const clock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(sec).padStart(2, '0')}`;
};

/** One transcript file per session that was recorded, keyed by session id. */
function transcriptFiles(data: CampaignExport, names: Names): Map<string, { path: string; text: string }> {
  const t = data.tables;
  const out = new Map<string, { path: string; text: string }>();
  for (const s of t.sessions) {
    const recordings = t.session_recordings.filter(r => r.session_id === s.id).sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? ''));
    const lines = recordings.map(r => ({ r, segs: t.transcript_segments.filter(g => g.recording_id === r.id && !g.dropped_as_echo).sort((a, b) => a.start_ms - b.start_ms) }));
    if (!lines.some(l => l.segs.length)) continue;
    const md = new Md().h(1, `${names.session.get(s.id)}: transcript`);
    for (const { r, segs } of lines) {
      if (segs.length === 0) continue;
      md.h(2, `Recording${r.started_at ? ` of ${r.started_at.slice(0, 10)}` : ''}`);
      md.list('Moments', t.recording_moments.filter(m => m.recording_id === r.id).sort((a, b) => a.at_ms - b.at_ms).map(m => `${clock(m.at_ms)} ${m.label ?? ''}`));
      md.raw(segs.map(g => {
        const who = g.pc_id ? names.pc.get(g.pc_id) : g.is_dm ? 'DM' : null;
        return `**${clock(g.start_ms)} · ${who ?? g.speaker_label ?? 'Someone'}:** ${oneLine(g.text)}  `;
      }));
    }
    out.set(s.id, { path: transcriptFile(s), text: md.toString() });
  }
  return out;
}

function parseCombatants(raw: unknown): EncounterCombatant[] {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.filter(c => c && typeof c === 'object') : [];
  } catch { return []; }
}

function encounters(data: CampaignExport, names: Names): string {
  const t = data.tables;
  const md = new Md().h(1, 'Encounters');
  for (const e of [...t.encounters].sort((a, b) => a.sort_order - b.sort_order || byName<Encounter>(x => x.name)(a, b))) {
    md.h(2, names.encounter.get(e.id)!);
    md.meta([e.difficulty, e.status, e.environment, e.party_size ? `${e.party_size} players` : null, e.party_level ? `level ${e.party_level}` : null]);
    md.list('Creatures', parseCombatants(e.combatants).map(c => {
      const name = (c.statblock_id && names.statblock.get(c.statblock_id)) || c.name || 'Unnamed creature';
      return `${c.count > 1 ? `${c.count} × ` : ''}${name}${c.challenge_rating ? ` (CR ${c.challenge_rating})` : ''}${c.notes ? `: ${c.notes}` : ''}`;
    }));
    md.para(e.description).section('DM notes', e.dm_notes);
  }
  if (t.random_encounter_tables.length) md.h(1, 'Random tables');
  for (const r of [...t.random_encounter_tables].sort((a, b) => a.sort_order - b.sort_order || byName<RandomEncounterTable>(x => x.name)(a, b))) {
    const die = normalizeDie(r.die_size);
    const entries = parseEntries(r.entries);
    const ranges = weightedRanges(entries, die);
    md.h(2, r.name || 'Untitled table').meta([r.subtitle, r.kind, `d${die}`, r.environment]).para(r.description);
    if (entries.length) {
      // Backslashes first, so text holding "\|" can't end up as an escaped backslash before a bare pipe.
      const cell = (s: string | null | undefined) => oneLine(clean(s)).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
      md.raw(['| Roll | Result | Details |', '| --- | --- | --- |', ...entries.map((en, i) => {
        const { lo, hi } = ranges[i];
        return `| ${lo === hi ? lo : `${lo}–${hi}`} | ${cell(en.name)} | ${cell(en.description)} |`;
      })]);
    }
    md.section('DM notes', r.dm_notes);
  }
  return md.toString();
}

const mod = (score: number | null) => (score == null ? '' : `${score} (${score >= 10 ? '+' : ''}${Math.floor((score - 10) / 2)})`);

function bestiary(data: CampaignExport): string {
  const md = new Md().h(1, 'Bestiary');
  for (const s of [...data.tables.monster_statblocks].sort(byName<MonsterStatblock>(x => x.name))) {
    md.h(2, s.name || 'Unnamed creature').meta([s.creature_type, s.challenge_rating ? `CR ${s.challenge_rating}` : null]);
    md.meta([s.armor_class ? `AC ${s.armor_class}${s.ac_descriptor ? ` (${s.ac_descriptor})` : ''}` : null,
      s.hit_points ? `HP ${s.hit_points}${s.hit_dice ? ` (${s.hit_dice})` : ''}` : null, s.speed ? `speed ${s.speed}` : null]);
    const scores = [s.str, s.dex, s.con, s.int, s.wis, s.cha];
    if (scores.some(v => v != null)) md.raw(['| STR | DEX | CON | INT | WIS | CHA |', '| --- | --- | --- | --- | --- | --- |', `| ${scores.map(mod).join(' | ')} |`]);
    md.list(null, ([
      ['Saving throws', s.saving_throws], ['Skills', s.skills], ['Damage immunities', s.damage_immunities],
      ['Damage resistances', s.damage_resistances], ['Condition immunities', s.condition_immunities],
      ['Senses', s.senses], ['Languages', s.languages], ['Tags', s.tags],
    ] as [string, string | null][]).filter(([, v]) => v?.trim()).map(([k, v]) => `${k}: ${v}`));
    md.para(s.content).section('DM notes', s.dm_notes);
  }
  return md.toString();
}

function items(data: CampaignExport, pics: Pics): string {
  const t = data.tables;
  const md = new Md().h(1, 'Items');
  for (const i of [...t.items].sort(byName<Item>(x => x.name))) {
    md.h(2, i.name || 'Unnamed item').meta([itemLine(i), i.value]);
    md.image(`Picture of ${i.name}`, pics.get(i.image_path ?? ''));
    md.para(i.description);
    md.list('Held by', t.item_holdings.filter(h => h.item_id === i.id).map(h =>
      `${holderName(h, t.player_characters)}${h.quantity > 1 ? ` ×${h.quantity}` : ''}${h.attuned ? ' (attuned)' : ''}`));
    md.section('DM notes', i.dm_notes);
  }
  return md.toString();
}

/**
 * Every Markdown file of the backup, by its path in the zip. `pics` holds the
 * pictures that made it into the zip; any others are left out of the pages.
 */
export function markdownFiles(data: CampaignExport, pics: Pics, missingPictures = 0): Record<string, string> {
  const t = data.tables;
  const names = namesOf(data);
  const transcripts = transcriptFiles(data, names);
  const parts: [string, string, number, () => string][] = [
    ['Party.md', 'Party', t.player_characters.length, () => party(data, names, pics)],
    ['Cast.md', 'Cast', t.npcs.length + data.canon.npcs.length, () => cast(data, names, pics)],
    ['Factions.md', 'Factions', t.factions.length, () => factions(data, names)],
    ['Places.md', 'Places', t.locations.length + data.canon.locations.length, () => places(data, names, pics)],
    ['Lore.md', 'Lore', t.lore_entries.length + data.canon.lore_entries.length, () => lore(data)],
    ['Threads.md', 'Threads and Inbox ideas', t.hooks.length + t.ideas.length, () => threads(data, names)],
    ['Modules.md', 'Modules', t.modules.length, () => modules(data, names, pics)],
    ['Sessions.md', 'Sessions', t.sessions.length, () => sessions(data, names, new Set(transcripts.keys()))],
    ['Encounters.md', 'Encounters and random tables', t.encounters.length + t.random_encounter_tables.length, () => encounters(data, names)],
    ['Bestiary.md', 'Stat sheets', t.monster_statblocks.length, () => bestiary(data)],
    ['Items.md', 'Items', t.items.length, () => items(data, pics)],
  ];
  const files: Record<string, string> = {
    'README.md': readme(data, parts.map(([file, label, n]) => [file, label, n]), pics.size, missingPictures),
  };
  for (const [file, , n, build] of parts) if (n > 0) files[file] = build();
  for (const { path, text } of transcripts.values()) files[path] = text;
  return files;
}
