import { useState, useRef } from 'react';
import { Pencil } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useStatBlockPanel } from '../../context/StatBlockPanelContext';
import { Modal } from '../Modal';
import { FormField, inputStyle } from '../FormField';
import { SectionHeader } from '../ui/SectionHeader';
import { InlineEditCard } from '../ui/InlineEditCard';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { MarkdownEditor } from '../ui/MarkdownEditor';
import { MarkdownContent } from '../ui/MarkdownContent';
import { EntityLinkToolbar } from '../ui/EntityLinkToolbar';
import { FactionPillSelector } from '../ui/FactionPillSelector';
import { insertAtCursor } from '../../lib/textUtils';
import { getFactionTypeStyle } from '../../lib/theme';
import type { PlayerCharacter } from '../../lib/database.types';

type PCForm = {
  character_name: string;
  player_name: string | null;
  race: string | null;
  class: string | null;
  background: string | null;
  story_hooks: string | null;
  key_npcs: string | null;
  is_active: boolean;
  faction_ids: string[];
  statblock_id: string | null;
};

const emptyForm = (): PCForm => ({
  character_name: '',
  player_name: '',
  race: '',
  class: '',
  background: '',
  story_hooks: '',
  key_npcs: '',
  is_active: true,
  faction_ids: [],
  statblock_id: null,
});

const inputEditStyle: React.CSSProperties = {
  backgroundColor: '#0f0e17',
  color: '#e8d5b0',
  border: '1px solid #3a3660',
  fontFamily: 'Georgia, Cambria, serif',
  fontSize: '0.875rem',
  borderRadius: '0.375rem',
  padding: '0.375rem 0.5rem',
  width: '100%',
};

