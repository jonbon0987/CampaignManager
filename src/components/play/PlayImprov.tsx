// The improv kit, docked with the table tools: names by culture, a quick NPC
// to play on the spot (sent to the Inbox to flesh out later), and the
// campaign's random tables rolled inline.

import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { usePlay } from '../../context/PlayContext';
import { useToast } from '../../context/ToastContext';
import { CULTURES, makeName, npcIdeaText, quickNpc, ROLES, TRAITS, VOICES, type CultureKey, type QuickNpc } from '../../lib/improv';
import { normalizeDie, parseEntries, rollWeighted } from '../../lib/randomEncounter';
import { Button } from '../ui/Button';
import type { RandomEncounterEntry } from '../../lib/database.types';

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

export function PlayImprov() {
  const { upsertIdea, randomEncounterTables } = useCampaign();
  const { addNote } = usePlay();
  const toast = useToast();

  const [culture, setCulture] = useState<CultureKey>('human');
  const [names, setNames] = useState<string[]>(() => Array.from({ length: 5 }, () => makeName('human')));
  const [npc, setNpc] = useState<QuickNpc>(() => quickNpc('human'));
  const [tableId, setTableId] = useState('');
  const [rolled, setRolled] = useState<{ table: string; die: number; roll: number; entry: RandomEncounterEntry | null } | null>(null);

  const rollNames = (c = culture) => setNames(Array.from({ length: 5 }, () => makeName(c)));
  const reroll = (key: keyof QuickNpc) => setNpc(n => ({
    ...n,
    [key]: key === 'name' ? makeName(culture) : key === 'role' ? pick(ROLES) : key === 'voice' ? pick(VOICES) : pick(TRAITS),
  }));

  const sendNpc = async () => {
    await upsertIdea({ text: npcIdeaText(npc), tag: 'npc', promoted_hook_id: null });
    toast(`${npc.name} is in the Inbox`, 'success');
    setNpc(quickNpc(culture));
  };

  const table = randomEncounterTables.find(t => t.id === tableId) ?? randomEncounterTables[0] ?? null;
  const rollTable = () => {
    if (!table) return;
    const die = normalizeDie(table.die_size);
    const r = rollWeighted(parseEntries(table.entries), die);
    setRolled({ table: table.name || 'Untitled table', die, roll: r.roll, entry: r.entry });
  };

  return (
    <div className="pt-pane pim">
      <section className="pim-section" aria-label="Names">
        <div className="pim-head">
          <span className="pim-title">Names</span>
          <select className="as-select pim-culture" value={culture} aria-label="Culture"
            onChange={e => { const c = e.target.value as CultureKey; setCulture(c); rollNames(c); setNpc(n => ({ ...n, name: makeName(c) })); }}>
            {(Object.keys(CULTURES) as CultureKey[]).map(k => <option key={k} value={k}>{CULTURES[k].label}</option>)}
          </select>
          <Button size="xs" variant="ghost" onClick={() => rollNames()} title="New names">↻</Button>
        </div>
        <ul className="pim-names">
          {names.map((n, i) => (
            <li key={`${n}-${i}`}>
              {/* eslint-disable-next-line no-restricted-syntax -- a name to give the quick NPC */}
              <button type="button" className="pim-name" onClick={() => setNpc(x => ({ ...x, name: n }))} title="Use for the quick NPC">{n}</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="pim-section" aria-label="Quick NPC">
        <div className="pim-head">
          <span className="pim-title">Quick NPC</span>
          <Button size="xs" variant="ghost" onClick={() => setNpc(quickNpc(culture))} title="A new NPC">↻ All</Button>
        </div>
        <dl className="pim-npc">
          {(['name', 'role', 'voice', 'trait'] as const).map(k => (
            <div key={k} className="pim-npc-row">
              <dt>{k}</dt>
              <dd>
                <input className="as-input" value={npc[k]} aria-label={k} onChange={e => setNpc(n => ({ ...n, [k]: e.target.value }))} />
                <Button size="xs" variant="ghost" onClick={() => reroll(k)} title={`Another ${k}`} aria-label={`Another ${k}`}>↻</Button>
              </dd>
            </div>
          ))}
        </dl>
        <div className="pt-row">
          <Button size="sm" variant="primary" onClick={() => void sendNpc()} disabled={!npc.name.trim()}>Send to the Inbox</Button>
          <Button size="sm" variant="ghost" onClick={() => addNote(`Met ${npcIdeaText(npc)}`)} title="Add them to the session’s notes">Note it</Button>
        </div>
      </section>

      <section className="pim-section" aria-label="Random tables">
        <div className="pim-head"><span className="pim-title">Roll a table</span></div>
        {randomEncounterTables.length === 0 ? (
          <p className="pt-empty">No random tables yet. Add them under Encounters › Random tables.</p>
        ) : (
          <>
            <div className="pt-row">
              <select className="as-select" value={table?.id ?? ''} aria-label="Random table" onChange={e => { setTableId(e.target.value); setRolled(null); }}>
                {randomEncounterTables.map(t => <option key={t.id} value={t.id}>{t.name || 'Untitled table'}</option>)}
              </select>
              <Button size="sm" variant="primary" onClick={rollTable}>Roll</Button>
            </div>
            {rolled && (
              <div className="pim-rolled" role="status">
                <div className="pim-rolled-roll">d{rolled.die} → {rolled.roll}</div>
                <div className="pim-rolled-name">{rolled.entry?.name || 'Nothing on the table there'}</div>
                {rolled.entry?.description && <p className="pim-rolled-desc">{rolled.entry.description}</p>}
                {rolled.entry && (
                  <Button size="xs" variant="ghost" onClick={() => addNote(`Rolled ${rolled.entry!.name} on ${rolled.table}`)}>Note it</Button>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
