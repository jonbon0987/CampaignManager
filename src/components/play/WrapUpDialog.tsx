// The end-of-session wrap-up: what's worth writing down before the night is
// over. Where the party stopped, experience or a level, loot handed out, what's
// left open, and how much time passed in the world. It opens after End session
// (and again from a played session's recap); every part can be left blank.

import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { usePlay } from '../../context/PlayContext';
import { useCampaignDate } from '../../hooks/useCampaignDate';
import { Modal } from '../Modal';
import { Button } from '../ui/Button';
import { SessionLoot } from '../items/ItemPlaces';
import { LeftOpenToInbox } from '../session/LeftOpenToInbox';
import { fightSummary } from '../../lib/combat';
import { fightXp, levelForXp } from '../../lib/levelling';
import { addDays, daysLabel, formatWorldDate } from '../../lib/calendar';
import { limitFor } from '../../lib/fieldLimits';
import { sessionName } from '../../lib/sessionLifecycle';
import type { Levelling, Session } from '../../lib/database.types';

/** Mounted while a wrap-up is open; it starts from the session as it is then. */
export function WrapUpDialog() {
  const { sessions } = useCampaign();
  const { wrapFor, closeWrapUp } = usePlay();
  const session = sessions.find(s => s.id === wrapFor);
  if (!session) return null;
  return <WrapUp key={session.id} session={session} onClose={closeWrapUp} />;
}