const labelStyle: React.CSSProperties = {
  color: '#c9a84c',
  fontSize: '0.65rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

export default function PCs() {
  const { pcs, upsertPC, deletePC, factions, monsterStatblocks } = useCampaign();
  const { openStatBlock } = useStatBlockPanel();
  const confirm = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PCForm>(emptyForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PCForm | null>(null);
  const [saving, setSaving] = useState(false);
  // Textarea refs for entity link toolbar
  const editBgRef = useRef<HTMLTextAreaElement>(null);
  const editHooksRef = useRef<HTMLTextAreaElement>(null);
  const editNpcsRef = useRef<HTMLTextAreaElement>(null);
  const newBgRef = useRef<HTMLTextAreaElement>(null);
  const newHooksRef = useRef<HTMLTextAreaElement>(null);
  const newNpcsRef = useRef<HTMLTextAreaElement>(null);

  const openAdd = () => {
    setForm(emptyForm());
    setModalOpen(true);
  };

  const handleCreate = async () => {
    await upsertPC({ ...form, dm_notes: null });
    setModalOpen(false);
  };

  const startEdit = (pc: PlayerCharacter) => {
    setEditingId(pc.id);
    setEditForm({
      character_name: pc.character_name,
      player_name: pc.player_name,
      race: pc.race,
      class: pc.class,
      background: pc.background,
      story_hooks: pc.story_hooks,
      key_npcs: pc.key_npcs,
      is_active: pc.is_active,
      faction_ids: pc.faction_ids ?? [],
      statblock_id: pc.statblock_id ?? null,
    });
    setExpandedId(pc.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const saveEdit = async () => {
    if (!editForm || !editingId) return;
    const pc = pcs.find(p => p.id === editingId);
    if (!pc) return;
    setSaving(true);
    await upsertPC({
      id: editingId,
      ...editForm,
      dm_notes: pc.dm_notes,
    });
    setSaving(false);
    cancelEdit();
  };

  const handleDelete = async (id: string) => {
    if (await confirm('Delete this character?')) {
      await deletePC(id);
      if (expandedId === id) setExpandedId(null);
      if (editingId === id) cancelEdit();
    }
  };

  return (
    <div>
      <SectionHeader
        title="Player Characters"
        subtitle={`${pcs.length} character${pcs.length !== 1 ? 's' : ''}`}
        onAdd={openAdd}
        addLabel="Add PC"
      />

      {pcs.length === 0 ? (
        <EmptyState message="No player characters yet. Add your first PC!" onAdd={openAdd} addLabel="Add PC" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pcs.map(pc => {
            const isExpanded = expandedId === pc.id;
            const isEditing = editingId === pc.id;

            return (
              <InlineEditCard
                key={pc.id}
                isEditing={isEditing}
                onSave={saveEdit}
                onCancel={cancelEdit}
                onDelete={() => handleDelete(pc.id)}
                saving={saving}
              >
                {isEditing && editForm ? (
                  /* Edit mode */
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block mb-1" style={labelStyle}>Character Name</label>
                        <input type="text" value={editForm.character_name} onChange={e => setEditForm(prev => prev ? { ...prev, character_name: e.target.value } : prev)} placeholder="Character name" autoFocus style={inputEditStyle} />
                      </div>
                      <div>
                        <label className="block mb-1" style={labelStyle}>Player Name</label>
                        <input type="text" value={editForm.player_name ?? ''} onChange={e => setEditForm(prev => prev ? { ...prev, player_name: e.target.value } : prev)} placeholder="Player name" style={inputEditStyle} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block mb-1" style={labelStyle}>Race</label>
                        <input type="text" value={editForm.race ?? ''} onChange={e => setEditForm(prev => prev ? { ...prev, race: e.target.value } : prev)} placeholder="Race" style={inputEditStyle} />
                      </div>
                      <div>
                        <label className="block mb-1" style={labelStyle}>Class</label>
                        <input type="text" value={editForm.class ?? ''} onChange={e => setEditForm(prev => prev ? { ...prev, class: e.target.value } : prev)} placeholder="Class" style={inputEditStyle} />
                      </div>
                    </div>
                    <div>
                      <label className="block mb-1" style={labelStyle}>Background</label>
                      <MarkdownEditor value={editForm.background ?? ''} onChange={v => setEditForm(prev => prev ? { ...prev, background: v } : prev)} placeholder="Background and history..." minHeight="60px" textareaRef={editBgRef} />
                      <EntityLinkToolbar textareaRef={editBgRef} onInsert={markup => setEditForm(prev => prev ? { ...prev, background: insertAtCursor(editBgRef, prev.background ?? '', markup) } : prev)} />
                    </div>
                    <div>
                      <label className="block mb-1" style={labelStyle}>Story Hooks</label>
                      <MarkdownEditor value={editForm.story_hooks ?? ''} onChange={v => setEditForm(prev => prev ? { ...prev, story_hooks: v } : prev)} placeholder="Personal quests, motivations..." minHeight="50px" textareaRef={editHooksRef} />
                      <EntityLinkToolbar textareaRef={editHooksRef} onInsert={markup => setEditForm(prev => prev ? { ...prev, story_hooks: insertAtCursor(editHooksRef, prev.story_hooks ?? '', markup) } : prev)} />
                    </div>
                    <div>
                      <label className="block mb-1" style={labelStyle}>Key NPCs</label>
                      <MarkdownEditor value={editForm.key_npcs ?? ''} onChange={v => setEditForm(prev => prev ? { ...prev, key_npcs: v } : prev)} placeholder="Relationships..." minHeight="50px" textareaRef={editNpcsRef} />
                      <EntityLinkToolbar textareaRef={editNpcsRef} onInsert={markup => setEditForm(prev => prev ? { ...prev, key_npcs: insertAtCursor(editNpcsRef, prev.key_npcs ?? '', markup) } : prev)} />
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
                  /* View mode */
                  <div>
                    <div
                      className="cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : pc.id)}
                    >
                      <div className="flex items-start justify-between group">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold" style={{ color: '#e8d5b0', fontFamily: 'Georgia, Cambria, serif' }}>
                            {pc.character_name || 'Unnamed'}
                          </h3>
                          <div className="text-sm mt-1" style={{ color: '#c9a84c' }}>
                            {[pc.race, pc.class].filter(Boolean).join(' · ')}
                          </div>
                          <div className="text-xs mt-1" style={{ color: '#9990b0' }}>
                            Player: {pc.player_name || '—'}
                          </div>
                          {pc.faction_ids && pc.faction_ids.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {pc.faction_ids.map(fid => {
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
                                      borderRadius: 3,
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
                          {pc.statblock_id && (() => {
                            const sb = monsterStatblocks.find(m => m.id === pc.statblock_id);
                            if (!sb) return null;
                            return (
                              <div className="mt-2">
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); openStatBlock(sb.id); }}
                                  className="text-xs underline"
                                  style={{ color: '#70a0e0', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                                  title="Open stat sheet"
                                >
                                  {sb.name}
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-1">
                          {!pc.is_active && <Badge label="Inactive" color="muted" size="xs" />}
                          <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); startEdit(pc); }} title="Edit">
                            <Pencil size={12} strokeWidth={1.5} />
                          </Button>
                          <span className="text-xs" style={{ color: '#6a6490' }}>
                            {isExpanded ? '▲' : '▼'}
                          </span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t" style={{ borderColor: '#3a3660' }}>
                          {pc.background && (
                            <div className="mb-3">
                              <div className="mb-1" style={labelStyle}>Background</div>
                              <MarkdownContent text={pc.background} className="text-sm" style={{ color: '#c9b88a', lineHeight: '1.6' }} />
                            </div>
                          )}
                          {pc.story_hooks && (
                            <div className="mb-3">
                              <div className="mb-1" style={labelStyle}>Story Hooks</div>
                              <MarkdownContent text={pc.story_hooks} className="text-sm" style={{ color: '#c9b88a', lineHeight: '1.6' }} />
                            </div>
                          )}
                          {pc.key_npcs && (
                            <div className="mb-3">
                              <div className="mb-1" style={labelStyle}>Key NPCs</div>
                              <MarkdownContent text={pc.key_npcs} className="text-sm" style={{ color: '#c9b88a', lineHeight: '1.6' }} />
                            </div>
                          )}
                          {!pc.background && !pc.story_hooks && !pc.key_npcs && (
                            <p className="text-sm" style={{ color: '#6a6490', fontStyle: 'italic' }}>No additional details recorded.</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </InlineEditCard>
            );
          })}
        </div>
      )}

      {/* Create-only modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New Player Character"
        onSave={handleCreate}
        wide
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Player's Name">
            <input type="text" value={form.player_name ?? ''} onChange={e => setForm(prev => ({ ...prev, player_name: e.target.value }))} placeholder="e.g., John" style={inputStyle} />
          </FormField>
          <FormField label="Character Name">
            <input type="text" value={form.character_name} onChange={e => setForm(prev => ({ ...prev, character_name: e.target.value }))} placeholder="e.g., Thorin Ironforge" style={inputStyle} />
          </FormField>
          <FormField label="Race">
            <input type="text" value={form.race ?? ''} onChange={e => setForm(prev => ({ ...prev, race: e.target.value }))} placeholder="e.g., Dwarf" style={inputStyle} />
          </FormField>
          <FormField label="Class">
            <input type="text" value={form.class ?? ''} onChange={e => setForm(prev => ({ ...prev, class: e.target.value }))} placeholder="e.g., Fighter" style={inputStyle} />
          </FormField>
        </div>
        <FormField label="Background">
          <MarkdownEditor value={form.background ?? ''} onChange={v => setForm(prev => ({ ...prev, background: v }))} placeholder="Character background and history..." minHeight="100px" textareaRef={newBgRef} />
          <EntityLinkToolbar textareaRef={newBgRef} onInsert={markup => setForm(prev => ({ ...prev, background: insertAtCursor(newBgRef, prev.background ?? '', markup) }))} />
        </FormField>
        <FormField label="Story Hooks">
          <MarkdownEditor value={form.story_hooks ?? ''} onChange={v => setForm(prev => ({ ...prev, story_hooks: v }))} placeholder="Personal quests, unresolved story threads, motivations..." minHeight="80px" textareaRef={newHooksRef} />
          <EntityLinkToolbar textareaRef={newHooksRef} onInsert={markup => setForm(prev => ({ ...prev, story_hooks: insertAtCursor(newHooksRef, prev.story_hooks ?? '', markup) }))} />
        </FormField>
        <FormField label="Key NPCs">
          <MarkdownEditor value={form.key_npcs ?? ''} onChange={v => setForm(prev => ({ ...prev, key_npcs: v }))} placeholder="Relationships with NPCs, other PCs, factions..." minHeight="80px" textareaRef={newNpcsRef} />
          <EntityLinkToolbar textareaRef={newNpcsRef} onInsert={markup => setForm(prev => ({ ...prev, key_npcs: insertAtCursor(newNpcsRef, prev.key_npcs ?? '', markup) }))} />
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
