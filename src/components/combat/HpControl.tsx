// Damage, heal and temporary HP for one combatant, at two densities:
//   rail: one amount, then Dmg / Heal / Temp (and Max while there is none).
//   full: the big HP readout (click a number to set it), the HP bar, Damage /
//         Heal around one field, ±1 / ±5 nudges and a temp-HP popover.
// Either way Enter in the amount deals damage and Shift+Enter heals.

import { useRef, useState, type ReactNode } from 'react';
import { clamp, type Combatant } from '../../lib/combat';
import { Button } from '../ui/Button';
import './combat.css';

export type Density = 'full' | 'rail';

export interface HpControlProps {
  combatant: Combatant;
  density: Density;
  onDamage(n: number): void;
  onHeal(n: number): void;
  onTemp(n: number): void;
  /** Full density: set current HP by clicking the number. */
  onSetHp?(n: number): void;
  /** Rail: offered while there's no max HP. Full: click the max to override it. */
  onSetMax?(n: number): void;
  className?: string;
  /** Rail: trailing content on the control line. Full: content under the controls. */
  children?: ReactNode;
}

const digits = (s: string) => s.replace(/[^0-9]/g, '');

export function HpControl(props: HpControlProps) {
  return props.density === 'full' ? <FullHp {...props} /> : <RailHp {...props} />;
}

