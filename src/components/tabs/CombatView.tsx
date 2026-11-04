import { useEffect, useState } from 'react';
import EncounterBuilder from './EncounterBuilder';
import CreatureStatblocks from './CreatureStatblocks';
import RandomEncounters from './RandomEncounters';

export type CombatSubView = 'encounters' | 'random' | 'statblocks';
const KIND_VIEW: Record<string, CombatSubView> = { encounter: 'encounters', statblock: 'statblocks', random: 'random' };

// The Encounters tab: encounters, random tables and stat sheets, switched from
// the topbar like every other tab's views. onImportFromWorld receives the
// world-import entity type for the view ('bestiary' for stat sheets,
// 'randomEncounter' for random tables).
export default function CombatView({ view, setView, onImportFromWorld, openTarget, onOpenConsumed }: {
  view: string;
  setView: (v: CombatSubView) => void;
  onImportFromWorld?: (type: string) => void;
  /**
   * A record requested from outside (search, an @-mention, the URL): a stat
   * sheet, an encounter or a random table. Without a kind (the URL, a return to
   * the tab) it opens in the view already showing.
   */
  openTarget?: { id: string; kind?: string } | null;
  onOpenConsumed?: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  // Show the view the requested record lives in, then hand its id down.
  useEffect(() => {
    if (!openTarget) return;
    const kindView = KIND_VIEW[openTarget.kind ?? ''];
    if (kindView) setView(kindView);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenId(openTarget.id);
    onOpenConsumed?.();
  }, [openTarget, onOpenConsumed, setView]);
  const clearOpenId = () => setOpenId(null);

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {view === 'random'
        ? <RandomEncounters onImportFromWorld={onImportFromWorld ? () => onImportFromWorld('randomEncounter') : undefined} openId={openId} onOpenConsumed={clearOpenId} />
        : view === 'statblocks'
          ? <CreatureStatblocks onImportFromWorld={onImportFromWorld ? () => onImportFromWorld('bestiary') : undefined} openId={openId} onOpenConsumed={clearOpenId} />
          : <EncounterBuilder openId={openId} onOpenConsumed={clearOpenId} />}
    </div>
  );
}
