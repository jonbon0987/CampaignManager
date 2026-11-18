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
import { combatantsFromParty, isDown, newCombatant, partyFrom, type Combatant } from '../../lib/combat';
import { HpControl } from '../combat/HpControl';
import { DeathSavePips } from '../combat/DeathSavePips';
import { ConditionChips } from '../combat/ConditionChips';
import { Input } from '../ui/Input';

function Row({ c, current, started, f }: { c: Combatant; current: boolean; started: boolean; f: FightControls }) {
  const { openStatBlock } = useStatBlockPanel();
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

      <HpControl density="rail" className="pi-indent" combatant={c}
        onDamage={n => f.damage(c.id, n)} onHeal={n => f.heal(c.id, n)} onTemp={n => f.addTemp(c.id, n)} onSetMax={n => f.setMax(c.id, n)}>
        {c.ac != null && <span className="pi-ac">AC {c.ac}</span>}
      </HpControl>

      {c.isPC && down && !dead && !stable && (
        <DeathSavePips density="rail" className="pi-indent" successes={c.deathSaves.s} failures={c.deathSaves.f} onSet={(k, v) => f.deathSave(c.id, k, v)} />
      )}

      {c.conCheck != null && (
        <div className="pi-con" role="alert">
          <span className="pi-con-text">◎ Concentration: Con save, DC {c.conCheck}</span>
          <Button size="xs" variant="secondary" onClick={() => f.resolveConcentration(c.id, true)}>Held</Button>
          <Button size="xs" variant="ghost" onClick={() => f.resolveConcentration(c.id, false)}>Lost</Button>
        </div>
      )}

      <ConditionChips density="rail" className="pi-indent" combatant={c}
        onToggle={cond => f.toggleCondition(c.id, cond)} onSetRounds={(cond, n) => f.setConditionRounds(c.id, cond, n)} />
    </li>
  );
}

export function PlayInitiative() {
  const { pcs } = useCampaign();
  const { fight, setFight, clearFight } = usePlay();
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
          {!!fight.expired?.length && (
            <div className="pi-expired" role="status">
              {fight.expired.map(e => `${e.name} is no longer ${e.conditions.join(' or ')}`).join(' · ')}
            </div>
          )}
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
        <Input look="inline" value={name} onChange={e => setName(e.target.value)} placeholder="Add a combatant…"
          aria-label="Add a combatant" onKeyDown={e => { if (e.key === 'Enter') add(); }} />
        {missing.length > 0 && (
          <Button size="sm" variant="secondary" onClick={() => f.add(combatantsFromParty(missing))}>
            + {missing.length === party.length ? 'Party' : missing.map(m => m.name).join(', ')}
          </Button>
        )}
        {fight.combatants.length > 0 && (
          <Button size="sm" variant="ghost" onClick={async () => {
            if (await confirm({ title: 'Clear the fight?', message: 'Everyone leaves the tracker, the party included. A line about the fight is kept for the recap.', confirmLabel: 'Clear' })) {
              clearFight();
            }
          }}>Clear</Button>
        )}
      </div>
    </div>
  );
}
