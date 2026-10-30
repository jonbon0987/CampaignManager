import { useEffect, useState } from 'react';
import EncounterBuilder from './EncounterBuilder';
import CreatureStatblocks from './CreatureStatblocks';
import RandomEncounters from './RandomEncounters';

export type CombatSubView = 'encounters' | 'random' | 'statblocks';

// The Encounters tab: encounters, random tables and stat sheets, switched from
// the topbar like every other tab's views. onImportFromWorld receives the
// world-import entity type for the view ('bestiary' for stat sheets,
// 'randomEncounter' for random tables).
export default function CombatView({ view, setView, onImportFromWorld, openTarget, onOpenConsumed }: {
  view: string;
  setView: (v: CombatSubView) => void;
  onImportFromWorld?: (type: string) => void;
  /** A record requested from outside (search, an @-mention): a stat sheet or an encounter. */
  openTarget?: { id: string; kind?: string } | null;
  onOpenConsumed?: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  // Show the view the requested record lives in, then hand its id down.
  useEffect(() => {
    if (!openTarget) return;
    setView(openTarget.kind === 'encounter' ? 'encounters' : 'statblocks');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenId(openTarget.id);
    onOpenConsumed?.();
  }, [openTarget, onOpenConsumed, setView]);
  const clearOpenId = () => setOpenId(null);

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {view === 'random'
        ? <RandomEncounters onImportFromWorld={onImportFromWorld ? () => onImportFromWorld('randomEncounter') : undefined} />
        : view === 'statblocks'
          ? <CreatureStatblocks onImportFromWorld={onImportFromWorld ? () => onImportFromWorld('bestiary') : undefined} openId={openId} onOpenConsumed={clearOpenId} />
          : <EncounterBuilder openId={openId} onOpenConsumed={clearOpenId} />}
    </div>
  );
}
