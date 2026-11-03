// Stat block text with its numbers as dice: click "+5 to hit" to roll the
// attack (shift for advantage, alt for disadvantage), "10 (2d6 + 3)" to roll
// damage (shift for a critical hit), "Wis +3" to roll the save. The result
// shows beside the chip, and during a live session it goes into Play's dice
// log with what it was for.

import { useState } from 'react';
import { usePlayMaybe } from '../../context/PlayContext';
import { critical, d20Natural, roll, rollD20, type DiceRoll } from '../../lib/dice';
import { rollSegments, type Rollable } from '../../lib/rollables';

const TITLE: Record<Rollable['kind'], string> = {
  attack: 'Roll to hit · shift: advantage · alt: disadvantage',
  damage: 'Roll damage · shift: critical hit',
  check: 'Roll it · shift: advantage · alt: disadvantage',
};

function RollChip({ text, rollable, source }: { text: string; rollable: Rollable; source?: string }) {
  const play = usePlayMaybe();
  const [last, setLast] = useState<DiceRoll | null>(null);

  const go = (e: React.MouseEvent) => {
    const mode = e.shiftKey ? 'advantage' : e.altKey ? 'disadvantage' : 'normal';
    const r = rollable.kind === 'damage'
      ? roll(e.shiftKey ? critical(rollable.spec) : rollable.spec)
      : rollD20(rollable.mod, mode);
    const what = rollable.kind === 'attack' ? `${rollable.mod >= 0 ? '+' : ''}${rollable.mod} to hit`
      : rollable.kind === 'check' ? rollable.label
      : 'damage';
    setLast(r);
    if (play?.live) play.logRoll(r, [source, what].filter(Boolean).join(' · '));
  };

  const nat = last ? d20Natural(last) : null;
  return (
    <span className="rl">
      <button type="button" className="rl-chip" onClick={go} title={TITLE[rollable.kind]}>{text}</button>
      {last && (
        <span className={`rl-out${nat ? ` is-${nat}` : ''}`} aria-live="polite" title={`${last.expr}: ${last.rolls.join(', ')}`}>
          → {last.total}{nat === 'crit' ? ' (20!)' : nat === 'fumble' ? ' (1)' : ''}
        </span>
      )}
    </span>
  );
}

/** Text with its rollable numbers as dice. `checks` also makes "Wis +3" style bonuses rollable. */
export function RollableText({ text, checks, source }: { text: string; checks?: boolean; source?: string }) {
  return (
    <>
      {rollSegments(text, { checks }).map((seg, i) =>
        seg.roll ? <RollChip key={i} text={seg.text} rollable={seg.roll} source={source} /> : <span key={i}>{seg.text}</span>,
      )}
    </>
  );
}
