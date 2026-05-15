import { useState, useMemo } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { ListDetail, ListRow, Pill, FilterSep, EmptyDetail } from '../ui/ListDetail';
import { Badge } from '../ui/Badge';
import { FormField, inputStyle } from '../FormField';
import { MarkdownEditor } from '../ui/MarkdownEditor';
import { FactionPillSelector } from '../ui/FactionPillSelector';
import { SearchableSelect } from '../ui/SearchableSelect';
import { ActiveToggle } from '../ui/ActiveToggle';
import { getFactionTypeStyle } from '../../lib/theme';
import { useConfirm } from '../../context/ConfirmContext';
import { useStatBlockPanel } from '../../context/StatBlockPanelContext';
import { pushRecent } from '../Sidebar';
import CharacterWeb from './CharacterWeb';
import { SaveBar } from '../ui/SaveBar';
import { useAutoSave } from '../../hooks/useAutoSave';
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

export default function Characters({ viewMode = 'list' }: { viewMode?: string; setViewMode?: (v: string) => void }) {
  return (
    <div style={{ height: '100%', overflow: viewMode === 'list' ? 'hidden' : 'auto' }}>
      {viewMode === 'list' && <CastList />}
      {viewMode === 'web'  && <CharacterWeb />}
    </div>
  );
}

function CastList() {
  const {
    pcs, npcs, factions,
    upsertPC,
    upsertNPC, deleteNPC,
    upsertFaction, deleteFaction,
    monsterStatblocks,
  } = useCampaign();
  const confirm = useConfirm();
  const { openStatBlock } = useStatBlockPanel();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [metFilter, setMetFilter] = useState<MetFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 'npc' | 'faction' | 'pc' | null — shows an inline create form in the detail panel
  const [creating, setCreating] = useState<'npc' | 'faction' | 'pc' | null>(null);

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

  const handleAdd = () => {
    if (filter === 'faction') {
      setCreating('faction');
    } else if (filter === 'npc') {
      setCreating('npc');
    } else {
      setCreating('pc');
    }
    setSelectedId(null);
  };

  return (
    <>
      <ListDetail
        title="Cast"
        count={all.length}
        search={search}
        onSearchChange={setSearch}
        onAdd={handleAdd}
        addLabel={filter === 'faction' ? '+ Faction' : filter === 'npc' ? '+ NPC' : '+ New'}
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
              <ListRow
                key={item.id}
                active={selected?.id === item.id}
                onClick={() => handleSelect(item)}
                glyph={item.glyph}
                title={item.name}
                subtitle={item.subtitle}
                meta={item.meta}
                badges={
                  item.kind === 'npc' && (item.raw as NPC).met_by_pcs
                    ? <Badge color="green">Met</Badge>
                    : undefined
                }
              />
            ))
          )
        }
        detail={
          creating === 'pc' ? (
            <PCCreatePanel
              onCancel={() => setCreating(null)}
              onCreate={async (pc) => { await upsertPC(pc); setCreating(null); }}
            />
          ) : creating === 'npc' ? (
            <NPCCreatePanel
              onCancel={() => setCreating(null)}
              onCreate={async (npc) => { await upsertNPC(npc); setCreating(null); }}
            />
          ) : creating === 'faction' ? (
            <FactionCreatePanel
              onCancel={() => setCreating(null)}
              onCreate={async (f) => { await upsertFaction(f); setCreating(null); }}
            />
          ) : selected ? (
            <CastDetail
              item={selected}
              onDeletePC={async (_id) => {
                const yes = await confirm('Delete this character? This cannot be undone.');
                if (yes) { setSelectedId(null); }
              }}
              onDeleteNPC={async (id) => {
                const yes = await confirm('Delete this NPC?');
                if (yes) { await deleteNPC(id); setSelectedId(null); }
              }}
              onDeleteFaction={async (id) => {
                const yes = await confirm('Delete this faction?');
                if (yes) { await deleteFaction(id); setSelectedId(null); }
              }}
              factions={factions}
              statblocks={monsterStatblocks}
              openStatBlock={openStatBlock}
            />
          ) : (
            <EmptyDetail>Select an entry from the list</EmptyDetail>
          )
        }
      />
    </>
  );
}

/* ── Cast Detail Panel ── */

