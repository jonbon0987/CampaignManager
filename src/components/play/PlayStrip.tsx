// The strip under the top bar while a session is live: which session, how long
// it's run, the agenda from Prep (scenes in order, then encounters), and End.

import { useEffect, useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useOpenRecord } from '../../context/NavigationContext';
import { usePlay, type PlayTab } from '../../context/PlayContext';
import { Button } from '../ui/Button';
import { addCombatants, combatantsFromEncounter } from '../../lib/combat';
import { planIds, sessionName } from '../../lib/sessionLifecycle';
import { useEndSession } from './useEndSession';
import { elapsedLabel } from '../../lib/playTime';

/** "1:12" since the session started, ticking once a minute (no seconds needed at the table). */
export function PlayClock({ since }: { since?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!since) return null;
  return <span className="ps-clock">{elapsedLabel(since, now)}</span>;
}

export function PlayStrip({ onShowTool }: { onShowTool: (tab: PlayTab) => void }) {
  const { scenes, submodules, modules, encounters, monsterStatblocks, loadModuleTree } = useCampaign();
  const { live, play, fight, setFight, setScene } = usePlay();
  const openRecord = useOpenRecord();
  const endSession = useEndSession(openRecord);
  const [ending, setEnding] = useState(false);
  const sceneIds = live ? planIds(live.plan, 'agenda') : [];
  const encounterIds = live ? planIds(live.plan, 'encounters') : [];
  const hasScenes = sceneIds.length > 0;

  // Scene names come from the module tree, which isn't loaded up front.
  useEffect(() => { if (hasScenes) void loadModuleTree().catch(() => {}); }, [hasScenes, loadModuleTree]);

  if (!live) return null;

  const currentIdx = sceneIds.indexOf(play.scene_id ?? '');
  const openScene = (id: string) => {
    setScene(id);
    const sub = submodules.find(s => s.id === scenes.find(sc => sc.id === id)?.submodule_id);
    const mod = sub ? modules.find(m => m.id === sub.module_id) : undefined;
    if (mod && sub) openRecord('modules', mod.id, `submodule:${sub.id}`);
  };

  // An encounter joins the fight once; after that its chip just shows the tracker.
  const runEncounter = (id: string) => {
    const enc = encounters.find(e => e.id === id);
    if (enc && !fight.combatants.some(c => c.encounterId === id)) {
      const joining = combatantsFromEncounter(enc, monsterStatblocks);
      setFight(f => addCombatants(f, joining));
    }
    onShowTool('initiative');
  };

  const finish = async () => {
    setEnding(true);
    try { await endSession(); } finally { setEnding(false); }
  };

  return (
    <div className="ps" role="region" aria-label="Session in play">
      {/* eslint-disable-next-line no-restricted-syntax -- the live session's name, styled with the strip */}
      <button type="button" className="ps-live" onClick={() => openRecord('sessions', live.id)} title="Open this session">
        <span className="ps-dot" aria-hidden /> {sessionName(live)} <PlayClock since={play.started_at} />
      </button>

      <div className="ps-agenda" aria-label="Agenda">
        {sceneIds.map((id, i) => {
          const sc = scenes.find(s => s.id === id);
          if (!sc) return null;
          const state = i === currentIdx ? ' is-current' : currentIdx > i ? ' is-done' : '';
          return (
            // eslint-disable-next-line no-restricted-syntax -- an agenda step, styled with the strip
            <button key={id} type="button" className={`ps-step${state}`} onClick={() => openScene(id)} aria-current={i === currentIdx ? 'step' : undefined}>
              <span className="ps-step-mark" aria-hidden>{currentIdx > i ? '✓' : i + 1}</span> {sc.title}
            </button>
          );
        })}
        {encounterIds.map(id => {
          const enc = encounters.find(e => e.id === id);
          if (!enc) return null;
          const joined = fight.combatants.some(c => c.encounterId === id);
          return (
            // eslint-disable-next-line no-restricted-syntax -- an agenda encounter, styled with the strip
            <button key={id} type="button" className={`ps-step ps-enc${joined ? ' is-joined' : ''}`} onClick={() => runEncounter(id)}
              title={joined ? 'In the fight; show initiative' : 'Add to initiative'}>
              <span className="ps-step-mark" aria-hidden>⚔</span> {enc.name}
            </button>
          );
        })}
        {sceneIds.length === 0 && encounterIds.length === 0 && (
          <span className="ps-empty">No agenda. Pick scenes and encounters in the session’s Prep.</span>
        )}
      </div>

      <Button variant="secondary" size="sm" onClick={() => void finish()} disabled={ending} className="ps-end">
        {ending ? 'Ending…' : '■ End session'}
      </Button>
    </div>
  );
}
