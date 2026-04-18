import { useState, useRef } from 'react';
import { Pencil, Swords, Gift, Lightbulb, Eye, ChevronDown, ChevronRight } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import { SectionHeader } from '../ui/SectionHeader';
import { SearchBar } from '../ui/SearchBar';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { StatBlockText } from '../ui/StatBlockText';
import { MarkdownContent } from '../ui/MarkdownContent';
import { EntityLinkToolbar } from '../ui/EntityLinkToolbar';
import { MarkdownEditor } from '../ui/MarkdownEditor';
import { insertAtCursor } from '../../lib/textUtils';
import type { Session } from '../../lib/database.types';

type SessionForm = {
  session_number: number;
  session_date: string | null;
  summary: string | null;
  combats: string | null;
  loot_rewards: string | null;
  hooks_notes: string | null;
  dm_notes: string | null;
};

const emptyForm = (): SessionForm => ({
  session_number: 1,
  session_date: new Date().toISOString().split('T')[0],
  summary: '',
  combats: null,
  loot_rewards: null,
  hooks_notes: null,
  dm_notes: null,
});

/* Collapsible section for structured session fields */
function SessionSection({
  icon: Icon,
  label,
  dmOnly,
  children,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  dmOnly?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded border overflow-hidden"
      style={{ borderColor: '#2e2c4a', backgroundColor: '#15132a' }}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-medium transition-colors duration-150"
        style={{ color: '#c9a84c', letterSpacing: '0.06em' }}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Icon size={12} strokeWidth={1.8} />
        <span style={{ textTransform: 'uppercase', fontSize: '0.65rem' }}>{label}</span>
        {dmOnly && (
          <span
            className="ml-auto text-[9px] px-1.5 py-0.5 rounded"
            style={{ backgroundColor: '#2a1a2a', color: '#b070b0', border: '1px solid #5a3060' }}
          >
            DM Only
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3" style={{ borderTop: '1px solid #2e2c4a' }}>
          <div className="pt-2">{children}</div>
        </div>
      )}
    </div>
  );
}

