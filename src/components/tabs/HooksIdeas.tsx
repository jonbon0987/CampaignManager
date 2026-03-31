import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import type { Hook } from '../../lib/database.types';

const CATEGORIES = ['main_plot', 'side_quest', 'character_arc', 'faction'] as const;
type Category = (typeof CATEGORIES)[number];

type HookForm = {
  title: string;
  category: string | null;
  description: string | null;
  is_active: boolean;
};

const emptyForm = (): HookForm => ({
  title: '',
  category: 'side_quest',
  description: '',
  is_active: true,
});

const categoryStyles: Record<Category, { border: string; badge: string; badgeBg: string }> = {
  main_plot:     { border: '#6a2a2a', badge: '#e05c5c', badgeBg: '#3a1a1a' },
  side_quest:    { border: '#4a3a1a', badge: '#c9a84c', badgeBg: '#2a2a10' },
  character_arc: { border: '#1a3a3a', badge: '#4caf7d', badgeBg: '#0a2a1a' },
  faction:       { border: '#2a1a4a', badge: '#9060e0', badgeBg: '#1a0a3a' },
};

const defaultStyle = categoryStyles.side_quest;

function getStyle(category: string | null) {
  return categoryStyles[category as Category] ?? defaultStyle;
}

function formatCategory(cat: string | null) {
  if (!cat) return 'Misc';
  return cat.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function HooksIdeas() {
  const { hooks, upsertHook, deleteHook } = useCampaign();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHook, setEditingHook] = useState<Hook | null>(null);
  const [form, setForm] = useState<HookForm>(emptyForm());
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all');
  const [showInactive, setShowInactive] = useState(false);

  const filtered = hooks.filter(h => {
    if (!showInactive && !h.is_active) return false;
    if (filterCategory !== 'all' && h.category !== filterCategory) return false;
    return true;
  });

  const openAdd = () => {
    setEditingHook(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (hook: Hook) => {
    setEditingHook(hook);
    setForm({ title: hook.title, category: hook.category, description: hook.description, is_active: hook.is_active });
    setModalOpen(true);
  };

  const handleSave = async () => {
    await upsertHook({
      ...(editingHook ? { id: editingHook.id } : {}),
      ...form,
      last_updated_session: editingHook?.last_updated_session ?? null,
      dm_only_notes: editingHook?.dm_only_notes ?? null,
    });
    setModalOpen(false);
  };

  const toggleActive = async (hook: Hook) => {
    await upsertHook({
      id: hook.id,
      title: hook.title,
      category: hook.category,
      description: hook.description,
      is_active: !hook.is_active,
      last_updated_session: hook.last_updated_session,
      dm_only_notes: hook.dm_only_notes,
    });
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this idea?')) {
      await deleteHook(id);
    }
  };

  const activeCount = hooks.filter(h => h.is_active).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: '#c9a84c', fontFamily: 'Georgia, serif' }}>
            Hooks & Ideas
          </h2>
          <p className="text-xs mt-0.5" style={{ color: '#6a6490' }}>
            {activeCount} active · {hooks.length} total
          </p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 rounded text-sm font-semibold transition-colors"
          style={{ backgroundColor: '#a07830', color: '#e8d5b0' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#c9a84c')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#a07830')}
        >
          + Add Idea
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <div className="flex gap-1 flex-wrap">
          {(['all', ...CATEGORIES] as const).map(c => (
            <button
              key={c}
              onClick={() => setFilterCategory(c)}
              className="text-xs px-3 py-1.5 rounded transition-colors"
              style={{
                backgroundColor: filterCategory === c ? '#3a3660' : '#22203a',
                color: filterCategory === c ? '#e8d5b0' : '#9990b0',
                border: '1px solid #3a3660',
              }}
            >
              {c === 'all' ? 'All' : formatCategory(c)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none" style={{ color: '#9990b0' }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            style={{ accentColor: '#c9a84c' }}
          />
          Show resolved
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#6a6490' }}>
          {hooks.length === 0
            ? 'No ideas yet. Start your DM scratchpad!'
            : 'No ideas match the current filters.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(hook => {
            const ps = getStyle(hook.category);
            return (
              <div
                key={hook.id}
                className="rounded-lg border p-4 flex flex-col"
                style={{
                  backgroundColor: '#1a1828',
                  borderColor: hook.is_active ? ps.border : '#2a2a3a',
                  opacity: hook.is_active ? 1 : 0.55,
                }}
              >
                <div className="flex items-start justify-between mb-2 gap-2">
                  <h3 className="font-bold flex-1" style={{ color: hook.is_active ? '#e8d5b0' : '#6a6490', fontFamily: 'Georgia, serif' }}>
                    {hook.title || 'Untitled Idea'}
                  </h3>
                  <span
                    className="text-xs px-2 py-0.5 rounded shrink-0"
                    style={{ backgroundColor: ps.badgeBg, color: ps.badge }}
                  >
                    {formatCategory(hook.category)}
                  </span>
                </div>

                <p className="text-sm flex-1 mb-4" style={{ color: hook.is_active ? '#c9b88a' : '#5a5470', lineHeight: '1.6' }}>
                  {hook.description || <span style={{ fontStyle: 'italic', color: '#4a4460' }}>No details written.</span>}
                </p>

                <div className="flex gap-2 mt-auto">
                  <button
                    onClick={() => toggleActive(hook)}
                    className="text-xs px-2 py-1 rounded flex-1 transition-colors"
                    style={{
                      backgroundColor: '#22203a',
                      color: hook.is_active ? '#9990b0' : '#4caf7d',
                      border: '1px solid #3a3660',
                    }}
                  >
                    {hook.is_active ? '✓ Resolve' : '↩ Reopen'}
                  </button>
                  <button
                    onClick={() => openEdit(hook)}
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(hook.id)}
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={{ backgroundColor: '#22203a', color: '#e05c5c', border: '1px solid #3a3660' }}
                  >
                    ×
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
        title={editingHook ? 'Edit Idea' : 'New Hook / Idea'}
        onSave={handleSave}
      >
        <FormField label="Title">
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
            placeholder="e.g., The Mysterious Map"
            style={inputStyle}
          />
        </FormField>
        <FormField label="Category">
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map(c => (
              <button
                key={c}
                onClick={() => setForm(prev => ({ ...prev, category: c }))}
                className="text-sm px-4 py-2 rounded flex-1 transition-colors"
                style={{
                  backgroundColor: form.category === c ? categoryStyles[c].badgeBg : '#22203a',
                  color: categoryStyles[c].badge,
                  border: `1px solid ${categoryStyles[c].border}`,
                  fontWeight: form.category === c ? 600 : 400,
                  outline: form.category === c ? `1px solid ${categoryStyles[c].badge}` : 'none',
                }}
              >
                {formatCategory(c)}
              </button>
            ))}
          </div>
        </FormField>
        <FormField label="Details / Notes">
          <textarea
            value={form.description ?? ''}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Describe the idea, how it could play out, related characters or locations..."
            style={{ ...textareaStyle, minHeight: '220px' }}
          />
        </FormField>
      </Modal>
    </div>
  );
}
