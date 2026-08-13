import { useState, useMemo, useEffect } from 'react';
import { useWorld } from '../../context/WorldContext';
import { useConfirm } from '../../context/ConfirmContext';
import { ListDetail, ListRow, DetailPanel, DetailSection, Pill, EmptyDetail } from '../ui/ListDetail';
import { Badge } from '../ui/Badge';
import { Modal } from '../Modal';
import { EncounterDetail } from '../ui/EncounterDetail';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import { getAIProvider } from '../../lib/aiProvider';
import { authHeaders } from '../../lib/apiClient';
import { StatBlockBody, emptyMonsterForm, CREATURE_TYPES, ABILITY_KEYS, abilityMod } from '../tabs/CreatureStatblocks';
import type { MonsterForm } from '../tabs/CreatureStatblocks';
import { SlashField } from '../ui/SlashField';
import { useAutoSave } from '../../hooks/useAutoSave';
import { OverflowMenu } from '../ui/OverflowMenu';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import type { MonsterStatblock, MonsterStatblockInsert } from '../../lib/database.types';
import type { WorldLocation } from '../../types/world';
import type { ReactNode } from 'react';

const VALID_CRS_SET = new Set([
  '0', '1/8', '1/4', '1/2',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
]);

function Tag({ children, kind }: { children: ReactNode; kind?: string }) {
  const colorMap: Record<string, 'green' | 'red' | 'orange' | 'muted' | 'gold'> = {
    active: 'green', deceased: 'red', deadly: 'red', hard: 'orange',
    medium: 'gold', mythic: 'muted', unknown: 'muted',
  };
  return <Badge color={colorMap[kind || ''] || 'muted'}>{children}</Badge>;
}

function SubtleTag({ children }: { children: ReactNode }) {
  return <Badge color="muted">{children}</Badge>;
}

function WorldBadge() {
  return <span className="w-inherited">⊕ World-scoped</span>;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="cm-stat">
      <div className="cm-stat-label">{label}</div>
      <div className="cm-stat-value">{value}</div>
    </div>
  );
}

// ═══════════════════════════════════════════
// WORLD NPCs VIEW
// ═══════════════════════════════════════════

