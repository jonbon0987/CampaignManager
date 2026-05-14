import { useState, useRef } from 'react';
import { Pencil } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Modal } from '../Modal';
import { FormField, inputStyle } from '../FormField';
import { SectionHeader } from '../ui/SectionHeader';
import { SearchBar } from '../ui/SearchBar';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { MarkdownContent } from '../ui/MarkdownContent';
import { MarkdownEditor } from '../ui/MarkdownEditor';
import { EntityLinkToolbar } from '../ui/EntityLinkToolbar';
import { insertAtCursor } from '../../lib/textUtils';
import type { SessionPrep as SessionPrepType } from '../../lib/database.types';

type PrepForm = {
  session_number: number;
  prep_date: string | null;
  notes: string | null;
};

const emptyForm = (): PrepForm => ({
  session_number: 1,
  prep_date: new Date().toISOString().split('T')[0],
  notes: '',
});

export default function SessionPrep() {
  const { sessionPreps, upsertSessionPrep, deleteSessionPrep, sessions } = useCampaign();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PrepForm>(emptyForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PrepForm | null>(null);
  const [saving, setSaving] = useState(false);
  const editNotesRef = useRef<HTMLTextAreaElement>(null);
  const newNotesRef = useRef<HTMLTextAreaElement>(null);

  const filtered = sessionPreps
    .filter(p => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (p.notes ?? '').toLowerCase().includes(q) ||
        (p.prep_date ?? '').includes(q) ||
        String(p.session_number).includes(q)
      );
    })
    .sort((a, b) => b.session_number - a.session_number);

  const openAdd = () => {
    // Default to one beyond the highest existing prep or session number
    const maxPrep = sessionPreps.length > 0 ? Math.max(...sessionPreps.map(p => p.session_number)) : 0;
    const maxSession = sessions.length > 0 ? Math.max(...sessions.map(s => s.session_number)) : 0;
    const nextNumber = Math.max(maxPrep, maxSession) + 1;
    setForm({ ...emptyForm(), session_number: nextNumber });
    setModalOpen(true);
  };

  const handleCreate = async () => {
    await upsertSessionPrep({
      session_number: form.session_number,
      prep_date: form.prep_date,
      notes: form.notes,
    });
    setModalOpen(false);
  };

  const startEdit = (p: SessionPrepType) => {
    setEditingId(p.id);
    setEditForm({
      session_number: p.session_number,
      prep_date: p.prep_date,
      notes: p.notes,
    });
    setExpandedId(p.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const saveEdit = async () => {
    if (!editForm || !editingId) return;
    setSaving(true);
    await upsertSessionPrep({
      session_number: editForm.session_number,
      prep_date: editForm.prep_date,
      notes: editForm.notes,
    });
    setSaving(false);
    cancelEdit();
  };

  const handleDelete = async (id: string) => {
    if (await confirm('Delete this prep entry?')) {
      await deleteSessionPrep(id);
      if (expandedId === id) setExpandedId(null);
      if (editingId === id) cancelEdit();
    }
  };

  return (
    <div className="max-w-3xl" style={{ padding: '28px' }}>
      <SectionHeader
        title="Session Prep"
        subtitle={`${sessionPreps.length} prep note${sessionPreps.length !== 1 ? 's' : ''}`}
        onAdd={openAdd}
        addLabel="Add Prep"
        extra={
          <div style={{ width: '240px' }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search prep notes…" />
          </div>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          message={search ? 'No prep notes match your search.' : 'No prep notes yet. Add your first session prep!'}
          onAdd={sessionPreps.length === 0 ? openAdd : undefined}
          addLabel="Add Prep"
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(prep => {
            const isExpanded = expandedId === prep.id;
            const isEditing = editingId === prep.id;

            return (
              <div
                key={prep.id}
                data-entity-id={prep.id}
                className="rounded-lg border transition-colors duration-150"
                style={{
                  backgroundColor: 'var(--paper)',
                  borderColor: isEditing ? 'var(--gold)' : 'var(--rule)',
                }}
              >
                {/* Header row */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer"
                  style={{ borderBottom: isExpanded ? '1px solid var(--rule)' : 'none' }}
                  onClick={() => {
                    if (!isEditing) setExpandedId(isExpanded ? null : prep.id);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Badge label={`Session ${prep.session_number} Prep`} color="blue" size="sm" />
                    <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{prep.prep_date ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isEditing && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={e => { e.stopPropagation(); startEdit(prep); }}
                        title="Edit"
                      >
                        <Pencil size={12} strokeWidth={1.5} />
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={e => { e.stopPropagation(); handleDelete(prep.id); }}
                    >
                      ×
                    </Button>
                    <span className="text-xs ml-1" style={{ color: 'var(--ink-3)' }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="p-4">
                    {isEditing && editForm ? (
                      <div className="flex flex-col gap-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.65rem' }}>
                              Session #
                            </label>
                            <input
                              type="number"
                              value={editForm.session_number}
                              onChange={e => setEditForm(prev => prev ? { ...prev, session_number: parseInt(e.target.value) || 1 } : prev)}
                              min={1}
                              className="w-full px-2 py-1.5 rounded text-sm outline-none"
                              style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: 'var(--serif)' }}
                            />
                          </div>
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.65rem' }}>
                              Prep Date
                            </label>
                            <input
                              type="date"
                              value={editForm.prep_date ?? ''}
                              onChange={e => setEditForm(prev => prev ? { ...prev, prep_date: e.target.value || null } : prev)}
                              className="w-full px-2 py-1.5 rounded text-sm outline-none"
                              style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: 'var(--serif)', colorScheme: 'dark' }}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs mb-1" style={{ color: 'var(--gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.65rem' }}>
                            Prep Notes
                          </label>
                          <MarkdownEditor
                            value={editForm.notes ?? ''}
                            onChange={v => setEditForm(prev => prev ? { ...prev, notes: v || null } : prev)}
                            placeholder="Reminders, NPC motivations, plot threads, encounter plans…"
                            minHeight="200px"
                            textareaRef={editNotesRef}
                          />
                          <EntityLinkToolbar textareaRef={editNotesRef} onInsert={markup => setEditForm(prev => prev ? { ...prev, notes: insertAtCursor(editNotesRef, prev.notes ?? '', markup) } : prev)} />
                        </div>

                        <div className="flex gap-2">
                          <Button variant="primary" size="sm" onClick={saveEdit} disabled={saving}>
                            {saving ? 'Saving…' : 'Save'}
                          </Button>
                          <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={saving}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {prep.notes ? (
                          <MarkdownContent text={prep.notes} className="text-sm" style={{ color: 'var(--ink)', fontFamily: 'var(--serif)', lineHeight: '1.7' }} />
                        ) : (
                          <p className="text-sm" style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>No prep notes yet. Click the pencil to add some!</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New Session Prep"
        onSave={handleCreate}
        wide
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Session #">
            <input
              type="number"
              value={form.session_number}
              onChange={e => setForm(prev => ({ ...prev, session_number: parseInt(e.target.value) || 1 }))}
              min={1}
              style={inputStyle}
            />
          </FormField>
          <FormField label="Prep Date">
            <input
              type="date"
              value={form.prep_date ?? ''}
              onChange={e => setForm(prev => ({ ...prev, prep_date: e.target.value || null }))}
              style={inputStyle}
            />
          </FormField>
        </div>
        <FormField label="Prep Notes">
          <MarkdownEditor
            value={form.notes ?? ''}
            onChange={v => setForm(prev => ({ ...prev, notes: v || null }))}
            placeholder="Reminders, NPC motivations, plot threads, encounter plans…"
            minHeight="200px"
            textareaRef={newNotesRef}
          />
          <EntityLinkToolbar textareaRef={newNotesRef} onInsert={markup => setForm(prev => ({ ...prev, notes: insertAtCursor(newNotesRef, prev.notes ?? '', markup) }))} />
        </FormField>
      </Modal>
    </div>
  );
}
