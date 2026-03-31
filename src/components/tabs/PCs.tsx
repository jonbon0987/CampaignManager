import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import type { PC } from '../../types';

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

const emptyPC = (): Omit<PC, 'id'> => ({
  playerName: '',
  characterName: '',
  race: '',
  characterClass: '',
  level: 1,
  backstory: '',
  hooks: '',
  connections: '',
});

export default function PCs() {
  const { data, setData } = useCampaign();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPC, setEditingPC] = useState<PC | null>(null);
  const [form, setForm] = useState(emptyPC());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const openAdd = () => {
    setEditingPC(null);
    setForm(emptyPC());
    setModalOpen(true);
  };

  const openEdit = (pc: PC) => {
    setEditingPC(pc);
    setForm({
      playerName: pc.playerName,
      characterName: pc.characterName,
      race: pc.race,
      characterClass: pc.characterClass,
      level: pc.level,
      backstory: pc.backstory,
      hooks: pc.hooks,
      connections: pc.connections,
    });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (editingPC) {
      setData(prev => ({
        ...prev,
        pcs: prev.pcs.map(pc => pc.id === editingPC.id ? { ...pc, ...form } : pc),
      }));
    } else {
      setData(prev => ({
        ...prev,
        pcs: [...prev.pcs, { id: generateId(), ...form }],
      }));
    }
    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this character?')) {
      setData(prev => ({ ...prev, pcs: prev.pcs.filter(pc => pc.id !== id) }));
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

      {data.pcs.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#6a6490' }}>
          No player characters yet. Add your first PC!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.pcs.map(pc => (
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
                      {pc.characterName || 'Unnamed'}
                    </h3>
                    <div className="text-sm mt-1" style={{ color: '#c9a84c' }}>
                      {[pc.race, pc.characterClass, pc.level ? `Lvl ${pc.level}` : null].filter(Boolean).join(' · ')}
                    </div>
                    <div className="text-xs mt-1" style={{ color: '#9990b0' }}>
                      Player: {pc.playerName || '—'}
                    </div>
                  </div>
                  <span className="text-xs ml-2 mt-1" style={{ color: '#6a6490' }}>
                    {expandedId === pc.id ? '▲' : '▼'}
                  </span>
                </div>

                {expandedId === pc.id && (
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: '#3a3660' }}>
                    {pc.backstory && (
                      <div className="mb-3">
                        <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#c9a84c' }}>Backstory</div>
                        <p className="text-sm" style={{ color: '#e8d5b0', lineHeight: '1.6' }}>{pc.backstory}</p>
                      </div>
                    )}
                    {pc.hooks && (
                      <div className="mb-3">
                        <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#c9a84c' }}>Character Hooks</div>
                        <p className="text-sm" style={{ color: '#e8d5b0', lineHeight: '1.6' }}>{pc.hooks}</p>
                      </div>
                    )}
                    {pc.connections && (
                      <div className="mb-3">
                        <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#c9a84c' }}>Connections</div>
                        <p className="text-sm" style={{ color: '#e8d5b0', lineHeight: '1.6' }}>{pc.connections}</p>
                      </div>
                    )}
                    {!pc.backstory && !pc.hooks && !pc.connections && (
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
              value={form.playerName}
              onChange={e => setForm(prev => ({ ...prev, playerName: e.target.value }))}
              placeholder="e.g., John"
              style={inputStyle}
            />
          </FormField>
          <FormField label="Character Name">
            <input
              type="text"
              value={form.characterName}
              onChange={e => setForm(prev => ({ ...prev, characterName: e.target.value }))}
              placeholder="e.g., Thorin Ironforge"
              style={inputStyle}
            />
          </FormField>
          <FormField label="Race">
            <input
              type="text"
              value={form.race}
              onChange={e => setForm(prev => ({ ...prev, race: e.target.value }))}
              placeholder="e.g., Dwarf"
              style={inputStyle}
            />
          </FormField>
          <FormField label="Class">
            <input
              type="text"
              value={form.characterClass}
              onChange={e => setForm(prev => ({ ...prev, characterClass: e.target.value }))}
              placeholder="e.g., Fighter"
              style={inputStyle}
            />
          </FormField>
        </div>
        <FormField label="Level">
          <input
            type="number"
            value={form.level}
            min={1}
            max={20}
            onChange={e => setForm(prev => ({ ...prev, level: parseInt(e.target.value) || 1 }))}
            style={{ ...inputStyle, maxWidth: '100px' }}
          />
        </FormField>
        <FormField label="Backstory">
          <textarea
            value={form.backstory}
            onChange={e => setForm(prev => ({ ...prev, backstory: e.target.value }))}
            placeholder="Character background and history..."
            style={{ ...textareaStyle, minHeight: '100px' }}
          />
        </FormField>
        <FormField label="Character Hooks">
          <textarea
            value={form.hooks}
            onChange={e => setForm(prev => ({ ...prev, hooks: e.target.value }))}
            placeholder="Personal quests, unresolved story threads, motivations..."
            style={{ ...textareaStyle, minHeight: '80px' }}
          />
        </FormField>
        <FormField label="Connections">
          <textarea
            value={form.connections}
            onChange={e => setForm(prev => ({ ...prev, connections: e.target.value }))}
            placeholder="Relationships with NPCs, other PCs, factions..."
            style={{ ...textareaStyle, minHeight: '80px' }}
          />
        </FormField>
      </Modal>
    </div>
  );
}
