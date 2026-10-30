// The table tools docked in the rail while a session is live: initiative,
// dice, timestamped notes and the recorder. Everything saves on the session.

import { useState } from 'react';
import { X } from 'lucide-react';
import { usePlay, type PlayTab } from '../../context/PlayContext';
import { useRecording } from '../../context/RecordingContext';
import { RecorderPanel } from '../session/RecorderPanel';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { PlayInitiative } from './PlayInitiative';
import { d20Natural, parseDice, roll } from '../../lib/dice';
import { noteStamp } from '../../lib/playTime';

const TABS: { id: PlayTab; label: string; glyph: string }[] = [
  { id: 'initiative', label: 'Initiative', glyph: '⚔' },
  { id: 'dice', label: 'Dice', glyph: '⚄' },
  { id: 'notes', label: 'Notes', glyph: '✎' },
  { id: 'record', label: 'Record', glyph: '●' },
];

const DICE = [4, 6, 8, 10, 12, 20, 100];

function DiceTray() {
  const { play, logRoll } = usePlay();
  const [expr, setExpr] = useState('');
  const spec = parseDice(expr);
  const rollExpr = (text: string) => {
    const s = parseDice(text);
    if (s) logRoll(roll(s));
  };

  return (
    <div className="pt-pane">
      <div className="pt-dice">
        {DICE.map(d => (
          <Button key={d} size="sm" variant="secondary" onClick={() => rollExpr(`d${d}`)}>d{d}</Button>
        ))}
      </div>
      <div className="pt-row">
        <input className="as-input" value={expr} onChange={e => setExpr(e.target.value)} placeholder="2d6+3"
          aria-label="Dice to roll" onKeyDown={e => { if (e.key === 'Enter' && spec) { rollExpr(expr); setExpr(''); } }} />
        <Button size="sm" variant="primary" disabled={!spec} onClick={() => { rollExpr(expr); setExpr(''); }}>Roll</Button>
      </div>
      <ul className="pt-log" aria-label="Dice log">
        {(play.rolls ?? []).map((r, i) => {
          const nat = d20Natural(r);
          return (
            <li key={`${r.at}-${i}`} className={`pt-roll${i === 0 ? ' is-latest' : ''}`}>
              <span className="pt-roll-expr">{r.expr}</span>
              {r.rolls.length > 1 && <span className="pt-roll-detail">[{r.rolls.join(', ')}]</span>}
              <span className={`pt-roll-total${nat ? ` is-${nat}` : ''}`}>{r.total}</span>
              <span className="pt-stamp">{noteStamp(r.at, play.started_at)}</span>
            </li>
          );
        })}
        {(play.rolls ?? []).length === 0 && <li className="pt-empty">Rolls here and from ⌘K are kept with the session.</li>}
      </ul>
    </div>
  );
}

function TableNotes() {
  const { play, addNote, removeNote } = usePlay();
  const { live: recording } = useRecording();
  const [text, setText] = useState('');
  const notes = [...(play.notes ?? [])].reverse();
  const save = () => { addNote(text); setText(''); };

  return (
    <div className="pt-pane">
      <div className="pt-row">
        <input className="as-input" value={text} onChange={e => setText(e.target.value)} placeholder="What just happened…"
          aria-label="Table note" onKeyDown={e => { if (e.key === 'Enter') save(); }} />
        <Button size="sm" variant="primary" disabled={!text.trim()} onClick={save}>Add</Button>
      </div>
      <p className="pt-hint">
        Notes go in the session’s recap{recording ? ', and onto the recording’s timeline' : ''}. <kbd className="cm-kbd">⌘.</kbd> adds one from anywhere.
      </p>
      <ul className="pt-notes" aria-label="Table notes">
        {notes.map(n => (
          <li key={n.id} className="pt-note">
            <span className="pt-stamp">{noteStamp(n.at, play.started_at)}</span>
            <span className="pt-note-text">{n.text}</span>
            <IconButton aria-label="Delete note" title="Delete" onClick={() => removeNote(n.id)} style={{ width: 22, height: 22 }}>
              <X size={12} />
            </IconButton>
          </li>
        ))}
        {notes.length === 0 && <li className="pt-empty">No notes yet.</li>}
      </ul>
    </div>
  );
}

export function PlayTools() {
  const { live, tab, setTab } = usePlay();
  if (!live) return null;

  return (
    <aside className="pt" aria-label="Table tools">
      <div className="cm-subtabs pt-tabs" role="tablist" aria-label="Table tools">
        {TABS.map(t => (
          // eslint-disable-next-line no-restricted-syntax -- a tool tab, styled with its strip
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`cm-subtab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}>
            <span aria-hidden>{t.glyph}</span> {t.label}
          </button>
        ))}
      </div>
      {/* Every tool stays mounted, so undo history and half-typed input survive a tab switch. */}
      <div className="pt-body">
        <div hidden={tab !== 'initiative'}><PlayInitiative /></div>
        <div hidden={tab !== 'dice'}><DiceTray /></div>
        <div hidden={tab !== 'notes'}><TableNotes /></div>
        <div hidden={tab !== 'record'} className="pt-pane"><RecorderPanel session={live} /></div>
      </div>
    </aside>
  );
}
