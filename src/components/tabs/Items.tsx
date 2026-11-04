// The campaign's item compendium: magic items, treasure and gear, with who
// holds each. Items no one holds yet are listed after those that are out in
// the world.

import { useEffect, useMemo, useState } from 'react';
import { firstNamed } from '../../lib/firstNamed';
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
import { SrdLibrary } from '../srd/SrdLibrary';
import { srdToItem, type SrdItem } from '../../lib/srd';
import type { Item } from '../../lib/database.types';

const GLYPH = '✠';

export default function Items({ openId, onOpenConsumed }: { openId?: string | null; onOpenConsumed?: () => void } = {}) {
  const ctx = useItems();
  const { pcs, selectedCampaign } = useCampaign();
  const [search, setSearch] = useState('');
  const [srdOpen, setSrdOpen] = useState(false);
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
  const selected = shown.find(i => i.id === selectedId) ?? firstNamed(shown, i => i.name) ?? null;

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

  // A copy of an SRD magic item, which is the DM's to change from then on.
  const addFromSrd = async (i: SrdItem) => {
    const item = await ctx.saveItem(srdToItem(i));
    setSearch('');
    setSelectedId(item.id);
  };
  const haveItem = (name: string) => items.some(i => i.name.trim().toLowerCase() === name.toLowerCase())
    ? `You already have an item called ${name}; this adds another.` : null;

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
    <>
    <ListDetail
      title="Items"
      count={shown.length}
      search={search}
      onSearchChange={setSearch}
      addLabel="+ Add"
      addOptions={[
        { label: 'Blank item', onClick: () => void handleAdd() },
        { label: 'From the SRD library…', onClick: () => setSrdOpen(true) },
      ]}
      empty={items.length === 0 ? {
        glyph: GLYPH, text: 'No items yet. Copy magic items from the SRD library, or add your own treasure and gear, then give them out from here, a PC’s page or a session’s loot.',
        actionLabel: 'Browse the SRD library', onAction: () => setSrdOpen(true),
      } : null}
      list={
        shown.length === 0 ? (
          <div className="cm-empty is-inline">No items match.</div>
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
          <EmptyDetail noun="item" />
        )
      }
    />
    <SrdLibrary kind="items" open={srdOpen} onClose={() => setSrdOpen(false)}
      edition={selectedCampaign?.rules_edition ?? '2014'} addLabel="Add to items" note={haveItem} onAdd={addFromSrd} />
    </>
  );
}
