// The scene in play, docked with the table tools: where it sits in the
// agenda, its read-aloud text large enough to read straight off the screen,
// and the creatures it brings. Steps through the agenda from Prep.

import { useEffect } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useOpenRecord } from '../../context/NavigationContext';
import { usePlay } from '../../context/PlayContext';
import { useStatBlockPanel } from '../../context/StatBlockPanelContext';
import { planIds } from '../../lib/sessionLifecycle';
import { parseLinkedIds } from '../tabs/moduleDetail/pickers';
import { ReadAloud } from '../ui/ReadAloudBlock';
import { Button } from '../ui/Button';

export function PlayScene() {
  const { scenes, submodules, modules, monsterStatblocks, loadModuleTree } = useCampaign();
  const { live, play, setScene } = usePlay();
  const openRecord = useOpenRecord();
  const { openStatBlock } = useStatBlockPanel();
  const agenda = live ? planIds(live.plan, 'agenda') : [];
  const hasAgenda = agenda.length > 0;

  // Scenes come from the module tree, which isn't loaded up front.
  useEffect(() => { if (hasAgenda) void loadModuleTree().catch(() => {}); }, [hasAgenda, loadModuleTree]);

  const scene = scenes.find(s => s.id === play.scene_id) ?? null;
  const idx = scene ? agenda.indexOf(scene.id) : -1;
  const sub = scene ? submodules.find(s => s.id === scene.submodule_id) : undefined;
  const mod = sub ? modules.find(m => m.id === sub.module_id) : undefined;
  const creatures = scene ? parseLinkedIds(scene.linked_monster_ids).flatMap(id => monsterStatblocks.filter(m => m.id === id)) : [];

  const go = (id: string) => setScene(id);

  if (!scene) {
    const picks = agenda.flatMap(id => scenes.filter(s => s.id === id));
    return (
      <div className="pt-pane">
        <p className="pt-empty">
          {picks.length ? 'Pick the scene you’re running; its read-aloud text shows here.' : 'No scenes on the agenda. Pick them in the session’s Prep.'}
        </p>
        <ol className="psc-agenda">
          {picks.map((s, i) => (
            <li key={s.id}>
              {/* eslint-disable-next-line no-restricted-syntax -- an agenda step */}
              <button type="button" className="psc-step" onClick={() => go(s.id)}><span className="psc-step-n">{i + 1}</span> {s.title}</button>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="pt-pane psc">
      <div className="psc-where">
        {[mod?.title, sub?.title].filter(Boolean).join(' › ')}
        {idx >= 0 && ` · scene ${idx + 1} of ${agenda.length}`}
      </div>
      <h3 className="psc-title">{scene.title || 'Untitled scene'}</h3>
      {scene.summary && <p className="psc-summary">{scene.summary}</p>}

      {scene.read_aloud?.trim()
        ? <ReadAloud text={scene.read_aloud} large />
        : <p className="pt-empty">No read-aloud text for this scene. Add it on the scene, under its module.</p>}

      {creatures.length > 0 && (
        <div className="psc-creatures">
          {creatures.map(m => (
            <Button key={m.id} size="xs" variant="secondary" onClick={() => openStatBlock(m.id)} title="Open the stat sheet">
              ◆ {m.name}{m.challenge_rating ? ` · CR ${m.challenge_rating}` : ''}
            </Button>
          ))}
        </div>
      )}

      <div className="psc-nav">
        <Button size="sm" variant="ghost" disabled={idx <= 0} onClick={() => go(agenda[idx - 1])}>‹ Previous</Button>
        {mod && sub && <Button size="sm" variant="ghost" onClick={() => openRecord('modules', mod.id, `submodule:${sub.id}`)}>Open the scene</Button>}
        <Button size="sm" variant="secondary" disabled={idx < 0 || idx >= agenda.length - 1} onClick={() => go(agenda[idx + 1])}>Next ›</Button>
      </div>
    </div>
  );
}
