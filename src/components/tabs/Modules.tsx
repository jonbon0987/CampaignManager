import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import type { Module } from '../../lib/database.types';

type ModuleForm = {
  chapter: string | null;
  title: string;
  synopsis: string | null;
  encounters: string | null;
  status: Module['status'];
};

const emptyForm = (): ModuleForm => ({
  chapter: '',
  title: '',
  synopsis: '',
  encounters: '',
  status: 'planned',
});

const statusStyles: Record<Module['status'], { bg: string; text: string; border: string }> = {
  planned:   { bg: '#1a1a3a', text: '#6090e0', border: '#3a3a7a' },
  active:    { bg: '#1a3a1a', text: '#4caf7d', border: '#2a7a2a' },
  completed: { bg: '#2a2a2a', text: '#7a7a7a', border: '#4a4a4a' },
};

export default function Modules() {
  const { modules, upsertModule, deleteModule } = useCampaign();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<Module | null>(null);
  const [form, setForm] = useState<ModuleForm>(emptyForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const openAdd = () => {
    setEditingModule(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (mod: Module) => {
    setEditingModule(mod);
    setForm({
      chapter: mod.chapter,
      title: mod.title,
      synopsis: mod.synopsis,
      encounters: mod.encounters,
      status: mod.status,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    await upsertModule({
      ...(editingModule ? { id: editingModule.id } : {}),
      ...form,
      played_session: editingModule?.played_session ?? null,
      rewards: editingModule?.rewards ?? null,
      dm_notes: editingModule?.dm_notes ?? null,
    });
    setModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this module?')) {
      await deleteModule(id);
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

      {modules.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#6a6490' }}>
          No modules yet. Add your first campaign chapter!
        </div>
      ) : (
        <div className="space-y-3">
          {modules.map(mod => {
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
                  {mod.chapter && (
                    <div
                      className="text-3xl font-bold shrink-0 w-10 text-center"
                      style={{ color: '#3a3660', fontFamily: 'Georgia, serif' }}
                    >
                      {mod.chapter}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold" style={{ color: '#e8d5b0', fontFamily: 'Georgia, serif' }}>
                      {mod.chapter ? `Chapter ${mod.chapter}: ` : ''}{mod.title || 'Untitled'}
                    </h3>
                    {mod.synopsis && (
                      <p className="text-sm mt-0.5" style={{ color: '#9990b0' }}>
                        {mod.synopsis.substring(0, 90)}{mod.synopsis.length > 90 ? '...' : ''}
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
                    {mod.synopsis && (
                      <div className="mb-4">
                        <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#c9a84c' }}>Synopsis</div>
                        <p className="text-sm" style={{ color: '#e8d5b0', lineHeight: '1.6' }}>{mod.synopsis}</p>
                      </div>
                    )}
                    {mod.encounters && (
                      <div className="mb-4">
                        <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#c9a84c' }}>Encounters</div>
                        <pre className="text-sm whitespace-pre-wrap" style={{ color: '#e8d5b0', lineHeight: '1.7', fontFamily: 'Georgia, serif' }}>
                          {mod.encounters}
                        </pre>
                      </div>
                    )}
                    {!mod.synopsis && !mod.encounters && (
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
          <FormField label="Chapter">
            <input
              type="text"
              value={form.chapter ?? ''}
              onChange={e => setForm(prev => ({ ...prev, chapter: e.target.value }))}
              placeholder="e.g., 1"
              style={inputStyle}
            />
          </FormField>
          <FormField label="Status">
            <select
              value={form.status}
              onChange={e => setForm(prev => ({ ...prev, status: e.target.value as Module['status'] }))}
              style={inputStyle}
            >
              <option value="planned">Planned</option>
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
        <FormField label="Synopsis">
          <textarea
            value={form.synopsis ?? ''}
            onChange={e => setForm(prev => ({ ...prev, synopsis: e.target.value }))}
            placeholder="Overview of this chapter's events, goals, and themes..."
            style={{ ...textareaStyle, minHeight: '100px' }}
          />
        </FormField>
        <FormField label="Encounters">
          <textarea
            value={form.encounters ?? ''}
            onChange={e => setForm(prev => ({ ...prev, encounters: e.target.value }))}
            placeholder="Important scenes, encounters, story beats, revelations..."
            style={{ ...textareaStyle, minHeight: '160px' }}
          />
        </FormField>
      </Modal>
    </div>
  );
}
