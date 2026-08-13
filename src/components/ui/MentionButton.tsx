import { useState, useRef, useEffect } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { CharCounter } from './CharCounter';

interface MentionEntry {
  id: string;
  label: string;
  kind: string;
  glyph: string;
}

const KIND_GLYPH: Record<string, string> = {
  npc: '◇', pc: '◈', faction: '⬡', location: '✦', lore: '❧', session: '✧', creature: '⚔',
};

interface MentionButtonProps {
  onInsert: (text: string) => void;
}

export function MentionButton({ onInsert }: MentionButtonProps) {
  const { npcs, pcs, factions, locations, lore, sessions } = useCampaign();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const all: MentionEntry[] = [
    ...npcs.map(x => ({ id: x.id, label: x.name, kind: 'npc', glyph: KIND_GLYPH.npc })),
    ...(pcs ?? []).map(x => ({ id: x.id, label: x.character_name, kind: 'pc', glyph: KIND_GLYPH.pc })),
    ...factions.map(x => ({ id: x.id, label: x.name, kind: 'faction', glyph: KIND_GLYPH.faction })),
    ...locations.map(x => ({ id: x.id, label: x.name, kind: 'location', glyph: KIND_GLYPH.location })),
    ...(lore ?? []).map(x => ({ id: x.id, label: x.title, kind: 'lore', glyph: KIND_GLYPH.lore })),
    ...sessions.map(x => ({ id: x.id, label: `Session #${x.session_number}`, kind: 'session', glyph: KIND_GLYPH.session })),
  ];

  const hits = q
    ? all.filter(x => x.label.toLowerCase().includes(q.toLowerCase())).slice(0, 10)
    : all.slice(0, 10);

  return (
    <div ref={ref} style={{ display: 'inline', position: 'relative' }}>
      <button
        className="as-at"
        onClick={() => { setOpen(o => !o); setQ(''); }}
        title="Link entity (@)"
        type="button"
      >
        @
      </button>
      {open && (
        <div className="as-pop">
          <div className="as-pop-s">
            <input
              autoFocus
              placeholder="Search entities…"
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
            />
          </div>
          <div className="as-pop-l">
            {hits.length === 0 && (
              <div style={{ padding: '12px 14px', color: 'var(--ink-3)', fontFamily: 'var(--serif)', fontSize: 13, fontStyle: 'italic' }}>
                No results
              </div>
            )}
            {hits.map(m => (
              <button
                key={m.kind + m.id}
                className="as-pop-i"
                onClick={() => { onInsert(`@${m.label}`); setOpen(false); }}
              >
                <span style={{ color: 'var(--gold)', width: 16, textAlign: 'center', flexShrink: 0 }}>{m.glyph}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
                <span className="as-pop-kind">{m.kind}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Wraps a textarea with an @ mention button that inserts text at cursor */
interface AutosaveTextareaProps {
  value: string | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  mention?: boolean;
  /** Soft character limit — drives a warning counter, does NOT block typing. */
  maxLength?: number;
}

export function AutosaveTextarea({ value, onChange, placeholder, rows = 4, mention = true, maxLength }: AutosaveTextareaProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  const insert = (text: string) => {
    const ta = taRef.current;
    if (!ta) { onChange((value ?? '') + ' ' + text); return; }
    const s = ta.selectionStart;
    const before = (value ?? '').slice(0, s);
    const after = (value ?? '').slice(ta.selectionEnd);
    const next = before + text + ' ' + after;
    onChange(next);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s + text.length + 1;
    }, 0);
  };

  return (
    <div className="as-tw">
      <textarea
        ref={taRef}
        className="as-ta"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
      {mention && <MentionButton onInsert={insert} />}
      <CharCounter value={value ?? ''} limit={maxLength} />
    </div>
  );
}
