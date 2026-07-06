import { useState, useMemo, useEffect } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { ListDetail, ListRow, DetailPanel, DetailSection, Pill, EmptyDetail } from '../ui/ListDetail';
import { Badge } from '../ui/Badge';
import { pushRecent } from '../Sidebar';
import { useAutoSave } from '../../hooks/useAutoSave';
import { OverflowMenu } from '../ui/OverflowMenu';
import { AutosaveTextarea } from '../ui/MentionButton';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import { ListRowWithHover } from '../HoverPreview';
import type { Location, LoreEntry } from '../../lib/database.types';

type WorldKind = 'location' | 'lore';
type FilterType = 'all' | WorldKind;

interface WorldItem {
  id: string;
  kind: WorldKind;
  name: string;
  subtitle: string;
  meta?: string;
  glyph: string;
  raw: unknown;
}

const GLYPHS: Record<WorldKind, string> = { location: '✦', lore: '❧' };

const LOCATION_TYPES = ['continent', 'city', 'town', 'dungeon', 'faction_hq', 'landmark', 'other'] as const;
const LORE_CATEGORIES = ['history', 'artifact', 'creature', 'magic', 'religion'] as const;

const typeBadgeColor: Record<string, 'blue' | 'green' | 'red' | 'gold' | 'muted'> = {
  continent: 'green', city: 'blue', town: 'green', dungeon: 'red', faction_hq: 'gold', landmark: 'blue', other: 'muted',
};

const categoryBadgeColor: Record<string, 'blue' | 'green' | 'red' | 'gold' | 'muted'> = {
  history: 'gold', artifact: 'blue', creature: 'red', magic: 'muted', religion: 'green',
};

