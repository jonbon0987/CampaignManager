import { useState, useMemo, useEffect } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useWorld } from '../../context/WorldContext';
import { useConfirm } from '../../context/ConfirmContext';
import { ListDetail, DetailPanel, DetailSection, EmptyDetail } from '../ui/ListDetail';
import { OriginBand, type Origin } from '../ui/OriginBand';
import { pushRecent } from '../Sidebar';
import { useAutoSave } from '../../hooks/useAutoSave';
import { OverflowMenu } from '../ui/OverflowMenu';
import { AutosaveTextarea } from '../ui/MentionButton';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import type { Location } from '../../lib/database.types';

const LOCATION_TYPES = ['continent', 'city', 'town', 'dungeon', 'faction_hq', 'landmark', 'other'] as const;

// Type → tree glyph (mirrors the prototype's locTypeGlyph, mapped to this app's types).
const LOC_GLYPH: Record<string, string> = {
  continent: '⛰', city: '⌖', town: '⌂', dungeon: '⌗', faction_hq: '◈', landmark: '✦', other: '✦',
};
const glyphFor = (t: string | null) => LOC_GLYPH[t ?? 'other'] ?? '✦';

function formatType(t: string | null) {
  if (!t) return '';
  return t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function Locations() {
  const {
    locations, globalLocations, linkedLocationIds,
    upsertLocation, deleteLocation, linkLocationToCampaign, unlinkLocationFromCampaign,
  } = useCampaign();
  const { activeWorldId, backToWorld, setWorldTab, setSelected: setWorldSelected } = useWorld();
  const confirm = useConfirm();

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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

  const importPool = useMemo(
    () => globalLocations.filter(l => !linkedSet.has(l.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [globalLocations, linkedSet],
  );

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
    if (result) setSelectedId(result.id);
  };

  const importLoc = async (loc: Location) => {
    await linkLocationToCampaign(loc.id);
    setSelectedId(loc.id);
    setShowImport(false);
  };

  const publish = async (loc: Location) => {
    await upsertLocation({
      id: loc.id, name: loc.name, region: loc.region, location_type: loc.location_type,
      parent_id: loc.parent_id, population: loc.population, status: loc.status,
      description: loc.description, history: loc.history, dm_notes: loc.dm_notes,
      world_id: activeWorldId || loc.world_id || null,
    }, 'global');
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
      addLabel={selected ? '+ Place here' : '+ Location'}
      onImport={() => setShowImport(v => !v)}
      importLabel={showImport ? '× Close import' : '+ Import from canon'}
      list={
        <>
          {showImport && (
            <div className="cm-importbrowse">
              <div className="cm-importbrowse-head">Import from canon · {importPool.length} available</div>
              {importPool.length === 0 ? (
                <div className="cm-importbrowse-empty">Nothing left to import — every canon place is already on this table.</div>
              ) : (
                importPool.map(l => (
                  <button key={l.id} className="cm-importbrowse-row" onClick={() => importLoc(l)}>
                    <span className="cm-importbrowse-glyph">{glyphFor(l.location_type)}</span>
                    <span className="cm-importbrowse-body">
                      <span className="cm-importbrowse-name">{l.name || 'Untitled'}</span>
                      <span className="cm-importbrowse-sub">{formatType(l.location_type) || 'Place'}</span>
                    </span>
                    <span className="cm-importbrowse-cta">Import ↓</span>
                  </button>
                ))
              )}
            </div>
          )}

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
          <LocationDetail
            key={selected.id}
            location={selected}
            origin={originOf(selected.id)}
            allLocations={locations}
            onOpenInCanon={() => openInCanon(selected.id)}
            onPublish={() => publish(selected)}
            onDetach={async () => { await unlinkLocationFromCampaign(selected.id); setSelectedId(null); }}
            onDelete={async () => {
              const yes = await confirm('Delete this location?', 'Any places nested under it become top-level.');
              if (yes) { await deleteLocation(selected.id); setSelectedId(null); }
            }}
          />
        ) : (
          <EmptyDetail>Select a place from the tree</EmptyDetail>
        )
      }
    />
  );
}

/* ── Location Detail (autosave, with parent picker) ── */

interface LocationForm {
  name: string;
  region: string;
  location_type: string;
  parent_id: string;
  population: string;
  status: string;
  description: string;
  history: string;
  dm_notes: string;
}

function locationToForm(loc: Location): LocationForm {
  return {
    name: loc.name ?? '',
    region: loc.region ?? '',
    location_type: loc.location_type ?? 'landmark',
    parent_id: loc.parent_id ?? '',
    population: loc.population ?? '',
    status: loc.status ?? 'active',
    description: loc.description ?? '',
    history: loc.history ?? '',
    dm_notes: loc.dm_notes ?? '',
  };
}

// Ids that can't be a parent of `loc`: itself and its descendants (would form a cycle).
function forbiddenParents(loc: Location, all: Location[]): Set<string> {
  const bad = new Set<string>([loc.id]);
  let added = true;
  while (added) {
    added = false;
    for (const l of all) {
      if (l.parent_id && bad.has(l.parent_id) && !bad.has(l.id)) {
        bad.add(l.id);
        added = true;
      }
    }
  }
  return bad;
}

interface DetailProps {
  origin: Origin;
  allLocations: Location[];
  onOpenInCanon: () => void;
  onPublish: () => void;
  onDetach: () => void;
  onDelete: () => void;
}

function LocationDetail({ location, origin, allLocations, onOpenInCanon, onPublish, onDetach, onDelete }: { location: Location } & DetailProps) {
  const { upsertLocation } = useCampaign();
  const [form, setForm] = useState<LocationForm>(() => locationToForm(location));

  useEffect(() => { setForm(locationToForm(location)); }, [location.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { status, saveNow } = useAutoSave<LocationForm>({
    data: form,
    onSave: async (data) => {
      await upsertLocation({
        id: location.id,
        name: data.name || 'Unnamed Location',
        region: data.region || null,
        location_type: data.location_type || null,
        parent_id: data.parent_id || null,
        population: data.population || null,
        status: data.status || null,
        description: data.description || null,
        history: data.history || null,
        dm_notes: data.dm_notes || null,
        world_id: location.world_id,
      }, origin === 'imported' ? 'global' : 'campaign');
    },
    delay: 800,
    enabled: true,
  });

  const set = <K extends keyof LocationForm>(key: K, value: LocationForm[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const forbidden = useMemo(() => forbiddenParents(location, allLocations), [location, allLocations]);
  const parentOptions = allLocations
    .filter(l => !forbidden.has(l.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <DetailPanel eyebrow="Location" title="">
      <OriginBand origin={origin} noun="place" onOpenInCanon={onOpenInCanon} onPublish={onPublish} onDetach={onDetach} />

      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        <OverflowMenu items={[{ label: 'Delete Location', danger: true, onClick: onDelete }]} />
      </div>

      <input className="as-title" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Location name…" />
      <input className="as-sub" value={form.region} onChange={e => set('region', e.target.value)} placeholder="Region…" />

      <div className="as-meta">
        <div className="as-mi">
          <span className="as-ml">Type</span>
          <select className="as-select" value={form.location_type} onChange={e => set('location_type', e.target.value)}>
            {LOCATION_TYPES.map(t => <option key={t} value={t}>{formatType(t)}</option>)}
          </select>
        </div>
        <div className="as-mi">
          <span className="as-ml">Within</span>
          <select className="as-select" value={form.parent_id} onChange={e => set('parent_id', e.target.value)}>
            <option value="">— Top level —</option>
            {parentOptions.map(l => (
              <option key={l.id} value={l.id}>{l.name || 'Unnamed'}</option>
            ))}
          </select>
        </div>
        <div className="as-mi">
          <span className="as-ml">Status</span>
          <select className="as-select" value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="active">Active</option>
            <option value="destroyed">Destroyed</option>
            <option value="unknown">Unknown</option>
            <option value="compromised">Compromised</option>
          </select>
        </div>
        <div className="as-mi">
          <span className="as-ml">Population</span>
          <input className="as-input" value={form.population} onChange={e => set('population', e.target.value)} placeholder="e.g. ~12,000" />
        </div>
      </div>

      <DetailSection title="Description">
        <AutosaveTextarea value={form.description} onChange={v => set('description', v)} placeholder="Describe this place…" rows={4} />
      </DetailSection>

      <DetailSection title="History">
        <AutosaveTextarea value={form.history} onChange={v => set('history', v)} placeholder="Historical events…" rows={4} />
      </DetailSection>

      <DetailSection title="DM Notes">
        <AutosaveTextarea value={form.dm_notes} onChange={v => set('dm_notes', v)} placeholder="Private DM notes…" rows={3} />
      </DetailSection>
    </DetailPanel>
  );
}
