import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import { SectionHeader } from '../ui/SectionHeader';
import { InlineEditCard } from '../ui/InlineEditCard';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
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

const categoryBadgeColor: Record<Category, 'red' | 'gold' | 'green' | 'blue'> = {
  main_plot:     'red',
  side_quest:    'gold',
  character_arc: 'green',
  faction:       'blue',
};

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
  const [form, setForm] = useState<HookForm>(emptyForm());
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all');
  const [showInactive, setShowInactive] = useState(false);
  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<HookForm | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = hooks.filter(h => {
    if (!showInactive && !h.is_active) return false;
    if (filterCategory !== 'all' && h.category !== filterCategory) return false;
    return true;
  });

  const openAdd = () => {
    setForm(emptyForm());
    setModalOpen(true);
  };

  const handleCreate = async () => {
    await upsertHook({
      ...form,
      last_updated_session: null,
      dm_only_notes: null,
    });
    setModalOpen(false);
  };

  const startEdit = (hook: Hook) => {
    setEditingId(hook.id);
    setEditForm({ title: hook.title, category: hook.category, description: hook.description, is_active: hook.is_active });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const saveEdit = async () => {
    if (!editForm || !editingId) return;
    const hook = hooks.find(h => h.id === editingId);
    if (!hook) return;
    setSaving(true);
    await upsertHook({
      id: editingId,
      ...editForm,
      last_updated_session: hook.last_updated_session,
      dm_only_notes: hook.dm_only_notes,
    });
    setSaving(false);
    cancelEdit();
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
      if (editingId === id) cancelEdit();
    }
  };

  const activeCount = hooks.filter(h => h.is_active).length;

  return (
    <div>
      <SectionHeader
        title="Hooks & Ideas"
        subtitle={`${activeCount} active · ${hooks.length} total`}
        onAdd={openAdd}
        addLabel="Add Idea"
        extra={
          <div className="flex flex-wrap gap-2 items-center">
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
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: '#9990b0' }}>
              <input
                type="checkbox"
                checked={showInactive}
                onChange={e => setShowInactive(e.target.checked)}
                style={{ accentColor: '#c9a84c' }}
              />
              Show resolved
            </label>
          </div>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          message={hooks.length === 0 ? 'No ideas yet. Start your DM scratchpad!' : 'No ideas match the current filters.'}
          onAdd={hooks.length === 0 ? openAdd : undefined}
          addLabel="Add Idea"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(hook => {
            const isEditing = editingId === hook.id;
            const ps = getStyle(hook.category);
            const badgeColor = categoryBadgeColor[hook.category as Category] ?? 'muted';

            return (
              <InlineEditCard
                key={hook.id}
                isEditing={isEditing}
                onSave={saveEdit}
                onCancel={cancelEdit}
                onDelete={() => handleDelete(hook.id)}
                saving={saving}
              >
                {isEditing && editForm ? (
                  /* Edit mode */
                  <div className="flex flex-col gap-3">
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={e => setEditForm(prev => prev ? { ...prev, title: e.target.value } : prev)}
                      placeholder="Title"
                      autoFocus
                      className="w-full px-2 py-1.5 rounded text-sm outline-none"
                      style={{ backgroundColor: '#0f0e17', color: '#e8d5b0', border: '1px solid #3a3660', fontFamily: 'Georgia, Cambria, serif' }}
                    />
                    <div className="flex gap-1 flex-wrap">
                      {CATEGORIES.map(c => (
                        <button
                          key={c}
                          onClick={() => setEditForm(prev => prev ? { ...prev, category: c } : prev)}
                          className="text-xs px-3 py-1 rounded transition-colors"
                          style={{
                            backgroundColor: editForm.category === c ? categoryStyles[c].badgeBg : '#22203a',
                            color: categoryStyles[c].badge,
                            border: `1px solid ${categoryStyles[c].border}`,
                            fontWeight: editForm.category === c ? 600 : 400,
                          }}
                        >
                          {formatCategory(c)}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={editForm.description ?? ''}
                      onChange={e => setEditForm(prev => prev ? { ...prev, description: e.target.value } : prev)}
                      placeholder="Describe the idea..."
                      rows={4}
                      className="w-full px-2 py-1.5 rounded text-sm outline-none resize-y"
                      style={{ backgroundColor: '#0f0e17', color: '#e8d5b0', border: '1px solid #3a3660', fontFamily: 'Georgia, Cambria, serif', minHeight: '100px' }}
                    />
                  </div>
                ) : (
                  /* View mode */
                  <div
                    className="flex flex-col"
                    style={{ opacity: hook.is_active ? 1 : 0.55 }}
                  >
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <h3 className="font-bold flex-1 text-sm" style={{ color: hook.is_active ? '#e8d5b0' : '#6a6490', fontFamily: 'Georgia, Cambria, serif' }}>
                        {hook.title || 'Untitled Idea'}
                      </h3>
                      <Badge label={formatCategory(hook.category)} color={badgeColor} size="xs" />
                    </div>

                    <p className="text-sm flex-1 mb-4" style={{ color: hook.is_active ? '#c9b88a' : '#5a5470', lineHeight: '1.6' }}>
                      {hook.description || <span style={{ fontStyle: 'italic', color: '#4a4460' }}>No details written.</span>}
                    </p>

                    <div className="flex gap-2 mt-auto">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => toggleActive(hook)}
                      >
                        {hook.is_active ? '✓ Resolve' : '↩ Reopen'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => startEdit(hook)} title="Edit">
                        <Pencil size={12} strokeWidth={1.5} />
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete(hook.id)}>
                        ×
                      </Button>
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
        title="New Hook / Idea"
        onSave={handleCreate}
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
