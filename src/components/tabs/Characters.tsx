import { useState, useMemo } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { ListDetail, ListRow, DetailPanel, DetailSection, Pill, FilterSep, EmptyDetail } from '../ui/ListDetail';
import { MarkdownContent } from '../ui/MarkdownContent';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { PCEditModal } from '../PCEditModal';
import { Modal } from '../Modal';
import { FormField, inputStyle } from '../FormField';
import { MarkdownEditor } from '../ui/MarkdownEditor';
import { FactionPillSelector } from '../ui/FactionPillSelector';
import { SearchableSelect } from '../ui/SearchableSelect';
import { EntityLinkToolbar } from '../ui/EntityLinkToolbar';
import { insertAtCursor } from '../../lib/textUtils';
import { getFactionTypeStyle } from '../../lib/theme';
import { useConfirm } from '../../context/ConfirmContext';
import { useStatBlockPanel } from '../../context/StatBlockPanelContext';
import { pushRecent } from '../Sidebar';
import CharacterWeb from './CharacterWeb';
import type { NPC, Faction } from '../../lib/database.types';
import { useRef } from 'react';

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

type CastSubTab = 'list' | 'web';

const CAST_TABS: { id: CastSubTab; label: string }[] = [
  { id: 'list', label: 'Cast' },
  { id: 'web',  label: 'Relationship Web' },
];

