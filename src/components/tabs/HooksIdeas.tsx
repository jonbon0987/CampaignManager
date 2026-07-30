import { useState } from 'react';
import { SlashField } from '../ui/SlashField';
import { Pencil } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import { SectionHeader } from '../ui/SectionHeader';
import { SearchBar } from '../ui/SearchBar';
import { InlineEditCard } from '../ui/InlineEditCard';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { MarkdownContent } from '../ui/MarkdownContent';
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
  main_plot:     { border: 'var(--red-line)', badge: 'var(--red)', badgeBg: 'var(--red-bg)' },
  side_quest:    { border: '#4a3a1a', badge: 'var(--gold)', badgeBg: '#2a2a10' },
  character_arc: { border: '#1a3a3a', badge: 'var(--success)', badgeBg: '#0a2a1a' },
  faction:       { border: '#3a2a1a', badge: 'var(--accent)', badgeBg: '#2a1a10' },
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
  const confirm = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<HookForm>(emptyForm());
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<HookForm | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = hooks.filter(h => {
    if (!showInactive && !h.is_active) return false;
    if (filterCategory !== 'all' && h.category !== filterCategory) return false;
    if (search && !h.title.toLowerCase().includes(search.toLowerCase())) return false;
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
    if (await confirm('Delete this idea?')) {
      await deleteHook(id);
      if (editingId === id) cancelEdit();
    }
  };

  const activeCount = hooks.filter(h => h.is_active).length;

  return (
    <div style={{ padding: '28px' }}>
      <SectionHeader
        title="Hooks & Ideas"
        subtitle={`${activeCount} active · ${hooks.length} total`}
        onAdd={openAdd}
        addLabel="Add Idea"
        extra={
          <div className="flex flex-wrap gap-2 items-center">
            <div style={{ width: 200 }}>
              <SearchBar value={search} onChange={setSearch} placeholder="Search hooks…" />
            </div>
            <div className="flex gap-1 flex-wrap">
              {(['all', ...CATEGORIES] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setFilterCategory(c)}
                  className="text-xs px-3 py-1.5 rounded transition-colors"
                  style={{
                    backgroundColor: filterCategory === c ? 'var(--rule)' : 'var(--paper-2)',
                    color: filterCategory === c ? 'var(--ink)' : 'var(--ink-2)',
                    border: '1px solid var(--rule)',
                  }}
                >
                  {c === 'all' ? 'All' : formatCategory(c)}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: 'var(--ink-2)' }}>
              <input
                type="checkbox"
                checked={showInactive}
                onChange={e => setShowInactive(e.target.checked)}
                style={{ accentColor: 'var(--gold)' }}
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
                entityId={hook.id}
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
                      style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: 'var(--serif)' }}
                    />
                    <div className="flex gap-1 flex-wrap">
                      {CATEGORIES.map(c => (
                        <button
                          key={c}
                          onClick={() => setEditForm(prev => prev ? { ...prev, category: c } : prev)}
                          className="text-xs px-3 py-1 rounded transition-colors"
                          style={{
                            backgroundColor: editForm.category === c ? categoryStyles[c].badgeBg : 'var(--paper-2)',
                            color: categoryStyles[c].badge,
                            border: `1px solid ${categoryStyles[c].border}`,
                            fontWeight: editForm.category === c ? 600 : 400,
                          }}
                        >
                          {formatCategory(c)}
                        </button>
                      ))}
                    </div>
                    <SlashField value={editForm.description ?? ''} onChange={v => setEditForm(prev => prev ? { ...prev, description: v } : prev)} placeholder="Describe the idea..." minHeight="100px" />
                  </div>
                ) : (
                  /* View mode */
                  <div
                    className="flex flex-col"
                    style={{ opacity: hook.is_active ? 1 : 0.55, height: 220 }}
                  >
                    <div className="flex items-start justify-between mb-2 gap-2" style={{ flexShrink: 0 }}>
                      <h3 className="font-bold flex-1 text-sm" style={{ color: hook.is_active ? 'var(--ink)' : 'var(--ink-3)', fontFamily: 'var(--serif)' }}>
                        {hook.title || 'Untitled Idea'}
                      </h3>
                      <Badge label={formatCategory(hook.category)} color={badgeColor} size="xs" />
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto mb-4" style={{ scrollbarWidth: 'thin' }}>
                      {hook.description ? (
                        <MarkdownContent text={hook.description} className="text-sm" style={{ color: hook.is_active ? 'var(--ink-2)' : 'var(--ink-3)', lineHeight: '1.6' }} />
                      ) : (
                        <p className="text-sm" style={{ color: 'var(--ink-3)', lineHeight: '1.6', fontStyle: 'italic' }}>No details written.</p>
                      )}
                    </div>

                    <div className="flex gap-2" style={{ flexShrink: 0 }}>
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
                  backgroundColor: form.category === c ? categoryStyles[c].badgeBg : 'var(--paper-2)',
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
          <SlashField value={form.description ?? ''} onChange={v => setForm(prev => ({ ...prev, description: v }))} placeholder="Describe the idea, how it could play out, related characters or locations..." minHeight="220px" />
        </FormField>
      </Modal>
    </div>
  );
}