export default function SessionNotes() {
  const { sessions, upsertSession, deleteSession } = useCampaign();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<SessionForm>(emptyForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SessionForm | null>(null);
  const [saving, setSaving] = useState(false);
  const editSummaryRef = useRef<HTMLTextAreaElement>(null);
  const newSummaryRef = useRef<HTMLTextAreaElement>(null);

  const filtered = sessions
    .filter(s => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (s.summary ?? '').toLowerCase().includes(q) ||
        (s.session_date ?? '').includes(q) ||
        String(s.session_number).includes(q) ||
        (s.combats ?? '').toLowerCase().includes(q) ||
        (s.loot_rewards ?? '').toLowerCase().includes(q) ||
        (s.hooks_notes ?? '').toLowerCase().includes(q) ||
        (s.dm_notes ?? '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.session_number - a.session_number);

  const openAdd = () => {
    const nextNumber = sessions.length > 0
      ? Math.max(...sessions.map(s => s.session_number)) + 1
      : 1;
    setForm({ ...emptyForm(), session_number: nextNumber });
    setModalOpen(true);
  };

  const handleCreate = async () => {
    await upsertSession({
      session_number: form.session_number,
      session_date: form.session_date,
      summary: form.summary,
      combats: form.combats,
      loot_rewards: form.loot_rewards,
      hooks_notes: form.hooks_notes,
      dm_notes: form.dm_notes,
    });
    setModalOpen(false);
  };

  const startEdit = (s: Session) => {
    setEditingId(s.id);
    setEditForm({
      session_number: s.session_number,
      session_date: s.session_date,
      summary: s.summary,
      combats: s.combats,
      loot_rewards: s.loot_rewards,
      hooks_notes: s.hooks_notes,
      dm_notes: s.dm_notes,
    });
    setExpandedId(s.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const saveEdit = async () => {
    if (!editForm || !editingId) return;
    setSaving(true);
    await upsertSession({
      session_number: editForm.session_number,
      session_date: editForm.session_date,
      summary: editForm.summary,
      combats: editForm.combats,
      loot_rewards: editForm.loot_rewards,
      hooks_notes: editForm.hooks_notes,
      dm_notes: editForm.dm_notes,
    });
    setSaving(false);
    cancelEdit();
  };

  const handleDelete = async (id: string) => {
    if (await confirm('Delete this session?')) {
      await deleteSession(id);
      if (expandedId === id) setExpandedId(null);
      if (editingId === id) cancelEdit();
    }
  };

  return (
    <div className="max-w-3xl">
      <SectionHeader
        title="Session Notes"
        subtitle={`${sessions.length} session${sessions.length !== 1 ? 's' : ''}`}
        onAdd={openAdd}
        addLabel="Add Session"
        extra={
          <div style={{ width: '240px' }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search sessions…" />
          </div>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          message={search ? 'No sessions match your search.' : 'No sessions yet. Add your first session!'}
          onAdd={sessions.length === 0 ? openAdd : undefined}
          addLabel="Add Session"
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(session => {
            const isExpanded = expandedId === session.id;
            const isEditing = editingId === session.id;

            return (
              <div
                key={session.id}
                data-entity-id={session.id}
                className="rounded-lg border overflow-hidden transition-colors duration-150"
                style={{
                  backgroundColor: '#1a1828',
                  borderColor: isEditing ? '#c9a84c' : '#2e2c4a',
                }}
              >
                {/* Header row */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer"
                  style={{ borderBottom: isExpanded ? '1px solid #3a3660' : 'none' }}
                  onClick={() => {
                    if (!isEditing) setExpandedId(isExpanded ? null : session.id);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Badge label={`Session ${session.session_number}`} color="gold" size="sm" />
                    <span className="text-xs" style={{ color: '#6a6490' }}>{session.session_date ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isEditing && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={e => { e.stopPropagation(); startEdit(session); }}
                        title="Edit"
                      >
                        <Pencil size={12} strokeWidth={1.5} />
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={e => { e.stopPropagation(); handleDelete(session.id); }}
                    >
                      ×
                    </Button>
                    <span className="text-xs ml-1" style={{ color: '#6a6490' }}>
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
                            <label className="block text-xs mb-1" style={{ color: '#c9a84c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.65rem' }}>
                              Session #
                            </label>
                            <input
                              type="number"
                              value={editForm.session_number}
                              onChange={e => setEditForm(prev => prev ? { ...prev, session_number: parseInt(e.target.value) || 1 } : prev)}
                              min={1}
                              className="w-full px-2 py-1.5 rounded text-sm outline-none"
                              style={{ backgroundColor: '#0f0e17', color: '#e8d5b0', border: '1px solid #3a3660', fontFamily: 'Georgia, Cambria, serif' }}
                            />
                          </div>
                          <div>
                            <label className="block text-xs mb-1" style={{ color: '#c9a84c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.65rem' }}>
                              Date
                            </label>
                            <input
                              type="date"
                              value={editForm.session_date ?? ''}
                              onChange={e => setEditForm(prev => prev ? { ...prev, session_date: e.target.value || null } : prev)}
                              className="w-full px-2 py-1.5 rounded text-sm outline-none"
                              style={{ backgroundColor: '#0f0e17', color: '#e8d5b0', border: '1px solid #3a3660', fontFamily: 'Georgia, Cambria, serif' }}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs mb-1" style={{ color: '#c9a84c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.65rem' }}>
                            Session Notes
                          </label>
                          <MarkdownEditor
                            value={editForm.summary ?? ''}
                            onChange={v => setEditForm(prev => prev ? { ...prev, summary: v || null } : prev)}
                            placeholder="What happened this session..."
                            minHeight="200px"
                            textareaRef={editSummaryRef}
                          />
                          <EntityLinkToolbar textareaRef={editSummaryRef} onInsert={markup => setEditForm(prev => prev ? { ...prev, summary: insertAtCursor(editSummaryRef, prev.summary ?? '', markup) } : prev)} />
                        </div>

                        {/* Structured session fields */}
                        <SessionSection icon={Swords} label="Combat Summary">
                          <MarkdownEditor
                            value={editForm.combats ?? ''}
                            onChange={v => setEditForm(prev => prev ? { ...prev, combats: v || null } : prev)}
                            placeholder="Describe combats that took place…"
                            minHeight="80px"
                          />
                        </SessionSection>
                        <SessionSection icon={Gift} label="Loot &amp; Rewards">
                          <MarkdownEditor
                            value={editForm.loot_rewards ?? ''}
                            onChange={v => setEditForm(prev => prev ? { ...prev, loot_rewards: v || null } : prev)}
                            placeholder="Items, gold, or rewards gained…"
                            minHeight="60px"
                          />
                        </SessionSection>
                        <SessionSection icon={Lightbulb} label="Hook Follow-ups">
                          <MarkdownEditor
                            value={editForm.hooks_notes ?? ''}
                            onChange={v => setEditForm(prev => prev ? { ...prev, hooks_notes: v || null } : prev)}
                            placeholder="Which hooks were advanced or introduced…"
                            minHeight="60px"
                          />
                        </SessionSection>
                        <SessionSection icon={Eye} label="DM Notes" dmOnly>
                          <MarkdownEditor
                            value={editForm.dm_notes ?? ''}
                            onChange={v => setEditForm(prev => prev ? { ...prev, dm_notes: v || null } : prev)}
                            placeholder="Private notes, reminders, secrets…"
                            minHeight="60px"
                          />
                        </SessionSection>

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
                        {session.summary ? (
                          <MarkdownContent text={session.summary} className="text-sm" style={{ color: '#e8d5b0', fontFamily: 'Georgia, Cambria, serif', lineHeight: '1.7' }} />
                        ) : (
                          <p className="text-sm" style={{ color: '#6a6490', fontStyle: 'italic' }}>No notes recorded for this session.</p>
                        )}

                        {/* Show structured fields when they have content */}
                        {session.combats && (
                          <SessionSection icon={Swords} label="Combat Summary">
                            <MarkdownContent text={session.combats} className="text-sm" style={{ color: '#e8d5b0', fontFamily: 'Georgia, Cambria, serif', lineHeight: '1.7' }} />
                          </SessionSection>
                        )}
                        {session.loot_rewards && (
                          <SessionSection icon={Gift} label="Loot &amp; Rewards">
                            <MarkdownContent text={session.loot_rewards} className="text-sm" style={{ color: '#e8d5b0', fontFamily: 'Georgia, Cambria, serif', lineHeight: '1.7' }} />
                          </SessionSection>
                        )}
                        {session.hooks_notes && (
                          <SessionSection icon={Lightbulb} label="Hook Follow-ups">
                            <MarkdownContent text={session.hooks_notes} className="text-sm" style={{ color: '#e8d5b0', fontFamily: 'Georgia, Cambria, serif', lineHeight: '1.7' }} />
                          </SessionSection>
                        )}
                        {session.dm_notes && (
                          <SessionSection icon={Eye} label="DM Notes" dmOnly>
                            <MarkdownContent text={session.dm_notes} className="text-sm" style={{ color: '#e8d5b0', fontFamily: 'Georgia, Cambria, serif', lineHeight: '1.7' }} />
                          </SessionSection>
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

      {/* Create-only modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New Session"
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
          <FormField label="Date">
            <input
              type="date"
              value={form.session_date ?? ''}
              onChange={e => setForm(prev => ({ ...prev, session_date: e.target.value || null }))}
              style={inputStyle}
            />
          </FormField>
        </div>
        <FormField label="Session Notes">
          <MarkdownEditor
            value={form.summary ?? ''}
            onChange={v => setForm(prev => ({ ...prev, summary: v || null }))}
            placeholder="What happened this session..."
            minHeight="200px"
            textareaRef={newSummaryRef}
          />
          <EntityLinkToolbar textareaRef={newSummaryRef} onInsert={markup => setForm(prev => ({ ...prev, summary: insertAtCursor(newSummaryRef, prev.summary ?? '', markup) }))} />
        </FormField>
        <div className="flex flex-col gap-2 mt-1">
          <SessionSection icon={Swords} label="Combat Summary">
            <MarkdownEditor
              value={form.combats ?? ''}
              onChange={v => setForm(prev => ({ ...prev, combats: v || null }))}
              placeholder="Describe combats that took place…"
              minHeight="80px"
            />
          </SessionSection>
          <SessionSection icon={Gift} label="Loot &amp; Rewards">
            <MarkdownEditor
              value={form.loot_rewards ?? ''}
              onChange={v => setForm(prev => ({ ...prev, loot_rewards: v || null }))}
              placeholder="Items, gold, or rewards gained…"
              minHeight="60px"
            />
          </SessionSection>
          <SessionSection icon={Lightbulb} label="Hook Follow-ups">
            <MarkdownEditor
              value={form.hooks_notes ?? ''}
              onChange={v => setForm(prev => ({ ...prev, hooks_notes: v || null }))}
              placeholder="Which hooks were advanced or introduced…"
              minHeight="60px"
            />
          </SessionSection>
          <SessionSection icon={Eye} label="DM Notes" dmOnly>
            <MarkdownEditor
              value={form.dm_notes ?? ''}
              onChange={v => setForm(prev => ({ ...prev, dm_notes: v || null }))}
              placeholder="Private notes, reminders, secrets…"
              minHeight="60px"
            />
          </SessionSection>
        </div>
      </Modal>
    </div>
  );
}
