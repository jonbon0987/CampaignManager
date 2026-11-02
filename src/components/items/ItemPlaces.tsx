// Where items show outside their own page: a PC's inventory, and what a
// session handed out.

import { useItems } from '../../context/items';
import { useOpenRecord } from '../../context/NavigationContext';
import { GiveItem } from './GiveItem';
import { HoldingList } from './HoldingList';

/** A PC's inventory, on their page. */
export function PCInventory({ pcId }: { pcId: string }) {
  const ctx = useItems();
  const open = useOpenRecord();
  if (!ctx) return null;
  return (
    <div className="as-fl">
      <span className="as-ll">Inventory</span>
      <HoldingList holdings={ctx.holdings.filter(h => h.pc_id === pcId)} showItem onOpenItem={id => open('items', id)}
        empty="Carrying nothing from the item list yet." />
      <GiveItem pcId={pcId} label="Add" />
    </div>
  );
}

/** The items a session handed out, and to whom, under its loot. */
export function SessionLoot({ sessionId }: { sessionId: string }) {
  const ctx = useItems();
  const open = useOpenRecord();
  if (!ctx) return null;
  return (
    <div className="inv-session">
      <div className="inv-label">Handed out this session</div>
      <HoldingList holdings={ctx.holdings.filter(h => h.session_id === sessionId)} showItem showHolder showSession={false}
        onOpenItem={id => open('items', id)} empty="Nothing from the item list yet." />
      <GiveItem sessionId={sessionId} label="Hand out" />
    </div>
  );
}
