// Holdings as rows: the item (opens its page), who has it, how many, whether
// it's attuned, the session it came from, and a × to take it away. Each page
// shows the columns it needs: a PC's inventory leaves out the holder, an
// item's page leaves out the item.

import { useState } from 'react';
import { X } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useItems } from '../../context/items';
import { holderName, itemLine } from '../../lib/items';
import { maxFor } from '../../lib/fieldLimits';
import { sessionName } from '../../lib/sessionLifecycle';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import type { ItemHolding } from '../../lib/database.types';

/** A count that saves when the DM leaves the field, not on every keystroke. */
function Quantity({ value, onCommit, label }: { value: number; onCommit: (n: number) => void; label: string }) {
  const [draft, setDraft] = useState(String(value));
  const commit = () => {
    const n = Math.min(maxFor('item_holdings', 'quantity') ?? 9_999, Math.max(1, Math.round(Number(draft)) || 1));
    setDraft(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <input className="as-input inv-qty" type="number" min={1} max={maxFor('item_holdings', 'quantity')} value={draft} aria-label={label}
      onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

export function HoldingList({ holdings, showItem, showHolder, showSession = true, onOpenItem, empty }: {
  holdings: ItemHolding[];
  showItem?: boolean;
  showHolder?: boolean;
  showSession?: boolean;
  onOpenItem?: (id: string) => void;
  empty?: string;
}) {
  const ctx = useItems();
  const { pcs, sessions } = useCampaign();
  if (!ctx) return null;
  if (holdings.length === 0) return empty ? <p className="as-empty-note">{empty}</p> : null;

  return (
    <ul className="inv-list">
      {holdings.map(h => {
        const item = ctx.items.find(i => i.id === h.item_id);
        const name = item?.name || 'Untitled item';
        const session = h.session_id ? sessions.find(s => s.id === h.session_id) : undefined;
        return (
          <li key={h.id} className="inv-row">
            {showItem && (
              <div className="inv-item">
                {onOpenItem
                  ? <Button variant="link" className="inv-name" onClick={() => onOpenItem(h.item_id)}>{name}</Button>
                  : <span className="inv-name">{name}</span>}
                {item && itemLine(item) && <span className="inv-line">{itemLine(item)}</span>}
              </div>
            )}
            {showHolder && (
              <select className="as-select inv-holder" aria-label={`Who has ${name}`}
                value={h.pc_id && pcs.some(p => p.id === h.pc_id) ? h.pc_id : ''}
                onChange={e => void ctx.updateHolding(h, { pc_id: e.target.value || null })}>
                <option value="">{holderName({ pc_id: null }, pcs)}</option>
                {pcs.map(p => <option key={p.id} value={p.id}>{p.character_name || 'Unnamed character'}</option>)}
              </select>
            )}
            <Quantity key={h.quantity} value={h.quantity} label={`How many ${name}`} onCommit={n => void ctx.updateHolding(h, { quantity: n })} />
            {item?.attunement && (
              <label className="inv-attune">
                <input type="checkbox" checked={h.attuned} onChange={e => void ctx.updateHolding(h, { attuned: e.target.checked })} />
                Attuned
              </label>
            )}
            {showSession && session && <span className="inv-when">{sessionName(session)}</span>}
            <IconButton onClick={() => void ctx.removeHolding(h)} aria-label={`Take away ${name}`} title="Take away" style={{ width: 22, height: 22 }}>
              <X size={12} />
            </IconButton>
          </li>
        );
      })}
    </ul>
  );
}
