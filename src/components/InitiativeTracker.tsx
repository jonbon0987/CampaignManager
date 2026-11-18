import { useState } from 'react';
import type { Encounter, MonsterStatblock } from '../lib/database.types';
import {
  combatantsFromEncounter, combatantsFromParty, newCombatant,
  type Combatant, type Condition, type Fight, type PartyMember,
} from '../lib/combat';
import { useFight, type FightControls } from '../hooks/useFight';
import { useStatBlockPanel } from '../context/StatBlockPanelContext';
import { useConfirm } from '../context/ConfirmContext';
import { plural } from '../lib/plural';
import StatBlockPanel from './StatBlockPanel';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { Input } from './ui/Input';
import { onActivate } from '../lib/activate';
import { HpControl } from './combat/HpControl';
import { DeathSavePips } from './combat/DeathSavePips';
import { ConditionChips, ConditionPicker } from './combat/ConditionChips';
import './initiativeTracker.css';

interface InitiativeTrackerProps {
  encounter: Encounter;
  statblocks: MonsterStatblock[];
  party?: PartyMember[];
  onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────
// The full-screen runner for an encounter. Its rules live in lib/combat and its
// HP, death-save and condition controls in components/combat, both shared with
// Play's docked tracker.
export function InitiativeTracker({ encounter, statblocks, party = [], onClose }: InitiativeTrackerProps) {
  const [fight, setFight] = useState<Fight>(() => ({
    combatants: [...combatantsFromEncounter(encounter, statblocks), ...combatantsFromParty(party)],
    turn: -1,
    round: 1,
  }));
  const f = useFight(fight, setFight);
  const { openStatBlock, activeStatBlockId, closeStatBlock } = useStatBlockPanel();
  const confirm = useConfirm();
  const [conditionMenuId, setConditionMenuId] = useState<string | null>(null);
  const [addingCombatant, setAddingCombatant] = useState(false);
  const [newCombatantName, setNewCombatantName] = useState('');

  const { started, order: sorted, historyLen, undo } = f;
  const statblockFor = (c: Combatant) => (c.statblockId ? statblocks.find(s => s.id === c.statblockId) ?? null : null);

  const addNewCombatant = () => {
    if (!newCombatantName.trim()) return;
    f.add([newCombatant(newCombatantName.trim())]);
    setNewCombatantName('');
    setAddingCombatant(false);
  };

  // A fight under way is only in memory here, so ending it asks first. Either
  // way the stat sheet docked beside it closes with it.
  const endFight = async () => {
    if (started) {
      const foes = fight.combatants.filter(c => !c.isPC);
      const down = foes.filter(c => c.currentHp <= 0).length;
      const ok = await confirm({
        title: 'End this fight?',
        message: `Round ${fight.round}${foes.length > 0 ? `, ${down} of ${plural(foes.length, 'foe')} down` : ''}. The tracker isn’t kept once it closes.`,
        confirmLabel: 'End fight',
      });
      if (!ok) return;
    }
    closeStatBlock();
    onClose();
  };

  const allHaveInitiative = fight.combatants.every(c => c.initiative !== null);

  return (
    <div className="itk">
      <div className="itk-main">
        <div className="itk-head">
          <div>
            <div className="itk-eyebrow">Theater-of-the-Mind</div>
            <h2 className="itk-title">
              {started ? `Round ${fight.round} · turn ${fight.turn + 1}/${sorted.length}` : encounter.name}
            </h2>
            {started && f.current && <div className="itk-sub">{f.current.name}'s turn</div>}
            {!!fight.expired?.length && (
              <div role="status" className="itk-sub is-expired">
                {fight.expired.map(e => `${e.name} is no longer ${e.conditions.join(' or ')}`).join(' · ')}
              </div>
            )}
          </div>

          <div className="itk-controls">
            <Button variant="secondary" size="sm" onClick={undo} disabled={historyLen === 0} title="Undo last HP change">
              ↺ Undo{historyLen > 0 ? ` (${historyLen})` : ''}
            </Button>
            {!started ? (
              <>
                <Button variant="secondary" size="sm" onClick={f.rollNPCs}>Roll NPCs</Button>
                <Button variant="secondary" size="sm" onClick={f.rollAll}>Roll All</Button>
                <Button variant="primary" size="sm" onClick={f.start} disabled={!allHaveInitiative}>Start Combat</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" size="sm" onClick={f.reset}>Reset</Button>
                <Button variant="primary" size="sm" onClick={f.next}>Next turn ▶</Button>
              </>
            )}
            <Button variant="danger" size="sm" onClick={() => void endFight()}>✕ End</Button>
          </div>
        </div>

        <div className="itk-list">
          {sorted.map((c, idx) => (
            <CombatantRow
              key={c.id}
              c={c}
              f={f}
              isCurrent={started && idx === fight.turn}
              started={started}
              conditionMenuOpen={conditionMenuId === c.id}
              statblock={statblockFor(c)}
              onViewStatblock={sb => openStatBlock(sb.id)}
              onToggleConditionMenu={() => setConditionMenuId(conditionMenuId === c.id ? null : c.id)}
            />
          ))}

          <div className="itk-add">
            {addingCombatant ? (
              <div className="itk-add-row">
                <Input
                  className="itk-add-input"
                  value={newCombatantName}
                  onChange={e => setNewCombatantName(e.target.value)}
                  placeholder="Combatant name…"
                  aria-label="Combatant name"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') addNewCombatant();
                    if (e.key === 'Escape') setAddingCombatant(false);
                  }}
                />
                <Button variant="primary" size="sm" onClick={addNewCombatant}>Add</Button>
                <Button variant="secondary" size="sm" onClick={() => setAddingCombatant(false)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" className="w-full border-dashed" onClick={() => setAddingCombatant(true)}>
                + Add Combatant
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* The stat sheet, docked beside the fight as it is beside the app */}
      {activeStatBlockId && (
        <div className="itk-sheet">
          <StatBlockPanel statblocks={statblocks} />
        </div>
      )}
    </div>
  );
}

// ─── Combatant row ────────────────────────────────────────────────────────────
interface CombatantRowProps {
  c: Combatant;
  f: FightControls;
  statblock: MonsterStatblock | null;
  isCurrent: boolean;
  started: boolean;
  conditionMenuOpen: boolean;
  onViewStatblock: (sb: MonsterStatblock) => void;
  onToggleConditionMenu: () => void;
}

function CombatantRow({ c, f, statblock, isCurrent, started, conditionMenuOpen, onViewStatblock, onToggleConditionMenu }: CombatantRowProps) {
  const down = c.maxHp > 0 && c.currentHp <= 0;
  const dead = c.conditions.includes('dead');
  const stable = c.conditions.includes('stable');
  const toggle = (cond: Condition) => f.toggleCondition(c.id, cond);
  const setRounds = (cond: Condition, n: number) => f.setConditionRounds(c.id, cond, n);

  return (
    <div>
      <div className={`itk-row${isCurrent ? ' is-current' : ''}${down && !c.isPC ? ' is-down' : ''}`}>
        <div className="itk-init">
          {!started ? (
            <input
              className="itk-init-input"
              type="number"
              aria-label={`Initiative for ${c.name}`}
              value={c.initiative ?? ''}
              onChange={e => f.setInitiative(c.id, e.target.value ? parseInt(e.target.value, 10) : null)}
              placeholder="—"
            />
          ) : (
            <span className={`itk-init-num${isCurrent ? ' is-current' : ''}`}>{c.initiative ?? '—'}</span>
          )}
        </div>

        <div className="itk-who">
          <div className="itk-name-line">
            <span className={`itk-kind${c.isPC ? ' is-pc' : ''}`} aria-hidden>{c.isPC ? '◈' : '◆'}</span>
            <span
              className={`itk-name${isCurrent ? ' is-current' : down ? ' is-down' : ''}${statblock ? ' is-link' : ''}`}
              onClick={() => statblock && onViewStatblock(statblock)}
              {...(statblock ? { role: 'button', tabIndex: 0, title: 'Open the stat block', onKeyDown: onActivate(() => onViewStatblock(statblock)) } : {})}
            >
              {c.name}
            </span>
          </div>
          <div className="itk-meta">
            <span>{c.isPC ? 'Player' : 'Monster'}</span>
            {c.ac != null && <span>AC {c.ac}</span>}
          </div>
          <ConditionChips density="full" combatant={c} onToggle={toggle} onSetRounds={setRounds} />
          {c.conCheck != null && (
            <div className="itk-con" role="alert">
              ◎ Concentration: Con save, DC {c.conCheck}
              <button type="button" onClick={() => f.resolveConcentration(c.id, true)}>Held</button>
              <button type="button" onClick={() => f.resolveConcentration(c.id, false)}>Lost</button>
            </div>
          )}
        </div>

        <HpControl
          density="full"
          combatant={c}
          onDamage={n => f.damage(c.id, n)}
          onHeal={n => f.heal(c.id, n)}
          onTemp={n => f.addTemp(c.id, n)}
          onSetHp={n => f.setHp(c.id, n)}
          onSetMax={n => f.setMax(c.id, n)}
        >
          {down && c.isPC && !dead && !stable && (
            <DeathSavePips density="full" successes={c.deathSaves.s} failures={c.deathSaves.f} onSet={(k, v) => f.deathSave(c.id, k, v)} />
          )}
          {down && c.isPC && (dead || stable) && (
            <div className={`itk-verdict${dead ? ' is-dead' : ''}`}>{dead ? '✝ Dead' : '✓ Stabilized'}</div>
          )}
        </HpControl>

        <div className="itk-trail">
          <IconButton active={c.conditions.length > 0} aria-label="Conditions" aria-expanded={conditionMenuOpen} onClick={onToggleConditionMenu} title="Conditions" style={{ width: 26, height: 26, fontSize: 'var(--fs-md)' }}>
            ◉
          </IconButton>
          <IconButton aria-label="Remove combatant" onClick={() => f.remove(c.id)} title="Remove" style={{ width: 26, height: 26, fontSize: 'var(--fs-xs)' }}>
            ✕
          </IconButton>
        </div>
      </div>

      {conditionMenuOpen && <ConditionPicker className="itk-picker" combatant={c} onToggle={toggle} onSetRounds={setRounds} />}
    </div>
  );
}
