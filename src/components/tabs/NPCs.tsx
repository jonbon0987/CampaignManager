import { useState } from 'react';
import { SlashField } from '../ui/SlashField';
import { Pencil } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useStatBlockPanel } from '../../context/StatBlockPanelContext';
import { Modal } from '../Modal';
import { FormField, inputStyle } from '../FormField';
import { SectionHeader } from '../ui/SectionHeader';
import { InlineEditCard } from '../ui/InlineEditCard';
import { SearchBar } from '../ui/SearchBar';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { MarkdownContent } from '../ui/MarkdownContent';
import { FactionPillSelector } from '../ui/FactionPillSelector';
import { getFactionTypeStyle } from '../../lib/theme';
import type { NPC } from '../../lib/database.types';

type NPCForm = {
  name: string;
  role: string | null;
  affiliation: string | null;
  status: NPC['status'];
  description: string | null;
  hooks_motivations: string | null;
  met_by_pcs: boolean;
  faction_ids: string[];
  statblock_id: string | null;
};

const emptyForm = (): NPCForm => ({
  name: '',
  role: '',
  affiliation: '',
  status: 'active',
  description: '',
  hooks_motivations: '',
  met_by_pcs: false,
  faction_ids: [],
  statblock_id: null,
});

const statusBadgeColor: Record<NPC['status'], 'green' | 'red' | 'gold'> = {
  active: 'green',
  deceased: 'red',
  unknown: 'gold',
};

const statusStyles: Record<NPC['status'], { bg: string; text: string }> = {
  active:   { bg: 'var(--success-bg)', text: 'var(--success)' },
  deceased: { bg: 'var(--red-bg)', text: 'var(--red)' },
  unknown:  { bg: 'var(--warn-bg)', text: 'var(--gold)' },
};

const inputEditStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--rule)',
  fontFamily: 'var(--serif)', fontSize: '0.875rem', borderRadius: '0.375rem',
  padding: '0.375rem 0.5rem', width: '100%',
};

const labelStyle: React.CSSProperties = {
  color: 'var(--gold)', fontSize: '0.65rem', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.08em',
};

type ViewMode = 'campaign' | 'global';