interface CastDetailProps {
  item: CastItem;
  onDeletePC: (id: string) => Promise<void>;
  onDeleteNPC: (id: string) => Promise<void>;
  onDeleteFaction: (id: string) => Promise<void>;
  factions: Faction[];
  statblocks: { id: string; name: string }[];
  openStatBlock: (id: string) => void;
}

function CastDetail({
  item,
  onDeletePC,
  onDeleteNPC,
  onDeleteFaction,
  factions,
  statblocks,
  openStatBlock,
}: CastDetailProps) {
  if (item.kind === 'pc') return <PCDetail item={item} onDelete={onDeletePC} />;
  if (item.kind === 'npc') return (
    <NPCDetail
      item={item}
      onDelete={onDeleteNPC}
      factions={factions}
      statblocks={statblocks}
      openStatBlock={openStatBlock}
    />
  );
  return (
    <FactionDetail
      item={item}
      onDelete={onDeleteFaction}
    />
  );
}

/* ── PC Detail ── */

type PCForm = {
  character_name: string;
  player_name: string;
  race: string;
  class: string;
  background: string;
  story_hooks: string;
  key_npcs: string;
  dm_notes: string;
  is_active: boolean;
  faction_ids: string[];
  statblock_id: string | null;
};

function PCDetail({ item, onDelete }: { item: CastItem; onDelete: (id: string) => Promise<void> }) {
  const pc = item.raw as PlayerCharacter;
  const { factions, monsterStatblocks, upsertPC, deletePC } = useCampaign();
  const confirm = useConfirm();

  const [form, setForm] = useState<PCForm>({
    character_name: pc.character_name,
    player_name: pc.player_name ?? '',
    race: pc.race ?? '',
    class: pc.class ?? '',
    background: pc.background ?? '',
    story_hooks: pc.story_hooks ?? '',
    key_npcs: pc.key_npcs ?? '',
    dm_notes: pc.dm_notes ?? '',
    is_active: pc.is_active,
    faction_ids: pc.faction_ids ?? [],
    statblock_id: pc.statblock_id ?? null,
  });

  const { status } = useAutoSave({
    data: form,
    onSave: async (data) => {
      await upsertPC({
        id: pc.id,
        character_name: data.character_name.trim() || pc.character_name,
        player_name: data.player_name || null,
        race: data.race || null,
        class: data.class || null,
        background: data.background || null,
        story_hooks: data.story_hooks || null,
        key_npcs: data.key_npcs || null,
        dm_notes: data.dm_notes || null,
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
      await onDelete(pc.id);
    }
  };

  const statblockOptions = monsterStatblocks.map(m => ({ id: m.id, label: m.name }));
  const pcFactions = factions.filter(f => form.faction_ids?.includes(f.id));

  return (
    <div className="cm-detail">
      <SaveBar status={status} onDelete={handleDelete} label="character" />
      <div className="as-ey">Player Character</div>
      <input
        className="as-title"
        value={form.character_name}
        onChange={e => setForm(p => ({ ...p, character_name: e.target.value }))}
        placeholder="Character name…"
      />
      <input
        className="as-sub"
        value={[form.race, form.class].filter(Boolean).join(' · ')}
        readOnly
        placeholder={[form.race || 'Race', form.class || 'Class'].join(' · ')}
        style={{ pointerEvents: 'none', opacity: 0.7 }}
      />

      <div className="as-meta">
        <div className="as-meta-item">
          <span className="as-meta-label">Status</span>
          <ActiveToggle isActive={form.is_active} onChange={v => setForm(p => ({ ...p, is_active: v }))} />
        </div>
        <div className="as-meta-item">
          <span className="as-meta-label">Player</span>
          <input
            className="as-inp"
            style={{ width: 120 }}
            value={form.player_name}
            onChange={e => setForm(p => ({ ...p, player_name: e.target.value }))}
            placeholder="Player name…"
          />
        </div>
      </div>

      <div className="as-grid2" style={{ marginBottom: 12 }}>
        <div className="as-field">
          <label className="as-label">Race</label>
          <input className="as-inp" value={form.race} onChange={e => setForm(p => ({ ...p, race: e.target.value }))} placeholder="e.g. Dwarf" />
        </div>
        <div className="as-field">
          <label className="as-label">Class</label>
          <input className="as-inp" value={form.class} onChange={e => setForm(p => ({ ...p, class: e.target.value }))} placeholder="e.g. Fighter" />
        </div>
      </div>

      <div className="as-sec"><div className="as-sec-row"><span className="as-sec-label">Background</span><span className="as-sec-rule"/></div></div>
      <MarkdownEditor value={form.background} onChange={v => setForm(p => ({ ...p, background: v }))} placeholder="Character background and history…" minHeight="80px" />

      <div className="as-sec"><div className="as-sec-row"><span className="as-sec-label">Story Hooks</span><span className="as-sec-rule"/></div></div>
      <MarkdownEditor value={form.story_hooks} onChange={v => setForm(p => ({ ...p, story_hooks: v }))} placeholder="Personal quests, motivations…" minHeight="60px" />

      <div className="as-sec"><div className="as-sec-row"><span className="as-sec-label">Key NPCs</span><span className="as-sec-rule"/></div></div>
      <MarkdownEditor value={form.key_npcs} onChange={v => setForm(p => ({ ...p, key_npcs: v }))} placeholder="Relationships with NPCs…" minHeight="60px" />

      <div className="as-sec"><div className="as-sec-row"><span className="as-sec-label">DM Notes</span><span className="as-sec-rule"/></div></div>
      <MarkdownEditor value={form.dm_notes} onChange={v => setForm(p => ({ ...p, dm_notes: v }))} placeholder="Private notes, secrets, plans…" minHeight="60px" />

      <div className="as-sec"><div className="as-sec-row"><span className="as-sec-label">Factions</span><span className="as-sec-rule"/></div></div>
      <FactionPillSelector selectedIds={form.faction_ids} onChange={ids => setForm(p => ({ ...p, faction_ids: ids }))} factions={factions} />
      {pcFactions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: 8 }}>
          {pcFactions.map(f => {
            const style = getFactionTypeStyle(f.faction_type);
            return <span key={f.id} className="cm-chip" style={{ borderColor: style.border, color: style.text }}>{f.name}</span>;
          })}
        </div>
      )}

      <div className="as-sec"><div className="as-sec-row"><span className="as-sec-label">Linked Stat Sheet</span><span className="as-sec-rule"/></div></div>
      <SearchableSelect value={form.statblock_id} onChange={id => setForm(p => ({ ...p, statblock_id: id }))} options={statblockOptions} placeholder="Select stat sheet…" searchPlaceholder="Search stat sheets…" />
    </div>
  );
}

