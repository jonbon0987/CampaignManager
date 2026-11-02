// The campaign's item compendium: magic items, treasure and gear, with who
// holds each. Items no one holds yet are listed after those that are out in
// the world.

import { useEffect, useMemo, useState } from 'react';
import { useReportRecord } from '../../context/NavigationContext';
import { useCampaign } from '../../context/CampaignContext';
import { useItems } from '../../context/items';
import { ListDetail, ListRow, EmptyDetail } from '../ui/ListDetail';
import { Badge } from '../ui/Badge';
import { ImageThumb } from '../ui/ImageThumb';
import { pushRecent } from '../../lib/recent';
import { markDraft } from '../../hooks/useDiscardBlankDraft';
import { blankItem, holdersSummary, itemLine, itemTypeLabel, rarity } from '../../lib/items';
import { ItemEditor } from '../entity/ItemEditor';
import type { Item } from '../../lib/database.types';

const GLYPH = '✠';

export default function Items({ openId, onOpenConsumed }: { openId?: string | null; onOpenConsumed?: () => void } = {}) {
  const ctx = useItems();
  const { pcs } = useCampaign();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useReportRecord('items', selectedId);

  // Open a record requested from outside the tab (a PC's inventory, the
  // sidebar's Recent list), then clear the request so it doesn't re-fire.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (openId) { setSelectedId(openId); onOpenConsumed?.(); }
  }, [openId, onOpenConsumed]);

  const items = useMemo(() => ctx?.items ?? [], [ctx?.items]);
  const holdings = useMemo(() => ctx?.holdings ?? [], [ctx?.holdings]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i => [i.name, itemTypeLabel(i.item_type), rarity(i.rarity)?.label, i.description]
      .some(s => s?.toLowerCase().includes(q)));
  }, [items, search]);

  const heldIds = new Set(holdings.map(h => h.item_id));
  const held = shown.filter(i => heldIds.has(i.id));
  const unheld = shown.filter(i => !heldIds.has(i.id));
  const selected = shown.find(i => i.id === selectedId) ?? shown[0] ?? null;

  if (!ctx) return null;

  const handleSelect = (item: Item) => {
    setSelectedId(item.id);
    pushRecent({ kind: 'item', id: item.id, label: item.name, tab: 'items' });
  };

  const handleAdd = async () => {
    const item = await ctx.saveItem(blankItem());
    markDraft(item.id);
    setSelectedId(item.id);
  };

  const renderRow = (item: Item) => {
    const r = rarity(item.rarity);
    return (
      <ListRow
        key={item.id}
        active={selected?.id === item.id}
        onClick={() => handleSelect(item)}
        glyph={GLYPH}
        thumb={item.image_path ? <ImageThumb path={item.image_path} glyph={GLYPH} /> : undefined}
        title={item.name || 'Untitled item'}
        subtitle={itemLine(item)}
        meta={holdersSummary(holdings.filter(h => h.item_id === item.id), pcs) || undefined}
        badges={r ? <Badge color={r.color}>{r.label}</Badge> : undefined}
      />
    );
  };

  return (
    <ListDetail
      title="Items"
      count={shown.length}
      search={search}
      onSearchChange={setSearch}
      onAdd={() => void handleAdd()}
      addLabel="+ Add item"
      list={
        items.length === 0 ? (
          <div className="cm-empty is-inline">No items yet. Add magic items, treasure and gear, then give them out from here, a PC’s page or a session’s loot.</div>
        ) : (
          <>
            {held.length > 0 && (
              <>
                <div className="cm-md-grouplabel">With the party · {held.length}</div>
                {held.map(renderRow)}
              </>
            )}
            {unheld.length > 0 && (
              <>
                <div className="cm-md-grouplabel is-local">Not handed out · {unheld.length}</div>
                {unheld.map(renderRow)}
              </>
            )}
          </>
        )
      }
      detail={
        selected ? (
          <ItemEditor
            key={selected.id}
            item={selected}
            save={fields => ctx.saveItem({ id: selected.id, ...fields })}
            remove={ctx.deleteItem}
            onDeleted={() => setSelectedId(null)}
          />
        ) : (
          <EmptyDetail>Select an item from the list</EmptyDetail>
        )
      }
    />
  );
}
