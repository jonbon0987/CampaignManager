import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
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

export default function PCs() {
  const { pcs, upsertPC, deletePC } = useCampaign();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPC, setEditingPC] = useState<PlayerCharacter | null>(null);
  const [form, setForm] = useState<PCForm>(emptyForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const openAdd = () => {
    setEditingPC(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (pc: PlayerCharacter) => {
    setEditingPC(pc);
    setForm({
      character_name: pc.character_name,
      player_name: pc.player_name,
      race: pc.race,
      class: pc.class,
      background: pc.background,
      story_hooks: pc.story_hooks,
      key_npcs: pc.key_npcs,
      is_active: pc.is_active,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    await upsertPC({
      ...(editingPC ? { id: editingPC.id } : {}),
      ...form,
      dm_notes: editingPC?.dm_notes ?? null,
    });
    setModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this character?')) {
      await deletePC(id);
      if (expandedId === id) setExpandedId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold" style={{ color: '#c9a84c', fontFamily: 'Georgia, serif' }}>
          Player Characters
        </h2>
        <button
          onClick={openAdd}
          className="px-4 py-2 rounded text-sm font-semibold transition-colors"
          style={{ backgroundColor: '#a07830', color: '#e8d5b0' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#c9a84c')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#a07830')}
        >
          + Add PC
        </button>
      </div>

      {pcs.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#6a6490' }}>
          No player characters yet. Add your first PC!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pcs.map(pc => (
            <div
              key={pc.id}
              className="rounded-lg border flex flex-col"
              style={{ backgroundColor: '#1a1828', borderColor: '#3a3660' }}
            >
              <div
                className="p-4 cursor-pointer flex-1"
                onClick={() => setExpandedId(expandedId === pc.id ? null : pc.id)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-lg" style={{ color: '#e8d5b0', fontFamily: 'Georgia, serif' }}>
                      {pc.character_name || 'Unnamed'}
                    </h3>
                    <div className="text-sm mt-1" style={{ color: '#c9a84c' }}>
                      {[pc.race, pc.class].filter(Boolean).join(' · ')}
                    </div>
                    <div className="text-xs mt-1" style={{ color: '#9990b0' }}>
                      Player: {pc.player_name || '—'}
                    </div>
                  </div>
                  <span className="text-xs ml-2 mt-1" style={{ color: '#6a6490' }}>
                    {expandedId === pc.id ? '▲' : '▼'}
                  </span>
                </div>

                {expandedId === pc.id && (
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: '#3a3660' }}>
                    {pc.background && (
                      <div className="mb-3">
                        <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#c9a84c' }}>Background</div>
                        <p className="text-sm" style={{ color: '#e8d5b0', lineHeight: '1.6' }}>{pc.background}</p>
                      </div>
                    )}
                    {pc.story_hooks && (
                      <div className="mb-3">
                        <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#c9a84c' }}>Story Hooks</div>
                        <p className="text-sm" style={{ color: '#e8d5b0', lineHeight: '1.6' }}>{pc.story_hooks}</p>
                      </div>
                    )}
                    {pc.key_npcs && (
                      <div className="mb-3">
                        <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#c9a84c' }}>Key NPCs</div>
                        <p className="text-sm" style={{ color: '#e8d5b0', lineHeight: '1.6' }}>{pc.key_npcs}</p>
                      </div>
                    )}
                    {!pc.background && !pc.story_hooks && !pc.key_npcs && (
                      <p className="text-sm" style={{ color: '#6a6490', fontStyle: 'italic' }}>No additional details recorded.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-2 p-3 pt-0">
                <button
                  onClick={() => openEdit(pc)}
                  className="text-xs px-2 py-1 rounded flex-1 transition-colors"
                  style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(pc.id)}
                  className="text-xs px-2 py-1 rounded transition-colors"
                  style={{ backgroundColor: '#22203a', color: '#e05c5c', border: '1px solid #3a3660' }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingPC ? 'Edit Player Character' : 'New Player Character'}
        onSave={handleSave}
        wide
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Player's Name">
            <input
              type="text"
              value={form.player_name ?? ''}
              onChange={e => setForm(prev => ({ ...prev, player_name: e.target.value }))}
              placeholder="e.g., John"
              style={inputStyle}
            />
          </FormField>
          <FormField label="Character Name">
            <input
              type="text"
              value={form.character_name}
              onChange={e => setForm(prev => ({ ...prev, character_name: e.target.value }))}
              placeholder="e.g., Thorin Ironforge"
              style={inputStyle}
            />
          </FormField>
          <FormField label="Race">
            <input
              type="text"
              value={form.race ?? ''}
              onChange={e => setForm(prev => ({ ...prev, race: e.target.value }))}
              placeholder="e.g., Dwarf"
              style={inputStyle}
            />
          </FormField>
          <FormField label="Class">
            <input
              type="text"
              value={form.class ?? ''}
              onChange={e => setForm(prev => ({ ...prev, class: e.target.value }))}
              placeholder="e.g., Fighter"
              style={inputStyle}
            />
          </FormField>
        </div>
        <FormField label="Background">
          <textarea
            value={form.background ?? ''}
            onChange={e => setForm(prev => ({ ...prev, background: e.target.value }))}
            placeholder="Character background and history..."
            style={{ ...textareaStyle, minHeight: '100px' }}
          />
        </FormField>
        <FormField label="Story Hooks">
          <textarea
            value={form.story_hooks ?? ''}
            onChange={e => setForm(prev => ({ ...prev, story_hooks: e.target.value }))}
            placeholder="Personal quests, unresolved story threads, motivations..."
            style={{ ...textareaStyle, minHeight: '80px' }}
          />
        </FormField>
        <FormField label="Key NPCs">
          <textarea
            value={form.key_npcs ?? ''}
            onChange={e => setForm(prev => ({ ...prev, key_npcs: e.target.value }))}
            placeholder="Relationships with NPCs, other PCs, factions..."
            style={{ ...textareaStyle, minHeight: '80px' }}
          />
        </FormField>
      </Modal>
    </div>
  );
}
