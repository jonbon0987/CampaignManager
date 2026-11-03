// The party at a glance while a session is live, under the play strip: each
// player character's hit points, AC and passives, any conditions, and
// inspiration. Hit points and conditions come from the fight when the PC is in
// it, so the strip and Initiative never disagree.

import { useCampaign } from '../../context/CampaignContext';
import { useOpenRecord } from '../../context/NavigationContext';
import { usePlay } from '../../context/PlayContext';
import type { Combatant } from '../../lib/combat';
import type { PlayerCharacter } from '../../lib/database.types';

function hpTone(c: Combatant): string {
  if (c.maxHp <= 0) return '';
  const pct = c.currentHp / c.maxHp;
  return c.currentHp <= 0 ? ' is-down' : pct <= 0.25 ? ' is-low' : pct <= 0.5 ? ' is-hurt' : '';
}

function Stat({ label, value, title }: { label: string; value: number | null | undefined; title: string }) {
  if (value == null) return null;
  return <span className="pty-stat" title={title}><span className="pty-stat-k">{label}</span> {value}</span>;
}

export function PartyStrip() {
  const { pcs } = useCampaign();
  const { live, play, fight, toggleInspiration } = usePlay();
  const openRecord = useOpenRecord();
  const party = pcs.filter(p => p.is_active && p.character_name);
  if (!live || party.length === 0) return null;

  const inspired = new Set(play.inspiration ?? []);
  const inFight = (pc: PlayerCharacter) => fight.combatants.find(c => c.isPC && c.name === pc.character_name);

  return (
    <div className="pty" role="list" aria-label="The party">
      {party.map(pc => {
        const c = inFight(pc);
        const hp = c && c.maxHp > 0 ? `${c.currentHp}/${c.maxHp}${c.temp ? ` +${c.temp}` : ''}` : pc.max_hp != null ? String(pc.max_hp) : null;
        const down = !!c && c.maxHp > 0 && c.currentHp <= 0;
        const has = inspired.has(pc.id);
        return (
          <div key={pc.id} role="listitem" className={`pty-pc${down ? ' is-down' : ''}`}>
            {/* eslint-disable-next-line no-restricted-syntax -- the PC's name, opening their sheet in Cast */}
            <button type="button" className="pty-name" onClick={() => openRecord('cast', pc.id)} title="Open in Cast">{pc.character_name}</button>
            {hp && <span className={`pty-hp${c ? hpTone(c) : ''}`} title={c ? 'Hit points, from Initiative' : 'Max HP'}><span className="pty-stat-k">HP</span> {hp}</span>}
            <Stat label="AC" value={pc.armor_class} title="Armor Class" />
            <Stat label="PP" value={pc.passive_perception} title="Passive Perception" />
            <Stat label="Ins" value={pc.passive_insight} title="Passive Insight" />
            <Stat label="Inv" value={pc.passive_investigation} title="Passive Investigation" />
            <Stat label="DC" value={pc.spell_save_dc} title="Spell save DC" />
            {down && c && (
              <span className="pty-saves" title="Death saves">
                ✓{c.deathSaves.s} ✗{c.deathSaves.f}
              </span>
            )}
            {(c?.conditions ?? []).map(cond => <span key={cond} className="pty-cond">{cond}</span>)}
            {/* eslint-disable-next-line no-restricted-syntax -- an on/off chip in the strip */}
            <button type="button" className={`pty-insp${has ? ' is-on' : ''}`} aria-pressed={has} onClick={() => toggleInspiration(pc.id)}
              title={has ? 'Has inspiration; click when it’s spent' : 'Give inspiration'}>
              {has ? '✦ Inspired' : '✧ Inspiration'}
            </button>
            {pc.sheet_url && /^https?:\/\//i.test(pc.sheet_url) && (
              <a className="pty-sheet" href={pc.sheet_url} target="_blank" rel="noreferrer noopener" aria-label={`${pc.character_name}'s sheet`}>Sheet ↗</a>
            )}
          </div>
        );
      })}
    </div>
  );
}
