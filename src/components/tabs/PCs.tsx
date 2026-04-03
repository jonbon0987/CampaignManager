import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import { SectionHeader } from '../ui/SectionHeader';
import { InlineEditCard } from '../ui/InlineEditCard';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
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
  const { pcs, upsertPC, deletePC } = useCampaign();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PCForm>(emptyForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PCForm | null>(null);
  const [saving, setSaving] = useState(false);

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
    if (confirm('Delete this character?')) {
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
                      <textarea value={editForm.background ?? ''} onChange={e => setEditForm(prev => prev ? { ...prev, background: e.target.value } : prev)} placeholder="Background and history..." rows={3} className="w-full resize-y outline-none" style={{ ...inputEditStyle, minHeight: '60px' }} />
                    </div>
                    <div>
                      <label className="block mb-1" style={labelStyle}>Story Hooks</label>
                      <textarea value={editForm.story_hooks ?? ''} onChange={e => setEditForm(prev => prev ? { ...prev, story_hooks: e.target.value } : prev)} placeholder="Personal quests, motivations..." rows={2} className="w-full resize-y outline-none" style={{ ...inputEditStyle, minHeight: '50px' }} />
                    </div>
                    <div>
                      <label className="block mb-1" style={labelStyle}>Key NPCs</label>
                      <textarea value={editForm.key_npcs ?? ''} onChange={e => setEditForm(prev => prev ? { ...prev, key_npcs: e.target.value } : prev)} placeholder="Relationships..." rows={2} className="w-full resize-y outline-none" style={{ ...inputEditStyle, minHeight: '50px' }} />
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
                        <div>
                          <h3 className="font-bold" style={{ color: '#e8d5b0', fontFamily: 'Georgia, Cambria, serif' }}>
                            {pc.character_name || 'Unnamed'}
                          </h3>
                          <div className="text-sm mt-1" style={{ color: '#c9a84c' }}>
                            {[pc.race, pc.class].filter(Boolean).join(' · ')}
                          </div>
                          <div className="text-xs mt-1" style={{ color: '#9990b0' }}>
                            Player: {pc.player_name || '—'}
                          </div>
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
                              <p className="text-sm" style={{ color: '#c9b88a', lineHeight: '1.6' }}>{pc.background}</p>
                            </div>
                          )}
                          {pc.story_hooks && (
                            <div className="mb-3">
                              <div className="mb-1" style={labelStyle}>Story Hooks</div>
                              <p className="text-sm" style={{ color: '#c9b88a', lineHeight: '1.6' }}>{pc.story_hooks}</p>
                            </div>
                          )}
                          {pc.key_npcs && (
                            <div className="mb-3">
                              <div className="mb-1" style={labelStyle}>Key NPCs</div>
                              <p className="text-sm" style={{ color: '#c9b88a', lineHeight: '1.6' }}>{pc.key_npcs}</p>
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
          <textarea value={form.background ?? ''} onChange={e => setForm(prev => ({ ...prev, background: e.target.value }))} placeholder="Character background and history..." style={{ ...textareaStyle, minHeight: '100px' }} />
        </FormField>
        <FormField label="Story Hooks">
          <textarea value={form.story_hooks ?? ''} onChange={e => setForm(prev => ({ ...prev, story_hooks: e.target.value }))} placeholder="Personal quests, unresolved story threads, motivations..." style={{ ...textareaStyle, minHeight: '80px' }} />
        </FormField>
        <FormField label="Key NPCs">
          <textarea value={form.key_npcs ?? ''} onChange={e => setForm(prev => ({ ...prev, key_npcs: e.target.value }))} placeholder="Relationships with NPCs, other PCs, factions..." style={{ ...textareaStyle, minHeight: '80px' }} />
        </FormField>
      </Modal>
    </div>
  );
}