export function WorldNPCsView() {
  const { npcs, factions, facById, locById, selected, setSelected, createNPC } = useWorld();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'npc' | 'faction'>('all');

  type ListItem = { id: string; name: string; kind: 'npc' | 'faction'; role?: string; type?: string; status?: string; era?: string; desc?: string; factions?: string[]; location?: string | null; tags?: string[]; tone?: string; };

  const items = useMemo(() => {
    const all: ListItem[] = [
      ...npcs.map(x => ({ ...x, kind: 'npc' as const })),
      ...factions.map(x => ({ ...x, kind: 'faction' as const })),
    ];
    return all.filter(x => {
      if (filter !== 'all' && x.kind !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = [x.name, x.role, x.desc, x.type].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [npcs, factions, filter, search]);

  const sel = items.find(x => x.id === selected.npcs) || items[0];

  return (
    <ListDetail
      title="World NPCs"
      count={items.length}
      search={search}
      onSearchChange={setSearch}
      onAdd={async () => { const id = await createNPC(); if (id) setSelected('npcs', id); }}
      filters={
        <>
          <Pill active={filter === 'all'} onClick={() => setFilter('all')}>All</Pill>
          <Pill active={filter === 'npc'} onClick={() => setFilter('npc')}>Characters</Pill>
          <Pill active={filter === 'faction'} onClick={() => setFilter('faction')}>Factions</Pill>
        </>
      }
      list={
        <div>
          {items.map(x => (
            <ListRow
              key={x.kind + x.id}
              active={sel?.id === x.id}
              onClick={() => setSelected('npcs', x.id)}
              glyph={x.kind === 'faction' ? '❖' : '◇'}
              title={x.name}
              subtitle={x.kind === 'npc' ? x.role : formatType(x.type)}
              badges={
                <>
                  {x.kind === 'npc' && x.status && <Tag kind={x.status}>{x.status}</Tag>}
                  {x.kind === 'npc' && x.era && <SubtleTag>{x.era}</SubtleTag>}
                  {x.kind === 'faction' && <SubtleTag>{formatType(x.type)}</SubtleTag>}
                </>
              }
            />
          ))}
        </div>
      }
      detail={sel ? <WorldNPCDetail entity={sel} /> : <EmptyDetail>Select an entry.</EmptyDetail>}
    />
  );
}

const NPC_STATUSES = ['active', 'deceased', 'unknown'] as const;

interface NPCForm {
  name: string;
  role: string;
  status: string;
  description: string;
  dm_notes: string;
}

function WorldNPCDetail({ entity }: { entity: any }) {
  const { npcs, facById, locById, upsertWorldNPC, deleteWorldNPC } = useWorld();
  const confirm = useConfirm();

  if (entity.kind === 'faction') {
    const members = npcs.filter(n => n.factions?.includes(entity.id));
    return (
      <DetailPanel eyebrow={`World Faction · ${formatType(entity.type)}`} title={entity.name} subtitle={entity.desc}>
        <WorldBadge />
        <div className="cm-stat-strip">
          <Stat label="Type" value={formatType(entity.type)} />
          <Stat label="Members" value={members.length} />
        </div>
        <DetailSection title="Known Members">
          {members.length === 0 ? (
            <p className="cm-prose" style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>No known members.</p>
          ) : (
            <div className="cm-chip-list">
              {members.map(n => (
                <span key={n.id} className="cm-chip">
                  <span className="cm-chip-glyph">◇</span>{n.name}
                </span>
              ))}
            </div>
          )}
        </DetailSection>
      </DetailPanel>
    );
  }

  return <WorldNPCEditDetail key={entity.id} entity={entity} />;
}

function WorldNPCEditDetail({ entity }: { entity: any }) {
  const { upsertWorldNPC, deleteWorldNPC, locations } = useWorld();
  const confirm = useConfirm();

  const [form, setForm] = useState<NPCForm>(() => ({
    name: entity.name ?? '',
    role: entity.role ?? '',
    status: entity.status ?? 'active',
    description: entity.desc ?? '',
    dm_notes: '',
  }));

  useEffect(() => {
    setForm({
      name: entity.name ?? '',
      role: entity.role ?? '',
      status: entity.status ?? 'active',
      description: entity.desc ?? '',
      dm_notes: '',
    });
  }, [entity.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { status, saveNow } = useAutoSave<NPCForm>({
    data: form,
    onSave: async (data) => {
      await upsertWorldNPC({
        id: entity.id,
        name: data.name || 'Unnamed NPC',
        role: data.role || null,
        status: (data.status as 'active' | 'deceased' | 'unknown') || null,
        description: data.description || null,
        dm_notes: data.dm_notes || null,
      });
    },
    delay: 800,
    enabled: true,
  });

  const set = <K extends keyof NPCForm>(key: K, value: NPCForm[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  return (
    <DetailPanel eyebrow="Character" title="">
      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        <OverflowMenu items={[
          { label: 'Delete NPC', danger: true, onClick: async () => {
            if (await confirm('Delete this NPC?', 'This cannot be undone.')) {
              await deleteWorldNPC(entity.id);
            }
          }},
        ]} />
      </div>
      <input className="as-title" value={form.name} onChange={e => set('name', e.target.value)} placeholder="NPC name…" />
      <input className="as-sub" value={form.role} onChange={e => set('role', e.target.value)} placeholder="Role…" />
      <div className="as-meta">
        <div className="as-mi">
          <span className="as-ml">Status</span>
          <select className="as-select" value={form.status} onChange={e => set('status', e.target.value)}>
            {NPC_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <DetailSection title="Description">
        <SlashField value={form.description} onChange={v => set('description', v)} placeholder="Describe this character…" />
      </DetailSection>
      <DetailSection title="DM Notes">
        <SlashField value={form.dm_notes} onChange={v => set('dm_notes', v)} placeholder="Private DM notes…" />
      </DetailSection>
    </DetailPanel>
  );
}

// ═══════════════════════════════════════════
// WORLD LOCATIONS VIEW
// ═══════════════════════════════════════════

const LOC_GLYPH: Record<string, string> = {
  continent: '⛰', city: '⌖', town: '⌂', dungeon: '⌗', faction_hq: '◈', landmark: '✦', other: '✦',
};
const glyphForType = (t: string | null) => LOC_GLYPH[t ?? 'other'] ?? '✦';

export function WorldLocationsView() {
  const { locations, selected, setSelected, createLocation } = useWorld();
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const byId = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations]);

  // Group children by parent; a parent outside this world's set counts as a root.
  const childrenOf = useMemo(() => {
    const m = new Map<string | null, WorldLocation[]>();
    for (const l of locations) {
      const pid = l.parent && byId.has(l.parent) ? l.parent : null;
      const arr = m.get(pid) ?? [];
      arr.push(l);
      m.set(pid, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return m;
  }, [locations, byId]);

  // Search → ids to show (matches plus their ancestors, keeping the tree connected).
  const visible = useMemo(() => {
    if (!search) return null;
    const q = search.toLowerCase();
    const match = (l: WorldLocation) => `${l.name} ${l.desc} ${l.type}`.toLowerCase().includes(q);
    const show = new Set<string>();
    for (const l of locations) {
      if (!match(l)) continue;
      let cur: WorldLocation | undefined = l;
      while (cur && !show.has(cur.id)) {
        show.add(cur.id);
        cur = cur.parent ? byId.get(cur.parent) : undefined;
      }
    }
    return show;
  }, [search, locations, byId]);

  const roots = childrenOf.get(null) ?? [];
  const sel = (selected.locations && byId.get(selected.locations)) || roots[0] || null;

  const toggle = (id: string) =>
    setCollapsed(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const renderNode = (l: WorldLocation, depth: number): React.ReactNode => {
    if (visible && !visible.has(l.id)) return null;
    const kids = (childrenOf.get(l.id) ?? []).filter(k => !visible || visible.has(k.id));
    const isOpen = !collapsed.has(l.id);
    return (
      <div key={l.id}>
        <div
          className={`cm-tree-node ${sel?.id === l.id ? 'is-active' : ''}`}
          style={{ paddingLeft: 8 + depth * 18 }}
          onClick={() => setSelected('locations', l.id)}
        >
          {kids.length ? (
            <button type="button" className="cm-tree-caret is-btn" onClick={e => { e.stopPropagation(); toggle(l.id); }}>
              {isOpen ? '▾' : '▸'}
            </button>
          ) : (
            <span className="cm-tree-caret" />
          )}
          <span className="cm-tree-glyph" style={{ color: 'var(--gold)' }}>{glyphForType(l.type)}</span>
          <span className="cm-tree-name">{l.name || 'Unnamed Location'}</span>
          <span className="cm-tree-type">{formatType(l.type)}</span>
        </div>
        {isOpen && kids.map(k => renderNode(k, depth + 1))}
      </div>
    );
  };

  return (
    <ListDetail
      title="World Locations"
      count={visible ? visible.size : locations.length}
      search={search}
      onSearchChange={setSearch}
      onAdd={async () => { const id = await createLocation(); if (id) setSelected('locations', id); }}
      list={
        locations.length === 0 ? (
          <div className="cm-empty is-inline">No locations yet — add one to start the map</div>
        ) : (
          <>
            <div className="cm-tree">{roots.map(r => renderNode(r, 0))}</div>
            <div className="cm-tree-legend"><span className="cm-tree-legend-dot is-gold" /> shared world canon</div>
          </>
        )
      }
      detail={sel ? <WorldLocationDetail loc={sel} allLocations={locations} /> : <EmptyDetail>Select a location.</EmptyDetail>}
    />
  );
}

const LOCATION_TYPES = ['continent', 'city', 'town', 'dungeon', 'faction_hq', 'landmark', 'other'] as const;
const LORE_CATEGORIES = ['history', 'artifact', 'creature', 'magic', 'religion'] as const;

function formatType(t: string | null) {
  if (!t) return '';
  return t.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bHq\b/, 'HQ');
}

interface LocForm {
  name: string;
  region: string;
  location_type: string;
  parent_id: string;
  population: string;
  status: string;
  description: string;
  history: string;
  dm_notes: string;
}

// Ids that can't be a parent of `loc`: itself and its descendants (would form a cycle).
function forbiddenParents(loc: WorldLocation, all: WorldLocation[]): Set<string> {
  const bad = new Set<string>([loc.id]);
  let added = true;
  while (added) {
    added = false;
    for (const l of all) {
      if (l.parent && bad.has(l.parent) && !bad.has(l.id)) { bad.add(l.id); added = true; }
    }
  }
  return bad;
}

function WorldLocationDetail({ loc, allLocations }: { loc: WorldLocation; allLocations: WorldLocation[] }) {
  const { upsertWorldLocation, deleteWorldLocation } = useWorld();
  const confirm = useConfirm();

  const toForm = (l: WorldLocation): LocForm => ({
    name: l.name ?? '',
    region: '',
    location_type: l.type ?? 'landmark',
    parent_id: l.parent ?? '',
    population: '',
    status: 'active',
    description: l.desc ?? '',
    history: '',
    dm_notes: '',
  });

  const [form, setForm] = useState<LocForm>(() => toForm(loc));

  useEffect(() => { setForm(toForm(loc)); }, [loc.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { status, saveNow } = useAutoSave<LocForm>({
    data: form,
    onSave: async (data) => {
      await upsertWorldLocation({
        id: loc.id,
        name: data.name || 'Unnamed Location',
        region: data.region || null,
        location_type: data.location_type || null,
        parent_id: data.parent_id || null,
        population: data.population || null,
        status: data.status || null,
        description: data.description || null,
        history: data.history || null,
        dm_notes: data.dm_notes || null,
      });
    },
    delay: 800,
    enabled: true,
  });

  const set = <K extends keyof LocForm>(key: K, value: LocForm[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const forbidden = useMemo(() => forbiddenParents(loc, allLocations), [loc, allLocations]);
  const parentOptions = allLocations
    .filter(l => !forbidden.has(l.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <DetailPanel eyebrow="Location" title="">
      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        <OverflowMenu items={[
          { label: 'Delete Location', danger: true, onClick: async () => {
            if (await confirm('Delete this location?', 'This cannot be undone.')) {
              await deleteWorldLocation(loc.id);
            }
          }},
        ]} />
      </div>
      <input className="as-title" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Location name…" />
      <input className="as-sub" value={form.region} onChange={e => set('region', e.target.value)} placeholder="Region…" />
      <div className="as-meta">
        <div className="as-mi">
          <span className="as-ml">Type</span>
          <select className="as-select" value={form.location_type} onChange={e => set('location_type', e.target.value)}>
            {LOCATION_TYPES.map(t => <option key={t} value={t}>{formatType(t)}</option>)}
          </select>
        </div>
        <div className="as-mi">
          <span className="as-ml">Within</span>
          <select className="as-select" value={form.parent_id} onChange={e => set('parent_id', e.target.value)}>
            <option value="">— Top level —</option>
            {parentOptions.map(l => <option key={l.id} value={l.id}>{l.name || 'Unnamed'}</option>)}
          </select>
        </div>
        <div className="as-mi">
          <span className="as-ml">Status</span>
          <select className="as-select" value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="active">Active</option>
            <option value="destroyed">Destroyed</option>
            <option value="unknown">Unknown</option>
            <option value="compromised">Compromised</option>
          </select>
        </div>
        <div className="as-mi">
          <span className="as-ml">Population</span>
          <input className="as-input" value={form.population} onChange={e => set('population', e.target.value)} placeholder="e.g. ~12,000" />
        </div>
      </div>
      <DetailSection title="Description">
        <SlashField value={form.description} onChange={v => set('description', v)} placeholder="Describe this place…" />
      </DetailSection>
      <DetailSection title="History">
        <SlashField value={form.history} onChange={v => set('history', v)} placeholder="Historical events…" />
      </DetailSection>
      <DetailSection title="DM Notes">
        <SlashField value={form.dm_notes} onChange={v => set('dm_notes', v)} placeholder="Private DM notes…" />
      </DetailSection>
    </DetailPanel>
  );
}

// ═══════════════════════════════════════════
// WORLD LORE VIEW
// ═══════════════════════════════════════════

export function WorldLoreView() {
  const { lore, selected, setSelected, createLoreEntry } = useWorld();
  const [search, setSearch] = useState('');

  const items = useMemo(() => {
    return lore.filter(x => {
      if (search && !`${x.title} ${x.desc}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [lore, search]);

  const sel = items.find(x => x.id === selected.lore) || items[0];

  return (
    <ListDetail
      title="World Lore"
      count={items.length}
      search={search}
      onSearchChange={setSearch}
      onAdd={async () => { const id = await createLoreEntry(); if (id) setSelected('lore', id); }}
      list={
        <div>
          {items.map(x => (
            <ListRow
              key={x.id}
              active={sel?.id === x.id}
              onClick={() => setSelected('lore', x.id)}
              glyph="❦"
              title={x.title}
              subtitle="Lore"
              badges={x.tags.slice(0, 2).map(t => <SubtleTag key={t}>{formatType(t)}</SubtleTag>)}
            />
          ))}
        </div>
      }
      detail={sel ? <WorldLoreDetail key={sel.id} entry={sel} /> : <EmptyDetail>Select a lore entry.</EmptyDetail>}
    />
  );
}

interface LoreForm {
  title: string;
  category: string;
  dm_only: boolean;
  content: string;
}

function WorldLoreDetail({ entry }: { entry: any }) {
  const { upsertWorldLore, deleteWorldLore } = useWorld();
  const confirm = useConfirm();

  const [form, setForm] = useState<LoreForm>(() => ({
    title: entry.title ?? '',
    category: entry.tags?.[0] ?? 'history',
    dm_only: false,
    content: entry.desc ?? '',
  }));

  useEffect(() => {
    setForm({
      title: entry.title ?? '',
      category: entry.tags?.[0] ?? 'history',
      dm_only: false,
      content: entry.desc ?? '',
    });
  }, [entry.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { status, saveNow } = useAutoSave<LoreForm>({
    data: form,
    onSave: async (data) => {
      await upsertWorldLore({
        id: entry.id,
        title: data.title || 'Untitled Entry',
        category: data.category || null,
        dm_only: data.dm_only,
        content: data.content || null,
      });
    },
    delay: 800,
    enabled: true,
  });

  const set = <K extends keyof LoreForm>(key: K, value: LoreForm[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  return (
    <DetailPanel eyebrow="Lore" title="">
      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        <OverflowMenu items={[
          { label: 'Delete entry', danger: true, onClick: async () => {
            if (await confirm('Delete this lore entry?', 'This cannot be undone.')) {
              await deleteWorldLore(entry.id);
            }
          }},
        ]} />
      </div>
      <input className="as-title" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Entry title…" />
      <div className="as-meta">
        <div className="as-mi">
          <span className="as-ml">Category</span>
          <select className="as-select" value={form.category} onChange={e => set('category', e.target.value)}>
            {LORE_CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </div>
        <div className="as-mi">
          <span className="as-ml">DM Only</span>
          <div className="as-pills">
            <button type="button" className={`as-pill-opt${form.dm_only ? ' is-active' : ''}`} onClick={() => set('dm_only', !form.dm_only)}>
              {form.dm_only ? 'Hidden from players' : 'Visible to players'}
            </button>
          </div>
        </div>
      </div>
      <DetailSection title="Content">
        <SlashField value={form.content} onChange={v => set('content', v)} placeholder="Lore content…" />
      </DetailSection>
    </DetailPanel>
  );
}

// ═══════════════════════════════════════════
// WORLD COMBAT VIEW (Bestiary + Encounters)
// ═══════════════════════════════════════════

export function WorldCombatView() {
  const {
    bestiary, encounters,
    worldStatblocks, worldEncounters,
    selected, setSelected,
    createBestiaryEntry, createEncounter,
    upsertWorldStatblock,
    deleteBestiaryEntry, deleteEncounter,
    upsertWorldEncounter,
  } = useWorld();
  const confirm = useConfirm();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'bestiary' | 'encounter'>('all');
  const [viewingStatblock, setViewingStatblock] = useState<MonsterStatblock | null>(null);

  // ---- Generate modal state ----
  const [genOpen, setGenOpen] = useState(false);
  const [genMode, setGenMode] = useState<'cr' | 'party'>('cr');
  const [genCR, setGenCR] = useState('');
  const [genPartySize, setGenPartySize] = useState('');
  const [genPartyLevel, setGenPartyLevel] = useState('');
  const [genAdditionalContext, setGenAdditionalContext] = useState('');
  const [genError, setGenError] = useState('');
  const [genLoading, setGenLoading] = useState(false);

  const openGenModal = () => {
    setGenMode('cr'); setGenCR(''); setGenPartySize(''); setGenPartyLevel('');
    setGenAdditionalContext(''); setGenError(''); setGenOpen(true);
  };

  const handleGenerate = async () => {
    let difficultyPrompt: string;
    if (genMode === 'cr') {
      const cr = genCR.trim();
      if (cr && !VALID_CRS_SET.has(cr)) {
        setGenError(`"${cr}" is not a valid CR. Valid values: 0, 1/8, 1/4, 1/2, 1–30.`);
        return;
      }
      difficultyPrompt = cr
        ? `CR ${cr}`
        : `a random challenge rating of your choosing (pick something interesting and varied)`;
    } else {
      const size = parseInt(genPartySize.trim(), 10);
      const level = parseInt(genPartyLevel.trim(), 10);
      if (!genPartySize.trim() || !genPartyLevel.trim()) { setGenError('Please enter both party size and average level.'); return; }
      if (isNaN(size) || size < 1 || size > 10) { setGenError('Party size must be between 1 and 10.'); return; }
      if (isNaN(level) || level < 1 || level > 20) { setGenError('Average level must be between 1 and 20.'); return; }
      difficultyPrompt = `a difficulty appropriate for a party of ${size} players at average level ${level}. Use D&D 5e encounter building guidelines to determine an appropriate CR for a hard or deadly solo boss fight, then build the creature at that CR. Give it legendary actions, legendary resistances if appropriate, and interesting abilities`;
    }

    const additionalContextClause = genAdditionalContext.trim()
      ? `\n\nAdditional DM instructions: ${genAdditionalContext.trim()}` : '';

    const prompt = `Generate a complete D&D 5e creature stat block for ${difficultyPrompt}. Be creative with the name and flavor. Follow official D&D 5e stat block format exactly.${additionalContextClause}

Respond with a JSON object using this exact structure (no markdown, just raw JSON):
{
  "name": "...",
  "creature_type": "one of: aberration|beast|celestial|construct|dragon|elemental|fey|fiend|giant|humanoid|monstrosity|ooze|plant|undead|other",
  "challenge_rating": "(the chosen CR as a string, e.g. \\"1/4\\" or \\"5\\")",
  "armor_class": (integer),
  "ac_descriptor": "(optional string, e.g. \\"natural armor\\" — omit if none)",
  "hit_points": (integer),
  "hit_dice": "(hit dice string, e.g. \\"6d10+12\\")",
  "speed": "(speed string, e.g. \\"30 ft., fly 60 ft.\\")",
  "str": (integer 1-30), "dex": (integer 1-30), "con": (integer 1-30),
  "int": (integer 1-30), "wis": (integer 1-30), "cha": (integer 1-30),
  "saving_throws": "(e.g. \\"Dex +4, Con +6\\" — omit if none)",
  "skills": "(e.g. \\"Perception +5, Stealth +4\\" — omit if none)",
  "damage_resistances": "(omit if none)",
  "damage_immunities": "(omit if none)",
  "condition_immunities": "(omit if none)",
  "senses": "(e.g. \\"darkvision 60 ft., passive Perception 15\\")",
  "languages": "(e.g. \\"Common, Draconic\\" — omit if none)",
  "content": "Full actions, bonus actions, reactions, legendary actions, and special traits as plain text.",
  "tags": "comma-separated flavor tags (e.g. undead, boss, ranged)",
  "dm_notes": "2-3 sentences of DM tactics and encounter tips"
}`;

    setGenError(''); setGenLoading(true);
    try {
      const res = await fetch('/api/generate-creature', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ prompt, provider: getAIProvider() }),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `Server error: ${res.status}`);

      const jsonText = (data.text ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      const toInt = (v: unknown) => { const n = parseInt(String(v ?? ''), 10); return isNaN(n) ? null : n; };

      const saved = await upsertWorldStatblock({
        name: String(parsed.name ?? 'Generated Creature'),
        creature_type: String(parsed.creature_type ?? 'monstrosity'),
        challenge_rating: String(parsed.challenge_rating ?? ''),
        armor_class: toInt(parsed.armor_class),
        ac_descriptor: parsed.ac_descriptor ? String(parsed.ac_descriptor) : null,
        hit_points: toInt(parsed.hit_points),
        hit_dice: parsed.hit_dice ? String(parsed.hit_dice) : null,
        speed: parsed.speed ? String(parsed.speed) : null,
        str: toInt(parsed.str), dex: toInt(parsed.dex), con: toInt(parsed.con),
        int: toInt(parsed.int), wis: toInt(parsed.wis), cha: toInt(parsed.cha),
        saving_throws: parsed.saving_throws ? String(parsed.saving_throws) : null,
        skills: parsed.skills ? String(parsed.skills) : null,
        damage_resistances: parsed.damage_resistances ? String(parsed.damage_resistances) : null,
        damage_immunities: parsed.damage_immunities ? String(parsed.damage_immunities) : null,
        condition_immunities: parsed.condition_immunities ? String(parsed.condition_immunities) : null,
        senses: parsed.senses ? String(parsed.senses) : null,
        languages: parsed.languages ? String(parsed.languages) : null,
        content: parsed.content ? String(parsed.content) : null,
        dm_notes: parsed.dm_notes ? String(parsed.dm_notes) : null,
        tags: parsed.tags ? String(parsed.tags) : null,
        sort_order: Math.floor(Date.now() / 1000),
      });

      setGenOpen(false);
      setSelected('combat', saved.id);
    } catch (err) {
      setGenError(`Generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setGenLoading(false);
    }
  };

  const handleAddCreature = async () => {
    const id = await createBestiaryEntry();
    if (id) setSelected('combat', id);
  };

  const handleAddEncounter = async () => {
    const id = await createEncounter();
    if (id) setSelected('combat', id);
  };

  type CombatItem = { id: string; name: string; kind: 'statblock' | 'encounter'; cr?: string; type?: string; hp?: number; ac?: number; desc?: string; tags?: string[]; difficulty?: string; status?: string; creatures?: string[]; notes?: string; };

  const items = useMemo(() => {
    const all: CombatItem[] = [
      ...bestiary.map(x => ({ ...x, kind: 'statblock' as const })),
      ...encounters.map(x => ({ ...x, kind: 'encounter' as const })),
    ];
    return all.filter(x => {
      if (filter === 'bestiary' && x.kind !== 'statblock') return false;
      if (filter === 'encounter' && x.kind !== 'encounter') return false;
      if (search) {
        const q = search.toLowerCase();
        if (!`${x.name} ${x.desc || x.notes || ''}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [bestiary, encounters, filter, search]);

  const sel = items.find(x => x.id === selected.combat) || items[0];
  const selRawEncounter = sel?.kind === 'encounter'
    ? worldEncounters.find(e => e.id === sel.id) ?? null
    : null;

  const handleDeleteEncounter = async () => {
    if (!selRawEncounter) return;
    const ok = await confirm({
      title: 'Delete encounter',
      message: `Delete "${selRawEncounter.name}"? This cannot be undone.`,
      danger: true,
    });
    if (ok) { await deleteEncounter(selRawEncounter.id); setSelected('combat', ''); }
  };

  const selRawStatblock = sel?.kind === 'statblock'
    ? worldStatblocks.find(s => s.id === sel.id) ?? null
    : null;

  const detail = !sel
    ? <EmptyDetail>Select an entry.</EmptyDetail>
    : sel.kind === 'encounter' && selRawEncounter
      ? (
        <EncounterDetail
          key={selRawEncounter.id}
          enc={selRawEncounter}
          monsterStatblocks={worldStatblocks}
          onDelete={handleDeleteEncounter}
          onViewStatblock={setViewingStatblock}
          upsertEncounter={upsertWorldEncounter}
          enableMentions={false}
        />
      )
      : selRawStatblock
        ? <WorldBestiaryDetail
            key={selRawStatblock.id}
            statblock={selRawStatblock}
            upsertWorldStatblock={upsertWorldStatblock}
            onDeleted={() => setSelected('combat', '')}
          />
        : <EmptyDetail>Select an entry.</EmptyDetail>;

  return (
    <>
      <ListDetail
        title="World Combat"
        count={items.length}
        search={search}
        onSearchChange={setSearch}
        onAdd={filter === 'encounter' ? handleAddEncounter : handleAddCreature}
        addLabel="+ New"
        onGenerate={filter !== 'encounter' ? openGenModal : undefined}
        generateLabel="✦"
        filters={
          <>
            <Pill active={filter === 'all'} onClick={() => setFilter('all')}>All</Pill>
            <Pill active={filter === 'bestiary'} onClick={() => setFilter('bestiary')}>Bestiary</Pill>
            <Pill active={filter === 'encounter'} onClick={() => setFilter('encounter')}>Encounters</Pill>
          </>
        }
        list={
          <div>
            {items.map(x => (
              <ListRow
                key={x.kind + x.id}
                active={sel?.id === x.id}
                onClick={() => setSelected('combat', x.id)}
                glyph={x.kind === 'statblock' ? '✜' : '⚔'}
                title={x.name}
                subtitle={x.kind === 'statblock' ? `CR ${x.cr} · ${x.type}` : `${x.difficulty} · ${(x.creatures || []).length} creatures`}
                badges={
                  x.kind === 'statblock'
                    ? (x.tags || []).slice(0, 2).map(t => <SubtleTag key={t}>{t}</SubtleTag>)
                    : <><Tag kind={x.difficulty}>{x.difficulty}</Tag><SubtleTag>{x.status}</SubtleTag></>
                }
              />
            ))}
          </div>
        }
        detail={detail}
      />

      {/* ── Generate modal ── */}
      <Modal
        isOpen={genOpen}
        onClose={() => { if (!genLoading) setGenOpen(false); }}
        title="Generate Creature"
        onSave={genLoading ? undefined : handleGenerate}
        saveLabel="Generate"
      >
        <div className="space-y-4">
          <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--rule)' }}>
            {(['cr', 'party'] as const).map(mode => (
              <button key={mode} onClick={() => { setGenMode(mode); setGenError(''); }} disabled={genLoading}
                className="flex-1 text-sm py-1.5 font-medium transition-colors"
                style={{ backgroundColor: genMode === mode ? 'var(--gold-dim)' : 'var(--paper)', color: genMode === mode ? 'var(--gold)' : 'var(--ink-2)' }}>
                {mode === 'cr' ? 'By Challenge Rating' : 'By Party'}
              </button>
            ))}
          </div>

          {genMode === 'cr' ? (
            <>
              <p className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6' }}>
                Optionally enter a CR, or leave blank for a random difficulty.
              </p>
              <FormField label="Challenge Rating (optional)">
                <input type="text" value={genCR} onChange={e => { setGenCR(e.target.value); setGenError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleGenerate(); } }}
                  placeholder="Leave blank for random, or e.g. 1/4, 5, 17"
                  style={inputStyle} autoFocus disabled={genLoading} />
              </FormField>
              <div className="text-xs" style={{ color: 'var(--ink-3)' }}>Valid CRs: 0, 1/8, 1/4, 1/2, 1–30</div>
            </>
          ) : (
            <>
              <p className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6' }}>
                Enter party details and the AI will build a boss scaled to challenge them.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Number of Players">
                  <input type="number" min={1} max={10} value={genPartySize}
                    onChange={e => { setGenPartySize(e.target.value); setGenError(''); }}
                    placeholder="e.g. 4" style={inputStyle} autoFocus disabled={genLoading} />
                </FormField>
                <FormField label="Average Party Level">
                  <input type="number" min={1} max={20} value={genPartyLevel}
                    onChange={e => { setGenPartyLevel(e.target.value); setGenError(''); }}
                    placeholder="e.g. 5" style={inputStyle} disabled={genLoading} />
                </FormField>
              </div>
            </>
          )}

          <FormField label="Additional Context (optional)">
            <textarea rows={3} value={genAdditionalContext}
              onChange={e => setGenAdditionalContext(e.target.value)}
              placeholder="e.g. Multiple stages, legendary actions, transforms mid-fight…"
              style={textareaStyle} disabled={genLoading} />
          </FormField>

          {genError && <p className="text-sm" style={{ color: 'var(--red)' }}>{genError}</p>}
          {genLoading && <p className="text-sm" style={{ color: 'var(--ink-2)', fontStyle: 'italic' }}>Generating stat block…</p>}
        </div>
      </Modal>

      {/* Statblock sheet viewer modal */}
      {viewingStatblock && (
        <Modal isOpen onClose={() => setViewingStatblock(null)} title={viewingStatblock.name} wide>
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {viewingStatblock.creature_type && (
                <span className="text-xs px-2 py-0.5 rounded border capitalize"
                  style={{ backgroundColor: 'var(--red-bg)', color: 'var(--red)', borderColor: 'var(--red-line)' }}>
                  {viewingStatblock.creature_type}
                </span>
              )}
              {viewingStatblock.challenge_rating && (
                <span className="text-xs px-2 py-0.5 rounded"
                  style={{ backgroundColor: 'var(--chip-bg)', color: 'var(--cr)', border: '1px solid var(--chip-line)' }}>
                  CR {viewingStatblock.challenge_rating}
                </span>
              )}
              {viewingStatblock.tags && (
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{viewingStatblock.tags}</span>
              )}
            </div>
            {viewingStatblock.content && (
              <pre className="text-sm whitespace-pre-wrap rounded p-3"
                style={{ color: 'var(--ink)', lineHeight: '1.7', fontFamily: 'monospace', fontSize: '0.8rem', backgroundColor: 'var(--bg)', border: '1px solid var(--rule)' }}>
                {viewingStatblock.content}
              </pre>
            )}
            {viewingStatblock.dm_notes && (
              <div>
                <div style={{ color: 'var(--gold)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.5rem' }}>DM Notes</div>
                <p className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6', fontStyle: 'italic' }}>
                  {viewingStatblock.dm_notes}
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

function WorldBestiaryDetail({
  statblock,
  upsertWorldStatblock,
  onDeleted,
}: {
  statblock: MonsterStatblock;
  upsertWorldStatblock: (data: Omit<MonsterStatblockInsert, 'world_id' | 'campaign_id'> & { id?: string }) => Promise<MonsterStatblock>;
  onDeleted: () => void;
}) {
  const { deleteBestiaryEntry } = useWorld();
  const confirm = useConfirm();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<MonsterForm>(emptyMonsterForm());

  const field = (key: keyof MonsterForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }));

  const openEdit = () => {
    const m = statblock;
    setForm({
      name: m.name,
      creature_type: m.creature_type ?? 'monstrosity',
      challenge_rating: m.challenge_rating ?? '',
      armor_class: m.armor_class != null ? String(m.armor_class) : '',
      ac_descriptor: m.ac_descriptor ?? '',
      hit_points: m.hit_points != null ? String(m.hit_points) : '',
      hit_dice: m.hit_dice ?? '',
      speed: m.speed ?? '',
      str: m.str != null ? String(m.str) : '',
      dex: m.dex != null ? String(m.dex) : '',
      con: m.con != null ? String(m.con) : '',
      int: m.int != null ? String(m.int) : '',
      wis: m.wis != null ? String(m.wis) : '',
      cha: m.cha != null ? String(m.cha) : '',
      saving_throws: m.saving_throws ?? '',
      skills: m.skills ?? '',
      damage_immunities: m.damage_immunities ?? '',
      damage_resistances: m.damage_resistances ?? '',
      condition_immunities: m.condition_immunities ?? '',
      senses: m.senses ?? '',
      languages: m.languages ?? '',
      content: m.content ?? '',
      dm_notes: m.dm_notes ?? '',
      tags: m.tags ?? '',
    });
    setEditOpen(true);
  };

  const toIntOrNull = (s: string): number | null => {
    const n = parseInt(s.trim(), 10);
    return isNaN(n) ? null : n;
  };

  const handleSave = async () => {
    await upsertWorldStatblock({
      id: statblock.id,
      name: form.name,
      creature_type: form.creature_type || null,
      challenge_rating: form.challenge_rating || null,
      armor_class: toIntOrNull(form.armor_class),
      ac_descriptor: form.ac_descriptor || null,
      hit_points: toIntOrNull(form.hit_points),
      hit_dice: form.hit_dice || null,
      speed: form.speed || null,
      str: toIntOrNull(form.str),
      dex: toIntOrNull(form.dex),
      con: toIntOrNull(form.con),
      int: toIntOrNull(form.int),
      wis: toIntOrNull(form.wis),
      cha: toIntOrNull(form.cha),
      saving_throws: form.saving_throws || null,
      skills: form.skills || null,
      damage_immunities: form.damage_immunities || null,
      damage_resistances: form.damage_resistances || null,
      condition_immunities: form.condition_immunities || null,
      senses: form.senses || null,
      languages: form.languages || null,
      content: form.content || null,
      dm_notes: form.dm_notes || null,
      tags: form.tags || null,
      sort_order: statblock.sort_order,
    });
    setEditOpen(false);
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete creature',
      message: `Delete "${statblock.name}" from the world bestiary? This cannot be undone.`,
      danger: true,
    });
    if (ok) { await deleteBestiaryEntry(statblock.id); onDeleted(); }
  };

  // Ability score input
  const AbilityInput = ({ k, label }: { k: keyof MonsterForm; label: string }) => {
    const val = form[k] as string;
    const score = parseInt(val, 10);
    const mod = !isNaN(score) ? abilityMod(score) : null;
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
        <input type="number" min={1} max={30} value={val} onChange={field(k)} placeholder="—"
          style={{ ...inputStyle, textAlign: 'center', padding: '4px 2px', width: '100%' }} />
        <div style={{ fontSize: '0.65rem', color: 'var(--ink-2)', marginTop: '3px', minHeight: '1em' }}>{mod ?? ''}</div>
      </div>
    );
  };

  return (
    <>
      <DetailPanel
        eyebrow={`World Bestiary · ${statblock.creature_type ?? 'creature'}`}
        title={statblock.name}
        subtitle={statblock.challenge_rating ? `Challenge Rating ${statblock.challenge_rating}` : undefined}
      >
        <WorldBadge />

        {/* Tags */}
        {statblock.tags && (
          <div style={{ marginBottom: 12 }}>
            {statblock.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
              <span key={t} className="cm-tag is-subtle" style={{ marginRight: 4 }}>{t}</span>
            ))}
          </div>
        )}

        {/* Full stat block */}
        <StatBlockBody m={statblock} />

        {/* Actions */}
        <div style={{ marginTop: 'auto', paddingTop: 20, borderTop: '1px solid var(--rule)', display: 'flex', gap: 8 }}>
          <button onClick={openEdit}
            style={{ background: 'none', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: '6px 14px', color: 'var(--ink-2)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--serif)' }}>
            Edit
          </button>
          <button onClick={handleDelete}
            style={{ background: 'none', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: '6px 12px', color: 'var(--red)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--serif)' }}>
            ✕ Delete
          </button>
        </div>
      </DetailPanel>

      {/* Edit modal */}
      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title={`Edit: ${statblock.name}`} onSave={handleSave} wide>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Creature Type">
            <select value={form.creature_type} onChange={field('creature_type')} style={inputStyle}>
              {CREATURE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </FormField>
          <FormField label="Challenge Rating">
            <input type="text" value={form.challenge_rating} onChange={field('challenge_rating')} placeholder="e.g., 1/4, 5, 17" style={inputStyle} />
          </FormField>
        </div>
        <FormField label="Name">
          <input type="text" value={form.name} onChange={field('name')} placeholder="e.g., Cave Troll, Shadow Drake" style={inputStyle} />
        </FormField>
        <FormField label="Tags">
          <input type="text" value={form.tags} onChange={field('tags')} placeholder="Comma-separated: boss, undead, ranged..." style={inputStyle} />
        </FormField>
        <div style={{ borderTop: '1px solid var(--rule)', margin: '4px 0' }} />
        <div className="grid grid-cols-3 gap-3">
          <div>
            <FormField label="Armor Class">
              <input type="number" min={1} max={30} value={form.armor_class} onChange={field('armor_class')} placeholder="e.g. 15" style={inputStyle} />
            </FormField>
            <input type="text" value={form.ac_descriptor} onChange={field('ac_descriptor')} placeholder="e.g. natural armor"
              style={{ ...inputStyle, marginTop: '4px', fontSize: '0.75rem' }} />
          </div>
          <div>
            <FormField label="Hit Points">
              <input type="number" min={1} value={form.hit_points} onChange={field('hit_points')} placeholder="e.g. 45" style={inputStyle} />
            </FormField>
            <input type="text" value={form.hit_dice} onChange={field('hit_dice')} placeholder="e.g. 6d10+12"
              style={{ ...inputStyle, marginTop: '4px', fontSize: '0.75rem' }} />
          </div>
          <FormField label="Speed">
            <input type="text" value={form.speed} onChange={field('speed')} placeholder="e.g. 30 ft., fly 60 ft." style={inputStyle} />
          </FormField>
        </div>
        <div>
          <div style={{ color: 'var(--gold)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem', marginTop: '4px' }}>Ability Scores</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
            {ABILITY_KEYS.map(({ key, label }) => <AbilityInput key={key} k={key} label={label} />)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Saving Throws">
            <input type="text" value={form.saving_throws} onChange={field('saving_throws')} placeholder="e.g. Dex +4, Con +6" style={inputStyle} />
          </FormField>
          <FormField label="Skills">
            <input type="text" value={form.skills} onChange={field('skills')} placeholder="e.g. Perception +5, Stealth +4" style={inputStyle} />
          </FormField>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Damage Resistances">
            <input type="text" value={form.damage_resistances} onChange={field('damage_resistances')} placeholder="e.g. fire, cold" style={inputStyle} />
          </FormField>
          <FormField label="Damage Immunities">
            <input type="text" value={form.damage_immunities} onChange={field('damage_immunities')} placeholder="e.g. poison, psychic" style={inputStyle} />
          </FormField>
          <FormField label="Condition Immunities">
            <input type="text" value={form.condition_immunities} onChange={field('condition_immunities')} placeholder="e.g. charmed, frightened" style={inputStyle} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Senses">
            <input type="text" value={form.senses} onChange={field('senses')} placeholder="e.g. darkvision 60 ft., passive Perception 15" style={inputStyle} />
          </FormField>
          <FormField label="Languages">
            <input type="text" value={form.languages} onChange={field('languages')} placeholder="e.g. Common, Draconic" style={inputStyle} />
          </FormField>
        </div>
        <div style={{ borderTop: '1px solid var(--rule)', margin: '4px 0' }} />
        <FormField label="Actions & Traits">
          <SlashField value={form.content} onChange={v => setForm(prev => ({ ...prev, content: v }))}
            placeholder="Actions, bonus actions, reactions, legendary actions..." minHeight="280px" />
        </FormField>
        <FormField label="DM Notes">
          <SlashField value={form.dm_notes} onChange={v => setForm(prev => ({ ...prev, dm_notes: v }))}
            placeholder="Tactics, encounter context, flavor notes..." minHeight="60px" />
        </FormField>
      </Modal>
    </>
  );
}