/* ── NPC Detail ── */

type NPCForm = {
  name: string;
  role: string;
  affiliation: string;
  location: string;
  status: NPC['status'];
  met_by_pcs: boolean;
  description: string;
  hooks_motivations: string;
  dm_notes: string;
  faction_ids: string[];
  statblock_id: string | null;
};

function NPCDetail({
  item,
  onDelete,
  factions,
  statblocks,
  openStatBlock,
}: {
  item: CastItem;
  onDelete: (id: string) => Promise<void>;
  factions: Faction[];
  statblocks: { id: string; name: string }[];
  openStatBlock: (id: string) => void;
}) {
  const npc = item.raw as NPC;
  const { upsertNPC } = useCampaign();

  const [form, setForm] = useState<NPCForm>({
    name: npc.name,
    role: npc.role ?? '',
    affiliation: npc.affiliation ?? '',
    location: npc.location ?? '',
    status: npc.status,
    met_by_pcs: npc.met_by_pcs,
    description: npc.description ?? '',
    hooks_motivations: npc.hooks_motivations ?? '',
    dm_notes: npc.dm_notes ?? '',
    faction_ids: npc.faction_ids ?? [],
    statblock_id: npc.statblock_id ?? null,
  });

  // Voice state — autosaved to localStorage immediately
  const [voice, setVoice] = useState<VoiceData>(() => loadVoice(npc.id));
  const updateVoice = (patch: Partial<VoiceData>) => {
    const next = { ...voice, ...patch };
    setVoice(next);
    saveVoice(npc.id, next);
  };

  const { status } = useAutoSave({
    data: form,
    onSave: async (data) => {
      await upsertNPC({
        id: npc.id,
        name: data.name.trim() || npc.name,
        role: data.role || null,
        affiliation: data.affiliation || null,
        location: data.location || null,
        status: data.status,
        met_by_pcs: data.met_by_pcs,
        description: data.description || null,
        hooks_motivations: data.hooks_motivations || null,
        dm_notes: data.dm_notes || null,
        faction_ids: data.faction_ids,
        statblock_id: data.statblock_id,
        first_session: npc.first_session,
      });
    },
    delay: 800,
  });

  const npcFactions = factions.filter(f => form.faction_ids?.includes(f.id));

  return (
    <div className="cm-detail">
      <SaveBar status={status} onDelete={() => onDelete(npc.id)} label="NPC" />
      <div className="as-ey">Non-Player Character</div>
      <input
        className="as-title"
        value={form.name}
        onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
        placeholder="NPC name…"
      />
      <input
        className="as-sub"
        value={form.role}
        onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
        placeholder="Role or title…"
      />

      <div className="as-meta">
        <div className="as-meta-item">
          <span className="as-meta-label">Status</span>
          <select className="as-sel" style={{ width: 'auto' }} value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as NPC['status'] }))}>
            <option value="active">Active</option>
            <option value="deceased">Deceased</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
        <div className="as-meta-item">
          <span className="as-meta-label">Met by PCs</span>
          <button
            className={`as-tog${form.met_by_pcs ? ' is-on' : ''}`}
            onClick={() => setForm(p => ({ ...p, met_by_pcs: !p.met_by_pcs }))}
          >
            {form.met_by_pcs ? 'Yes' : 'No'}
          </button>
        </div>
      </div>

      <div className="as-grid2" style={{ marginBottom: 12 }}>
        <div className="as-field">
          <label className="as-label">Affiliation</label>
          <input className="as-inp" value={form.affiliation} onChange={e => setForm(p => ({ ...p, affiliation: e.target.value }))} placeholder="e.g. Merchant Guild" />
        </div>
        <div className="as-field">
          <label className="as-label">Location</label>
          <input className="as-inp" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Velden" />
        </div>
      </div>

      <div className="as-sec"><div className="as-sec-row"><span className="as-sec-label">Description</span><span className="as-sec-rule"/></div></div>
      <MarkdownEditor value={form.description} onChange={v => setForm(p => ({ ...p, description: v }))} placeholder="Physical appearance, personality, quirks…" minHeight="80px" />

      <div className="as-sec"><div className="as-sec-row"><span className="as-sec-label">Hooks &amp; Motivations</span><span className="as-sec-rule"/></div></div>
      <MarkdownEditor value={form.hooks_motivations} onChange={v => setForm(p => ({ ...p, hooks_motivations: v }))} placeholder="What drives this NPC? What plot hooks do they offer?" minHeight="60px" />

      <div className="as-sec"><div className="as-sec-row"><span className="as-sec-label">Voice</span><span className="as-sec-rule"/></div></div>
      <div className="as-grid2">
        <div className="as-field">
          <label className="as-label">Accent</label>
          <input className="as-inp" value={voice.accent ?? ''} onChange={e => updateVoice({ accent: e.target.value })} placeholder="e.g. Gravelly baritone" />
        </div>
        <div className="as-field">
          <label className="as-label">Patterns</label>
          <input className="as-inp" value={voice.patterns ?? ''} onChange={e => updateVoice({ patterns: e.target.value })} placeholder="e.g. Never finishes sentences" />
        </div>
        <div className="as-field">
          <label className="as-label">Signature Phrase</label>
          <input className="as-inp" value={voice.phrase ?? ''} onChange={e => updateVoice({ phrase: e.target.value })} placeholder='e.g. "The gods have long ears…"' />
        </div>
        <div className="as-field">
          <label className="as-label">Tics</label>
          <input className="as-inp" value={voice.tics ?? ''} onChange={e => updateVoice({ tics: e.target.value })} placeholder="e.g. Drums fingers" />
        </div>
      </div>

      <div className="as-sec"><div className="as-sec-row"><span className="as-sec-label">DM Notes</span><span className="as-sec-rule"/></div></div>
      <MarkdownEditor value={form.dm_notes} onChange={v => setForm(p => ({ ...p, dm_notes: v }))} placeholder="Private DM notes…" minHeight="60px" />

      <div className="as-sec"><div className="as-sec-row"><span className="as-sec-label">Factions</span><span className="as-sec-rule"/></div></div>
      <FactionPillSelector selectedIds={form.faction_ids} onChange={ids => setForm(p => ({ ...p, faction_ids: ids }))} factions={factions} />
      {npcFactions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: 8 }}>
          {npcFactions.map(f => {
            const style = getFactionTypeStyle(f.faction_type);
            return <span key={f.id} className="cm-chip" style={{ borderColor: style.border, color: style.text }}>{f.name}</span>;
          })}
        </div>
      )}

      {form.statblock_id && (
        <>
          <div className="as-sec"><div className="as-sec-row"><span className="as-sec-label">Stat Sheet</span><span className="as-sec-rule"/></div></div>
          <button className="cm-pill is-active" onClick={() => openStatBlock(form.statblock_id!)}>
            {statblocks.find(s => s.id === form.statblock_id)?.name ?? 'View Stat Sheet'}
          </button>
        </>
      )}

      {npc.first_session && (
        <div style={{ marginTop: 16, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          First appeared: Session #{npc.first_session}
        </div>
      )}
    </div>
  );
}

