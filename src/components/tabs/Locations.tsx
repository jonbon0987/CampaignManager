import { useState, useMemo, useEffect } from 'react';
import { useReportRecord } from '../../context/NavigationContext';
import { useCampaign } from '../../context/CampaignContext';
import { useWorld } from '../../context/WorldContext';
import { ListDetail, EmptyDetail } from '../ui/ListDetail';
import type { Origin } from '../ui/OriginBand';
import { pushRecent } from '../../lib/recent';
import { markDraft } from '../../hooks/useDiscardBlankDraft';
import type { Location } from '../../lib/database.types';
import { LocationEditor, type LocationFields } from '../entity/LocationEditor';

// Type → tree glyph (mirrors the prototype's locTypeGlyph, mapped to this app's types).
const LOC_GLYPH: Record<string, string> = {
  continent: '⛰', city: '⌖', town: '⌂', dungeon: '⌗', faction_hq: '◈', landmark: '✦', other: '✦',
};
const glyphFor = (t: string | null) => LOC_GLYPH[t ?? 'other'] ?? '✦';

function formatType(t: string | null) {
  if (!t) return '';
  return t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function Locations({ openId, onOpenConsumed, onImportFromWorld }: { openId?: string | null; onOpenConsumed?: () => void; onImportFromWorld?: () => void } = {}) {
  const {
    locations, linkedLocationIds,
    upsertLocation, deleteLocation, linkLocationToCampaign, unlinkLocationFromCampaign,
  } = useCampaign();
  const { activeWorldId, backToWorld, setWorldTab, setSelected: setWorldSelected } = useWorld();

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useReportRecord('locations', selectedId);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Open a record requested from outside the tab (e.g. the sidebar "Recent"
  // list), then clear the request so it doesn't re-fire. Syncing selection to an
  // incoming external request is the legitimate case for setState in an effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (openId) { setSelectedId(openId); onOpenConsumed?.(); }
  }, [openId, onOpenConsumed]);

  const linkedSet = useMemo(() => new Set(linkedLocationIds), [linkedLocationIds]);
  const originOf = (id: string): Origin => (linkedSet.has(id) ? 'imported' : 'local');

  const byId = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations]);
  const childrenOf = useMemo(() => {
    const m = new Map<string | null, Location[]>();
    for (const l of locations) {
      // Treat a parent that isn't in this campaign's set as a root.
      const pid = l.parent_id && byId.has(l.parent_id) ? l.parent_id : null;
      const arr = m.get(pid) ?? [];
      arr.push(l);
      m.set(pid, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return m;
  }, [locations, byId]);

  // Search → set of ids to show (matches plus their ancestors so the tree stays connected).
  const visible = useMemo(() => {
    if (!search) return null; // null = show everything
    const q = search.toLowerCase();
    const match = (l: Location) =>
      l.name.toLowerCase().includes(q) ||
      (l.region ?? '').toLowerCase().includes(q) ||
      (l.location_type ?? '').toLowerCase().includes(q);
    const show = new Set<string>();
    for (const l of locations) {
      if (!match(l)) continue;
      let cur: Location | undefined = l;
      while (cur && !show.has(cur.id)) {
        show.add(cur.id);
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
      }
    }
    return show;
  }, [search, locations, byId]);

  const roots = childrenOf.get(null) ?? [];
  const selected = selectedId ? byId.get(selectedId) ?? null : (roots[0] ?? null);

  const totalShown = visible ? visible.size : locations.length;

  const handleSelect = (loc: Location) => {
    setSelectedId(loc.id);
    pushRecent({ kind: 'location', id: loc.id, label: loc.name, tab: 'locations' });
  };

  const handleAdd = async () => {
    const parentId = selected ? selected.id : null;
    const result = await upsertLocation({
      name: '', location_type: 'landmark', region: null, parent_id: parentId,
      description: null, dm_notes: null, history: null, population: null, status: null, world_id: null,
    });
    if (result) { markDraft(result.id); setSelectedId(result.id); }
  };

  // Publishing promotes the place into canon, then keeps it visible here.
  const publish = async (loc: Location, fields: LocationFields) => {
    await upsertLocation({ id: loc.id, ...fields, world_id: activeWorldId || loc.world_id || null } as Parameters<typeof upsertLocation>[0], 'global');
    await linkLocationToCampaign(loc.id);
  };

  const openInCanon = (id: string) => {
    setWorldTab('locations');
    setWorldSelected('locations', id);
    backToWorld();
  };

  const toggle = (id: string) =>
    setCollapsed(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const renderNode = (loc: Location, depth: number): React.ReactNode => {
    if (visible && !visible.has(loc.id)) return null;
    const kids = (childrenOf.get(loc.id) ?? []).filter(k => !visible || visible.has(k.id));
    const isOpen = !collapsed.has(loc.id);
    const origin = originOf(loc.id);
    return (
      <div key={loc.id}>
        <div
          className={`cm-tree-node ${selected?.id === loc.id ? 'is-active' : ''}`}
          style={{ paddingLeft: 8 + depth * 18 }}
          onClick={() => handleSelect(loc)}
        >
          {kids.length ? (
            <button
              type="button"
              className="cm-tree-caret is-btn"
              onClick={e => { e.stopPropagation(); toggle(loc.id); }}
            >
              {isOpen ? '▾' : '▸'}
            </button>
          ) : (
            <span className="cm-tree-caret" />
          )}
          <span className="cm-tree-glyph" style={{ color: origin === 'imported' ? 'var(--gold)' : 'var(--orange)' }}>
            {glyphFor(loc.location_type)}
          </span>
          <span className="cm-tree-name">{loc.name || 'Unnamed Location'}</span>
          <span className="cm-tree-type">{formatType(loc.location_type)}</span>
        </div>
        {isOpen && kids.map(k => renderNode(k, depth + 1))}
      </div>
    );
  };

  return (
    <ListDetail
      title="Locations"
      count={totalShown}
      search={search}
      onSearchChange={setSearch}
      onAdd={handleAdd}
      addLabel="+ Location"
      onImport={onImportFromWorld}
      importLabel="⊕ Import Location"
      list={
        <>

          {locations.length === 0 ? (
            <div className="cm-empty is-inline">No places yet — create one or import from canon</div>
          ) : (
            <>
              <div className="cm-tree">{roots.map(r => renderNode(r, 0))}</div>
              <div className="cm-tree-legend">
                <span className="cm-tree-legend-dot is-gold" /> imported canon
                <span className="cm-tree-legend-dot is-orange" style={{ marginLeft: 12 }} /> only this table
              </div>
            </>
          )}
        </>
      }
      detail={
        selected ? (
          <LocationEditor
            key={selected.id}
            location={selected}
            scope="campaign"
            allLocations={locations}
            save={fields => upsertLocation({ id: selected.id, ...fields, world_id: selected.world_id } as Parameters<typeof upsertLocation>[0],
              originOf(selected.id) === 'imported' ? 'global' : 'campaign')}
            remove={deleteLocation}
            onDeleted={() => setSelectedId(null)}
            canon={{
              origin: originOf(selected.id),
              onOpenInCanon: () => openInCanon(selected.id),
              onPublish: fields => publish(selected, fields),
              onDetach: async () => { await unlinkLocationFromCampaign(selected.id); setSelectedId(null); },
            }}
          />
        ) : (
          <EmptyDetail>Select a place from the tree</EmptyDetail>
        )
      }
    />
  );
}