function RailHp({ combatant: c, onDamage, onHeal, onTemp, onSetMax, className = '', children }: HpControlProps) {
  const [amount, setAmount] = useState('');
  const n = parseInt(amount, 10);
  const valid = n > 0;
  const apply = (fn: (n: number) => void) => { if (valid) { fn(n); setAmount(''); } };

  return (
    <div className={`cbt-hp-rail ${className}`.trim()}>
      <input className="cbt-amount" type="number" min={1} aria-label={`Amount for ${c.name}`} placeholder="#"
        value={amount} onChange={e => setAmount(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') apply(e.shiftKey ? onHeal : onDamage); }} />
      <Button size="xs" variant="secondary" disabled={!valid} onClick={() => apply(onDamage)} title="Damage (Enter)">Dmg</Button>
      <Button size="xs" variant="secondary" disabled={!valid} onClick={() => apply(onHeal)} title="Heal (Shift+Enter)">Heal</Button>
      <Button size="xs" variant="ghost" disabled={!valid} onClick={() => apply(onTemp)} title="Temporary HP">Temp</Button>
      {onSetMax && c.maxHp <= 0 && <Button size="xs" variant="ghost" disabled={!valid} onClick={() => apply(onSetMax)} title="Set max HP">Max</Button>}
      {children}
    </div>
  );
}

// HP bar colour by how much is left.
function barFill(pct: number): string {
  if (pct > 60) return 'linear-gradient(to right, var(--accent), var(--gold))';
  if (pct > 25) return 'linear-gradient(to right, var(--accent), var(--diff-hard))';
  return 'linear-gradient(to right, var(--red), var(--accent))';
}

// The big number: red when down, orange when bloodied. With no max (a PC whose
// HP isn't set) it reads neutral, never "down".
function readoutColor(hp: number, max: number): string {
  if (max <= 0) return 'var(--ink-2)';
  if (hp <= 0) return 'var(--red)';
  return hp <= max / 2 ? 'var(--orange)' : 'var(--ink)';
}

/** A number that turns into a field when clicked; Enter or leaving saves, Escape cancels. */
function EditableNumber({ value, label, kind, color, onSave, children }: {
  value: number; label: string; kind: 'num' | 'max'; color?: string; onSave?: (n: number) => void; children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const cancel = useRef(false);
  const cls = kind === 'num' ? 'cbt-hp-num' : 'cbt-hp-max';

  if (!onSave) return <span className={cls} style={color ? { color } : undefined}>{children}</span>;
  if (!editing) {
    return (
      // eslint-disable-next-line no-restricted-syntax -- the HP readout itself is the button: the number keeps its size and colour
      <button type="button" className={`${cls} cbt-hp-editable`} style={color ? { color } : undefined}
        aria-label={label} title={label} onClick={() => { setText(String(value)); setEditing(true); }}>
        {children}
      </button>
    );
  }
  const commit = () => {
    const n = parseInt(text, 10);
    if (!isNaN(n) && n >= 0) onSave(n);
    setEditing(false);
  };
  return (
    <input className={`cbt-hp-edit is-${kind}`} autoFocus inputMode="numeric" aria-label={label} value={text}
      onChange={e => setText(digits(e.target.value))}
      onFocus={e => e.currentTarget.select()}
      onBlur={() => { if (cancel.current) { cancel.current = false; setEditing(false); } else commit(); }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') { cancel.current = true; e.currentTarget.blur(); } }} />
  );
}

function FullHp({ combatant: c, onDamage, onHeal, onTemp, onSetHp, onSetMax, className = '', children }: HpControlProps) {
  const [val, setVal] = useState('');
  const [tempOpen, setTempOpen] = useState(false);
  const [tempVal, setTempVal] = useState('');

  const hasMax = c.maxHp > 0;
  const down = hasMax && c.currentHp <= 0;
  const bloodied = hasMax && c.currentHp > 0 && c.currentHp <= c.maxHp / 2;
  const pct = hasMax ? clamp((c.currentHp / c.maxHp) * 100, 0, 100) : 0;
  const dead = c.conditions.includes('dead');
  const stable = c.conditions.includes('stable');

  const apply = (heal: boolean) => {
    const n = parseInt(val, 10);
    if (isNaN(n) || n <= 0) return;
    if (heal) onHeal(n); else onDamage(n);
    setVal('');
  };
  const commitTemp = () => {
    const n = parseInt(tempVal, 10);
    if (!isNaN(n) && n > 0) onTemp(n);
    setTempVal('');
    setTempOpen(false);
  };

  return (
    <div className={`cbt-hp ${className}`.trim()}>
      <div className="cbt-hp-top">
        <div className="cbt-hp-read">
          <EditableNumber kind="num" value={c.currentHp} label={`Set ${c.name}'s current HP`} color={readoutColor(c.currentHp, c.maxHp)} onSave={onSetHp}>
            {c.currentHp}
          </EditableNumber>
          <EditableNumber kind="max" value={c.maxHp} label={`Override ${c.name}'s max HP for this fight`} onSave={onSetMax}>
            /{hasMax ? c.maxHp : '—'}
          </EditableNumber>
          {c.temp > 0 && <span className="cbt-hp-temp">+{c.temp} temp</span>}
        </div>
        {down ? (
          <span className="cbt-hp-status is-down">{dead ? 'Dead' : stable ? 'Stable' : 'Down'}</span>
        ) : bloodied ? (
          <span className="cbt-hp-status is-bloodied">Bloodied</span>
        ) : null}
      </div>

      {hasMax && (
        <div className={`cbt-bar${c.temp > 0 ? ' has-temp' : ''}`}>
          <div className="cbt-bar-fill" style={{ width: `${pct}%`, background: barFill(pct) }} />
        </div>
      )}

      <div className="cbt-hp-ctrl">
        <div className="cbt-dh">
          {/* eslint-disable-next-line no-restricted-syntax -- half of the joined Damage | amount | Heal control */}
          <button type="button" className="cbt-dh-btn is-dmg" onClick={() => apply(false)}>Damage</button>
          <input inputMode="numeric" value={val} placeholder="0" aria-label={`Amount for ${c.name}`}
            onChange={e => setVal(digits(e.target.value))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); apply(e.shiftKey); } }} />
          {/* eslint-disable-next-line no-restricted-syntax -- half of the joined Damage | amount | Heal control */}
          <button type="button" className="cbt-dh-btn is-heal" onClick={() => apply(true)}>Heal</button>
        </div>
        {[1, 5].map(n => (
          <div key={n} className="cbt-nudge">
            <button type="button" onClick={() => onHeal(n)} aria-label={`Heal ${n}`} title={`+${n}`}>+{n}</button>
            <button type="button" onClick={() => onDamage(n)} aria-label={`Damage ${n}`} title={`−${n}`}>−{n}</button>
          </div>
        ))}
        {/* eslint-disable-next-line no-restricted-syntax -- the temp-HP toggle, sized to the Damage | Heal control */}
        <button type="button" className="cbt-tempbtn" title="Add temporary HP" aria-label="Add temporary HP" aria-expanded={tempOpen}
          onClick={() => setTempOpen(o => !o)}>+T</button>
      </div>

      {tempOpen && (
        <div className="cbt-temppop">
          <span className="cbt-temppop-hint">Temp HP</span>
          <input autoFocus inputMode="numeric" value={tempVal} placeholder="0" aria-label={`Temporary HP for ${c.name}`}
            onChange={e => setTempVal(digits(e.target.value))}
            onKeyDown={e => { if (e.key === 'Enter') commitTemp(); if (e.key === 'Escape') setTempOpen(false); }} />
          {/* eslint-disable-next-line no-restricted-syntax -- temp-HP popover action in the popover's info tint */}
          <button type="button" className="cbt-temppop-btn" onClick={commitTemp}>Set</button>
          {/* eslint-disable-next-line no-restricted-syntax -- temp-HP popover action in the popover's info tint */}
          <button type="button" className="cbt-temppop-btn is-quiet" onClick={() => setTempOpen(false)}>Cancel</button>
        </div>
      )}

      {children}
    </div>
  );
}
