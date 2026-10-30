import { useState, useMemo } from 'react';
import { useWorld } from '../../context/WorldContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useStatBlockPanel } from '../../context/StatBlockPanelContext';
import { StatSheetEditor } from '../entity/StatSheetEditor';
import { ListDetail, ListRow, Pill, EmptyDetail } from '../ui/ListDetail';
import { Badge } from '../ui/Badge';
import { Modal } from '../Modal';
import { EncounterDetail } from '../ui/EncounterDetail';
import { RandomEncounterDetail } from '../ui/RandomEncounterDetail';
import { GenerateWorldEncounterModal } from '../ui/GenerateEncounterModal';
import { GenerateWorldRandomTableModal } from '../ui/GenerateRandomTableModal';
import { parseEntries, kindMeta } from '../../lib/randomEncounter';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import { getAIProvider } from '../../lib/aiProvider';
import { authHeaders } from '../../lib/apiClient';
import { buildSelectedContextBlock } from '../../lib/campaignContext';
import {
  EntityContextPicker,
  useSelectedContextEntities,
  type ContextRef,
} from '../ui/EntityContextPicker';
import { markDraft } from '../../hooks/useDiscardBlankDraft';
import type { WorldLocation } from '../../types/world';
import { NPCEditor } from '../entity/NPCEditor';
import { LocationEditor } from '../entity/LocationEditor';
import { LoreEditor } from '../entity/LoreEditor';
import { FactionEditor } from '../entity/FactionEditor';
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

// ═══════════════════════════════════════════
// WORLD NPCs VIEW
// ═══════════════════════════════════════════

export function WorldNPCsView() {
  const { npcs, factions, selected, setSelected, createNPC, createFaction } = useWorld();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'npc' | 'faction'>('all');

  const addCharacter = async () => { const id = await createNPC(); if (id) { markDraft(id); setSelected('npcs', id); } };
  const addFaction = async () => { const id = await createFaction(); if (id) { markDraft(id); setSelected('npcs', id); } };

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
      onAdd={filter === 'faction' ? addFaction : addCharacter}
      addLabel={filter === 'faction' ? '+ Add faction' : filter === 'npc' ? '+ Add NPC' : '+ Add'}
      addOptions={filter === 'all' ? [
        { label: 'NPC', onClick: addCharacter },
        { label: 'Faction', onClick: addFaction },
      ] : undefined}
      filters={
        <>
          <Pill active={filter === 'all'} onClick={() => setFilter('all')}>All</Pill>
          <Pill active={filter === 'npc'} onClick={() => setFilter('npc')}>NPCs</Pill>
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

// The world's NPCs and factions, in the same editors a campaign uses.
function WorldNPCDetail({ entity }: { entity: { id: string; kind: 'npc' | 'faction' } }) {
  const { npcs, factions, locations, worldStatblocks, setSelected, setWorldTab, upsertWorldNPC, deleteWorldNPC, upsertWorldFaction, deleteWorldFaction } = useWorld();
  const factionRows = factions.flatMap(f => (f.row ? [f.row] : []));
  const npcRows = npcs.flatMap(n => (n.row ? [n.row] : []));

  if (entity.kind === 'faction') {
    const row = factionRows.find(f => f.id === entity.id);
    if (!row) return <EmptyDetail>Loading…</EmptyDetail>;
    return (
      <FactionEditor
        key={row.id}
        faction={row}
        scope="world"
        npcs={npcRows}
        save={fields => upsertWorldFaction({ id: row.id, ...fields })}
        remove={deleteWorldFaction}
        onOpenNPC={id => setSelected('npcs', id)}
      />
    );
  }

  const row = npcRows.find(n => n.id === entity.id);
  if (!row) return <EmptyDetail>Loading…</EmptyDetail>;
  return (
    <NPCEditor
      key={row.id}
      npc={row}
      scope="world"
      factions={factionRows}
      locations={locations.flatMap(l => (l.row ? [l.row] : []))}
      onOpenLocation={id => { setWorldTab('locations'); setSelected('locations', id); }}
      statblocks={worldStatblocks.map(s => ({ id: s.id, name: s.name }))}
      save={fields => upsertWorldNPC({ id: row.id, ...fields })}
      remove={deleteWorldNPC}
    />
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
  const { locations, selected, setSelected, createLocation, upsertWorldLocation, deleteWorldLocation } = useWorld();
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
      onAdd={async () => { const id = await createLocation(); if (id) { markDraft(id); setSelected('locations', id); } }}
      addLabel="+ Add location"
      list={
        locations.length === 0 ? (
          <div className="cm-empty is-inline">No locations yet — add one to start the map</div>
        ) : (
          <div className="cm-tree">{roots.map(r => renderNode(r, 0))}</div>
        )
      }
      detail={sel?.row ? (
        <LocationEditor
          key={sel.id}
          location={sel.row}
          scope="world"
          allLocations={locations.flatMap(l => (l.row ? [l.row] : []))}
          save={fields => upsertWorldLocation({ id: sel.id, ...fields })}
          remove={deleteWorldLocation}
        />
      ) : <EmptyDetail>Select a location.</EmptyDetail>}
    />
  );
}


function formatType(t: string | null) {
  if (!t) return '';
  return t.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bHq\b/, 'HQ');
}

// ═══════════════════════════════════════════
// WORLD LORE VIEW
// ═══════════════════════════════════════════

export function WorldLoreView() {
  const { lore, selected, setSelected, createLoreEntry, upsertWorldLore, deleteWorldLore } = useWorld();
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
      onAdd={async () => { const id = await createLoreEntry(); if (id) { markDraft(id); setSelected('lore', id); } }}
      addLabel="+ Add lore"
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
      detail={sel?.row ? (
        <LoreEditor
          key={sel.id}
          entry={sel.row}
          scope="world"
          save={fields => upsertWorldLore({ id: sel.id, ...fields })}
          remove={deleteWorldLore}
        />
      ) : <EmptyDetail>Select a lore entry.</EmptyDetail>}
    />
  );
}

