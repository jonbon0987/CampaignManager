// The docked initiative tracker: the session's one fight, sized for the rail.
// Same rules as the full-screen tracker (lib/combat), saved on the session.

import { useState } from 'react';
import { X } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { usePlay } from '../../context/PlayContext';
import { useStatBlockPanel } from '../../context/StatBlockPanelContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useFight, type FightControls } from '../../hooks/useFight';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import {
  CONDITIONS, CONDITION_COLORS, combatantsFromParty, isDown, newCombatant, partyFrom,
  type Combatant, type Condition,
} from '../../lib/combat';

function Pips({ label, value, onSet, tone }: { label: string; value: number; onSet: (n: number) => void; tone: string }) {
  return (
    <span className="pi-pips" aria-label={`${label}: ${value} of 3`}>
      <span className="pi-pips-label">{label}</span>
      {[1, 2, 3].map(n => (
        // eslint-disable-next-line no-restricted-syntax -- a death-save pip
        <button key={n} type="button" className="pi-pip" style={n <= value ? { background: tone, borderColor: tone } : undefined}
          aria-label={`${label} ${n}`} onClick={() => onSet(n <= value ? n - 1 : n)} />
      ))}
    </span>
  );
}

function Row({ c, current, started, f }: { c: Combatant; current: boolean; started: boolean; f: FightControls }) {
  const { openStatBlock } = useStatBlockPanel();
  const [amount, setAmount] = useState('');
  const n = parseInt(amount, 10);
  const valid = n > 0;
  const apply = (fn: (id: string, n: number) => void) => { if (valid) { fn(c.id, n); setAmount(''); } };
  const down = isDown(c);
  const dead = c.conditions.includes('dead');
  const stable = c.conditions.includes('stable');
  const hpTone = c.maxHp <= 0 ? 'var(--ink-3)' : down ? 'var(--red)' : c.currentHp <= c.maxHp / 2 ? 'var(--orange)' : 'var(--ink)';

  return (
    <li className={`pi-row${current ? ' is-current' : ''}${down && !c.isPC ? ' is-down' : ''}`}>
      <div className="pi-top">
        {started
          ? <span className="pi-init">{c.initiative ?? '—'}</span>
          : <input className="pi-init-input" type="number" aria-label={`Initiative for ${c.name}`} placeholder="—"
              value={c.initiative ?? ''} onChange={e => f.setInitiative(c.id, e.target.value === '' ? null : parseInt(e.target.value, 10))} />}
        <span className="pi-glyph" aria-hidden>{c.isPC ? '◈' : '◆'}</span>
        {c.statblockId
          ? <Button variant="link" className="pi-name" onClick={() => openStatBlock(c.statblockId!)} title="Open stat sheet">{c.name}</Button>
          : <span className="pi-name">{c.name}</span>}
        <span className="pi-hp" style={{ color: hpTone }}>
          {c.maxHp > 0 ? `${c.currentHp}/${c.maxHp}` : '— HP'}
          {c.temp > 0 && <span className="pi-temp"> +{c.temp}</span>}
        </span>
        <IconButton aria-label={`Remove ${c.name}`} title="Remove" onClick={() => f.remove(c.id)} style={{ width: 22, height: 22 }}>
          <X size={12} />
        </IconButton>
      </div>

      <div className="pi-bot">
        <input className="pi-amount" type="number" min={1} aria-label={`Amount for ${c.name}`} placeholder="#"
          value={amount} onChange={e => setAmount(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') apply(e.shiftKey ? f.heal : f.damage); }} />
        <Button size="xs" variant="secondary" disabled={!valid} onClick={() => apply(f.damage)} title="Damage (Enter)">Dmg</Button>
        <Button size="xs" variant="secondary" disabled={!valid} onClick={() => apply(f.heal)} title="Heal (Shift+Enter)">Heal</Button>
        <Button size="xs" variant="ghost" disabled={!valid} onClick={() => apply(f.addTemp)} title="Temporary HP">Temp</Button>
        {c.maxHp <= 0 && <Button size="xs" variant="ghost" disabled={!valid} onClick={() => apply(f.setMax)} title="Set max HP">Max</Button>}
        {c.ac != null && <span className="pi-ac">AC {c.ac}</span>}
      </div>

      {c.isPC && down && !dead && !stable && (
        <div className="pi-saves">
          <Pips label="Saves" value={c.deathSaves.s} tone="var(--moss)" onSet={v => f.deathSave(c.id, 's', v)} />
          <Pips label="Fails" value={c.deathSaves.f} tone="var(--red)" onSet={v => f.deathSave(c.id, 'f', v)} />
        </div>
      )}

      <div className="pi-conds">
        {c.conditions.map(cond => (
          // eslint-disable-next-line no-restricted-syntax -- a condition pill; clicking clears it
          <button key={cond} type="button" className="pi-cond" style={{ color: CONDITION_COLORS[cond], borderColor: CONDITION_COLORS[cond] }}
            onClick={() => f.toggleCondition(c.id, cond)} title={`Clear ${cond}`}>
            {cond} ×
          </button>
        ))}
        <select className="pi-cond-add" aria-label={`Add a condition to ${c.name}`} value=""
          onChange={e => { if (e.target.value) f.toggleCondition(c.id, e.target.value as Condition); }}>
          <option value="">+ condition</option>
          {CONDITIONS.filter(x => !c.conditions.includes(x)).map(x => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>
    </li>
  );
}

export function PlayInitiative() {
  const { pcs } = useCampaign();
  const { fight, setFight } = usePlay();
  const f = useFight(fight, setFight);
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const party = partyFrom(pcs);
  const missing = party.filter(p => !fight.combatants.some(c => c.isPC && c.name === p.name));
  const allRolled = fight.combatants.length > 0 && fight.combatants.every(c => c.initiative !== null);

  const add = () => {
    if (!name.trim()) return;
    f.add([newCombatant(name.trim())]);
    setName('');
  };

  return (
    <div className="pi">
      <div className="pi-head">
        <div className="pi-status">
          {f.started ? <>Round {fight.round}<span className="pi-status-sub"> · {f.current?.name}’s turn</span></> : 'Not started'}
        </div>
        <div className="pi-controls">
          {f.historyLen > 0 && <Button size="xs" variant="ghost" onClick={f.undo} title="Undo the last HP change">↺ Undo</Button>}
          {f.started ? (
            <>
              <Button size="xs" variant="ghost" onClick={f.reset}>Reset</Button>
              <Button size="xs" variant="primary" onClick={f.next}>Next turn ▶</Button>
            </>
          ) : (
            <>
              <Button size="xs" variant="ghost" onClick={f.rollNPCs} disabled={fight.combatants.length === 0}>Roll NPCs</Button>
              <Button size="xs" variant="primary" onClick={f.start} disabled={!allRolled} title={allRolled ? 'Start the fight' : 'Everyone needs an initiative first'}>Start</Button>
            </>
          )}
        </div>
      </div>

      {fight.combatants.length === 0 ? (
        <p className="pi-empty">No one in the fight. Add the party, an encounter from the agenda, or anyone by name.</p>
      ) : (
        <ul className="pi-list">
          {f.order.map((c, i) => <Row key={c.id} c={c} current={f.started && i === fight.turn} started={f.started} f={f} />)}
        </ul>
      )}

      <div className="pi-add">
        <input className="as-input" value={name} onChange={e => setName(e.target.value)} placeholder="Add a combatant…"
          aria-label="Add a combatant" onKeyDown={e => { if (e.key === 'Enter') add(); }} />
        {missing.length > 0 && (
          <Button size="sm" variant="secondary" onClick={() => f.add(combatantsFromParty(missing))}>
            + {missing.length === party.length ? 'Party' : missing.map(m => m.name).join(', ')}
          </Button>
        )}
        {fight.combatants.length > 0 && (
          <Button size="sm" variant="ghost" onClick={async () => {
            if (await confirm({ title: 'Clear the fight?', message: 'Everyone leaves the tracker, the party included.', confirmLabel: 'Clear' })) {
              setFight({ combatants: [], turn: -1, round: 1 });
            }
          }}>Clear</Button>
        )}
      </div>
    </div>
  );
}
