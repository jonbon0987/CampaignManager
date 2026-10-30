import { useState, useMemo, useEffect } from 'react';
import { useOpenRecord, useReportRecord } from '../../context/NavigationContext';
import { useCampaign } from '../../context/CampaignContext';
import { useWorld } from '../../context/WorldContext';
import { ListDetail, ListRow, EmptyDetail, Pill, FilterSep } from '../ui/ListDetail';
import { Badge } from '../ui/Badge';
import type { Origin } from '../ui/OriginBand';
import { useStatBlockPanel } from '../../context/StatBlockPanelContext';
import { pushRecent } from '../../lib/recent';
import CharacterWeb from './CharacterWeb';
import { markDraft } from '../../hooks/useDiscardBlankDraft';
import { ListRowWithHover } from '../HoverPreview';
import { NPCEditor } from '../entity/NPCEditor';
import { FactionEditor } from '../entity/FactionEditor';
import { PCEditor } from '../entity/PCEditor';
import type { NPC, Faction, PlayerCharacter } from '../../lib/database.types';

type CastKind = 'pc' | 'npc' | 'faction';
type FilterType = 'all' | CastKind;
type MetFilter = 'all' | 'met' | 'unmet';

interface CastItem {
  id: string;
  kind: CastKind;
  name: string;
  subtitle: string;
  meta?: string;
  glyph: string;
  raw: unknown;
}

const GLYPHS: Record<CastKind, string> = { pc: '◈', npc: '◇', faction: '⬡' };

export default function Characters({ viewMode = 'list', onImportFromWorld, openId, onOpenConsumed }: { viewMode?: string; setViewMode?: (v: string) => void; onImportFromWorld?: () => void; openId?: string | null; onOpenConsumed?: () => void }) {
  return (
    <div style={{ height: '100%', overflow: viewMode === 'list' ? 'hidden' : 'auto' }}>
      {viewMode === 'list' && <CastList onImportFromWorld={onImportFromWorld} openId={openId} onOpenConsumed={onOpenConsumed} />}
      {viewMode === 'web'  && <CharacterWeb />}
    </div>
  );
}

