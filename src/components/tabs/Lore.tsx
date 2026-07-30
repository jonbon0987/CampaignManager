import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Modal } from '../Modal';
import { FormField, inputStyle } from '../FormField';
import { SectionHeader } from '../ui/SectionHeader';
import { InlineEditCard } from '../ui/InlineEditCard';
import { SearchBar } from '../ui/SearchBar';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { AutoGrowTextarea } from '../ui/AutoGrowTextarea';
import type { LoreEntry } from '../../lib/database.types';

const LORE_CATEGORIES = ['history', 'artifact', 'creature', 'magic', 'religion'] as const;
type LoreCategory = typeof LORE_CATEGORIES[number];

const categoryBadgeColor: Record<LoreCategory, 'blue' | 'green' | 'red' | 'gold' | 'muted'> = {
  history: 'gold',
  artifact: 'blue',
  creature: 'red',
  magic: 'muted',
  religion: 'green',
};

function formatCategory(c: string) {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

type LoreForm = {
  title: string;
  category: LoreCategory;
  content: string;
  dm_only: boolean;
};

const emptyForm = (): LoreForm => ({
  title: '',
  category: 'history',
  content: '',
  dm_only: false,
});

const inputEditStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg)',
  color: 'var(--ink)',
  border: '1px solid var(--rule)',
  fontFamily: 'var(--serif)',
  fontSize: '0.875rem',
  borderRadius: '0.375rem',
  padding: '0.375rem 0.5rem',
  width: '100%',
};