function formatType(t: string | null) {
  if (!t) return '';
  return t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function LoreLocations({ onImportFromWorld }: { onImportFromWorld?: (type: string) => void }) {
  const {
    locations, lore,
    upsertLocation, deleteLocation,
    upsertLore, deleteLore,
  } = useCampaign();
  const confirm = useConfirm();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Build unified list
  const all = useMemo<WorldItem[]>(() => {
    const items: WorldItem[] = [
      ...locations.map(loc => ({
        id: loc.id,
        kind: 'location' as const,
        name: loc.name,
        subtitle: [formatType(loc.location_type), loc.region].filter(Boolean).join(' · '),
        meta: loc.status && loc.status !== 'active' ? loc.status : undefined,
        glyph: GLYPHS.location,
        raw: loc,
      })),
      ...lore.map(l => ({
        id: l.id,
        kind: 'lore' as const,
        name: l.title,
        subtitle: l.category ? l.category.charAt(0).toUpperCase() + l.category.slice(1) : '',
        meta: l.dm_only ? 'DM only' : undefined,
        glyph: GLYPHS.lore,
        raw: l,
      })),
    ];

    return items.filter(item => {
      if (filter !== 'all' && item.kind !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!item.name.toLowerCase().includes(q) && !item.subtitle.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [locations, lore, filter, search]);

  const selected = all.find(x => x.id === selectedId) || all[0] || null;

  const handleSelect = (item: WorldItem) => {
    setSelectedId(item.id);
    pushRecent({ kind: item.kind, id: item.id, label: item.name, tab: 'world' });
  };

  const handleAdd = async () => {
    if (filter === 'lore') {
      const result = await upsertLore({ title: '', category: null, content: null, dm_only: false });
      setSelectedId(result.id);
    } else {
      const result = await upsertLocation({
        name: '', location_type: 'landmark', region: null,
        description: null, dm_notes: null,
        history: null, population: null, status: null,
      });
      setSelectedId(result.id);
    }
  };

  return (
    <>
      <ListDetail
        title="World"
        count={all.length}
        search={search}
        onSearchChange={setSearch}
        onAdd={handleAdd}
        addLabel={filter === 'lore' ? '+ Lore' : '+ Location'}
        onImport={onImportFromWorld ? () => onImportFromWorld(filter === 'lore' ? 'lore' : 'location') : undefined}
        importLabel={filter === 'lore' ? '⊕ Import Lore' : '⊕ Import Location'}
        filters={
          <>
            <Pill active={filter === 'all'} onClick={() => setFilter('all')}>All</Pill>
            <Pill active={filter === 'location'} onClick={() => setFilter('location')}>Locations</Pill>
            <Pill active={filter === 'lore'} onClick={() => setFilter('lore')}>Lore</Pill>
          </>
        }
        list={
          all.length === 0 ? (
            <div className="cm-empty is-inline">No entries match your filters</div>
          ) : (
            all.map(item => (
              <ListRowWithHover
                key={item.id}
                entity={item.raw as Location | LoreEntry}
                kind={item.kind}
              >
                <ListRow
                  active={selected?.id === item.id}
                  onClick={() => handleSelect(item)}
                  glyph={item.glyph}
                  title={item.name}
                  subtitle={item.subtitle}
                  meta={item.meta}
                  badges={
                    item.kind === 'location' && (item.raw as Location).location_type
                      ? <Badge color={typeBadgeColor[(item.raw as Location).location_type!] ?? 'muted'}>
                          {formatType((item.raw as Location).location_type)}
                        </Badge>
                      : item.kind === 'lore' && (item.raw as LoreEntry).category
                      ? <Badge color={categoryBadgeColor[(item.raw as LoreEntry).category!] ?? 'muted'}>
                          {((item.raw as LoreEntry).category ?? '').charAt(0).toUpperCase() + ((item.raw as LoreEntry).category ?? '').slice(1)}
                        </Badge>
                      : undefined
                  }
                />
              </ListRowWithHover>
            ))
          )
        }
        detail={
          selected ? (
            selected.kind === 'location' ? (
              <LocationDetail
                key={selected.id}
                location={selected.raw as Location}
                onDelete={async () => {
                  const yes = await confirm('Delete this location?', 'This cannot be undone.');
                  if (yes) { await deleteLocation(selected.id); setSelectedId(null); }
                }}
              />
            ) : (
              <LoreDetail
                key={selected.id}
                entry={selected.raw as LoreEntry}
                onDelete={async () => {
                  const yes = await confirm('Delete this lore entry?', 'This cannot be undone.');
                  if (yes) { await deleteLore(selected.id); setSelectedId(null); }
                }}
              />
            )
          ) : (
            <EmptyDetail>Select an entry from the list</EmptyDetail>
          )
        }
      />
    </>
  );
}

/* ── Location Detail (autosave) ── */

interface LocationForm {
  name: string;
  region: string;
  location_type: string;
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
    population: loc.population ?? '',
    status: loc.status ?? 'active',
    description: loc.description ?? '',
    history: loc.history ?? '',
    dm_notes: loc.dm_notes ?? '',
  };
}

function LocationDetail({ location, onDelete }: { location: Location; onDelete: () => void }) {
  const { upsertLocation } = useCampaign();
  const [form, setForm] = useState<LocationForm>(() => locationToForm(location));

  // Reset form when switching to a different location
  useEffect(() => {
    setForm(locationToForm(location));
  }, [location.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { status, saveNow } = useAutoSave<LocationForm>({
    data: form,
    onSave: async (data) => {
      await upsertLocation({
        id: location.id,
        name: data.name || 'Unnamed Location',
        region: data.region || null,
        location_type: data.location_type || null,
        population: data.population || null,
        status: data.status || null,
        description: data.description || null,
        history: data.history || null,
        dm_notes: data.dm_notes || null,
      });
    },
    delay: 800,
    enabled: true,
  });

  const set = <K extends keyof LocationForm>(key: K, value: LocationForm[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  return (
    <DetailPanel eyebrow="Location" title="">
      {/* Action bar */}
      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        <OverflowMenu items={[
          { label: 'Delete Location', danger: true, onClick: onDelete },
        ]} />
      </div>

      {/* Title + region */}
      <input
        className="as-title"
        value={form.name}
        onChange={e => set('name', e.target.value)}
        placeholder="Location name…"
      />
      <input
        className="as-sub"
        value={form.region}
        onChange={e => set('region', e.target.value)}
        placeholder="Region…"
      />

      {/* Meta strip */}
      <div className="as-meta">
        <div className="as-mi">
          <span className="as-ml">Type</span>
          <select
            className="as-select"
            value={form.location_type}
            onChange={e => set('location_type', e.target.value)}
          >
            {LOCATION_TYPES.map(t => (
              <option key={t} value={t}>{formatType(t)}</option>
            ))}
          </select>
        </div>
        <div className="as-mi">
          <span className="as-ml">Status</span>
          <select
            className="as-select"
            value={form.status}
            onChange={e => set('status', e.target.value)}
          >
            <option value="active">Active</option>
            <option value="destroyed">Destroyed</option>
            <option value="unknown">Unknown</option>
            <option value="compromised">Compromised</option>
          </select>
        </div>
        <div className="as-mi">
          <span className="as-ml">Population</span>
          <input
            className="as-input"
            value={form.population}
            onChange={e => set('population', e.target.value)}
            placeholder="e.g. ~12,000"
          />
        </div>
      </div>

      {/* Description */}
      <DetailSection title="Description">
        <AutosaveTextarea
          value={form.description}
          onChange={v => set('description', v)}
          placeholder="Describe this place…"
          rows={4}
        />
      </DetailSection>

      {/* History */}
      <DetailSection title="History">
        <AutosaveTextarea
          value={form.history}
          onChange={v => set('history', v)}
          placeholder="Historical events…"
          rows={4}
        />
      </DetailSection>

      {/* DM Notes */}
      <DetailSection title="DM Notes">
        <AutosaveTextarea
          value={form.dm_notes}
          onChange={v => set('dm_notes', v)}
          placeholder="Private DM notes…"
          rows={3}
        />
      </DetailSection>
    </DetailPanel>
  );
}

/* ── Lore Detail (autosave) ── */

interface LoreForm {
  title: string;
  category: string;
  dm_only: boolean;
  content: string;
}

function loreToForm(entry: LoreEntry): LoreForm {
  return {
    title: entry.title ?? '',
    category: entry.category ?? 'history',
    dm_only: entry.dm_only ?? false,
    content: entry.content ?? '',
  };
}

function LoreDetail({ entry, onDelete }: { entry: LoreEntry; onDelete: () => void }) {
  const { upsertLore } = useCampaign();
  const [form, setForm] = useState<LoreForm>(() => loreToForm(entry));

  // Reset form when switching to a different entry
  useEffect(() => {
    setForm(loreToForm(entry));
  }, [entry.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { status, saveNow } = useAutoSave<LoreForm>({
    data: form,
    onSave: async (data) => {
      await upsertLore({
        id: entry.id,
        title: data.title || 'Untitled Entry',
        category: data.category || null,
        dm_only: data.dm_only,
        content: data.content || null,
      });
    },
    delay: 800,
    enabled: true,
  });

  const set = <K extends keyof LoreForm>(key: K, value: LoreForm[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  return (
    <DetailPanel eyebrow="Lore" title="">
      {/* Action bar */}
      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        <OverflowMenu items={[
          { label: 'Delete entry', danger: true, onClick: onDelete },
        ]} />
      </div>

      {/* Title */}
      <input
        className="as-title"
        value={form.title}
        onChange={e => set('title', e.target.value)}
        placeholder="Entry title…"
      />

      {/* Meta strip */}
      <div className="as-meta">
        <div className="as-mi">
          <span className="as-ml">Category</span>
          <select
            className="as-select"
            value={form.category}
            onChange={e => set('category', e.target.value)}
          >
            {LORE_CATEGORIES.map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="as-mi">
          <span className="as-ml">DM Only</span>
          <div className="as-pills">
            <button
              type="button"
              className={`as-pill-opt${form.dm_only ? ' is-active' : ''}`}
              onClick={() => set('dm_only', !form.dm_only)}
            >
              {form.dm_only ? 'Hidden from players' : 'Visible to players'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <DetailSection title="Content">
        <AutosaveTextarea
          value={form.content}
          onChange={v => set('content', v)}
          placeholder="Lore content…"
          rows={8}
        />
      </DetailSection>
    </DetailPanel>
  );
}
