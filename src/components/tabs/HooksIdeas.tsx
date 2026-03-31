import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import type { Hook } from '../../types';

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

const emptyHook = (): Omit<Hook, 'id'> => ({
  title: '',
  content: '',
  priority: 'medium',
  used: false,
});

const priorityStyles: Record<Hook['priority'], { border: string; badge: string; badgeBg: string }> = {
  high:   { border: '#6a2a2a', badge: '#e05c5c', badgeBg: '#3a1a1a' },
  medium: { border: '#4a3a1a', badge: '#c9a84c', badgeBg: '#2a2a10' },
  low:    { border: '#1a3a3a', badge: '#4caf7d', badgeBg: '#0a2a1a' },
};

export default function HooksIdeas() {
  const { data, setData } = useCampaign();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHook, setEditingHook] = useState<Hook | null>(null);
  const [form, setForm] = useState(emptyHook());
  const [filterPriority, setFilterPriority] = useState<Hook['priority'] | 'all'>('all');
  const [showUsed, setShowUsed] = useState(false);

  const filtered = data.hooks.filter(h => {
    if (!showUsed && h.used) return false;
    if (filterPriority !== 'all' && h.priority !== filterPriority) return false;
    return true;
  });

  const openAdd = () => {
    setEditingHook(null);
    setForm(emptyHook());
    setModalOpen(true);
  };

  const openEdit = (hook: Hook) => {
    setEditingHook(hook);
    setForm({ title: hook.title, content: hook.content, priority: hook.priority, used: hook.used });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (editingHook) {
      setData(prev => ({
        ...prev,
        hooks: prev.hooks.map(h => h.id === editingHook.id ? { ...h, ...form } : h),
      }));
    } else {
      setData(prev => ({
        ...prev,
        hooks: [...prev.hooks, { id: generateId(), ...form }],
      }));
    }
    setModalOpen(false);
  };

  const toggleUsed = (id: string) => {
    setData(prev => ({
      ...prev,
      hooks: prev.hooks.map(h => h.id === id ? { ...h, used: !h.used } : h),
    }));
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this idea?')) {
      setData(prev => ({ ...prev, hooks: prev.hooks.filter(h => h.id !== id) }));
    }
  };

  const unusedCount = data.hooks.filter(h => !h.used).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: '#c9a84c', fontFamily: 'Georgia, serif' }}>
            Hooks & Ideas
          </h2>
          <p className="text-xs mt-0.5" style={{ color: '#6a6490' }}>
            {unusedCount} unused {unusedCount === 1 ? 'idea' : 'ideas'} · {data.hooks.length} total
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
        <div className="flex gap-1">
          {(['all', 'high', 'medium', 'low'] as const).map(p => (
            <button
              key={p}
              onClick={() => setFilterPriority(p)}
              className="text-xs px-3 py-1.5 rounded capitalize transition-colors"
              style={{
                backgroundColor: filterPriority === p ? '#3a3660' : '#22203a',
                color: filterPriority === p ? '#e8d5b0' : '#9990b0',
                border: '1px solid #3a3660',
              }}
            >
              {p === 'all' ? 'All' : p}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none" style={{ color: '#9990b0' }}>
          <input
            type="checkbox"
            checked={showUsed}
            onChange={e => setShowUsed(e.target.checked)}
            style={{ accentColor: '#c9a84c' }}
          />
          Show used ideas
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#6a6490' }}>
          {data.hooks.length === 0
            ? 'No ideas yet. Start your DM scratchpad!'
            : 'No ideas match the current filters.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(hook => {
            const ps = priorityStyles[hook.priority];
            return (
              <div
                key={hook.id}
                className="rounded-lg border p-4 flex flex-col"
                style={{
                  backgroundColor: '#1a1828',
                  borderColor: hook.used ? '#2a2a3a' : ps.border,
                  opacity: hook.used ? 0.55 : 1,
                }}
              >
                <div className="flex items-start justify-between mb-2 gap-2">
                  <h3 className="font-bold flex-1" style={{ color: hook.used ? '#6a6490' : '#e8d5b0', fontFamily: 'Georgia, serif' }}>
                    {hook.title || 'Untitled Idea'}
                  </h3>
                  <span
                    className="text-xs px-2 py-0.5 rounded capitalize shrink-0"
                    style={{ backgroundColor: ps.badgeBg, color: ps.badge }}
                  >
                    {hook.priority}
                  </span>
                </div>

                <p className="text-sm flex-1 mb-4" style={{ color: hook.used ? '#5a5470' : '#c9b88a', lineHeight: '1.6' }}>
                  {hook.content || <span style={{ fontStyle: 'italic', color: '#4a4460' }}>No details written.</span>}
                </p>

                <div className="flex gap-2 mt-auto">
                  <button
                    onClick={() => toggleUsed(hook.id)}
                    className="text-xs px-2 py-1 rounded flex-1 transition-colors"
                    style={{
                      backgroundColor: '#22203a',
                      color: hook.used ? '#4caf7d' : '#9990b0',
                      border: '1px solid #3a3660',
                    }}
                  >
                    {hook.used ? '↩ Unmark' : '✓ Mark Used'}
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
        <FormField label="Priority">
          <div className="flex gap-2">
            {(['high', 'medium', 'low'] as const).map(p => (
              <button
                key={p}
                onClick={() => setForm(prev => ({ ...prev, priority: p }))}
                className="text-sm px-4 py-2 rounded capitalize flex-1 transition-colors"
                style={{
                  backgroundColor: form.priority === p ? priorityStyles[p].badgeBg : '#22203a',
                  color: priorityStyles[p].badge,
                  border: `1px solid ${priorityStyles[p].border}`,
                  fontWeight: form.priority === p ? 600 : 400,
                  outline: form.priority === p ? `1px solid ${priorityStyles[p].badge}` : 'none',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </FormField>
        <FormField label="Details / Notes">
          <textarea
            value={form.content}
            onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))}
            placeholder="Describe the idea, how it could play out, related characters or locations..."
            style={{ ...textareaStyle, minHeight: '220px' }}
          />
        </FormField>
      </Modal>
    </div>
  );
}