const labelStyle: React.CSSProperties = {
  color: 'var(--gold)',
  fontSize: '0.65rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

export default function Lore() {
  const { lore, upsertLore, deleteLore } = useCampaign();
  const confirm = useConfirm();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<LoreForm>(emptyForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<LoreForm | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = lore.filter(entry => {
    if (filterCategory !== 'all' && entry.category !== filterCategory) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return entry.title.toLowerCase().includes(q) || (entry.content ?? '').toLowerCase().includes(q);
  });

  const openAdd = () => { setForm(emptyForm()); setModalOpen(true); };

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    await upsertLore({ ...form });
    setModalOpen(false);
  };

  const startEdit = (entry: LoreEntry) => {
    setEditingId(entry.id);
    setEditForm({
      title: entry.title,
      category: (entry.category as LoreCategory) ?? 'history',
      content: entry.content ?? '',
      dm_only: entry.dm_only,
    });
    setExpandedId(entry.id);
  };

  const cancelEdit = () => { setEditingId(null); setEditForm(null); };

  const saveEdit = async () => {
    if (!editForm || !editingId) return;
    setSaving(true);
    await upsertLore({ id: editingId, ...editForm });
    setSaving(false);
    cancelEdit();
  };

  const handleDelete = async (id: string) => {
    if (await confirm('Delete this lore entry?')) {
      await deleteLore(id);
      if (expandedId === id) setExpandedId(null);
      if (editingId === id) cancelEdit();
    }
  };

  return (
    <div>
      <SectionHeader title="Lore" onAdd={openAdd} addLabel="Add Lore Entry" />

      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div style={{ width: '220px' }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search lore…" />
        </div>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="text-sm rounded px-2 py-1.5 outline-none"
          style={{ backgroundColor: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: 'var(--serif)' }}
        >
          <option value="all">All Categories</option>
          {LORE_CATEGORIES.map(c => (
            <option key={c} value={c}>{formatCategory(c)}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          message={search || filterCategory !== 'all' ? 'No lore entries match your filters.' : 'No lore entries yet.'}
          onAdd={!search && filterCategory === 'all' ? openAdd : undefined}
          addLabel="Add Lore Entry"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(entry => {
            const isEditing = editingId === entry.id;
            const isExpanded = expandedId === entry.id;
            const cat = (entry.category as LoreCategory) ?? 'history';

            return (
              <InlineEditCard
                key={entry.id}
                entityId={entry.id}
                isEditing={isEditing}
                onSave={saveEdit}
                onCancel={cancelEdit}
                onDelete={() => handleDelete(entry.id)}
                saving={saving}
              >
                {isEditing && editForm ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block mb-1" style={labelStyle}>Title</label>
                        <input
                          type="text"
                          value={editForm.title}
                          onChange={e => setEditForm(prev => prev ? { ...prev, title: e.target.value } : prev)}
                          autoFocus
                          style={inputEditStyle}
                        />
                      </div>
                      <div>
                        <label className="block mb-1" style={labelStyle}>Category</label>
                        <select
                          value={editForm.category}
                          onChange={e => setEditForm(prev => prev ? { ...prev, category: e.target.value as LoreCategory } : prev)}
                          style={inputEditStyle}
                        >
                          {LORE_CATEGORIES.map(c => (
                            <option key={c} value={c}>{formatCategory(c)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block mb-1" style={labelStyle}>Content</label>
                      <AutoGrowTextarea
                        value={editForm.content}
                        onChange={v => setEditForm(prev => prev ? { ...prev, content: v } : prev)}
                        placeholder="Describe this piece of lore…"
                        style={inputEditStyle}
                        minRows={4}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`dm-only-${entry.id}`}
                        checked={editForm.dm_only}
                        onChange={e => setEditForm(prev => prev ? { ...prev, dm_only: e.target.checked } : prev)}
                        style={{ accentColor: 'var(--gold)' }}
                      />
                      <label htmlFor={`dm-only-${entry.id}`} className="text-xs" style={{ color: 'var(--ink-2)' }}>DM only</label>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold" style={{ color: 'var(--ink)', fontFamily: 'var(--serif)' }}>
                              {entry.title || 'Untitled'}
                            </h3>
                            {entry.dm_only && <Badge label="DM Only" color="red" size="xs" />}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge label={formatCategory(cat)} color={categoryBadgeColor[cat]} size="xs" />
                          <span className="text-xs ml-1" style={{ color: 'var(--ink-3)' }}>{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </div>

                      {entry.content && (
                        <p className="text-sm mt-2" style={{ color: 'var(--ink-2)', lineHeight: '1.6', whiteSpace: isExpanded ? 'pre-wrap' : undefined }}>
                          {isExpanded
                            ? entry.content
                            : entry.content.substring(0, 140) + (entry.content.length > 140 ? '…' : '')}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--rule-soft)' }}>
                      <Button variant="ghost" size="sm" onClick={() => startEdit(entry)} title="Edit">
                        <Pencil size={12} strokeWidth={1.5} />
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete(entry.id)}>Delete</Button>
                    </div>
                  </div>
                )}
              </InlineEditCard>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New Lore Entry"
        onSave={handleCreate}
        wide
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Title">
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g., The Pale Chronicle"
              style={inputStyle}
              autoFocus
            />
          </FormField>
          <FormField label="Category">
            <select
              value={form.category}
              onChange={e => setForm(prev => ({ ...prev, category: e.target.value as LoreCategory }))}
              style={inputStyle}
            >
              {LORE_CATEGORIES.map(c => (
                <option key={c} value={c}>{formatCategory(c)}</option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label="Content">
          <AutoGrowTextarea
            value={form.content}
            onChange={v => setForm(prev => ({ ...prev, content: v }))}
            placeholder="Describe this piece of lore — history, legend, artifact details, magical properties…"
            style={{ ...inputStyle, lineHeight: '1.65' }}
            minRows={5}
          />
        </FormField>
        <div className="flex items-center gap-2 mt-1">
          <input
            type="checkbox"
            id="new-lore-dm-only"
            checked={form.dm_only}
            onChange={e => setForm(prev => ({ ...prev, dm_only: e.target.checked }))}
            style={{ accentColor: 'var(--gold)' }}
          />
          <label htmlFor="new-lore-dm-only" className="text-xs" style={{ color: 'var(--ink-2)' }}>DM only (hidden from players)</label>
        </div>
      </Modal>
    </div>
  );
}
