import { useState, useMemo, useEffect } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useWorld } from '../../context/WorldContext';
import { ListDetail, ListRow, EmptyDetail, Pill, FilterSep } from '../ui/ListDetail';
import { Badge } from '../ui/Badge';
import { OriginBand, type Origin } from '../ui/OriginBand';
import { Button } from '../ui/Button';
import { FactionPillSelector } from '../ui/FactionPillSelector';
import { SearchableSelect } from '../ui/SearchableSelect';
import { getFactionTypeStyle } from '../../lib/theme';
import { useConfirm } from '../../context/ConfirmContext';
import { useStatBlockPanel } from '../../context/StatBlockPanelContext';
import { pushRecent } from '../Sidebar';
import CharacterWeb from './CharacterWeb';
import { useAutoSave } from '../../hooks/useAutoSave';
import { OverflowMenu } from '../ui/OverflowMenu';
import { SlashField } from '../ui/SlashField';
import { limitFor, minFor, maxFor } from '../../lib/fieldLimits';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import { ListRowWithHover } from '../HoverPreview';
import type { NPC, Faction, PlayerCharacter } from '../../lib/database.types';

// ── Voice data stored in localStorage keyed by NPC id ────────────────────────
interface VoiceData { accent?: string; patterns?: string; phrase?: string; tics?: string; }
const VOICE_KEY = (id: string) => `npc-voice-${id}`;
function loadVoice(id: string): VoiceData { try { return JSON.parse(localStorage.getItem(VOICE_KEY(id)) ?? '{}'); } catch { return {}; } }
function saveVoice(id: string, v: VoiceData) { localStorage.setItem(VOICE_KEY(id), JSON.stringify(v)); }

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

  // Open a record requested from outside the tab (e.g. the sidebar "Recent"
  // list), then clear the request so it doesn't re-fire. Syncing selection to an
  // incoming external request is the legitimate case for setState in an effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (openId) { setSelectedId(openId); onOpenConsumed?.(); }
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
    setSelectedId(result.id);
  };
  const addPC = async () => {
    const result = await upsertPC({ character_name: '', is_active: true, faction_ids: [] });
    setSelectedId(result.id);
  };
  const addNPC = async () => {
    const result = await upsertNPC({ name: '', status: 'active', met_by_pcs: false, faction_ids: [] });
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
            item={selected}
            factions={factions}
            statblocks={monsterStatblocks}
            openStatBlock={openStatBlock}
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
  onDeselect: () => void;
}

function CastDetail({ item, factions, statblocks, openStatBlock, onDeselect }: CastDetailProps) {
  if (item.kind === 'pc') return (
    <PCDetail item={item} factions={factions} statblocks={statblocks} onDeselect={onDeselect} />
  );
  if (item.kind === 'npc') return (
    <NPCDetail
      item={item}
      factions={factions}
      statblocks={statblocks}
      openStatBlock={openStatBlock}
      onDeselect={onDeselect}
    />
  );
  return (
    <FactionDetail item={item} onDeselect={onDeselect} />
  );
}

/* ── NPC Detail ── */

type NPCFormData = {
  name: string;
  role: string | null;
  affiliation: string | null;
  status: NPC['status'];
  description: string | null;
  hooks_motivations: string | null;
  dm_notes: string | null;
  location: string | null;
  first_session: number | null;
  met_by_pcs: boolean;
  faction_ids: string[];
  statblock_id: string | null;
};

