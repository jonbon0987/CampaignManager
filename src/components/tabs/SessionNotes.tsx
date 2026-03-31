import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import type { Session } from '../../types';

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

const emptySession = (): Omit<Session, 'id'> => ({
  number: 1,
  date: new Date().toISOString().split('T')[0],
  title: '',
  notes: '',
});

export default function SessionNotes() {
  const { data, setData } = useCampaign();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [form, setForm] = useState(emptySession());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = data.sessions
    .filter(s => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        s.notes.toLowerCase().includes(q) ||
        s.date.includes(q) ||
        String(s.number).includes(q)
      );
    })
    .sort((a, b) => b.number - a.number);

  const openAdd = () => {
    const nextNumber = data.sessions.length > 0
      ? Math.max(...data.sessions.map(s => s.number)) + 1
      : 1;
    setEditingSession(null);
    setForm({ ...emptySession(), number: nextNumber });
    setModalOpen(true);
  };

  const openEdit = (session: Session) => {
    setEditingSession(session);
    setForm({ number: session.number, date: session.date, title: session.title, notes: session.notes });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (editingSession) {
      setData(prev => ({
        ...prev,
        sessions: prev.sessions.map(s => s.id === editingSession.id ? { ...s, ...form } : s),
      }));
    } else {
      setData(prev => ({
        ...prev,
        sessions: [...prev.sessions, { id: generateId(), ...form }],
      }));
    }
    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this session?')) {
      setData(prev => ({ ...prev, sessions: prev.sessions.filter(s => s.id !== id) }));
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
          placeholder="Search sessions by title, notes, or date..."
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
                      Session {session.number}
                    </span>
                    <span className="font-semibold" style={{ color: '#e8d5b0', fontFamily: 'Georgia, serif' }}>
                      {session.title || 'Untitled Session'}
                    </span>
                  </div>
                  <div className="text-xs mt-1" style={{ color: '#6a6490' }}>{session.date}</div>
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
                  {session.notes ? (
                    <pre className="whitespace-pre-wrap text-sm" style={{ color: '#e8d5b0', fontFamily: 'Georgia, serif', lineHeight: '1.7' }}>
                      {session.notes}
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
              value={form.number}
              onChange={e => setForm(prev => ({ ...prev, number: parseInt(e.target.value) || 1 }))}
              min={1}
              style={inputStyle}
            />
          </FormField>
          <FormField label="Date">
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
              style={inputStyle}
            />
          </FormField>
        </div>
        <FormField label="Title">
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
            placeholder="e.g., The Dragon's Lair"
            style={inputStyle}
          />
        </FormField>
        <FormField label="Session Notes">
          <textarea
            value={form.notes}
            onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="What happened this session..."
            style={{ ...textareaStyle, minHeight: '320px' }}
          />
        </FormField>
      </Modal>
    </div>
  );
}
