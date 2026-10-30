import { useState, useMemo, useEffect } from 'react';
import { useReportRecord } from '../../context/NavigationContext';
import { useCampaign } from '../../context/CampaignContext';
import { useWorld } from '../../context/WorldContext';
import { ListDetail, ListRow, EmptyDetail } from '../ui/ListDetail';
import { Badge } from '../ui/Badge';
import type { Origin } from '../ui/OriginBand';
import { pushRecent } from '../../lib/recent';
import { markDraft } from '../../hooks/useDiscardBlankDraft';
import type { LoreEntry } from '../../lib/database.types';
import { LoreEditor, type LoreFields } from '../entity/LoreEditor';

const GLYPH = '❦';

const categoryBadgeColor: Record<string, 'blue' | 'green' | 'red' | 'gold' | 'muted'> = {
  history: 'gold', artifact: 'blue', creature: 'red', magic: 'muted', religion: 'green',
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface LoreItem {
  id: string;
  origin: Origin;
  raw: LoreEntry;
}

export default function Lore({ openId, onOpenConsumed, onImportFromWorld }: { openId?: string | null; onOpenConsumed?: () => void; onImportFromWorld?: () => void } = {}) {
  const {
    lore, linkedLoreIds,
    upsertLore, deleteLore, linkLoreToCampaign, unlinkLoreFromCampaign,
  } = useCampaign();
  const { activeWorldId, backToWorld, setWorldTab, setSelected: setWorldSelected } = useWorld();

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useReportRecord('lore', selectedId);

  // Open a record requested from outside the tab (e.g. the sidebar "Recent"
  // list), then clear the request so it doesn't re-fire. Syncing selection to an
  // incoming external request is the legitimate case for setState in an effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (openId) { setSelectedId(openId); onOpenConsumed?.(); }
  }, [openId, onOpenConsumed]);

  const all = useMemo<LoreItem[]>(() => {
    const linked = new Set(linkedLoreIds);
    return lore
      .map(l => ({ id: l.id, origin: (linked.has(l.id) ? 'imported' : 'local') as Origin, raw: l }))
      .filter(item => {
        if (!search) return true;
        const q = search.toLowerCase();
        return item.raw.title.toLowerCase().includes(q) || (item.raw.category ?? '').toLowerCase().includes(q);
      });
  }, [lore, linkedLoreIds, search]);

  const imported = all.filter(i => i.origin === 'imported');
  const local = all.filter(i => i.origin === 'local');
  const selected = all.find(x => x.id === selectedId) || all[0] || null;

  const handleSelect = (item: LoreItem) => {
    setSelectedId(item.id);
    pushRecent({ kind: 'lore', id: item.id, label: item.raw.title, tab: 'lore' });
  };

  const handleAdd = async () => {
    const result = await upsertLore({ title: '', category: null, content: null, dm_only: false, world_id: null });
    if (result) { markDraft(result.id); setSelectedId(result.id); }
  };

  // Publishing promotes the entry into canon, then keeps it visible here.
  const publish = async (entry: LoreEntry, fields: LoreFields) => {
    await upsertLore({ id: entry.id, ...fields, world_id: activeWorldId || entry.world_id || null } as Parameters<typeof upsertLore>[0], 'global');
    await linkLoreToCampaign(entry.id);
  };

  const openInCanon = (id: string) => {
    setWorldTab('lore');
    setWorldSelected('lore', id);
    backToWorld();
  };

  const renderRow = (item: LoreItem) => (
    <ListRow
        key={item.id}
        active={selected?.id === item.id}
        onClick={() => handleSelect(item)}
        glyph={GLYPH}
        title={item.raw.title || 'Untitled Entry'}
        subtitle={item.raw.category ? cap(item.raw.category) : ''}
        meta={item.raw.dm_only ? 'DM only' : undefined}
        badges={
          <>
            <Badge color={item.origin === 'imported' ? 'gold' : 'orange'} size="xs">
              {item.origin === 'imported' ? 'imported' : 'only here'}
            </Badge>
            {item.raw.category && (
              <Badge color={categoryBadgeColor[item.raw.category] ?? 'muted'}>{cap(item.raw.category)}</Badge>
            )}
          </>
        }
      />
  );

  return (
    <ListDetail
      title="Lore"
      count={all.length}
      search={search}
      onSearchChange={setSearch}
      onAdd={handleAdd}
      addLabel="+ Add lore"
      onImport={onImportFromWorld}
      importLabel="⊕ Import lore"
      list={
        <>
          {all.length === 0 ? (
            <div className="cm-empty is-inline">No lore yet — create one or import from canon</div>
          ) : (
            <>
              {imported.length > 0 && (
                <>
                  <div className="cm-md-grouplabel">Imported from canon · {imported.length}</div>
                  {imported.map(renderRow)}
                </>
              )}
              {local.length > 0 && (
                <>
                  <div className="cm-md-grouplabel is-local">Created for this table · {local.length}</div>
                  {local.map(renderRow)}
                </>
              )}
            </>
          )}
        </>
      }
      detail={
        selected ? (
          <LoreEditor
            key={selected.id}
            entry={selected.raw}
            scope="campaign"
            save={fields => upsertLore({ id: selected.id, ...fields, world_id: selected.raw.world_id } as Parameters<typeof upsertLore>[0],
              selected.origin === 'imported' ? 'global' : 'campaign')}
            remove={deleteLore}
            onDeleted={() => setSelectedId(null)}
            canon={{
              origin: selected.origin,
              onOpenInCanon: () => openInCanon(selected.id),
              onPublish: fields => publish(selected.raw, fields),
              onDetach: async () => { await unlinkLoreFromCampaign(selected.id); setSelectedId(null); },
            }}
          />
        ) : (
          <EmptyDetail>Select an entry from the list</EmptyDetail>
        )
      }
    />
  );
}
