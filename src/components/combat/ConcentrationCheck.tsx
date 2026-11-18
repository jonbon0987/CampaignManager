// The Con save a concentrating combatant owes after taking damage, and the two
// outcomes: Held keeps the spell, Lost ends it.
//   rail: a full-width strip with the standard small buttons.
//   full: an inline chip under the name with compact bordered buttons.

import { Button } from '../ui/Button';
import type { Density } from './HpControl';
import './combat.css';

export interface ConcentrationCheckProps {
  dc: number;
  density: Density;
  onResolve(held: boolean): void;
  className?: string;
}

export function ConcentrationCheck({ dc, density, onResolve, className = '' }: ConcentrationCheckProps) {
  return (
    <div className={`cbt-con is-${density} ${className}`.trim()} role="alert">
      <span className="cbt-con-text">◎ Concentration: Con save, DC {dc}</span>
      {density === 'rail' ? (
        <>
          <Button size="xs" variant="secondary" onClick={() => onResolve(true)}>Held</Button>
          <Button size="xs" variant="ghost" onClick={() => onResolve(false)}>Lost</Button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => onResolve(true)}>Held</button>
          <button type="button" onClick={() => onResolve(false)}>Lost</button>
        </>
      )}
    </div>
  );
}