// ═══════════════════════════════════════════
// WORLD COMBAT VIEW (Bestiary + Encounters)
// ═══════════════════════════════════════════

/** The world's Encounters views, switched from the topbar like the campaign's. */
export type WorldCombatSubView = 'encounter' | 'random' | 'bestiary';

export function WorldCombatView({ view: filter, setView: setFilter }: { view: WorldCombatSubView; setView: (v: WorldCombatSubView) => void }) {
  const {
    bestiary, encounters,
    worldStatblocks, worldEncounters,
    worldRandomEncounterTables,
    selected, setSelected,
    createBestiaryEntry, createEncounter,
    createRandomEncounterTable,
    upsertWorldStatblock,
    deleteBestiaryEntry, deleteEncounter,
    upsertWorldEncounter,
    upsertWorldRandomEncounterTable, deleteRandomEncounterTable,
    activeWorld,
  } = useWorld();
  const confirm = useConfirm();

  const [search, setSearch] = useState('');
  const { openStatBlock } = useStatBlockPanel();

  // ---- Generate modal state ----
  const [genOpen, setGenOpen] = useState(false);           // creature (stat sheet) generator
  const [genEncOpen, setGenEncOpen] = useState(false);     // full-encounter generator
  const [genTableOpen, setGenTableOpen] = useState(false); // whole random-table generator
  const [genMode, setGenMode] = useState<'cr' | 'party'>('cr');
  const [genCR, setGenCR] = useState('');
  const [genPartySize, setGenPartySize] = useState('');
  const [genPartyLevel, setGenPartyLevel] = useState('');
  const [genContext, setGenContext] = useState<ContextRef[]>([]);
  const [genAdditionalContext, setGenAdditionalContext] = useState('');
  const [genError, setGenError] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const genContextEntities = useSelectedContextEntities(genContext);

  const openGenModal = () => {
    setGenMode('cr'); setGenCR(''); setGenPartySize(''); setGenPartyLevel('');
    setGenContext([]); setGenAdditionalContext(''); setGenError(''); setGenOpen(true);
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

    const worldContextBlock = buildSelectedContextBlock(genContextEntities, {
      title: activeWorld?.name ?? '',
      plotSummary: activeWorld?.tagline ?? '',
    });
    const additionalContextClause = genAdditionalContext.trim()
      ? `\n\nAdditional DM instructions: ${genAdditionalContext.trim()}` : '';

    const prompt = `Generate a complete D&D 5e creature stat block for ${difficultyPrompt}. Be creative with the name and flavor. Follow official D&D 5e stat block format exactly.${worldContextBlock}${additionalContextClause}

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

  const handleAddRandomTable = async () => {
    const id = await createRandomEncounterTable();
    if (id) setSelected('combat', id);
  };

  type CombatItem = { id: string; name: string; kind: 'statblock' | 'encounter' | 'random'; cr?: string; type?: string; hp?: number; ac?: number; desc?: string; tags?: string[]; difficulty?: string; status?: string; creatures?: string[]; notes?: string; tableKind?: string; rows?: number; };

  const items = useMemo(() => {
    const all: CombatItem[] = [
      ...bestiary.map(x => ({ ...x, kind: 'statblock' as const })),
      ...encounters.map(x => ({ ...x, kind: 'encounter' as const })),
      ...worldRandomEncounterTables.map(t => ({
        id: t.id, name: t.name || 'Untitled table', kind: 'random' as const,
        tableKind: t.kind, rows: parseEntries(t.entries).length,
        desc: t.subtitle ?? t.description ?? '',
      })),
    ];
    return all.filter(x => {
      if (filter === 'bestiary' && x.kind !== 'statblock') return false;
      if (filter === 'encounter' && x.kind !== 'encounter') return false;
      if (filter === 'random' && x.kind !== 'random') return false;
      if (search) {
        const q = search.toLowerCase();
        if (!`${x.name} ${x.desc || x.notes || ''}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [bestiary, encounters, worldRandomEncounterTables, filter, search]);

  const sel = items.find(x => x.id === selected.combat) || items[0];
  const selRawEncounter = sel?.kind === 'encounter'
    ? worldEncounters.find(e => e.id === sel.id) ?? null
    : null;
  const selRawRandomTable = sel?.kind === 'random'
    ? worldRandomEncounterTables.find(t => t.id === sel.id) ?? null
    : null;

  const handleDeleteEncounter = async () => {
    if (!selRawEncounter) return;
    const ok = await confirm({
      title: 'Delete encounter',
      message: `Delete "${selRawEncounter.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) { await deleteEncounter(selRawEncounter.id); setSelected('combat', ''); }
  };

  const selRawStatblock = sel?.kind === 'statblock'
    ? worldStatblocks.find(s => s.id === sel.id) ?? null
    : null;

  const handleDeleteRandomTable = async () => {
    if (!selRawRandomTable) return;
    const ok = await confirm({
      title: 'Delete random table',
      message: `Delete "${selRawRandomTable.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) { await deleteRandomEncounterTable(selRawRandomTable.id); setSelected('combat', ''); }
  };

  const detail = !sel
    ? <EmptyDetail>Select an entry.</EmptyDetail>
    : sel.kind === 'encounter' && selRawEncounter
      ? (
        <EncounterDetail
          key={selRawEncounter.id}
          enc={selRawEncounter}
          monsterStatblocks={worldStatblocks}
          onDelete={handleDeleteEncounter}
          onViewStatblock={sb => openStatBlock(sb.id)}
          upsertEncounter={upsertWorldEncounter}
          enableMentions={false}
        />
      )
      : sel.kind === 'random' && selRawRandomTable
        ? (
          <RandomEncounterDetail
            key={selRawRandomTable.id}
            table={selRawRandomTable}
            scope="world"
            onDelete={handleDeleteRandomTable}
            upsertTable={upsertWorldRandomEncounterTable}
            statblocks={worldStatblocks}
            onViewStatblock={sb => openStatBlock(sb.id)}
          />
        )
      : selRawStatblock
        ? <StatSheetEditor
            key={selRawStatblock.id}
            statblock={selRawStatblock}
            scope="world"
            save={fields => upsertWorldStatblock({ id: selRawStatblock.id, ...fields, sort_order: selRawStatblock.sort_order })}
            remove={deleteBestiaryEntry}
            onDeleted={() => setSelected('combat', '')}
            onView={() => openStatBlock(selRawStatblock.id)}
          />
        : <EmptyDetail>Select an entry.</EmptyDetail>;

  return (
    <>
      <ListDetail
        title={filter === 'encounter' ? 'Encounters' : filter === 'random' ? 'Random tables' : 'Stat sheets'}
        count={items.length}
        search={search}
        onSearchChange={setSearch}
        onAdd={filter === 'encounter' ? handleAddEncounter : filter === 'random' ? handleAddRandomTable : handleAddCreature}
        addLabel={filter === 'encounter' ? '+ Add encounter' : filter === 'random' ? '+ Add table' : '+ Add stat sheet'}
        onGenerate={filter === 'bestiary' ? openGenModal : filter === 'encounter' ? () => setGenEncOpen(true) : filter === 'random' ? () => setGenTableOpen(true) : undefined}
        list={
          <div>
            {items.map(x => (
              <ListRow
                key={x.kind + x.id}
                active={sel?.id === x.id}
                onClick={() => setSelected('combat', x.id)}
                glyph={x.kind === 'statblock' ? '✜' : x.kind === 'random' ? kindMeta(x.tableKind ?? 'encounter').glyph : '⚔'}
                title={x.name}
                subtitle={
                  x.kind === 'statblock' ? `CR ${x.cr} · ${x.type}`
                    : x.kind === 'random' ? `${kindMeta(x.tableKind ?? 'encounter').label} · ${x.rows} ${x.rows === 1 ? 'entry' : 'entries'}`
                    : `${x.difficulty} · ${(x.creatures || []).length} creatures`
                }
                badges={
                  x.kind === 'statblock'
                    ? (x.tags || []).slice(0, 2).map(t => <SubtleTag key={t}>{t}</SubtleTag>)
                    : x.kind === 'random'
                      ? <SubtleTag>World</SubtleTag>
                      : <><Tag kind={x.difficulty}>{x.difficulty}</Tag><SubtleTag>{x.status}</SubtleTag></>
                }
              />
            ))}
          </div>
        }
        detail={detail}
      />

      {/* ── Generate full encounter (AI) ── */}
      <GenerateWorldEncounterModal
        isOpen={genEncOpen}
        onClose={() => setGenEncOpen(false)}
        onCreated={enc => { setGenEncOpen(false); setFilter('encounter'); setSelected('combat', enc.id); }}
      />

      {/* ── Generate whole random table (AI) ── */}
      <GenerateWorldRandomTableModal
        isOpen={genTableOpen}
        onClose={() => setGenTableOpen(false)}
        onCreated={t => { setGenTableOpen(false); setFilter('random'); setSelected('combat', t.id); }}
      />

      {/* ── Generate creature modal ── */}
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

          <div>
            <EntityContextPicker
              selected={genContext}
              onChange={setGenContext}
              disabled={genLoading}
              label="World Context"
            />
            <p className="text-xs mt-1.5" style={{ color: 'var(--ink-3)' }}>
              Add specific NPCs, factions, locations, or lore so the stat block feels native to your world.
            </p>
          </div>

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

    </>
  );
}
