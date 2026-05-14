import { useState, useMemo, useEffect } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { ListDetail, ListRow, DetailPanel, DetailSection, Pill, FilterSep, EmptyDetail } from '../ui/ListDetail';
import { MarkdownContent } from '../ui/MarkdownContent';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { PCEditModal } from '../PCEditModal';
import { FormField, inputStyle } from '../FormField';
import { MarkdownEditor } from '../ui/MarkdownEditor';
import { FactionPillSelector } from '../ui/FactionPillSelector';
import { EntityLinkToolbar } from '../ui/EntityLinkToolbar';
import { insertAtCursor } from '../../lib/textUtils';
import { getFactionTypeStyle } from '../../lib/theme';
import { useConfirm } from '../../context/ConfirmContext';
import { useStatBlockPanel } from '../../context/StatBlockPanelContext';
import { pushRecent } from '../Sidebar';
import CharacterWeb from './CharacterWeb';
import { VoiceCard } from '../ui/VoiceCard';
import type { NPC, Faction } from '../../lib/database.types';
import { useRef } from 'react';

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
  // 'npc' | 'faction' | null — shows an inline create form in the detail panel
  const [creating, setCreating] = useState<'npc' | 'faction' | null>(null);

  // PC edit modal (PCs have a richer dedicated modal)
  const [pcEditId, setPcEditId] = useState<string | null>(null);

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
      setSelectedId(null);
    } else if (filter === 'npc') {
      setCreating('npc');
      setSelectedId(null);
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
          creating === 'npc' ? (
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

      {/* PC Edit Modal (PCs have a richer dedicated modal) */}
      <PCEditModal
        isOpen={!!pcEditId}
        pcId={pcEditId === '__new__' ? null : pcEditId}
        onClose={() => setPcEditId(null)}
      />
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

/* ── NPC Detail (tabbed) ── */

type NPCTab = 'profile' | 'voice' | 'connections' | 'history';

const NPC_TABS: { id: NPCTab; label: string }[] = [
  { id: 'profile',     label: 'Profile' },
  { id: 'voice',       label: 'Voice' },
  { id: 'connections', label: 'Connections' },
  { id: 'history',     label: 'History' },
];

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
  const statusBadge: Record<NPC['status'], 'green' | 'red' | 'gold'> = { active: 'green', deceased: 'red', unknown: 'gold' };

  const [tab, setTab] = useState<NPCTab>('profile');
  const [editing, setEditing] = useState(false);
  const [editNpc, setEditNpc] = useState<Partial<NPC>>({});
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Reset tab & edit state when NPC changes
  useEffect(() => { setTab('profile'); setEditing(false); }, [npc.id]);

  // Voice state
  const [voice, setVoice] = useState<VoiceData>(() => loadVoice(npc.id));
  const [editingVoice, setEditingVoice] = useState(false);
  const [editVoice, setEditVoice] = useState<VoiceData>({});
  useEffect(() => { setVoice(loadVoice(npc.id)); setEditingVoice(false); }, [npc.id]);

  const startEdit = () => {
    setEditNpc({ name: npc.name, role: npc.role, affiliation: npc.affiliation, status: npc.status, description: npc.description, hooks_motivations: npc.hooks_motivations, dm_notes: npc.dm_notes, location: npc.location, met_by_pcs: npc.met_by_pcs, faction_ids: npc.faction_ids, statblock_id: npc.statblock_id });
    setEditing(true);
  };

  const saveNpcEdit = async () => {
    await onEdit({ id: npc.id, name: editNpc.name || npc.name, ...editNpc });
    setEditing(false);
  };

  const startVoiceEdit = () => { setEditVoice({ ...voice }); setEditingVoice(true); };
  const saveVoiceEdit = () => { saveVoice(npc.id, editVoice); setVoice(editVoice); setEditingVoice(false); };

  if (editing) {
    return (
      <DetailPanel eyebrow="NPC" title="Editing" subtitle={editNpc.name || npc.name}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Name"><input style={inputStyle} value={editNpc.name ?? ''} onChange={e => setEditNpc(p => ({ ...p, name: e.target.value }))} /></FormField>
            <FormField label="Role"><input style={inputStyle} value={editNpc.role ?? ''} onChange={e => setEditNpc(p => ({ ...p, role: e.target.value || null }))} placeholder="e.g. Tavern keeper" /></FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Affiliation"><input style={inputStyle} value={editNpc.affiliation ?? ''} onChange={e => setEditNpc(p => ({ ...p, affiliation: e.target.value || null }))} /></FormField>
            <FormField label="Location"><input style={inputStyle} value={editNpc.location ?? ''} onChange={e => setEditNpc(p => ({ ...p, location: e.target.value || null }))} /></FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Status">
              <select style={inputStyle} value={editNpc.status ?? 'active'} onChange={e => setEditNpc(p => ({ ...p, status: e.target.value as NPC['status'] }))}>
                <option value="active">Active</option><option value="deceased">Deceased</option><option value="unknown">Unknown</option>
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
            <MarkdownEditor value={editNpc.description ?? ''} onChange={v => setEditNpc(p => ({ ...p, description: v || null }))} placeholder="Physical appearance, personality, quirks..." minHeight="120px" textareaRef={descRef} />
            <EntityLinkToolbar textareaRef={descRef} onInsert={markup => setEditNpc(p => ({ ...p, description: insertAtCursor(descRef, p.description ?? '', markup) }))} />
          </FormField>
          <FormField label="Hooks & Motivations">
            <MarkdownEditor value={editNpc.hooks_motivations ?? ''} onChange={v => setEditNpc(p => ({ ...p, hooks_motivations: v || null }))} placeholder="What drives this NPC? What plot hooks do they offer?" minHeight="80px" />
          </FormField>
          <FormField label="DM Notes">
            <MarkdownEditor value={editNpc.dm_notes ?? ''} onChange={v => setEditNpc(p => ({ ...p, dm_notes: v || null }))} placeholder="Private DM notes..." minHeight="80px" />
          </FormField>
          <FactionPillSelector selectedIds={editNpc.faction_ids ?? []} onChange={ids => setEditNpc(p => ({ ...p, faction_ids: ids }))} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="primary" size="sm" onClick={saveNpcEdit}>Save</Button>
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      </DetailPanel>
    );
  }

  return (
    <DetailPanel eyebrow="NPC" title={npc.name} subtitle={[npc.role, npc.affiliation].filter(Boolean).join(' · ')}>
      {/* Detail tabs */}
      <div className="cm-subtabs" style={{ marginBottom: '12px' }}>
        {NPC_TABS.map(t => (
          <button key={t.id} className={`cm-subtab${tab === t.id ? ' is-active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {tab === 'profile' && (
        <>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
            <Badge color={statusBadge[npc.status]}>{npc.status}</Badge>
            {npc.met_by_pcs && <Badge color="blue">Met by PCs</Badge>}
            <div style={{ flex: 1 }} />
            <Button variant="secondary" size="sm" onClick={startEdit}>Edit</Button>
            <Button variant="secondary" size="sm" onClick={() => onDelete(npc.id)}>Delete</Button>
          </div>
          {(npc.location || npc.first_session) && (
            <div className="cm-stat-strip">
              {npc.location && <span className="ds"><span className="ds-label">Location</span><span className="ds-value">{npc.location}</span></span>}
              {npc.first_session && <span className="ds"><span className="ds-label">First Session</span><span className="ds-value">#{npc.first_session}</span></span>}
            </div>
          )}
          {npc.description && <DetailSection title="Description"><MarkdownContent content={npc.description} /></DetailSection>}
          {npc.hooks_motivations && <DetailSection title="Hooks & Motivations"><MarkdownContent content={npc.hooks_motivations} /></DetailSection>}
          {npc.dm_notes && <DetailSection title="DM Notes"><MarkdownContent content={npc.dm_notes} /></DetailSection>}
        </>
      )}

      {/* Voice tab */}
      {tab === 'voice' && (
        <>
          {editingVoice ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <FormField label="Accent & Delivery"><input style={inputStyle} value={editVoice.accent ?? ''} onChange={e => setEditVoice(p => ({ ...p, accent: e.target.value || undefined }))} placeholder="e.g. Gravelly baritone, speaks slowly" /></FormField>
              <FormField label="Speech Patterns"><input style={inputStyle} value={editVoice.patterns ?? ''} onChange={e => setEditVoice(p => ({ ...p, patterns: e.target.value || undefined }))} placeholder="e.g. Never finishes sentences, asks questions" /></FormField>
              <FormField label="Signature Phrase"><input style={inputStyle} value={editVoice.phrase ?? ''} onChange={e => setEditVoice(p => ({ ...p, phrase: e.target.value || undefined }))} placeholder='e.g. "The gods have long ears..."' /></FormField>
              <FormField label="Personality Tics"><input style={inputStyle} value={editVoice.tics ?? ''} onChange={e => setEditVoice(p => ({ ...p, tics: e.target.value || undefined }))} placeholder="e.g. Drums fingers, avoids eye contact" /></FormField>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="primary" size="sm" onClick={saveVoiceEdit}>Save</Button>
                <Button variant="secondary" size="sm" onClick={() => setEditingVoice(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <VoiceCard voice={voice} npcName={npc.name} onGenerate={startVoiceEdit} />
              {(voice.accent || voice.patterns || voice.phrase || voice.tics) && (
                <div style={{ marginTop: '12px' }}>
                  <Button variant="secondary" size="sm" onClick={startVoiceEdit}>Edit voice notes</Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Connections tab */}
      {tab === 'connections' && (
        <>
          {npcFactions.length > 0 && (
            <DetailSection title="Factions">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {npcFactions.map(f => {
                  const style = getFactionTypeStyle(f.faction_type);
                  return <span key={f.id} className="cm-chip" style={{ borderColor: style.border, color: style.text }}>{f.name}</span>;
                })}
              </div>
            </DetailSection>
          )}
          {npc.statblock_id && (
            <DetailSection title="Stat Block">
              <button className="cm-pill is-active" onClick={() => openStatBlock(npc.statblock_id!)}>
                {statblocks.find(s => s.id === npc.statblock_id)?.name ?? 'View Stat Block'}
              </button>
            </DetailSection>
          )}
          {npcFactions.length === 0 && !npc.statblock_id && (
            <div style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontSize: 13, padding: '24px 0' }}>No connections recorded yet.</div>
          )}
        </>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <>
          <div className="cm-stat-strip" style={{ marginBottom: '16px' }}>
            <span className="ds"><span className="ds-label">Status</span><span className="ds-value"><Badge color={statusBadge[npc.status]}>{npc.status}</Badge></span></span>
            <span className="ds"><span className="ds-label">Met by PCs</span><span className="ds-value">{npc.met_by_pcs ? 'Yes' : 'Not yet'}</span></span>
            {npc.first_session && <span className="ds"><span className="ds-label">First Session</span><span className="ds-value">#{npc.first_session}</span></span>}
          </div>
          <div style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontSize: 13 }}>Full session history coming soon.</div>
        </>
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

/* ── Inline Create Panels ── */

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
    <DetailPanel eyebrow="NPC" title="New NPC" subtitle="Fill in the details below">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <FormField label="Name"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="NPC name" /></FormField>
          <FormField label="Role"><input style={inputStyle} value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Tavern keeper" /></FormField>
        </div>
        <FormField label="Description"><MarkdownEditor value={description} onChange={setDescription} placeholder="First impressions, appearance..." minHeight="100px" /></FormField>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="primary" size="sm" onClick={handleCreate} disabled={!name.trim() || saving}>{saving ? 'Creating…' : 'Create NPC'}</Button>
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </DetailPanel>
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
    <DetailPanel eyebrow="Faction" title="New Faction" subtitle="Fill in the details below">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
          <Button variant="primary" size="sm" onClick={handleCreate} disabled={!name.trim() || saving}>{saving ? 'Creating…' : 'Create Faction'}</Button>
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </DetailPanel>
  );
}