function CastList({ onImportFromWorld, openId, onOpenConsumed }: { onImportFromWorld?: () => void; openId?: string | null; onOpenConsumed?: () => void }) {
  const {
    pcs, npcs, factions,
    upsertPC,
    upsertNPC,
    upsertFaction,
    monsterStatblocks,
    linkedNPCIds,
  } = useCampaign();
  const { openStatBlock } = useStatBlockPanel();

  // NPCs linked from world canon (vs. campaign-local) — used to badge their rows.
  const linkedNPCSet = useMemo(() => new Set(linkedNPCIds), [linkedNPCIds]);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [metFilter, setMetFilter] = useState<MetFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useReportRecord('cast', selectedId);

  // Open a record requested from outside the tab (e.g. the sidebar "Recent"
  // list), then clear the request so it doesn't re-fire. Syncing selection to an
  // incoming external request is the legitimate case for setState in an effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (openId) { setSelectedId(openId); setFilter('all'); setMetFilter('all'); setSearch(''); onOpenConsumed?.(); }
  }, [openId, onOpenConsumed]);

  // Build unified list
  const all = useMemo<CastItem[]>(() => {
    const factionNames = (ids: string[] | null) =>
      (ids ?? []).map(id => factions.find(f => f.id === id)?.name).filter(Boolean).join(', ');
    const items: CastItem[] = [
      ...pcs.map(pc => ({
        id: pc.id,
        kind: 'pc' as const,
        name: pc.character_name || 'Unnamed',
        subtitle: [pc.race, pc.class].filter(Boolean).join(' '),
        meta: pc.is_active ? undefined : 'inactive',
        glyph: GLYPHS.pc,
        raw: pc,
      })),
      ...npcs.map(npc => ({
        id: npc.id,
        kind: 'npc' as const,
        name: npc.name,
        subtitle: [npc.role, factionNames(npc.faction_ids) || npc.affiliation].filter(Boolean).join(' · '),
        meta: npc.status === 'deceased' ? 'deceased' : undefined,
        glyph: GLYPHS.npc,
        raw: npc,
      })),
      ...factions.map(f => ({
        id: f.id,
        kind: 'faction' as const,
        name: f.name,
        subtitle: f.faction_type ? f.faction_type.charAt(0).toUpperCase() + f.faction_type.slice(1) : '',
        glyph: GLYPHS.faction,
        raw: f,
      })),
    ];

    return items.filter(item => {
      if (filter !== 'all' && item.kind !== filter) return false;
      if (item.kind === 'npc' && metFilter !== 'all') {
        const npc = item.raw as NPC;
        if (metFilter === 'met' && !npc.met_by_pcs) return false;
        if (metFilter === 'unmet' && npc.met_by_pcs) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!item.name.toLowerCase().includes(q) && !item.subtitle.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [pcs, npcs, factions, filter, metFilter, search]);

  // Resolve selected item
  const selected = all.find(x => x.id === selectedId) || all[0] || null;

  const handleSelect = (item: CastItem) => {
    setSelectedId(item.id);
    pushRecent({ kind: item.kind, id: item.id, label: item.name, tab: 'cast' });
  };

  const addFaction = async () => {
    const result = await upsertFaction({ name: '', faction_type: 'other', overview: null, key_figures: null, agenda: null, dm_notes: null });
    markDraft(result.id);
    setSelectedId(result.id);
  };
  const addPC = async () => {
    const result = await upsertPC({ character_name: '', is_active: true, faction_ids: [] });
    markDraft(result.id);
    setSelectedId(result.id);
  };
  const addNPC = async () => {
    const result = await upsertNPC({ name: '', status: 'active', met_by_pcs: false, faction_ids: [] });
    markDraft(result.id);
    setSelectedId(result.id);
  };

  const handleAdd = async () => {
    if (filter === 'faction') await addFaction();
    else if (filter === 'pc') await addPC();
    else await addNPC();
  };

  return (
    <ListDetail
      title="Cast"
      count={all.length}
      search={search}
      onSearchChange={setSearch}
      onAdd={handleAdd}
      addLabel={filter === 'faction' ? '+ Add faction' : filter === 'npc' ? '+ Add NPC' : filter === 'pc' ? '+ Add PC' : '+ Add'}
      addOptions={filter === 'all' ? [
        { label: 'PC', onClick: addPC },
        { label: 'NPC', onClick: addNPC },
        { label: 'Faction', onClick: addFaction },
      ] : undefined}
      onImport={onImportFromWorld && (filter === 'all' || filter === 'npc') ? onImportFromWorld : undefined}
      importLabel="⊕ Import NPC"
      filters={
        <>
          <Pill active={filter === 'all'} onClick={() => setFilter('all')}>All</Pill>
          <Pill active={filter === 'pc'} onClick={() => setFilter('pc')}>PCs</Pill>
          <Pill active={filter === 'npc'} onClick={() => setFilter('npc')}>NPCs</Pill>
          <Pill active={filter === 'faction'} onClick={() => setFilter('faction')}>Factions</Pill>
          {(filter === 'all' || filter === 'npc') && (
            <>
              <FilterSep />
              <Pill subtle active={metFilter === 'met'} onClick={() => setMetFilter(metFilter === 'met' ? 'all' : 'met')}>Met</Pill>
              <Pill subtle active={metFilter === 'unmet'} onClick={() => setMetFilter(metFilter === 'unmet' ? 'all' : 'unmet')}>Unmet</Pill>
            </>
          )}
        </>
      }
      list={
        all.length === 0 ? (
          <div className="cm-empty is-inline">No entries match your filters</div>
        ) : (
          all.map(item => (
            <ListRowWithHover
              key={item.id}
              entity={item.raw as NPC | PlayerCharacter | Faction}
              kind={item.kind}
            >
              <ListRow
                active={selected?.id === item.id}
                onClick={() => handleSelect(item)}
                glyph={item.glyph}
                title={item.name}
                subtitle={item.subtitle}
                meta={item.meta}
                badges={
                  item.kind === 'npc' ? (
                    <>
                      {linkedNPCSet.has(item.id) && <Badge color="gold" size="xs">imported</Badge>}
                      {(item.raw as NPC).met_by_pcs && <Badge color="green">Met</Badge>}
                    </>
                  ) : undefined
                }
              />
            </ListRowWithHover>
          ))
        )
      }
      detail={
        selected ? (
          <CastDetail
            key={selected.id}
            item={selected}
            factions={factions}
            statblocks={monsterStatblocks}
            openStatBlock={openStatBlock}
            onSelect={setSelectedId}
            onDeselect={() => setSelectedId(null)}
          />
        ) : (
          <EmptyDetail>Select an entry from the list</EmptyDetail>
        )
      }
    />
  );
}

/* ── Cast Detail Panel ── */

interface CastDetailProps {
  item: CastItem;
  factions: Faction[];
  statblocks: { id: string; name: string }[];
  openStatBlock: (id: string) => void;
  onSelect: (id: string) => void;
  onDeselect: () => void;
}

function CastDetail({ item, factions, statblocks, openStatBlock, onSelect, onDeselect }: CastDetailProps) {
  if (item.kind === 'pc') return (
    <CampaignPC pc={item.raw as PlayerCharacter} factions={factions} statblocks={statblocks} onSelect={onSelect} onDeselect={onDeselect} />
  );
  if (item.kind === 'npc') return (
    <CampaignNPC npc={item.raw as NPC} factions={factions} statblocks={statblocks} openStatBlock={openStatBlock} onDeselect={onDeselect} />
  );
  return <CampaignFaction faction={item.raw as Faction} onSelect={onSelect} onDeselect={onDeselect} />;
}

/* ── NPCs and factions: the shared editors, saving to this campaign ── */

function CampaignNPC({ npc, factions, statblocks, openStatBlock, onDeselect }: {
  npc: NPC;
  factions: Faction[];
  statblocks: { id: string; name: string }[];
  openStatBlock: (id: string) => void;
  onDeselect: () => void;
}) {
  const { locations, upsertNPC, deleteNPC, linkedNPCIds, linkNPCToCampaign, unlinkNPCFromCampaign } = useCampaign();
  const { activeWorldId, backToWorld, setWorldTab, setSelected: setWorldSelected } = useWorld();
  const openRecord = useOpenRecord();
  // Imported (linked from world canon) vs. local (this campaign only). Drives the
  // provenance band AND the save scope: editing an imported NPC must write to
  // the canon row ('global'), not accidentally re-scope it to this campaign.
  const origin: Origin = linkedNPCIds.includes(npc.id) ? 'imported' : 'local';
  type Insert = Parameters<typeof upsertNPC>[0];

  return (
    <NPCEditor
      npc={npc}
      scope="campaign"
      factions={factions}
      locations={locations}
      statblocks={statblocks}
      onOpenLocation={id => openRecord('locations', id)}
      save={fields => upsertNPC({ id: npc.id, ...fields } as Insert, origin === 'imported' ? 'global' : 'campaign')}
      remove={deleteNPC}
      onDeleted={onDeselect}
      onOpenStatBlock={openStatBlock}
      canon={{
        origin,
        onOpenInCanon: () => { setWorldSelected('npcs', npc.id); setWorldTab('npcs'); backToWorld(); },
        // Publish promotes it into canon, then keeps it visible here.
        onPublish: async fields => {
          await upsertNPC({ id: npc.id, ...fields, world_id: activeWorldId || npc.world_id || null } as Insert, 'global');
          await linkNPCToCampaign(npc.id);
        },
        onDetach: async () => { await unlinkNPCFromCampaign(npc.id); onDeselect(); },
      }}
    />
  );
}

function CampaignPC({ pc, factions, statblocks, onSelect, onDeselect }: {
  pc: PlayerCharacter;
  factions: Faction[];
  statblocks: { id: string; name: string }[];
  onSelect: (id: string) => void;
  onDeselect: () => void;
}) {
  const { npcs, upsertPC, deletePC } = useCampaign();
  return (
    <PCEditor
      pc={pc}
      factions={factions}
      npcs={npcs}
      statblocks={statblocks}
      save={fields => upsertPC({ id: pc.id, ...fields } as Parameters<typeof upsertPC>[0])}
      remove={deletePC}
      onDeleted={onDeselect}
      onOpenNPC={onSelect}
    />
  );
}

function CampaignFaction({ faction, onSelect, onDeselect }: { faction: Faction; onSelect: (id: string) => void; onDeselect: () => void }) {
  const { npcs, upsertFaction, deleteFaction } = useCampaign();
  return (
    <FactionEditor
      faction={faction}
      scope="campaign"
      npcs={npcs}
      save={fields => upsertFaction({ id: faction.id, ...fields } as Parameters<typeof upsertFaction>[0])}
      remove={deleteFaction}
      onDeleted={onDeselect}
      onOpenNPC={onSelect}
    />
  );
}

