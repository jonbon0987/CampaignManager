// Gives an item: from the item's page (to someone), a PC's inventory (any item)
// or a session's loot (any item, to someone). Typing a name the compendium
// doesn't have makes that item, to fill in later on the Items page.

import { useId, useState, type FormEvent } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useItems } from '../../context/items';
import { blankItem } from '../../lib/items';
import { limitFor, maxFor } from '../../lib/fieldLimits';
import { Button } from '../ui/Button';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function GiveItem({ itemId, pcId, sessionId, label }: {
  /** The item to give, on its own page; otherwise the DM names one. */
  itemId?: string;
  /** Who gets it, on a PC's page (null for the party); otherwise the DM picks. */
  pcId?: string | null;
  /** The session it's handed out in. */
  sessionId?: string | null;
  label: string;
}) {
  const ctx = useItems();
  const { pcs } = useCampaign();
  const listId = useId();
  const [name, setName] = useState('');
  const [to, setTo] = useState('');
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!ctx) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const typed = name.trim();
    if (!itemId && !typed) return;
    setBusy(true);
    setError('');
    try {
      const existing = ctx.items.find(i => i.name.trim().toLowerCase() === typed.toLowerCase());
      const id = itemId ?? existing?.id ?? (await ctx.saveItem(blankItem(typed))).id;
      await ctx.give({ item_id: id, pc_id: pcId !== undefined ? pcId : (to || null), quantity: qty, session_id: sessionId ?? null });
      setName('');
      setQty(1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="inv-give" onSubmit={e => void submit(e)}>
      {!itemId && (
        <>
          <input className="as-input inv-give-name" list={listId} value={name} onChange={e => setName(e.target.value)}
            placeholder="An item, or a new one’s name…" aria-label="Item" maxLength={limitFor('items', 'name')} />
          <datalist id={listId}>
            {ctx.items.filter(i => i.name.trim()).map(i => <option key={i.id} value={i.name} />)}
          </datalist>
        </>
      )}
      {pcId === undefined && (
        <select className="as-select inv-holder" value={to} onChange={e => setTo(e.target.value)} aria-label="Give to">
          <option value="">The party</option>
          {pcs.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.character_name || 'Unnamed character'}</option>)}
        </select>
      )}
      <input className="as-input inv-qty" type="number" min={1} max={maxFor('item_holdings', 'quantity')} value={qty} aria-label="How many"
        onChange={e => setQty(Math.max(1, Math.round(Number(e.target.value)) || 1))} />
      <Button type="submit" size="xs" variant="secondary" disabled={busy || (!itemId && !name.trim())}>{busy ? 'Saving…' : label}</Button>
      {error && <p className="inv-error" role="alert">{error}</p>}
    </form>
  );
}