/* ── Faction Detail ── */

const FACTION_TYPES = ['guild', 'government', 'religious', 'criminal', 'military', 'arcane', 'merchant', 'other'];

type FactionForm = {
  name: string;
  faction_type: string;
  overview: string;
  key_figures: string;
  agenda: string;
  dm_notes: string;
};

function FactionDetail({
  item,
  onDelete,
}: {
  item: CastItem;
  onDelete: (id: string) => Promise<void>;
}) {
  const faction = item.raw as Faction;
  const { upsertFaction } = useCampaign();

  const [form, setForm] = useState<FactionForm>({
    name: faction.name,
    faction_type: faction.faction_type ?? 'other',
    overview: faction.overview ?? '',
    key_figures: faction.key_figures ?? '',
    agenda: faction.agenda ?? '',
    dm_notes: faction.dm_notes ?? '',
  });

  const { status } = useAutoSave({
    data: form,
    onSave: async (data) => {
      await upsertFaction({
        id: faction.id,
        name: data.name.trim() || faction.name,
        faction_type: data.faction_type,
        overview: data.overview || null,
        key_figures: data.key_figures || null,
        agenda: data.agenda || null,
        dm_notes: data.dm_notes || null,
      });
    },
    delay: 800,
  });

  return (
    <div className="cm-detail">
      <SaveBar status={status} onDelete={() => onDelete(faction.id)} label="faction" />
      <div className="as-ey">Faction</div>
      <input
        className="as-title"
        value={form.name}
        onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
        placeholder="Faction name…"
      />

      <div className="as-meta">
        <div className="as-meta-item">
          <span className="as-meta-label">Type</span>
          <select className="as-sel" style={{ width: 'auto' }} value={form.faction_type} onChange={e => setForm(p => ({ ...p, faction_type: e.target.value }))}>
            {FACTION_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
      </div>

      <div className="as-sec"><div className="as-sec-row"><span className="as-sec-label">Overview</span><span className="as-sec-rule"/></div></div>
      <MarkdownEditor value={form.overview} onChange={v => setForm(p => ({ ...p, overview: v }))} placeholder="What is this faction about?" minHeight="80px" />

      <div className="as-sec"><div className="as-sec-row"><span className="as-sec-label">Key Figures</span><span className="as-sec-rule"/></div></div>
      <MarkdownEditor value={form.key_figures} onChange={v => setForm(p => ({ ...p, key_figures: v }))} placeholder="Important members…" minHeight="60px" />

      <div className="as-sec"><div className="as-sec-row"><span className="as-sec-label">Agenda</span><span className="as-sec-rule"/></div></div>
      <MarkdownEditor value={form.agenda} onChange={v => setForm(p => ({ ...p, agenda: v }))} placeholder="Goals and plans…" minHeight="60px" />

      <div className="as-sec"><div className="as-sec-row"><span className="as-sec-label">DM Notes</span><span className="as-sec-rule"/></div></div>
      <MarkdownEditor value={form.dm_notes} onChange={v => setForm(p => ({ ...p, dm_notes: v }))} placeholder="Hidden agendas, secrets…" minHeight="60px" />
    </div>
  );
}

/* ── Inline Create Panels ── */

function PCCreatePanel({ onCancel, onCreate }: { onCancel: () => void; onCreate: (pc: Parameters<ReturnType<typeof useCampaign>['upsertPC']>[0]) => Promise<void> }) {
  const [name, setName] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [race, setRace] = useState('');
  const [cls, setCls] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onCreate({
      character_name: name.trim(),
      player_name: playerName || null,
      race: race || null,
      class: cls || null,
      background: null, story_hooks: null, key_npcs: null, dm_notes: null,
      is_active: true, faction_ids: [], statblock_id: null,
    });
    setSaving(false);
  };

  return (
    <div className="cm-detail">
      <div className="as-ey">Player Character</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <FormField label="Character Name"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="e.g. Thorin Ironforge" /></FormField>
          <FormField label="Player Name"><input style={inputStyle} value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="e.g. John" /></FormField>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <FormField label="Race"><input style={inputStyle} value={race} onChange={e => setRace(e.target.value)} placeholder="e.g. Dwarf" /></FormField>
          <FormField label="Class"><input style={inputStyle} value={cls} onChange={e => setCls(e.target.value)} placeholder="e.g. Fighter" /></FormField>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="text-sm px-4 py-2 rounded font-semibold" style={{ backgroundColor: '#a07830', color: '#e8dcc4', border: 'none', cursor: 'pointer', fontFamily: 'var(--serif)' }} onClick={handleCreate} disabled={!name.trim() || saving}>{saving ? 'Creating…' : 'Create Character'}</button>
          <button className="text-sm px-4 py-2 rounded" style={{ color: '#b9ac90', border: '1px solid #2e2820', background: 'none', cursor: 'pointer' }} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function NPCCreatePanel({ onCancel, onCreate }: { onCancel: () => void; onCreate: (npc: Parameters<ReturnType<typeof useCampaign>['upsertNPC']>[0]) => Promise<void> }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onCreate({ name: name.trim(), role: role || null, affiliation: null, status: 'active', description: description || null, hooks_motivations: null, dm_notes: null, location: null, first_session: null, met_by_pcs: false, faction_ids: [], statblock_id: null });
    setSaving(false);
  };

  return (
    <div className="cm-detail">
      <div className="as-ey">Non-Player Character</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <FormField label="Name"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="NPC name" /></FormField>
          <FormField label="Role"><input style={inputStyle} value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Tavern keeper" /></FormField>
        </div>
        <FormField label="Description"><MarkdownEditor value={description} onChange={setDescription} placeholder="First impressions, appearance..." minHeight="100px" /></FormField>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="text-sm px-4 py-2 rounded font-semibold" style={{ backgroundColor: '#a07830', color: '#e8dcc4', border: 'none', cursor: 'pointer', fontFamily: 'var(--serif)' }} onClick={handleCreate} disabled={!name.trim() || saving}>{saving ? 'Creating…' : 'Create NPC'}</button>
          <button className="text-sm px-4 py-2 rounded" style={{ color: '#b9ac90', border: '1px solid #2e2820', background: 'none', cursor: 'pointer' }} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function FactionCreatePanel({ onCancel, onCreate }: { onCancel: () => void; onCreate: (f: Parameters<ReturnType<typeof useCampaign>['upsertFaction']>[0]) => Promise<void> }) {
  const [name, setName] = useState('');
  const [factionType, setFactionType] = useState('guild');
  const [overview, setOverview] = useState('');
  const [saving, setSaving] = useState(false);
  const TYPES = ['guild', 'government', 'religious', 'criminal', 'military', 'arcane', 'merchant', 'other'];

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onCreate({ name: name.trim(), faction_type: factionType, overview: overview || null, key_figures: null, agenda: null, dm_notes: null });
    setSaving(false);
  };

  return (
    <div className="cm-detail">
      <div className="as-ey">Faction</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <FormField label="Name"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="Faction name" /></FormField>
          <FormField label="Type">
            <select style={inputStyle} value={factionType} onChange={e => setFactionType(e.target.value)}>
              {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </FormField>
        </div>
        <FormField label="Overview"><MarkdownEditor value={overview} onChange={setOverview} placeholder="What is this faction about?" minHeight="100px" /></FormField>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="text-sm px-4 py-2 rounded font-semibold" style={{ backgroundColor: '#a07830', color: '#e8dcc4', border: 'none', cursor: 'pointer', fontFamily: 'var(--serif)' }} onClick={handleCreate} disabled={!name.trim() || saving}>{saving ? 'Creating…' : 'Create Faction'}</button>
          <button className="text-sm px-4 py-2 rounded" style={{ color: '#b9ac90', border: '1px solid #2e2820', background: 'none', cursor: 'pointer' }} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
