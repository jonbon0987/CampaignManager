// Damage, heal and temporary HP for one combatant. One amount, then the
// button for what it is: Enter deals it as damage, Shift+Enter heals.

import { useState, type ReactNode } from 'react';
import type { Combatant } from '../../lib/combat';
import { Button } from '../ui/Button';
import './combat.css';

export interface HpControlProps {
  combatant: Combatant;
  onDamage(n: number): void;
  onHeal(n: number): void;
  onTemp(n: number): void;
  /** Offered while the combatant has no max HP yet. */
  onSetMax?(n: number): void;
  className?: string;
  /** Trailing content on the same line (the rail shows AC here). */
  children?: ReactNode;
}

export function HpControl({ combatant: c, onDamage, onHeal, onTemp, onSetMax, className = '', children }: HpControlProps) {
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
