import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
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
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [form, setForm] = useState<SessionForm>(emptyForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    setEditingSession(null);
    setForm({ ...emptyForm(), session_number: nextNumber });
    setModalOpen(true);
  };

  const openEdit = (s: Session) => {
    setEditingSession(s);
    setForm({ session_number: s.session_number, session_date: s.session_date, summary: s.summary });
    setModalOpen(true);
  };

  const handleSave = async () => {
    await upsertSession({
      session_number: form.session_number,
      session_date: form.session_date,
      summary: form.summary,
      combats: editingSession?.combats ?? null,
      loot_rewards: editingSession?.loot_rewards ?? null,
      hooks_notes: editingSession?.hooks_notes ?? null,
      dm_notes: editingSession?.dm_notes ?? null,
    });
    setModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this session?')) {
      await deleteSession(id);
      if (expandedId === id) setExpandedId(null);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold" style={{ color: '#c9a84c', fontFamily: 'Georgia, serif' }}>
          Session Notes
        </h2>
        <button
          onClick={openAdd}
          className="px-4 py-2 rounded text-sm font-semibold transition-colors"
          style={{ backgroundColor: '#a07830', color: '#e8d5b0' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#c9a84c')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#a07830')}
        >
          + Add Session
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search sessions by summary or date..."
          style={{ ...inputStyle, maxWidth: '420px' }}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#6a6490' }}>
          {search ? 'No sessions match your search.' : 'No sessions yet. Add your first session!'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(session => (
            <div key={session.id} className="rounded-lg border overflow-hidden" style={{ backgroundColor: '#1a1828', borderColor: '#3a3660' }}>
              <div
                className="flex items-center justify-between p-4 cursor-pointer"
                style={{ borderBottom: expandedId === session.id ? '1px solid #3a3660' : 'none' }}
                onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}
              >
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold px-2 py-1 rounded" style={{ backgroundColor: '#22203a', color: '#c9a84c' }}>
                      Session {session.session_number}
                    </span>
                  </div>
                  <div className="text-xs mt-1" style={{ color: '#6a6490' }}>{session.session_date ?? '—'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={e => { e.stopPropagation(); openEdit(session); }}
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(session.id); }}
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={{ backgroundColor: '#22203a', color: '#e05c5c', border: '1px solid #3a3660' }}
                  >
                    Delete
                  </button>
                  <span className="text-xs ml-1" style={{ color: '#6a6490' }}>
                    {expandedId === session.id ? '▲' : '▼'}
                  </span>
                </div>
              </div>
              {expandedId === session.id && (
                <div className="p-4">
                  {session.summary ? (
                    <pre className="whitespace-pre-wrap text-sm" style={{ color: '#e8d5b0', fontFamily: 'Georgia, serif', lineHeight: '1.7' }}>
                      {session.summary}
                    </pre>
                  ) : (
                    <p className="text-sm" style={{ color: '#6a6490', fontStyle: 'italic' }}>No notes recorded for this session.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingSession ? 'Edit Session' : 'New Session'}
        onSave={handleSave}
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