function WrapUp({ session, onClose }: { session: Session; onClose: () => void }) {
  const { pcs, scenes, monsterStatblocks, selectedCampaign, updateSession, updatePC, updateCampaign } = useCampaign();
  const { date, setDate, months, suffix } = useCampaignDate();
  const play = session.play ?? {};
  const party = pcs.filter(p => p.is_active && p.character_name);

  // The night's fights: the ones cleared from Initiative, and the one still in it.
  const current = fightSummary(play.fight);
  const fights = [
    ...(play.fights ?? []),
    ...(current ? [{ summary: current, xp: fightXp(play.fight, monsterStatblocks).total }] : []),
  ];
  const totalXp = fights.reduce((s, f) => s + f.xp, 0);

  const scene = scenes.find(s => s.id === play.scene_id);
  const [stopped, setStopped] = useState(play.stopped ?? (scene ? `In ${scene.title}.` : ''));
  const [levelling, setLevelling] = useState<Levelling | null>(selectedCampaign?.levelling ?? null);
  const [xpEach, setXpEach] = useState(String(party.length ? Math.floor(totalXp / party.length) : 0));
  const [matchLevels, setMatchLevels] = useState(true);
  const [milestone, setMilestone] = useState(false);
  const [leftOpen, setLeftOpen] = useState(session.hooks_notes ?? '');
  const [days, setDays] = useState('');
  const [saving, setSaving] = useState(false);

  const each = Math.max(0, parseInt(xpEach, 10) || 0);
  const daysPassed = Math.max(0, parseInt(days, 10) || 0);
  const newDate = date && daysPassed > 0 ? addDays(date, daysPassed, months) : null;
  // Who the XP (or the milestone) takes up a level.
  const rising = party.flatMap(pc => {
    if (!pc.level) return [];
    const to = levelling === 'xp' && matchLevels ? levelForXp((pc.xp ?? 0) + each)
      : levelling === 'milestone' && milestone ? pc.level + 1 : pc.level;
    return to > pc.level && to <= 20 ? [{ pc, to }] : [];
  });

  const save = async () => {
    setSaving(true);
    try {
      if (newDate) setDate(newDate);
      await updateSession(session.id, {
        hooks_notes: leftOpen.trim() || null,
        play: { ...play, stopped: stopped.trim() || null, wrapped_at: new Date().toISOString() },
        ...(newDate ? { world_end: { year: newDate.year, day: newDate.day } } : {}),
      });
      if (levelling && selectedCampaign && levelling !== selectedCampaign.levelling) {
        await updateCampaign(selectedCampaign.id, { levelling });
      }
      const ups = new Map(rising.map(u => [u.pc.id, u.to]));
      for (const pc of party) {
        const xp = levelling === 'xp' && each > 0 ? (pc.xp ?? 0) + each : undefined;
        const level = ups.get(pc.id);
        if (xp !== undefined || level !== undefined) await updatePC(pc.id, { ...(xp !== undefined ? { xp } : {}), ...(level !== undefined ? { level } : {}) });
      }
      onClose();
    } catch {
      // The failed save has shown its toast; the wrap-up stays open to try again.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Wrap up ${sessionName(session)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Skip for now</Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save the wrap-up'}</Button>
        </>
      }
    >
      <div className="wu">
        <p className="wu-intro">Five things worth writing down while the night is fresh. Leave any of them blank.</p>

        <div className="wu-part">
          <label className="wu-label" htmlFor="wu-stopped">1 · Where you stopped</label>
          <textarea id="wu-stopped" className="as-input wu-text" rows={2} value={stopped} onChange={e => setStopped(e.target.value)}
            placeholder="Mid-fight in the Drowned Portico; the party just found the crown's case…" maxLength={limitFor('sessions', 'hooks_notes')} />
          <span className="as-hint">The next session's Prep and "Previously on" show it.</span>
        </div>

        <div className="wu-part">
          <span className="wu-label" id="wu-xp-label">2 · Experience</span>
          <div className="wu-pills" role="radiogroup" aria-labelledby="wu-xp-label">
            {(['xp', 'milestone'] as const).map(mode => (
              // eslint-disable-next-line no-restricted-syntax -- a choice pill, styled .cm-pill
              <button key={mode} type="button" role="radio" aria-checked={levelling === mode} className={`cm-pill is-subtle${levelling === mode ? ' is-active' : ''}`}
                onClick={() => setLevelling(mode)}>
                {mode === 'xp' ? 'By XP' : 'By milestone'}
              </button>
            ))}
          </div>
          {!selectedCampaign?.levelling && <span className="as-hint">How this table levels; it's remembered for the campaign.</span>}

          {levelling === 'xp' && (
            <>
              {fights.length > 0 ? (
                <ul className="wu-fights">
                  {fights.map((f, i) => (
                    <li key={i}><span>{f.summary}</span><span className="wu-num">{f.xp.toLocaleString()} XP</span></li>
                  ))}
                </ul>
              ) : <span className="as-hint">No fights ran in Play's Initiative this session.</span>}
              <div className="wu-row">
                <label htmlFor="wu-xp-each">{party.length === 1 ? `XP to ${party[0].character_name}` : `XP to each of the ${party.length} PCs`}</label>
                <input id="wu-xp-each" className="as-input wu-num-in" type="number" inputMode="numeric" min={0} value={xpEach} onChange={e => setXpEach(e.target.value)} />
                {fights.length > 0 && <span className="as-hint">{totalXp.toLocaleString()} XP in all</span>}
              </div>
              <label className="wu-check">
                <input type="checkbox" checked={matchLevels} onChange={e => setMatchLevels(e.target.checked)} />
                Raise levels the new XP reaches
              </label>
            </>
          )}
          {levelling === 'milestone' && (
            <label className="wu-check">
              <input type="checkbox" checked={milestone} onChange={e => setMilestone(e.target.checked)} />
              Everyone gains a level
            </label>
          )}
          {rising.length > 0 && (
            <p className="wu-levels">{rising.map(u => `${u.pc.character_name} reaches level ${u.to}`).join(' · ')}</p>
          )}
        </div>

        <div className="wu-part">
          <span className="wu-label">3 · Loot handed out</span>
          <SessionLoot sessionId={session.id} />
        </div>

        <div className="wu-part">
          <label className="wu-label" htmlFor="wu-open">4 · Left open</label>
          <textarea id="wu-open" className="as-input wu-text" rows={3} value={leftOpen} onChange={e => setLeftOpen(e.target.value)}
            placeholder="One loose end per line." maxLength={limitFor('sessions', 'hooks_notes')} />
          <LeftOpenToInbox text={leftOpen} sessionNumber={session.session_number} />
        </div>

        <div className="wu-part">
          <span className="wu-label">5 · Time in the world</span>
          {date ? (
            <div className="wu-row">
              <label htmlFor="wu-days">Days that passed</label>
              <input id="wu-days" className="as-input wu-num-in" type="number" inputMode="numeric" min={0} value={days} onChange={e => setDays(e.target.value)} placeholder="0" />
              <span className="as-hint">
                {newDate
                  ? `${formatWorldDate(date, months, suffix)} → ${formatWorldDate(newDate, months, suffix)} (${daysLabel(daysPassed)})`
                  : `Today is ${formatWorldDate(date, months, suffix)}.`}
              </span>
            </div>
          ) : (
            <span className="as-hint">The campaign has no in-world date yet. Set one on Home to track time here.</span>
          )}
        </div>
      </div>
    </Modal>
  );
}
