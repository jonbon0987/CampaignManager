import { useState, useMemo, useEffect } from 'react';
import { useReportRecord } from '../../context/NavigationContext';
import { useCampaign } from '../../context/CampaignContext';
import { useWorld } from '../../context/WorldContext';
import { ListDetail, ListRow, EmptyDetail, Pill, FilterSep } from '../ui/ListDetail';
import { Badge } from '../ui/Badge';
import type { Origin } from '../ui/OriginBand';
import { FactionPillSelector } from '../ui/FactionPillSelector';
import { SearchableSelect } from '../ui/SearchableSelect';
import { useConfirm } from '../../context/ConfirmContext';
import { useStatBlockPanel } from '../../context/StatBlockPanelContext';
import { pushRecent } from '../../lib/recent';
import CharacterWeb from './CharacterWeb';
import { useAutoSave } from '../../hooks/useAutoSave';
import { markDraft, useDiscardBlankDraft } from '../../hooks/useDiscardBlankDraft';
import { OverflowMenu } from '../ui/OverflowMenu';
import { SlashField } from '../ui/SlashField';
import { limitFor, minFor, maxFor } from '../../lib/fieldLimits';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import { ListRowWithHover } from '../HoverPreview';
import { SessionHistory } from '../session/SessionHistory';
import { SessionUpdateBand } from '../session/SessionUpdateBand';
import { NPCEditor } from '../entity/NPCEditor';
import { FactionEditor } from '../entity/FactionEditor';
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
        subtitle: [npc.role, npc.affiliation].filter(Boolean).join(' · '),
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
      addLabel={filter === 'faction' ? '+ Faction' : filter === 'npc' ? '+ NPC' : filter === 'pc' ? '+ PC' : '+ New'}
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
    <PCDetail item={item} factions={factions} statblocks={statblocks} onDeselect={onDeselect} />
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
  const { upsertNPC, deleteNPC, linkedNPCIds, linkNPCToCampaign, unlinkNPCFromCampaign } = useCampaign();
  const { activeWorldId, backToWorld, setWorldTab, setSelected: setWorldSelected } = useWorld();
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
      statblocks={statblocks}
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

const isEmpty = (v: string | null | undefined) => !v?.trim();

/* ── PC Detail ── */

type PCFormData = {
  character_name: string;
  player_name: string | null;
  race: string | null;
  class: string | null;
  background: string | null;
  story_hooks: string | null;
  key_npcs: string | null;
  dm_notes: string | null;
  is_active: boolean;
  faction_ids: string[];
  statblock_id: string | null;
  level: number | null;
  max_hp: number | null;
  armor_class: number | null;
};

