import { useState, useRef, useEffect } from 'react';
import { useCampaign } from '../context/CampaignContext';
import type { Tab } from '../App';
import { Button } from './ui/Button';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InitRow {
  id: string;
  name: string;
  roll: number | null;
  hp: string;
  kind: 'pc' | 'npc' | 'mob';
}

interface RollEntry {
  id: number;
  expr: string;
  result: number;
  rolls: number[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let rollId = 1;
const DICE = [4, 6, 8, 10, 12, 20, 100] as const;

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

// ─── Search panel ─────────────────────────────────────────────────────────────

function SearchPanel({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const campaign = useCampaign();
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const results = q
    ? [
        ...campaign.npcs
          .filter(n => n.name.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 5)
          .map(n => ({ id: n.id, label: n.name, sub: n.role ?? '', tab: 'cast' as Tab, glyph: '◇' })),
        ...campaign.locations
          .filter(l => l.name.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 4)
          .map(l => ({ id: l.id, label: l.name, sub: l.location_type ?? '', tab: 'locations' as Tab, glyph: '✦' })),
        ...campaign.modules
          .filter(m => m.title.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 3)
          .map(m => ({ id: m.id, label: m.title, sub: m.status ?? '', tab: 'modules' as Tab, glyph: '❧' })),
        ...campaign.pcs
          .filter(p => p.character_name.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 3)
          .map(p => ({ id: p.id, label: p.character_name, sub: `${p.race ?? ''} ${p.class ?? ''}`.trim(), tab: 'cast' as Tab, glyph: '◈' })),
      ].slice(0, 12)
    : [];

  return (
    <div className="sb-search">
      <input
        ref={inputRef}
        className="sb-search-input"
        placeholder="Search anything…"
        value={q}
        onChange={e => setQ(e.target.value)}
      />
      <div className="sb-search-list">
        {results.map(x => (
          <button
            key={x.id}
            className="sb-search-item"
            onClick={() => { onNavigate(x.tab); }}
          >
            <span className="sb-search-glyph">{x.glyph}</span>
            <span className="sb-search-label">{x.label}</span>
            {x.sub && <span className="sb-search-sub">{x.sub}</span>}
          </button>
        ))}
        {!q && <div className="sb-search-hint">Search NPCs, locations, modules…</div>}
        {q && results.length === 0 && <div className="sb-search-hint">No results for "{q}"</div>}
      </div>
    </div>
  );
}

// ─── Dice panel ───────────────────────────────────────────────────────────────

function DicePanel() {
  const [log, setLog] = useState<RollEntry[]>([]);
  const [custom, setCustom] = useState('');

  const roll = (sides: number, count = 1, mod = 0) => {
    const rolls = Array.from({ length: count }, () => rollDie(sides));
    const result = rolls.reduce((s, r) => s + r, 0) + mod;
    const modStr = mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : '';
    const expr = count > 1 ? `${count}d${sides}${modStr}` : `1d${sides}${modStr}`;
    setLog(l => [{ id: rollId++, expr, result, rolls }, ...l].slice(0, 10));
  };

  const handleCustom = () => {
    const match = custom.trim().match(/^(\d*)d(\d+)\s*([+-]\s*\d+)?$/i);
    if (!match) return;
    const count = match[1] ? parseInt(match[1]) : 1;
    const sides = parseInt(match[2]);
    const mod = match[3] ? parseInt(match[3].replace(/\s/g, '')) : 0;
    roll(sides, count, mod);
    setCustom('');
  };

  return (
    <div className="sb-dice">
      <div className="sb-dice-row">
        {DICE.map(s => (
          <button key={s} className="sb-dice-btn" onClick={() => roll(s)}>d{s}</button>
        ))}
      </div>
      <div className="sb-dice-custom">
        <input
          className="sb-dice-input"
          placeholder="2d6+3…"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCustom()}
        />
        <button className="sb-dice-roll-btn" onClick={handleCustom} disabled={!custom.trim()}>
          Roll
        </button>
      </div>
      <div className="sb-dice-log">
        {log.length === 0 && <div className="sb-dice-empty">Click a die to roll</div>}
        {log.map(e => (
          <div key={e.id} className="sb-dice-entry">
            <span className="sb-dice-expr">{e.expr}</span>
            {e.rolls.length > 1 && (
              <span className="sb-dice-detail">[{e.rolls.join(', ')}]</span>
            )}
            <span className={`sb-dice-result ${e.rolls.length === 1 && e.rolls[0] === 20 && e.expr.includes('d20') ? 'is-crit' : e.rolls.length === 1 && e.rolls[0] === 1 && e.expr.includes('d20') ? 'is-fumble' : ''}`}>
              {e.result}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Initiative panel ─────────────────────────────────────────────────────────

function InitiativePanel({ pcNames }: { pcNames: string[] }) {
  const [rows, setRows] = useState<InitRow[]>(() =>
    pcNames.map((name, i) => ({
      id: `pc-${i}`,
      name,
      roll: null,
      hp: '',
      kind: 'pc' as const,
    }))
  );
  const [active, setActive] = useState(0);
  const [round, setRound] = useState(1);
  const [started, setStarted] = useState(false);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const sorted = started
    ? [...rows].sort((a, b) => (b.roll ?? -999) - (a.roll ?? -999))
    : rows;

  const rollAll = () => {
    setRows(rs => rs.map(r => ({ ...r, roll: Math.floor(Math.random() * 20) + 1 })));
  };

  const rollNPCs = () => {
    setRows(rs => rs.map(r => r.kind === 'pc' ? r : { ...r, roll: Math.floor(Math.random() * 20) + 1 }));
  };

  const nextTurn = () => {
    const next = active + 1;
    if (next >= sorted.length) {
      setActive(0);
      setRound(r => r + 1);
    } else {
      setActive(next);
    }
  };

  const start = () => {
    setStarted(true);
    setActive(0);
    setRound(1);
  };

  const reset = () => {
    setStarted(false);
    setActive(0);
    setRound(1);
    setRows(rs => rs.map(r => ({ ...r, roll: null })));
  };

  const addRow = () => {
    if (!newName.trim()) return;
    setRows(rs => [...rs, {
      id: `mob-${Date.now()}`,
      name: newName.trim(),
      roll: null,
      hp: '',
      kind: 'mob',
    }]);
    setNewName('');
    setAdding(false);
  };

  const removeRow = (id: string) => {
    setRows(rs => rs.filter(r => r.id !== id));
  };

  const allHaveRoll = rows.every(r => r.roll !== null);

  return (
    <div className="sb-init">
      {/* Header */}
      <div className="sb-init-head">
        <span className="sb-init-status">
          {started ? `Round ${round} · Turn ${active + 1}/${sorted.length}` : 'Setup'}
        </span>
        <div className="sb-init-controls">
          {!started ? (
            <>
              <Button variant="ghost" size="sm" onClick={rollNPCs}>Roll NPCs</Button>
              <Button variant="ghost" size="sm" onClick={rollAll}>Roll All</Button>
              <Button
                variant="primary"
                size="sm"
                onClick={start}
                disabled={!allHaveRoll}
                style={{ opacity: allHaveRoll ? 1 : 0.4 }}
              >
                Start
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={reset}>Reset</Button>
              <Button variant="primary" size="sm" onClick={nextTurn}>Next ▶</Button>
            </>
          )}
        </div>
      </div>

      {/* List */}
      <div className="sb-init-list">
        {sorted.map((row, i) => {
          const isCurrent = started && i === active;
          return (
            <div key={row.id} className={`sb-init-row ${isCurrent ? 'is-active' : ''} sb-init-${row.kind}`}>
              {/* Roll */}
              {!started ? (
                <input
                  className="sb-init-roll-input"
                  type="number"
                  placeholder="—"
                  value={row.roll ?? ''}
                  onChange={e => setRows(rs => rs.map(r =>
                    r.id === row.id ? { ...r, roll: e.target.value ? parseInt(e.target.value) : null } : r
                  ))}
                />
              ) : (
                <span className="sb-init-roll">{row.roll ?? '—'}</span>
              )}
              {/* Glyph */}
              <span className="sb-init-glyph">
                {row.kind === 'pc' ? '◈' : row.kind === 'npc' ? '◇' : '◆'}
              </span>
              {/* Name */}
              <span className="sb-init-name">{row.name}</span>
              {/* HP */}
              <input
                className="sb-init-hp"
                placeholder="HP"
                value={row.hp}
                onChange={e => setRows(rs => rs.map(r =>
                  r.id === row.id ? { ...r, hp: e.target.value } : r
                ))}
              />
              {/* Remove */}
              <button
                className="sb-init-remove"
                onClick={() => removeRow(row.id)}
                title="Remove"
              >✕</button>
            </div>
          );
        })}
      </div>

      {/* Add combatant */}
      <div className="sb-init-add">
        {adding ? (
          <div className="sb-init-add-row">
            <input
              className="sb-init-add-input"
              autoFocus
              placeholder="Name…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addRow();
                if (e.key === 'Escape') setAdding(false);
              }}
            />
            <Button variant="primary" size="sm" onClick={addRow}>Add</Button>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        ) : (
          <button className="sb-init-add-btn" onClick={() => setAdding(true)}>
            + Add combatant
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Session Bar ──────────────────────────────────────────────────────────────

interface SessionBarProps {
  open: boolean;
  onClose: () => void;
  runMode: boolean;
  onToggleRun: () => void;
  onNavigate: (tab: Tab) => void;
  pcNames?: string[];
}

export default function SessionBar({
  open,
  onClose,
  runMode,
  onToggleRun,
  onNavigate,
  pcNames = [],
}: SessionBarProps) {
  const [tab, setTab] = useState<'init' | 'dice' | 'search'>('init');

  if (!open) return null;

  return (
    <div className={`sb ${runMode ? 'sb-run' : ''}`}>
      {/* Tab bar */}
      <div className="sb-tabs">
        <button className={tab === 'init' ? 'is-active' : ''} onClick={() => setTab('init')}>
          ⚔ Initiative
        </button>
        <button className={tab === 'dice' ? 'is-active' : ''} onClick={() => setTab('dice')}>
          ⚄ Dice
        </button>
        <button className={tab === 'search' ? 'is-active' : ''} onClick={() => setTab('search')}>
          ⌕ Search
        </button>
        <span className="sb-spacer" />
        {!runMode && (
          <button className="sb-close" onClick={onClose}>Hide</button>
        )}
        <button className="sb-exit" onClick={onToggleRun}>
          {runMode ? 'Exit Session' : 'Run Session'}
        </button>
      </div>

      {/* Body */}
      <div className="sb-body">
        {tab === 'init' && <InitiativePanel pcNames={pcNames} />}
        {tab === 'dice' && <DicePanel />}
        {tab === 'search' && <SearchPanel onNavigate={onNavigate} />}
      </div>
    </div>
  );
}