function NPCDetail({
  item,
  factions,
  statblocks,
  openStatBlock,
  onDeselect,
}: {
  item: CastItem;
  factions: Faction[];
  statblocks: { id: string; name: string }[];
  openStatBlock: (id: string) => void;
  onDeselect: () => void;
}) {
  const npc = item.raw as NPC;
  const { upsertNPC, deleteNPC, linkedNPCIds, linkNPCToCampaign, unlinkNPCFromCampaign } = useCampaign();
  const { activeWorldId, backToWorld, setWorldTab, setSelected: setWorldSelected } = useWorld();
  const confirm = useConfirm();

  // Imported (linked from world canon) vs. local (this campaign only). Drives the
  // provenance banner AND the save scope: editing an imported NPC must write to
  // the canon row ('global'), not accidentally re-scope it to this campaign.
  const origin: Origin = linkedNPCIds.includes(npc.id) ? 'imported' : 'local';

  const [form, setForm] = useState<NPCFormData>({
    name: npc.name,
    role: npc.role,
    affiliation: npc.affiliation,
    status: npc.status,
    description: npc.description,
    hooks_motivations: npc.hooks_motivations,
    dm_notes: npc.dm_notes,
    location: npc.location,
    first_session: npc.first_session,
    met_by_pcs: npc.met_by_pcs,
    faction_ids: npc.faction_ids ?? [],
    statblock_id: npc.statblock_id,
  });

  useEffect(() => {
    setForm({
      name: npc.name,
      role: npc.role,
      affiliation: npc.affiliation,
      status: npc.status,
      description: npc.description,
      hooks_motivations: npc.hooks_motivations,
      dm_notes: npc.dm_notes,
      location: npc.location,
      first_session: npc.first_session,
      met_by_pcs: npc.met_by_pcs,
      faction_ids: npc.faction_ids ?? [],
      statblock_id: npc.statblock_id,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [npc.id]);

  const { status, saveNow } = useAutoSave({
    data: form,
    onSave: async (data) => {
      await upsertNPC({
        id: npc.id,
        name: data.name,
        role: data.role,
        affiliation: data.affiliation,
        status: data.status,
        description: data.description,
        hooks_motivations: data.hooks_motivations,
        dm_notes: data.dm_notes,
        location: data.location,
        first_session: data.first_session,
        met_by_pcs: data.met_by_pcs,
        faction_ids: data.faction_ids,
        statblock_id: data.statblock_id,
      }, origin === 'imported' ? 'global' : 'campaign');
    },
    delay: 800,
  });

  // Voice state (localStorage only)
  const [voice, setVoice] = useState<VoiceData>(() => loadVoice(npc.id));
  useEffect(() => { setVoice(loadVoice(npc.id)); }, [npc.id]);

  const handleVoiceChange = (field: keyof VoiceData, val: string) => {
    const updated = { ...voice, [field]: val || undefined };
    setVoice(updated);
    saveVoice(npc.id, updated);
  };

  const handleDelete = async () => {
    const yes = await confirm('Delete this NPC?', 'This cannot be undone.');
    if (yes) {
      await deleteNPC(npc.id);
      onDeselect();
    }
  };

  // Provenance actions (mirror Lore/Locations): jump to the canon NPC, promote a
  // local NPC into shared canon, or detach a linked one back to this campaign only.
  const openInCanon = () => {
    setWorldSelected('npcs', npc.id);
    setWorldTab('npcs');
    backToWorld();
  };
  const publishToCanon = async () => {
    await upsertNPC({
      id: npc.id,
      name: form.name, role: form.role, affiliation: form.affiliation, status: form.status,
      description: form.description, hooks_motivations: form.hooks_motivations, dm_notes: form.dm_notes,
      location: form.location, first_session: form.first_session, met_by_pcs: form.met_by_pcs,
      faction_ids: form.faction_ids, statblock_id: form.statblock_id,
      world_id: activeWorldId || npc.world_id || null,
    }, 'global');
    await linkNPCToCampaign(npc.id); // keep it visible in this campaign after promoting
  };
  const detachFromCanon = async () => {
    await unlinkNPCFromCampaign(npc.id);
    onDeselect();
  };

  const statblockOptions = statblocks.map(m => ({ id: m.id, label: m.name }));

  const set = <K extends keyof NPCFormData>(key: K, val: NPCFormData[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="as-detail-root">
      <OriginBand origin={origin} noun="NPC" onOpenInCanon={openInCanon} onPublish={publishToCanon} onDetach={detachFromCanon} />

      {/* Action bar */}
      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        <OverflowMenu items={[
          { label: 'Delete NPC', danger: true, onClick: handleDelete },
        ]} />
      </div>

      {/* Eyebrow */}
      <div className="cm-eyebrow">Non-Player Character</div>

      {/* Title + subtitle inputs */}
      <input
        className="as-title"
        value={form.name}
        onChange={e => set('name', e.target.value)}
        placeholder="Character name…"
        maxLength={limitFor('npcs', 'name')}
      />
      <input
        className="as-sub"
        value={form.role ?? ''}
        onChange={e => set('role', e.target.value || null)}
        placeholder="Role or title…"
        maxLength={limitFor('npcs', 'role')}
      />

      {/* Meta strip: status pills + met toggle */}
      <div className="as-meta">
        <div className="as-mi">
          <span className="as-ml">Status</span>
          <div className="as-pills">
            {(['active', 'deceased', 'unknown'] as NPC['status'][]).map(s => (
              <button
                key={s}
                className={`as-pill-opt${form.status === s ? ' is-active' : ''}`}
                onClick={() => set('status', s)}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="as-mi">
          <span className="as-ml">Met by PCs</span>
          <button
            className={`as-tog${form.met_by_pcs ? ' is-on' : ''}`}
            onClick={() => set('met_by_pcs', !form.met_by_pcs)}
          >
            {form.met_by_pcs ? 'Yes' : 'No'}
          </button>
        </div>
      </div>

      {/* Short fields */}
      <div className="as-grid-2">
        <div className="as-fl">
          <label className="as-ll">Affiliation</label>
          <input
            className="as-input"
            value={form.affiliation ?? ''}
            onChange={e => set('affiliation', e.target.value || null)}
            placeholder="Guild, city, group…"
            maxLength={limitFor('npcs', 'affiliation')}
          />
        </div>
        <div className="as-fl">
          <label className="as-ll">Location</label>
          <input
            className="as-input"
            value={form.location ?? ''}
            onChange={e => set('location', e.target.value || null)}
            placeholder="Where found…"
            maxLength={limitFor('npcs', 'location')}
          />
        </div>
        <div className="as-fl">
          <label className="as-ll">First Session #</label>
          <input
            className="as-input"
            type="number"
            min={minFor('npcs', 'first_session')}
            max={maxFor('npcs', 'first_session')}
            value={form.first_session ?? ''}
            onChange={e => set('first_session', e.target.value ? parseInt(e.target.value, 10) : null)}
            placeholder="e.g. 3"
          />
        </div>
      </div>

      {/* Description */}
      <div className="as-fl">
        <label className="as-ll">Description</label>
        <SlashField
          value={form.description ?? ''}
          onChange={v => set('description', v || null)}
          placeholder="Physical appearance, personality, quirks…"
          minHeight="120px"
          maxLength={limitFor('npcs', 'description')}
        />
      </div>

      {/* Hooks & Motivations */}
      <div className="as-fl">
        <label className="as-ll">Hooks &amp; Motivations</label>
        <SlashField
          value={form.hooks_motivations ?? ''}
          onChange={v => set('hooks_motivations', v || null)}
          placeholder="What drives this NPC? What plot hooks do they offer?"
          minHeight="96px"
          maxLength={limitFor('npcs', 'hooks_motivations')}
        />
      </div>

      {/* Voice (localStorage) */}
      <div className="as-fl">
        <label className="as-ll">Voice</label>
        <div className="as-grid-2">
          <div className="as-fl">
            <label className="as-ll">Accent &amp; Delivery</label>
            <input
              className="as-input"
              value={voice.accent ?? ''}
              onChange={e => handleVoiceChange('accent', e.target.value)}
              placeholder="e.g. Gravelly baritone, speaks slowly"
            />
          </div>
          <div className="as-fl">
            <label className="as-ll">Speech Patterns</label>
            <input
              className="as-input"
              value={voice.patterns ?? ''}
              onChange={e => handleVoiceChange('patterns', e.target.value)}
              placeholder="e.g. Never finishes sentences"
            />
          </div>
          <div className="as-fl">
            <label className="as-ll">Signature Phrase</label>
            <input
              className="as-input"
              value={voice.phrase ?? ''}
              onChange={e => handleVoiceChange('phrase', e.target.value)}
              placeholder='e.g. "The gods have long ears…"'
            />
          </div>
          <div className="as-fl">
            <label className="as-ll">Personality Tics</label>
            <input
              className="as-input"
              value={voice.tics ?? ''}
              onChange={e => handleVoiceChange('tics', e.target.value)}
              placeholder="e.g. Drums fingers, avoids eye contact"
            />
          </div>
        </div>
      </div>

      {/* DM Notes */}
      <div className="as-fl">
        <label className="as-ll">DM Notes</label>
        <SlashField
          value={form.dm_notes ?? ''}
          onChange={v => set('dm_notes', v || null)}
          placeholder="Private notes, secrets, plans…"
          minHeight="96px"
          maxLength={limitFor('npcs', 'dm_notes')}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SearchableSelect
            value={form.statblock_id}
            onChange={id => set('statblock_id', id)}
            options={statblockOptions}
            placeholder="Select stat sheet…"
            searchPlaceholder="Search stat sheets…"
          />
          {form.statblock_id && (
            <Button variant="primary" size="xs" onClick={() => openStatBlock(form.statblock_id!)}>
              View
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

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
        level: pc.level,
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

  const set = <K extends keyof PCFormData>(key: K, val: PCFormData[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  const statblockOptions = statblocks.map(m => ({ id: m.id, label: m.name }));

  return (
    <div className="as-detail-root">
      {/* Action bar */}
      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        <OverflowMenu items={[
          { label: 'Delete Character', danger: true, onClick: handleDelete },
        ]} />
      </div>

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
    </div>
  );
}

/* ── Faction Detail ── */

type FactionFormData = {
  name: string;
  faction_type: string | null;
  overview: string | null;
  key_figures: string | null;
  agenda: string | null;
  dm_notes: string | null;
};

const FACTION_TYPES = ['government', 'religious', 'criminal', 'military', 'scholarly', 'merchant', 'guild', 'arcane', 'other'];

function FactionDetail({
  item,
  onDeselect,
}: {
  item: CastItem;
  onDeselect: () => void;
}) {
  const faction = item.raw as Faction;
  const { upsertFaction, deleteFaction } = useCampaign();
  const confirm = useConfirm();

  const [form, setForm] = useState<FactionFormData>({
    name: faction.name,
    faction_type: faction.faction_type,
    overview: faction.overview,
    key_figures: faction.key_figures,
    agenda: faction.agenda,
    dm_notes: faction.dm_notes,
  });

  useEffect(() => {
    setForm({
      name: faction.name,
      faction_type: faction.faction_type,
      overview: faction.overview,
      key_figures: faction.key_figures,
      agenda: faction.agenda,
      dm_notes: faction.dm_notes,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faction.id]);

  const { status, saveNow } = useAutoSave({
    data: form,
    onSave: async (data) => {
      await upsertFaction({
        id: faction.id,
        name: data.name,
        faction_type: data.faction_type,
        overview: data.overview,
        key_figures: data.key_figures,
        agenda: data.agenda,
        dm_notes: data.dm_notes,
      });
    },
    delay: 800,
  });

  const handleDelete = async () => {
    const yes = await confirm('Delete this faction?', 'This cannot be undone.');
    if (yes) {
      await deleteFaction(faction.id);
      onDeselect();
    }
  };

  const set = <K extends keyof FactionFormData>(key: K, val: FactionFormData[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="as-detail-root">
      {/* Action bar */}
      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        <OverflowMenu items={[
          { label: 'Delete Faction', danger: true, onClick: handleDelete },
        ]} />
      </div>

      {/* Eyebrow */}
      <div className="cm-eyebrow">Faction</div>

      {/* Name */}
      <input
        className="as-title"
        value={form.name}
        onChange={e => set('name', e.target.value)}
        placeholder="Faction name…"
        maxLength={limitFor('factions', 'name')}
      />

      {/* Type select */}
      <div className="as-fl">
        <label className="as-ll">Type</label>
        <select
          className="as-select"
          value={form.faction_type ?? 'other'}
          onChange={e => set('faction_type', e.target.value)}
        >
          {FACTION_TYPES.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Overview */}
      <div className="as-fl">
        <label className="as-ll">Overview</label>
        <SlashField
          value={form.overview ?? ''}
          onChange={v => set('overview', v || null)}
          placeholder="What is this faction about?"
          minHeight="120px"
          maxLength={limitFor('factions', 'overview')}
        />
      </div>

      {/* Key Figures */}
      <div className="as-fl">
        <label className="as-ll">Key Figures</label>
        <SlashField
          value={form.key_figures ?? ''}
          onChange={v => set('key_figures', v || null)}
          placeholder="Important members…"
          minHeight="96px"
          maxLength={limitFor('factions', 'key_figures')}
        />
      </div>

      {/* Agenda */}
      <div className="as-fl">
        <label className="as-ll">Agenda</label>
        <SlashField
          value={form.agenda ?? ''}
          onChange={v => set('agenda', v || null)}
          placeholder="Goals and plans…"
          minHeight="96px"
          maxLength={limitFor('factions', 'agenda')}
        />
      </div>

      {/* DM Notes */}
      <div className="as-fl">
        <label className="as-ll">DM Notes</label>
        <SlashField
          value={form.dm_notes ?? ''}
          onChange={v => set('dm_notes', v || null)}
          placeholder="Hidden agendas, secrets…"
          minHeight="96px"
          maxLength={limitFor('factions', 'dm_notes')}
        />
      </div>
    </div>
  );
}
