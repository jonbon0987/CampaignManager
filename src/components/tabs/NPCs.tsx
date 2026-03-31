import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import type { NPC } from '../../lib/database.types';

type NPCForm = {
  name: string;
  role: string | null;
  affiliation: string | null;
  status: NPC['status'];
  description: string | null;
  hooks_motivations: string | null;
};

const emptyForm = (): NPCForm => ({
  name: '',
  role: '',
  affiliation: '',
  status: 'active',
  description: '',
  hooks_motivations: '',
});

const statusStyles: Record<NPC['status'], { bg: string; text: string }> = {
  active:   { bg: '#1a3a1a', text: '#4caf7d' },
  deceased: { bg: '#3a1a1a', text: '#e05c5c' },
  unknown:  { bg: '#2a2a1a', text: '#c9a84c' },
};

export default function NPCs() {
  const { npcs, upsertNPC, deleteNPC } = useCampaign();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingNPC, setEditingNPC] = useState<NPC | null>(null);
  const [form, setForm] = useState<NPCForm>(emptyForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = npcs.filter(npc => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      npc.name.toLowerCase().includes(q) ||
      (npc.role ?? '').toLowerCase().includes(q) ||
      (npc.description ?? '').toLowerCase().includes(q)
    );
  });

  const openAdd = () => {
    setEditingNPC(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (npc: NPC) => {
    setEditingNPC(npc);
    setForm({
      name: npc.name,
      role: npc.role,
      affiliation: npc.affiliation,
      status: npc.status,
      description: npc.description,
      hooks_motivations: npc.hooks_motivations,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    await upsertNPC({
      ...(editingNPC ? { id: editingNPC.id } : {}),
      ...form,
      dm_notes: editingNPC?.dm_notes ?? null,
      location: editingNPC?.location ?? null,
      first_session: editingNPC?.first_session ?? null,
    });
    setModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this NPC?')) {
      await deleteNPC(id);
      if (expandedId === id) setExpandedId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold" style={{ color: '#c9a84c', fontFamily: 'Georgia, serif' }}>
          Non-Player Characters
        </h2>
        <button
          onClick={openAdd}
          className="px-4 py-2 rounded text-sm font-semibold transition-colors"
          style={{ backgroundColor: '#a07830', color: '#e8d5b0' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#c9a84c')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#a07830')}
        >
          + Add NPC
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search NPCs by name, role, or description..."
          style={{ ...inputStyle, maxWidth: '420px' }}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#6a6490' }}>
          {search ? 'No NPCs match your search.' : 'No NPCs yet. Add your first NPC!'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(npc => {
            const ss = statusStyles[npc.status];
            return (
              <div
                key={npc.id}
                className="rounded-lg border flex flex-col"
                style={{ backgroundColor: '#1a1828', borderColor: '#3a3660' }}
              >
                <div
                  className="p-4 cursor-pointer flex-1"
                  onClick={() => setExpandedId(expandedId === npc.id ? null : npc.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 pr-2">
                      <h3 className="font-bold text-lg" style={{ color: '#e8d5b0', fontFamily: 'Georgia, serif' }}>
                        {npc.name || 'Unnamed NPC'}
                      </h3>
                      {npc.role && (
                        <div className="text-sm mt-0.5" style={{ color: '#9990b0' }}>{npc.role}</div>
                      )}
                      {npc.affiliation && (
                        <div className="text-xs mt-0.5" style={{ color: '#6a6490' }}>{npc.affiliation}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className="text-xs px-2 py-0.5 rounded capitalize"
                        style={{ backgroundColor: ss.bg, color: ss.text }}
                      >
                        {npc.status}
                      </span>
                      <span className="text-xs ml-1" style={{ color: '#6a6490' }}>
                        {expandedId === npc.id ? '▲' : '▼'}
                      </span>
                    </div>
                  </div>

                  {npc.description && (
                    <p className="text-sm mt-2" style={{ color: '#c9b88a', lineHeight: '1.5' }}>
                      {expandedId === npc.id
                        ? npc.description
                        : npc.description.substring(0, 100) + (npc.description.length > 100 ? '...' : '')}
                    </p>
                  )}

                  {expandedId === npc.id && npc.hooks_motivations && (
                    <div className="mt-4 pt-4 border-t" style={{ borderColor: '#3a3660' }}>
                      <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#c9a84c' }}>
                        Hooks & Motivations
                      </div>
                      <p className="text-sm" style={{ color: '#e8d5b0', lineHeight: '1.6' }}>{npc.hooks_motivations}</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 p-3 pt-0">
                  <button
                    onClick={() => openEdit(npc)}
                    className="text-xs px-2 py-1 rounded flex-1 transition-colors"
                    style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(npc.id)}
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={{ backgroundColor: '#22203a', color: '#e05c5c', border: '1px solid #3a3660' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingNPC ? 'Edit NPC' : 'New NPC'}
        onSave={handleSave}
        wide
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Name">
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Garrak the Bold"
              style={inputStyle}
            />
          </FormField>
          <FormField label="Role / Title">
            <input
              type="text"
              value={form.role ?? ''}
              onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))}
              placeholder="e.g., Merchant, Villain, Quest Giver"
              style={inputStyle}
            />
          </FormField>
          <FormField label="Affiliation">
            <input
              type="text"
              value={form.affiliation ?? ''}
              onChange={e => setForm(prev => ({ ...prev, affiliation: e.target.value }))}
              placeholder="e.g., Merchant Guild, City Watch"
              style={inputStyle}
            />
          </FormField>
          <FormField label="Status">
            <select
              value={form.status}
              onChange={e => setForm(prev => ({ ...prev, status: e.target.value as NPC['status'] }))}
              style={inputStyle}
            >
              <option value="active">Active</option>
              <option value="deceased">Deceased</option>
              <option value="unknown">Unknown</option>
            </select>
          </FormField>
        </div>
        <FormField label="Description">
          <textarea
            value={form.description ?? ''}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Physical appearance, personality, and first impressions..."
            style={{ ...textareaStyle, minHeight: '80px' }}
          />
        </FormField>
        <FormField label="Hooks & Motivations">
          <textarea
            value={form.hooks_motivations ?? ''}
            onChange={e => setForm(prev => ({ ...prev, hooks_motivations: e.target.value }))}
            placeholder="Personal goals, secrets, relationships..."
            style={{ ...textareaStyle, minHeight: '100px' }}
          />
        </FormField>
      </Modal>
    </div>
  );
}
