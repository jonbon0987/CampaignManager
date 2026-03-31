import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import type { CampaignModule } from '../../types';

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

const emptyModule = (): Omit<CampaignModule, 'id'> => ({
  number: 1,
  title: '',
  description: '',
  keyEvents: '',
  status: 'upcoming',
});

const statusStyles: Record<CampaignModule['status'], { bg: string; text: string; border: string }> = {
  upcoming:  { bg: '#1a1a3a', text: '#6090e0', border: '#3a3a7a' },
  active:    { bg: '#1a3a1a', text: '#4caf7d', border: '#2a7a2a' },
  completed: { bg: '#2a2a2a', text: '#7a7a7a', border: '#4a4a4a' },
};

export default function Modules() {
  const { data, setData } = useCampaign();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<CampaignModule | null>(null);
  const [form, setForm] = useState(emptyModule());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = [...data.modules].sort((a, b) => a.number - b.number);

  const openAdd = () => {
    const nextNumber = data.modules.length > 0
      ? Math.max(...data.modules.map(m => m.number)) + 1
      : 1;
    setEditingModule(null);
    setForm({ ...emptyModule(), number: nextNumber });
    setModalOpen(true);
  };

  const openEdit = (mod: CampaignModule) => {
    setEditingModule(mod);
    setForm({
      number: mod.number,
      title: mod.title,
      description: mod.description,
      keyEvents: mod.keyEvents,
      status: mod.status,
    });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (editingModule) {
      setData(prev => ({
        ...prev,
        modules: prev.modules.map(m => m.id === editingModule.id ? { ...m, ...form } : m),
      }));
    } else {
      setData(prev => ({
        ...prev,
        modules: [...prev.modules, { id: generateId(), ...form }],
      }));
    }
    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this module?')) {
      setData(prev => ({ ...prev, modules: prev.modules.filter(m => m.id !== id) }));
      if (expandedId === id) setExpandedId(null);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold" style={{ color: '#c9a84c', fontFamily: 'Georgia, serif' }}>
          Modules
        </h2>
        <button
          onClick={openAdd}
          className="px-4 py-2 rounded text-sm font-semibold transition-colors"
          style={{ backgroundColor: '#a07830', color: '#e8d5b0' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#c9a84c')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#a07830')}
        >
          + Add Module
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#6a6490' }}>
          No modules yet. Add your first campaign chapter!
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(mod => {
            const ss = statusStyles[mod.status];
            const isExpanded = expandedId === mod.id;
            return (
              <div
                key={mod.id}
                className="rounded-lg border overflow-hidden"
                style={{ backgroundColor: '#1a1828', borderColor: '#3a3660' }}
              >
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer"
                  style={{ borderBottom: isExpanded ? '1px solid #3a3660' : 'none' }}
                  onClick={() => setExpandedId(isExpanded ? null : mod.id)}
                >
                  <div
                    className="text-3xl font-bold shrink-0 w-10 text-center"
                    style={{ color: '#3a3660', fontFamily: 'Georgia, serif' }}
                  >
                    {String(mod.number).padStart(2, '0')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold" style={{ color: '#e8d5b0', fontFamily: 'Georgia, serif' }}>
                      Chapter {mod.number}: {mod.title || 'Untitled'}
                    </h3>
                    {mod.description && (
                      <p className="text-sm mt-0.5" style={{ color: '#9990b0' }}>
                        {mod.description.substring(0, 90)}{mod.description.length > 90 ? '...' : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-xs px-2 py-1 rounded border capitalize"
                      style={{ backgroundColor: ss.bg, color: ss.text, borderColor: ss.border }}
                    >
                      {mod.status}
                    </span>
                    <span className="text-xs" style={{ color: '#6a6490' }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-4">
                    {mod.description && (
                      <div className="mb-4">
                        <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#c9a84c' }}>Description</div>
                        <p className="text-sm" style={{ color: '#e8d5b0', lineHeight: '1.6' }}>{mod.description}</p>
                      </div>
                    )}
                    {mod.keyEvents && (
                      <div className="mb-4">
                        <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#c9a84c' }}>Key Events</div>
                        <pre className="text-sm whitespace-pre-wrap" style={{ color: '#e8d5b0', lineHeight: '1.7', fontFamily: 'Georgia, serif' }}>
                          {mod.keyEvents}
                        </pre>
                      </div>
                    )}
                    {!mod.description && !mod.keyEvents && (
                      <p className="text-sm mb-4" style={{ color: '#6a6490', fontStyle: 'italic' }}>No details recorded for this module.</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={e => { e.stopPropagation(); openEdit(mod); }}
                        className="text-xs px-3 py-1 rounded transition-colors"
                        style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(mod.id); }}
                        className="text-xs px-3 py-1 rounded transition-colors"
                        style={{ backgroundColor: '#22203a', color: '#e05c5c', border: '1px solid #3a3660' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingModule ? 'Edit Module' : 'New Module'}
        onSave={handleSave}
        wide
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Chapter #">
            <input
              type="number"
              value={form.number}
              min={1}
              onChange={e => setForm(prev => ({ ...prev, number: parseInt(e.target.value) || 1 }))}
              style={inputStyle}
            />
          </FormField>
          <FormField label="Status">
            <select
              value={form.status}
              onChange={e => setForm(prev => ({ ...prev, status: e.target.value as CampaignModule['status'] }))}
              style={inputStyle}
            >
              <option value="upcoming">Upcoming</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </FormField>
        </div>
        <FormField label="Title">
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
            placeholder="e.g., The Train Heist"
            style={inputStyle}
          />
        </FormField>
        <FormField label="Description">
          <textarea
            value={form.description}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Overview of this chapter's events, goals, and themes..."
            style={{ ...textareaStyle, minHeight: '100px' }}
          />
        </FormField>
        <FormField label="Key Events">
          <textarea
            value={form.keyEvents}
            onChange={e => setForm(prev => ({ ...prev, keyEvents: e.target.value }))}
            placeholder="Important scenes, encounters, story beats, revelations..."
            style={{ ...textareaStyle, minHeight: '160px' }}
          />
        </FormField>
      </Modal>
    </div>
  );
}
