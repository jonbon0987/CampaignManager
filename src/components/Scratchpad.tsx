import { useState, useEffect, useRef } from 'react';

interface ScratchNote {
  id: number;
  time: string;
  text: string;
}

interface ScratchpadProps {
  open: boolean;
  onClose: () => void;
}

export default function Scratchpad({ open, onClose }: ScratchpadProps) {
  const [notes, setNotes] = useState<ScratchNote[]>(() => {
    try { return JSON.parse(localStorage.getItem('cm-scratch') || '[]'); } catch { return []; }
  });
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('cm-scratch', JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const addNote = () => {
    if (!input.trim()) return;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setNotes(n => [{ id: Date.now(), time, text: input.trim() }, ...n]);
    setInput('');
  };

  if (!open) return null;

  return (
    <div className="v6-scratch">
      <div className="v6-scratch-head">
        <span className="v6-scratch-icon">✎</span>
        <span className="v6-scratch-title">Scratchpad</span>
        <span className="v6-scratch-count">{notes.length}</span>
        <div style={{ flex: 1 }} />
        <span className="v6-scratch-key">⌘.</span>
        <button className="v6-scratch-close" onClick={onClose} aria-label="Close scratchpad">✕</button>
      </div>

      <div className="v6-scratch-notes">
        {notes.length === 0 && (
          <div className="v6-scratch-empty">
            No notes yet. Jot something down during your session.
          </div>
        )}
        {notes.map(n => (
          <div key={n.id} className="v6-scratch-note">
            <span className="v6-scratch-time">{n.time}</span>
            <span className="v6-scratch-text">{n.text}</span>
            <button
              className="v6-scratch-rm"
              onClick={() => setNotes(ns => ns.filter(x => x.id !== n.id))}
              title="Remove"
            >✕</button>
          </div>
        ))}
      </div>

      <div className="v6-scratch-input">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNote(); } }}
          placeholder="Quick note…"
          className="v6-scratch-field"
        />
        <button className="v6-scratch-send" onClick={addNote} aria-label="Add note">↵</button>
      </div>

      <div className="v6-scratch-foot">
        <button className="v6-scratch-action" onClick={() => setNotes([])}>Clear all</button>
      </div>
    </div>
  );
}