function PCDetail({
  item,
  factions,
  statblocks,
  onDeselect,
}: {
  item: CastItem;
  factions: Faction[];
  statblocks: { id: string; name: string }[];
  onDeselect: () => void;
}) {
  const pc = item.raw as PlayerCharacter;
  const { upsertPC, deletePC } = useCampaign();
  const confirm = useConfirm();

  const [form, setForm] = useState<PCFormData>({
    character_name: pc.character_name,
    player_name: pc.player_name,
    race: pc.race,
    class: pc.class,
    background: pc.background,
    story_hooks: pc.story_hooks,
    key_npcs: pc.key_npcs,
    dm_notes: pc.dm_notes,
    is_active: pc.is_active,
    faction_ids: pc.faction_ids ?? [],
    statblock_id: pc.statblock_id,
    level: pc.level,
    max_hp: pc.max_hp,
    armor_class: pc.armor_class,
  });

  useEffect(() => {
    setForm({
      character_name: pc.character_name,
      player_name: pc.player_name,
      race: pc.race,
      class: pc.class,
      background: pc.background,
      story_hooks: pc.story_hooks,
      key_npcs: pc.key_npcs,
      dm_notes: pc.dm_notes,
      is_active: pc.is_active,
      faction_ids: pc.faction_ids ?? [],
      statblock_id: pc.statblock_id,
      level: pc.level,
      max_hp: pc.max_hp,
      armor_class: pc.armor_class,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pc.id]);

  const { status, saveNow } = useAutoSave({
    data: form,
    onSave: async (data) => {
      await upsertPC({
        id: pc.id,
        character_name: data.character_name,
        player_name: data.player_name,
        race: data.race,
        class: data.class,
        level: data.level,
        max_hp: data.max_hp,
        armor_class: data.armor_class,
        background: data.background,
        story_hooks: data.story_hooks,
        key_npcs: data.key_npcs,
        dm_notes: data.dm_notes,
        is_active: data.is_active,
        faction_ids: data.faction_ids,
        statblock_id: data.statblock_id,
      });
    },
    delay: 800,
  });

  const handleDelete = async () => {
    if (await confirm('Delete this character? This cannot be undone.')) {
      await deletePC(pc.id);
      onDeselect();
    }
  };

  useDiscardBlankDraft(pc.id, isEmpty(form.character_name) && isEmpty(form.player_name) && isEmpty(form.race) && isEmpty(form.class)
    && isEmpty(form.background) && isEmpty(form.story_hooks) && isEmpty(form.key_npcs) && isEmpty(form.dm_notes), deletePC);

  const set = <K extends keyof PCFormData>(key: K, val: PCFormData[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  const statblockOptions = statblocks.map(m => ({ id: m.id, label: m.name }));

  return (
    <div className="cm-detail">
      {/* Action bar */}
      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        <OverflowMenu items={[
          { label: 'Delete Character', danger: true, onClick: handleDelete },
        ]} />
      </div>

      <SessionUpdateBand entityType="pc" entityId={pc.id} />

      {/* Eyebrow */}
      <div className="cm-eyebrow">Player Character</div>

      {/* Title + subtitle inputs */}
      <input
        className="as-title"
        value={form.character_name}
        onChange={e => set('character_name', e.target.value)}
        placeholder="Character name…"
        maxLength={limitFor('player_characters', 'character_name')}
      />
      <input
        className="as-sub"
        value={form.player_name ?? ''}
        onChange={e => set('player_name', e.target.value || null)}
        placeholder="Player name…"
        maxLength={limitFor('player_characters', 'player_name')}
      />

      {/* Active toggle */}
      <div className="as-meta">
        <div className="as-mi">
          <span className="as-ml">Active</span>
          <button
            className={`as-tog${form.is_active ? ' is-on' : ''}`}
            onClick={() => set('is_active', !form.is_active)}
          >
            {form.is_active ? 'Active' : 'Inactive'}
          </button>
        </div>
      </div>

      {/* Core stat grid */}
      <div className="as-grid-2">
        <div className="as-fl">
          <label className="as-ll">Race</label>
          <input
            className="as-input"
            value={form.race ?? ''}
            onChange={e => set('race', e.target.value || null)}
            placeholder="e.g. Dwarf"
            maxLength={limitFor('player_characters', 'race')}
          />
        </div>
        <div className="as-fl">
          <label className="as-ll">Class</label>
          <input
            className="as-input"
            value={form.class ?? ''}
            onChange={e => set('class', e.target.value || null)}
            placeholder="e.g. Fighter"
            maxLength={limitFor('player_characters', 'class')}
          />
        </div>
      </div>

      {/* Combat numbers: they fill in the initiative tracker */}
      <div className="as-grid-3">
        {([
          ['level', 'Level', 'e.g. 5'],
          ['max_hp', 'Max HP', 'e.g. 38'],
          ['armor_class', 'AC', 'e.g. 16'],
        ] as const).map(([key, label, hint]) => (
          <div key={key} className="as-fl">
            <label className="as-ll" htmlFor={`pc-${key}`}>{label}</label>
            <input
              id={`pc-${key}`}
              className="as-input"
              type="number"
              inputMode="numeric"
              min={minFor('player_characters', key)}
              max={maxFor('player_characters', key)}
              value={form[key] ?? ''}
              onChange={e => set(key, e.target.value ? parseInt(e.target.value, 10) : null)}
              placeholder={hint}
            />
          </div>
        ))}
      </div>

      {/* Background */}
      <div className="as-fl">
        <label className="as-ll">Background</label>
        <SlashField
          value={form.background ?? ''}
          onChange={v => set('background', v || null)}
          placeholder="Character background and history…"
          minHeight="120px"
          maxLength={limitFor('player_characters', 'background')}
        />
      </div>

      {/* Story Hooks */}
      <div className="as-fl">
        <label className="as-ll">Story Hooks</label>
        <SlashField
          value={form.story_hooks ?? ''}
          onChange={v => set('story_hooks', v || null)}
          placeholder="Personal quests, motivations…"
          minHeight="96px"
          maxLength={limitFor('player_characters', 'story_hooks')}
        />
      </div>

      {/* Key NPCs */}
      <div className="as-fl">
        <label className="as-ll">Key NPCs</label>
        <SlashField
          value={form.key_npcs ?? ''}
          onChange={v => set('key_npcs', v || null)}
          placeholder="Relationships with NPCs…"
          minHeight="96px"
          maxLength={limitFor('player_characters', 'key_npcs')}
        />
      </div>

      {/* DM Notes */}
      <div className="as-fl">
        <label className="as-ll">DM Notes</label>
        <SlashField
          value={form.dm_notes ?? ''}
          onChange={v => set('dm_notes', v || null)}
          placeholder="Private notes, secrets, plans…"
          minHeight="96px"
          maxLength={limitFor('player_characters', 'dm_notes')}
        />
      </div>

      {/* Factions */}
      <div className="as-fl">
        <label className="as-ll">Factions</label>
        <FactionPillSelector
          selectedIds={form.faction_ids}
          onChange={ids => set('faction_ids', ids)}
          factions={factions}
        />
      </div>

      {/* Stat block */}
      <div className="as-fl">
        <label className="as-ll">Linked Stat Sheet</label>
        <SearchableSelect
          value={form.statblock_id}
          onChange={id => set('statblock_id', id)}
          options={statblockOptions}
          placeholder="Select stat sheet…"
          searchPlaceholder="Search stat sheets…"
        />
      </div>

      <div className="as-fl">
        <label className="as-ll">Session History</label>
        <SessionHistory entityType="pc" entityId={pc.id} />
      </div>
    </div>
  );
}