export default function Characters() {
  const [activeSubTab, setActiveSubTab] = useState<CastSubTab>('list');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="cm-subtabs">
        {CAST_TABS.map(tab => (
          <button
            key={tab.id}
            className={`cm-subtab${activeSubTab === tab.id ? ' is-active' : ''}`}
            onClick={() => setActiveSubTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: activeSubTab === 'list' ? 'hidden' : 'auto' }}>
        {activeSubTab === 'list' && <CastList />}
        {activeSubTab === 'web'  && <CharacterWeb />}
      </div>
    </div>
  );
}

function CastList() {
  const {
    pcs, npcs, factions,
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

  // Edit modals
  const [pcEditId, setPcEditId] = useState<string | null>(null);
  const [npcModalOpen, setNpcModalOpen] = useState(false);
  const [factionModalOpen, setFactionModalOpen] = useState(false);

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
      setFactionModalOpen(true);
    } else if (filter === 'npc') {
      setNpcModalOpen(true);
    } else {
      setPcEditId('__new__');
    }
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
          selected ? (
            <CastDetail
              item={selected}
              onEditPC={() => setPcEditId(selected.id)}
              onEditNPC={async (npc) => { await upsertNPC(npc); }}
              onDeleteNPC={async (id) => {
                const yes = await confirm('Delete this NPC?', 'This cannot be undone.');
                if (yes) { await deleteNPC(id); setSelectedId(null); }
              }}
              onEditFaction={async (f) => { await upsertFaction(f); }}
              onDeleteFaction={async (id) => {
                const yes = await confirm('Delete this faction?', 'This cannot be undone.');
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

      {/* PC Edit Modal */}
      <PCEditModal
        isOpen={!!pcEditId}
        pcId={pcEditId === '__new__' ? null : pcEditId}
        onClose={() => setPcEditId(null)}
      />

      {/* Quick NPC Create Modal */}
      {npcModalOpen && (
        <NPCCreateModal
          onClose={() => setNpcModalOpen(false)}
        />
      )}

      {/* Quick Faction Create Modal */}
      {factionModalOpen && (
        <FactionCreateModal
          onClose={() => setFactionModalOpen(false)}
        />
      )}
    </>
  );
}

/* ── Cast Detail Panel ── */

interface CastDetailProps {
  item: CastItem;
  onEditPC: () => void;
  onEditNPC: (npc: Partial<NPC> & { id: string; name: string }) => Promise<void>;
  onDeleteNPC: (id: string) => Promise<void>;
  onEditFaction: (f: Partial<Faction> & { id?: string; name: string }) => Promise<void>;
  onDeleteFaction: (id: string) => Promise<void>;
  factions: Faction[];
  statblocks: { id: string; name: string }[];
  openStatBlock: (id: string) => void;
}

function CastDetail({
  item,
  onEditPC,
  onEditNPC,
  onDeleteNPC,
  onEditFaction,
  onDeleteFaction,
  factions,
  statblocks,
  openStatBlock,
}: CastDetailProps) {
  if (item.kind === 'pc') return <PCDetail item={item} onEdit={onEditPC} />;
  if (item.kind === 'npc') return (
    <NPCDetail
      item={item}
      onEdit={onEditNPC}
      onDelete={onDeleteNPC}
      factions={factions}
      statblocks={statblocks}
      openStatBlock={openStatBlock}
    />
  );
  return (
    <FactionDetail
      item={item}
      onEdit={onEditFaction}
      onDelete={onDeleteFaction}
    />
  );
}

/* ── PC Detail ── */

function PCDetail({ item, onEdit }: { item: CastItem; onEdit: () => void }) {
  const pc = item.raw as import('../../lib/database.types').PlayerCharacter;
  const { factions } = useCampaign();
  const pcFactions = factions.filter(f => pc.faction_ids?.includes(f.id));

  return (
    <DetailPanel
      eyebrow="Player Character"
      title={pc.character_name || 'Unnamed'}
      subtitle={[pc.race, pc.class].filter(Boolean).join(' · ')}
    >
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <Button variant="secondary" size="sm" onClick={onEdit}>Edit</Button>
        {!pc.is_active && <Badge color="muted">Inactive</Badge>}
      </div>

      {pc.player_name && (
        <DetailSection title="Player">
          <div style={{ color: 'var(--ink-2)', fontSize: '15px' }}>{pc.player_name}</div>
        </DetailSection>
      )}

      {pc.background && (
        <DetailSection title="Background">
          <MarkdownContent content={pc.background} />
        </DetailSection>
      )}

      {pc.story_hooks && (
        <DetailSection title="Story Hooks">
          <MarkdownContent content={pc.story_hooks} />
        </DetailSection>
      )}

      {pc.key_npcs && (
        <DetailSection title="Key NPCs">
          <MarkdownContent content={pc.key_npcs} />
        </DetailSection>
      )}

      {pcFactions.length > 0 && (
        <DetailSection title="Factions">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {pcFactions.map(f => {
              const style = getFactionTypeStyle(f.faction_type);
              return (
                <span
                  key={f.id}
                  className="cm-chip"
                  style={{ borderColor: style.border, color: style.text }}
                >
                  {f.name}
                </span>
              );
            })}
          </div>
        </DetailSection>
      )}

      {pc.dm_notes && (
        <DetailSection title="DM Notes">
          <MarkdownContent content={pc.dm_notes} />
        </DetailSection>
      )}
    </DetailPanel>
  );
}

/* ── NPC Detail ── */

function NPCDetail({
  item,
  onEdit,
  onDelete,
  factions,
  statblocks,
  openStatBlock,
}: {
  item: CastItem;
  onEdit: (npc: Partial<NPC> & { id: string; name: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  factions: Faction[];
  statblocks: { id: string; name: string }[];
  openStatBlock: (id: string) => void;
}) {
  const npc = item.raw as NPC;
  const npcFactions = factions.filter(f => npc.faction_ids?.includes(f.id));

  const statusBadge: Record<NPC['status'], 'green' | 'red' | 'gold'> = {
    active: 'green', deceased: 'red', unknown: 'gold',
  };

  const [editing, setEditing] = useState(false);
  const [editNpc, setEditNpc] = useState<Partial<NPC>>({});
  const descRef = useRef<HTMLTextAreaElement>(null);

  const startEdit = () => {
    setEditNpc({
      name: npc.name,
      role: npc.role,
      affiliation: npc.affiliation,
      status: npc.status,
      description: npc.description,
      hooks_motivations: npc.hooks_motivations,
      dm_notes: npc.dm_notes,
      location: npc.location,
      met_by_pcs: npc.met_by_pcs,
      faction_ids: npc.faction_ids,
      statblock_id: npc.statblock_id,
    });
    setEditing(true);
  };

  const saveNpcEdit = async () => {
    await onEdit({ id: npc.id, name: editNpc.name || npc.name, ...editNpc });
    setEditing(false);
  };

  if (editing) {
    return (
      <DetailPanel eyebrow="NPC" title="Editing" subtitle={editNpc.name || npc.name}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Name">
              <input style={inputStyle} value={editNpc.name ?? ''} onChange={e => setEditNpc(p => ({ ...p, name: e.target.value }))} />
            </FormField>
            <FormField label="Role">
              <input style={inputStyle} value={editNpc.role ?? ''} onChange={e => setEditNpc(p => ({ ...p, role: e.target.value || null }))} placeholder="e.g. Tavern keeper" />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Affiliation">
              <input style={inputStyle} value={editNpc.affiliation ?? ''} onChange={e => setEditNpc(p => ({ ...p, affiliation: e.target.value || null }))} />
            </FormField>
            <FormField label="Location">
              <input style={inputStyle} value={editNpc.location ?? ''} onChange={e => setEditNpc(p => ({ ...p, location: e.target.value || null }))} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Status">
              <select style={inputStyle} value={editNpc.status ?? 'active'} onChange={e => setEditNpc(p => ({ ...p, status: e.target.value as NPC['status'] }))}>
                <option value="active">Active</option>
                <option value="deceased">Deceased</option>
                <option value="unknown">Unknown</option>
              </select>
            </FormField>
            <FormField label="Met by PCs">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ink-2)', fontSize: '14px', cursor: 'pointer' }}>
                <input type="checkbox" checked={editNpc.met_by_pcs ?? false} onChange={e => setEditNpc(p => ({ ...p, met_by_pcs: e.target.checked }))} style={{ accentColor: 'var(--gold)' }} />
                Met
              </label>
            </FormField>
          </div>
          <FormField label="Description">
            <MarkdownEditor
              value={editNpc.description ?? ''}
              onChange={v => setEditNpc(p => ({ ...p, description: v || null }))}
              placeholder="Physical appearance, personality, quirks..."
              minHeight="120px"
              textareaRef={descRef}
            />
            <EntityLinkToolbar textareaRef={descRef} onInsert={markup => setEditNpc(p => ({ ...p, description: insertAtCursor(descRef, p.description ?? '', markup) }))} />
          </FormField>
          <FormField label="Hooks & Motivations">
            <MarkdownEditor
              value={editNpc.hooks_motivations ?? ''}
              onChange={v => setEditNpc(p => ({ ...p, hooks_motivations: v || null }))}
              placeholder="What drives this NPC? What plot hooks do they offer?"
              minHeight="80px"
            />
          </FormField>
          <FormField label="DM Notes">
            <MarkdownEditor
              value={editNpc.dm_notes ?? ''}
              onChange={v => setEditNpc(p => ({ ...p, dm_notes: v || null }))}
              placeholder="Private DM notes..."
              minHeight="80px"
            />
          </FormField>
          <FactionPillSelector
            selectedIds={editNpc.faction_ids ?? []}
            onChange={ids => setEditNpc(p => ({ ...p, faction_ids: ids }))}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="primary" size="sm" onClick={saveNpcEdit}>Save</Button>
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      </DetailPanel>
    );
  }

  return (
    <DetailPanel
      eyebrow="NPC"
      title={npc.name}
      subtitle={[npc.role, npc.affiliation].filter(Boolean).join(' · ')}
    >
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge color={statusBadge[npc.status]}>{npc.status}</Badge>
        {npc.met_by_pcs && <Badge color="blue">Met by PCs</Badge>}
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onClick={startEdit}>Edit</Button>
        <Button variant="secondary" size="sm" onClick={() => onDelete(npc.id)}>Delete</Button>
      </div>

      {npc.location && (
        <div className="cm-stat-strip">
          <span className="ds">
            <span className="ds-label">Location</span>
            <span className="ds-value">{npc.location}</span>
          </span>
          {npc.first_session && (
            <span className="ds">
              <span className="ds-label">First Session</span>
              <span className="ds-value">#{npc.first_session}</span>
            </span>
          )}
        </div>
      )}

      {npc.description && (
        <DetailSection title="Description">
          <MarkdownContent content={npc.description} />
        </DetailSection>
      )}

      {npc.hooks_motivations && (
        <DetailSection title="Hooks & Motivations">
          <MarkdownContent content={npc.hooks_motivations} />
        </DetailSection>
      )}

      {npcFactions.length > 0 && (
        <DetailSection title="Factions">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {npcFactions.map(f => {
              const style = getFactionTypeStyle(f.faction_type);
              return (
                <span key={f.id} className="cm-chip" style={{ borderColor: style.border, color: style.text }}>
                  {f.name}
                </span>
              );
            })}
          </div>
        </DetailSection>
      )}

      {npc.statblock_id && (
        <DetailSection title="Stat Block">
          <button
            className="cm-pill is-active"
            onClick={() => openStatBlock(npc.statblock_id!)}
          >
            {statblocks.find(s => s.id === npc.statblock_id)?.name ?? 'View Stat Block'}
          </button>
        </DetailSection>
      )}

      {npc.dm_notes && (
        <DetailSection title="DM Notes">
          <MarkdownContent content={npc.dm_notes} />
        </DetailSection>
      )}
    </DetailPanel>
  );
}

/* ── Faction Detail ── */

function FactionDetail({
  item,
  onEdit,
  onDelete,
}: {
  item: CastItem;
  onEdit: (f: Partial<Faction> & { id?: string; name: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const faction = item.raw as Faction;
  const [editing, setEditing] = useState(false);
  const [editFaction, setEditFaction] = useState<Partial<Faction>>({});

  const TYPES = ['guild', 'government', 'religious', 'criminal', 'military', 'arcane', 'merchant', 'other'];

  const startEdit = () => {
    setEditFaction({
      name: faction.name,
      faction_type: faction.faction_type,
      overview: faction.overview,
      key_figures: faction.key_figures,
      agenda: faction.agenda,
      dm_notes: faction.dm_notes,
    });
    setEditing(true);
  };

  const saveFactionEdit = async () => {
    await onEdit({ id: faction.id, name: editFaction.name || faction.name, ...editFaction });
    setEditing(false);
  };

  if (editing) {
    return (
      <DetailPanel eyebrow="Faction" title="Editing" subtitle={editFaction.name || faction.name}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Name">
              <input style={inputStyle} value={editFaction.name ?? ''} onChange={e => setEditFaction(p => ({ ...p, name: e.target.value }))} />
            </FormField>
            <FormField label="Type">
              <select style={inputStyle} value={editFaction.faction_type ?? 'other'} onChange={e => setEditFaction(p => ({ ...p, faction_type: e.target.value }))}>
                {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Overview">
            <MarkdownEditor value={editFaction.overview ?? ''} onChange={v => setEditFaction(p => ({ ...p, overview: v || null }))} placeholder="What is this faction about?" minHeight="120px" />
          </FormField>
          <FormField label="Key Figures">
            <MarkdownEditor value={editFaction.key_figures ?? ''} onChange={v => setEditFaction(p => ({ ...p, key_figures: v || null }))} placeholder="Important members..." minHeight="80px" />
          </FormField>
          <FormField label="Agenda">
            <MarkdownEditor value={editFaction.agenda ?? ''} onChange={v => setEditFaction(p => ({ ...p, agenda: v || null }))} placeholder="Goals and plans..." minHeight="80px" />
          </FormField>
          <FormField label="DM Notes">
            <MarkdownEditor value={editFaction.dm_notes ?? ''} onChange={v => setEditFaction(p => ({ ...p, dm_notes: v || null }))} placeholder="Hidden agendas, secrets..." minHeight="80px" />
          </FormField>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="primary" size="sm" onClick={saveFactionEdit}>Save</Button>
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      </DetailPanel>
    );
  }

  return (
    <DetailPanel
      eyebrow="Faction"
      title={faction.name}
      subtitle={faction.faction_type ? faction.faction_type.charAt(0).toUpperCase() + faction.faction_type.slice(1) : undefined}
    >
      <div style={{ display: 'flex', gap: '8px' }}>
        <Button variant="secondary" size="sm" onClick={startEdit}>Edit</Button>
        <Button variant="secondary" size="sm" onClick={() => onDelete(faction.id)}>Delete</Button>
      </div>

      {faction.overview && (
        <DetailSection title="Overview">
          <MarkdownContent content={faction.overview} />
        </DetailSection>
      )}

      {faction.key_figures && (
        <DetailSection title="Key Figures">
          <MarkdownContent content={faction.key_figures} />
        </DetailSection>
      )}

      {faction.agenda && (
        <DetailSection title="Agenda">
          <MarkdownContent content={faction.agenda} />
        </DetailSection>
      )}

      {faction.dm_notes && (
        <DetailSection title="DM Notes">
          <MarkdownContent content={faction.dm_notes} />
        </DetailSection>
      )}
    </DetailPanel>
  );
}

/* ── Quick Create Modals ── */

function NPCCreateModal({ onClose }: { onClose: () => void }) {
  const { upsertNPC } = useCampaign();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    await upsertNPC({
      name: name.trim(),
      role: role || null,
      affiliation: null,
      status: 'active',
      description: null,
      hooks_motivations: null,
      dm_notes: null,
      location: null,
      first_session: null,
      met_by_pcs: false,
      faction_ids: [],
      statblock_id: null,
    });
    onClose();
  };

  return (
    <Modal title="New NPC" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <FormField label="Name">
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} autoFocus />
        </FormField>
        <FormField label="Role">
          <input style={inputStyle} value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Tavern keeper, Court wizard" />
        </FormField>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!name.trim()}>Create</Button>
        </div>
      </div>
    </Modal>
  );
}

function FactionCreateModal({ onClose }: { onClose: () => void }) {
  const { upsertFaction } = useCampaign();
  const [name, setName] = useState('');
  const [factionType, setFactionType] = useState('guild');

  const TYPES = ['guild', 'government', 'religious', 'criminal', 'military', 'arcane', 'merchant', 'other'];

  const handleCreate = async () => {
    if (!name.trim()) return;
    await upsertFaction({
      name: name.trim(),
      faction_type: factionType,
      overview: null,
      key_figures: null,
      agenda: null,
      dm_notes: null,
    });
    onClose();
  };

  return (
    <Modal title="New Faction" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <FormField label="Name">
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} autoFocus />
        </FormField>
        <FormField label="Type">
          <select
            style={inputStyle}
            value={factionType}
            onChange={e => setFactionType(e.target.value)}
          >
            {TYPES.map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </FormField>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!name.trim()}>Create</Button>
        </div>
      </div>
    </Modal>
  );
}
