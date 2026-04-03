import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import { SectionHeader } from '../ui/SectionHeader';
import { SearchBar } from '../ui/SearchBar';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import type { Session } from '../../lib/database.types';

type SessionForm = {
  session_number: number;
  session_date: string | null;
  summary: string | null;
};

const emptyForm = (): SessionForm => ({
  session_number: 1,
  session_date: new Date().toISOString().split('T')[0],
  summary: '',
});

export default function SessionNotes() {
  const { sessions, upsertSession, deleteSession } = useCampaign();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<SessionForm>(emptyForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SessionForm | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = sessions
    .filter(s => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (s.summary ?? '').toLowerCase().includes(q) ||
        (s.session_date ?? '').includes(q) ||
        String(s.session_number).includes(q)
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
      combats: null,
      loot_rewards: null,
      hooks_notes: null,
      dm_notes: null,
    });
    setModalOpen(false);
  };

  const startEdit = (s: Session) => {
    setEditingId(s.id);
    setEditForm({ session_number: s.session_number, session_date: s.session_date, summary: s.summary });
    setExpandedId(s.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const saveEdit = async () => {
    if (!editForm || !editingId) return;
    const session = sessions.find(s => s.id === editingId);
    if (!session) return;
    setSaving(true);
    await upsertSession({
      session_number: editForm.session_number,
      session_date: editForm.session_date,
      summary: editForm.summary,
      // Preserve hidden fields
      combats: session.combats,
      loot_rewards: session.loot_rewards,
      hooks_notes: session.hooks_notes,
      dm_notes: session.dm_notes,
    });
    setSaving(false);
    cancelEdit();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this session?')) {
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
                          <textarea
                            value={editForm.summary ?? ''}
                            onChange={e => setEditForm(prev => prev ? { ...prev, summary: e.target.value || null } : prev)}
                            placeholder="What happened this session..."
                            rows={10}
                            className="w-full px-2 py-1.5 rounded text-sm outline-none resize-y"
                            style={{ backgroundColor: '#0f0e17', color: '#e8d5b0', border: '1px solid #3a3660', fontFamily: 'Georgia, Cambria, serif', minHeight: '200px' }}
                          />
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
                      session.summary ? (
                        <pre className="whitespace-pre-wrap text-sm" style={{ color: '#e8d5b0', fontFamily: 'Georgia, Cambria, serif', lineHeight: '1.7' }}>
                          {session.summary}
                        </pre>
                      ) : (
                        <p className="text-sm" style={{ color: '#6a6490', fontStyle: 'italic' }}>No notes recorded for this session.</p>
                      )
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
          <textarea
            value={form.summary ?? ''}
            onChange={e => setForm(prev => ({ ...prev, summary: e.target.value || null }))}
            placeholder="What happened this session..."
            style={{ ...textareaStyle, minHeight: '320px' }}
          />
        </FormField>
      </Modal>
    </div>
  );
}