export default function NPCs() {
  const {
    npcs, globalNPCs, linkedNPCIds,
    upsertNPC, deleteNPC, linkNPCToCampaign, unlinkNPCFromCampaign,
    factions, monsterStatblocks,
  } = useCampaign();
  const { openStatBlock } = useStatBlockPanel();
  const confirm = useConfirm();

  const [viewMode, setViewMode] = useState<ViewMode>('campaign');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<NPCForm>(emptyForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<NPCForm | null>(null);
  const [saving, setSaving] = useState(false);

  const displayList = viewMode === 'campaign' ? npcs : globalNPCs;

  const filtered = displayList.filter(npc => {
    if (!search) return true;
    const q = search.toLowerCase();
    return npc.name.toLowerCase().includes(q) || (npc.role ?? '').toLowerCase().includes(q) || (npc.description ?? '').toLowerCase().includes(q);
  });

  const unlinkableGlobals = globalNPCs.filter(n => linkedNPCIds.includes(n.id));
  const linkableGlobals = globalNPCs.filter(
    n => !linkedNPCIds.includes(n.id) &&
    (linkSearch ? n.name.toLowerCase().includes(linkSearch.toLowerCase()) || (n.role ?? '').toLowerCase().includes(linkSearch.toLowerCase()) : true)
  );

  const openAdd = () => { setForm(emptyForm()); setModalOpen(true); };

  const handleCreate = async () => {
    await upsertNPC({ ...form, dm_notes: null, location: null, first_session: null }, viewMode);
    setModalOpen(false);
  };

  const startEdit = (npc: NPC) => {
    setEditingId(npc.id);
    setEditForm({
      name: npc.name, role: npc.role, affiliation: npc.affiliation, status: npc.status,
      description: npc.description, hooks_motivations: npc.hooks_motivations, met_by_pcs: npc.met_by_pcs,
      faction_ids: npc.faction_ids ?? [],
      statblock_id: npc.statblock_id ?? null,
    });
    setExpandedId(npc.id);
  };

  const cancelEdit = () => { setEditingId(null); setEditForm(null); };

  const saveEdit = async () => {
    if (!editForm || !editingId) return;
    const npc = displayList.find(n => n.id === editingId);
    if (!npc) return;
    const scope = npc.campaign_id === null ? 'global' : 'campaign';
    setSaving(true);
    await upsertNPC({
      id: editingId, ...editForm,
      dm_notes: npc.dm_notes, location: npc.location, first_session: npc.first_session,
    }, scope);
    setSaving(false);
    cancelEdit();
  };

  const handleToggleMet = async (npc: NPC) => {
    const scope = npc.campaign_id === null ? 'global' : 'campaign';
    await upsertNPC({
      id: npc.id, name: npc.name, role: npc.role, affiliation: npc.affiliation, status: npc.status,
      description: npc.description, hooks_motivations: npc.hooks_motivations,
      dm_notes: npc.dm_notes, location: npc.location, first_session: npc.first_session,
      met_by_pcs: !npc.met_by_pcs,
      faction_ids: npc.faction_ids ?? [],
      statblock_id: npc.statblock_id ?? null,
    }, scope);
  };

  const handleDelete = async (id: string) => {
    if (await confirm('Delete this NPC?')) {
      await deleteNPC(id);
      if (expandedId === id) setExpandedId(null);
      if (editingId === id) cancelEdit();
    }
  };

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px', borderRadius: 'var(--radius)', fontSize: '13px',
    fontWeight: active ? 600 : 400, cursor: 'pointer', border: 'none',
    backgroundColor: active ? 'var(--rule-soft)' : 'transparent',
    color: active ? 'var(--gold)' : 'var(--ink-2)', transition: 'all 0.15s',
  });

  return (
    <div>
      <SectionHeader
        title="Non-Player Characters"
        onAdd={openAdd}
        addLabel="Add NPC"
        extra={
          <div className="flex items-center gap-2">
            {viewMode === 'campaign' && (
              <Button variant="secondary" size="sm" onClick={() => setLinkPickerOpen(true)}>
                Link Global NPC
              </Button>
            )}
          </div>
        }
      />

      {/* View toggle */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--bg)' }}>
          <button style={pillStyle(viewMode === 'campaign')} onClick={() => setViewMode('campaign')}>This Campaign</button>
          <button style={pillStyle(viewMode === 'global')} onClick={() => setViewMode('global')}>Global Pool</button>
        </div>
        <div style={{ width: '240px' }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search NPCs…" />
        </div>
      </div>

      {viewMode === 'global' && (
        <p className="text-xs mb-4" style={{ color: 'var(--ink-3)' }}>
          Global NPCs are available across all campaigns. Use "Add to Campaign" to include one in the current campaign.
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          message={search ? 'No NPCs match your search.' : viewMode === 'campaign' ? 'No NPCs in this campaign yet.' : 'No global NPCs yet.'}
          onAdd={!search ? openAdd : undefined}
          addLabel="Add NPC"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(npc => {
            const isEditing = editingId === npc.id;
            const isExpanded = expandedId === npc.id;
            const isGlobal = npc.campaign_id === null;
            const isLinked = isGlobal && linkedNPCIds.includes(npc.id);

            return (
              <InlineEditCard
                key={npc.id}
                entityId={npc.id}
                isEditing={isEditing}
                onSave={saveEdit}
                onCancel={cancelEdit}
                onDelete={() => handleDelete(npc.id)}
                saving={saving}
              >
                {isEditing && editForm ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block mb-1" style={labelStyle}>Name</label>
                        <input type="text" value={editForm.name} onChange={e => setEditForm(prev => prev ? { ...prev, name: e.target.value } : prev)} autoFocus style={inputEditStyle} />
                      </div>
                      <div>
                        <label className="block mb-1" style={labelStyle}>Role</label>
                        <input type="text" value={editForm.role ?? ''} onChange={e => setEditForm(prev => prev ? { ...prev, role: e.target.value } : prev)} style={inputEditStyle} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block mb-1" style={labelStyle}>Affiliation</label>
                        <input type="text" value={editForm.affiliation ?? ''} onChange={e => setEditForm(prev => prev ? { ...prev, affiliation: e.target.value } : prev)} style={inputEditStyle} />
                      </div>
                      <div>
                        <label className="block mb-1" style={labelStyle}>Status</label>
                        <select value={editForm.status} onChange={e => setEditForm(prev => prev ? { ...prev, status: e.target.value as NPC['status'] } : prev)} style={inputEditStyle}>
                          <option value="active">Active</option>
                          <option value="deceased">Deceased</option>
                          <option value="unknown">Unknown</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block mb-1" style={labelStyle}>Description</label>
                      <SlashField value={editForm.description ?? ''} onChange={v => setEditForm(prev => prev ? { ...prev, description: v } : prev)} placeholder="Physical appearance, personality..." minHeight="60px" />
                    </div>
                    <div>
                      <label className="block mb-1" style={labelStyle}>Hooks & Motivations</label>
                      <SlashField value={editForm.hooks_motivations ?? ''} onChange={v => setEditForm(prev => prev ? { ...prev, hooks_motivations: v } : prev)} placeholder="Personal goals, secrets..." minHeight="60px" />
                    </div>
                    <div>
                      <label className="block mb-1" style={labelStyle}>Factions</label>
                      <FactionPillSelector
                        selectedIds={editForm.faction_ids}
                        onChange={ids => setEditForm(prev => prev ? { ...prev, faction_ids: ids } : prev)}
                        factions={factions}
                      />
                    </div>
                    <div>
                      <label className="block mb-1" style={labelStyle}>Linked Stat Sheet</label>
                      <select
                        value={editForm.statblock_id ?? ''}
                        onChange={e => setEditForm(prev => prev ? { ...prev, statblock_id: e.target.value || null } : prev)}
                        style={inputEditStyle}
                      >
                        <option value="">None</option>
                        {monsterStatblocks.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : npc.id)}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold" style={{ color: 'var(--ink)', fontFamily: 'var(--serif)' }}>
                              {npc.name || 'Unnamed NPC'}
                            </h3>
                            {isGlobal && <Badge label="Global" color="blue" size="xs" />}
                          </div>
                          {npc.role && <div className="text-sm mt-0.5" style={{ color: 'var(--ink-2)' }}>{npc.role}</div>}
                          {npc.affiliation && <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{npc.affiliation}</div>}
                          {npc.faction_ids && npc.faction_ids.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {npc.faction_ids.map(fid => {
                                const f = factions.find(x => x.id === fid);
                                if (!f) return null;
                                const style = getFactionTypeStyle(f.faction_type);
                                return (
                                  <span
                                    key={fid}
                                    style={{
                                      backgroundColor: style.bg,
                                      color: style.text,
                                      border: `1px solid ${style.border}`,
                                      borderRadius: 'var(--radius)',
                                      padding: '1px 5px',
                                      fontSize: 10,
                                      lineHeight: 1.3,
                                    }}
                                  >
                                    {f.name}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                          {npc.statblock_id && (() => {
                            const sb = monsterStatblocks.find(m => m.id === npc.statblock_id);
                            if (!sb) return null;
                            return (
                              <div className="mt-1">
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); openStatBlock(sb.id); }}
                                  className="text-xs underline"
                                  style={{ color: 'var(--info)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                                  title="Open stat sheet"
                                >
                                  {sb.name}
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge label={npc.status} color={statusBadgeColor[npc.status]} size="xs" />
                          <button
                            onClick={e => { e.stopPropagation(); handleToggleMet(npc); }}
                            className="text-xs px-2 py-1 rounded transition-colors"
                            title={npc.met_by_pcs ? 'PCs have met this NPC' : 'PCs have not met this NPC'}
                            style={{
                              backgroundColor: npc.met_by_pcs ? 'var(--info-bg)' : 'var(--paper-2)',
                              color: npc.met_by_pcs ? 'var(--info)' : 'var(--ink-3)',
                              border: `1px solid ${npc.met_by_pcs ? 'var(--info-line)' : 'var(--rule)'}`,
                            }}
                          >
                            {npc.met_by_pcs ? 'Met' : 'Unmet'}
                          </button>
                          <span className="text-xs ml-1" style={{ color: 'var(--ink-3)' }}>{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </div>

                      {npc.description && (
                        isExpanded ? (
                          <MarkdownContent text={npc.description} className="text-sm mt-2" style={{ color: 'var(--ink-2)', lineHeight: '1.5' }} />
                        ) : (
                          <p className="text-sm mt-2" style={{ color: 'var(--ink-2)', lineHeight: '1.5' }}>
                            {npc.description.substring(0, 100)}{npc.description.length > 100 ? '…' : ''}
                          </p>
                        )
                      )}

                      {isExpanded && npc.hooks_motivations && (
                        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--rule)' }}>
                          <div className="mb-1" style={labelStyle}>Hooks & Motivations</div>
                          <MarkdownContent text={npc.hooks_motivations} className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6' }} />
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--rule-soft)' }}>
                      <Button variant="ghost" size="sm" onClick={() => startEdit(npc)} title="Edit">
                        <Pencil size={12} strokeWidth={1.5} />
                      </Button>
                      {viewMode === 'campaign' && isLinked ? (
                        <Button variant="secondary" size="sm" onClick={async () => { if (await confirm('Remove from this campaign?')) unlinkNPCFromCampaign(npc.id); }}>Unlink</Button>
                      ) : viewMode === 'global' && !isLinked ? (
                        <Button variant="secondary" size="sm" onClick={() => linkNPCToCampaign(npc.id)} style={{ color: 'var(--success)' }}>Add to Campaign</Button>
                      ) : viewMode === 'global' && isLinked ? (
                        <Button variant="secondary" size="sm" onClick={async () => { if (await confirm('Remove from campaign?')) unlinkNPCFromCampaign(npc.id); }} style={{ color: 'var(--info)' }}>In Campaign ✓</Button>
                      ) : (
                        <Button variant="danger" size="sm" onClick={() => handleDelete(npc.id)}>Delete</Button>
                      )}
                    </div>
                  </div>
                )}
              </InlineEditCard>
            );
          })}
        </div>
      )}

      {/* Link Global NPC picker modal */}
      <Modal isOpen={linkPickerOpen} onClose={() => { setLinkPickerOpen(false); setLinkSearch(''); }} title="Link Global NPC to Campaign" onSave={undefined} wide>
        <p className="text-sm mb-3" style={{ color: 'var(--ink-2)' }}>
          Select global NPCs to add to this campaign.
          {unlinkableGlobals.length > 0 && ` (${unlinkableGlobals.length} already linked)`}
        </p>
        <input type="text" value={linkSearch} onChange={e => setLinkSearch(e.target.value)} placeholder="Search global NPCs..." style={{ ...inputStyle, marginBottom: '12px' }} />
        {linkableGlobals.length === 0 ? (
          <div className="text-center py-8" style={{ color: 'var(--ink-3)' }}>
            {linkSearch ? 'No matches.' : 'All global NPCs are already linked to this campaign.'}
          </div>
        ) : (
          <div className="flex flex-col gap-2" style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {linkableGlobals.map(npc => {
              const ss = statusStyles[npc.status];
              return (
                <div key={npc.id} className="flex items-center justify-between p-3 rounded-lg border" style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--rule)' }}>
                  <div>
                    <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{npc.name}</span>
                    {npc.role && <span className="text-xs ml-2" style={{ color: 'var(--ink-2)' }}>{npc.role}</span>}
                    <span className="text-xs ml-2 px-1.5 py-0.5 rounded capitalize" style={{ backgroundColor: ss.bg, color: ss.text }}>{npc.status}</span>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => linkNPCToCampaign(npc.id)} style={{ color: 'var(--success)' }}>+ Add</Button>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* Create-only modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={viewMode === 'global' ? 'New Global NPC' : 'New NPC'} onSave={handleCreate} wide>
        {viewMode === 'global' && (
          <p className="text-xs mb-4" style={{ color: 'var(--ink-3)' }}>Creating a Global NPC — available across all campaigns.</p>
        )}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Name"><input type="text" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., Garrak the Bold" style={inputStyle} /></FormField>
          <FormField label="Role / Title"><input type="text" value={form.role ?? ''} onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))} placeholder="e.g., Merchant, Villain" style={inputStyle} /></FormField>
          <FormField label="Affiliation"><input type="text" value={form.affiliation ?? ''} onChange={e => setForm(prev => ({ ...prev, affiliation: e.target.value }))} placeholder="e.g., Merchant Guild" style={inputStyle} /></FormField>
          <FormField label="Status">
            <select value={form.status} onChange={e => setForm(prev => ({ ...prev, status: e.target.value as NPC['status'] }))} style={inputStyle}>
              <option value="active">Active</option>
              <option value="deceased">Deceased</option>
              <option value="unknown">Unknown</option>
            </select>
          </FormField>
        </div>
        <FormField label="Description">
          <SlashField value={form.description ?? ''} onChange={v => setForm(prev => ({ ...prev, description: v }))} placeholder="Physical appearance, personality..." minHeight="80px" />
        </FormField>
        <FormField label="Hooks & Motivations">
          <SlashField value={form.hooks_motivations ?? ''} onChange={v => setForm(prev => ({ ...prev, hooks_motivations: v }))} placeholder="Personal goals, secrets..." minHeight="100px" />
        </FormField>
        <FormField label="Factions">
          <FactionPillSelector
            selectedIds={form.faction_ids}
            onChange={ids => setForm(prev => ({ ...prev, faction_ids: ids }))}
            factions={factions}
          />
        </FormField>
        <FormField label="Linked Stat Sheet">
          <select
            value={form.statblock_id ?? ''}
            onChange={e => setForm(prev => ({ ...prev, statblock_id: e.target.value || null }))}
            style={inputStyle}
          >
            <option value="">None</option>
            {monsterStatblocks.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </FormField>
      </Modal>
    </div>
  );
}
