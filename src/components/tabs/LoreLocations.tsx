import { useState, useMemo } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { ListDetail, ListRow, Pill, EmptyDetail } from '../ui/ListDetail';
import { MarkdownEditor } from '../ui/MarkdownEditor';
import { Badge } from '../ui/Badge';
import { FormField, inputStyle } from '../FormField';
import { SaveBar } from '../ui/SaveBar';
import { useAutoSave } from '../../hooks/useAutoSave';
import { pushRecent } from '../Sidebar';
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

const LOCATION_TYPES = ['city', 'town', 'dungeon', 'faction_hq', 'landmark', 'other'] as const;

const typeBadgeColor: Record<string, 'blue' | 'green' | 'red' | 'gold' | 'muted'> = {
  city: 'blue', town: 'green', dungeon: 'red', faction_hq: 'gold', landmark: 'blue', other: 'muted',
};

const categoryBadgeColor: Record<string, 'blue' | 'green' | 'red' | 'gold' | 'muted'> = {
  history: 'gold', artifact: 'blue', creature: 'red', magic: 'muted', religion: 'green',
};

function formatType(t: string | null) {
  if (!t) return '';
  return t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function LoreLocations() {
  const {
    locations, lore,
    upsertLocation, deleteLocation,
    upsertLore, deleteLore,
  } = useCampaign();
  const confirm = useConfirm();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // In-panel creation: 'location' | 'lore' | null
  const [creating, setCreating] = useState<'location' | 'lore' | null>(null);

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

  const handleAdd = () => {
    if (filter === 'lore') {
      setCreating('lore');
      setSelectedId(null);
    } else {
      setCreating('location');
      setSelectedId(null);
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
              <ListRow
                key={item.id}
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
            ))
          )
        }
        detail={
          creating === 'location' ? (
            <LocationCreatePanel
              onCancel={() => setCreating(null)}
              onCreate={async (loc) => { await upsertLocation(loc); setCreating(null); }}
            />
          ) : creating === 'lore' ? (
            <LoreCreatePanel
              onCancel={() => setCreating(null)}
              onCreate={async (l) => { await upsertLore(l); setCreating(null); }}
            />
          ) : selected ? (
            selected.kind === 'location' ? (
              <LocationDetail
                location={selected.raw as Location}
                onDelete={async () => {
                  const yes = await confirm('Delete this location?');
                  if (yes) { await deleteLocation(selected.id); setSelectedId(null); }
                }}
              />
            ) : (
              <LoreDetail
                entry={selected.raw as LoreEntry}
                onDelete={async () => {
                  const yes = await confirm('Delete this lore entry?');
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

/* ── Location Detail ── */

type LocationForm = {
  name: string;
  location_type: string;
  region: string;
  population: string;
  status: string;
  description: string;
  history: string;
  dm_notes: string;
};

function LocationDetail({ location, onDelete }: { location: Location; onDelete: () => void }) {
  const { upsertLocation } = useCampaign();

  const [form, setForm] = useState<LocationForm>({
    name: location.name,
    location_type: location.location_type ?? 'other',
    region: location.region ?? '',
    population: location.population ?? '',
    status: location.status ?? 'active',
    description: location.description ?? '',
    history: location.history ?? '',
    dm_notes: location.dm_notes ?? '',
  });

  const { status } = useAutoSave({
    data: form,
    onSave: async (data) => {
      await upsertLocation({
        id: location.id,
        name: data.name.trim() || location.name,
        location_type: data.location_type,
        region: data.region || null,
        population: data.population || null,
        status: data.status,
        description: data.description || null,
        history: data.history || null,
        dm_notes: data.dm_notes || null,
      });
    },
    delay: 800,
  });

  return (
    <div className="cm-detail">
      <SaveBar status={status} onDelete={onDelete} label="location" />
      <div className="as-ey">Location</div>
      <input
        className="as-title"
        value={form.name}
        onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
        placeholder="Location name…"
      />

      <div className="as-meta">
        <div className="as-meta-item">
          <span className="as-meta-label">Type</span>
          <select className="as-sel" style={{ width: 'auto' }} value={form.location_type} onChange={e => setForm(p => ({ ...p, location_type: e.target.value }))}>
            {LOCATION_TYPES.map(t => <option key={t} value={t}>{formatType(t)}</option>)}
          </select>
        </div>
        <div className="as-meta-item">
          <span className="as-meta-label">Status</span>
          <select className="as-sel" style={{ width: 'auto' }} value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
            <option value="active">Active</option>
            <option value="destroyed">Destroyed</option>
            <option value="unknown">Unknown</option>
            <option value="compromised">Compromised</option>
          </select>
        </div>
      </div>

      <div className="as-grid2" style={{ marginBottom: 12 }}>
        <div className="as-field">
          <label className="as-label">Region</label>
          <input className="as-inp" value={form.region} onChange={e => setForm(p => ({ ...p, region: e.target.value }))} placeholder="e.g. Northern Reaches" />
        </div>
        <div className="as-field">
          <label className="as-label">Population</label>
          <input className="as-inp" value={form.population} onChange={e => setForm(p => ({ ...p, population: e.target.value }))} placeholder="e.g. ~12,000" />
        </div>
      </div>

      <div className="as-sec"><div className="as-sec-row"><span className="as-sec-label">Description</span><span className="as-sec-rule"/></div></div>
      <MarkdownEditor value={form.description} onChange={v => setForm(p => ({ ...p, description: v }))} placeholder="Describe this place…" minHeight="80px" />

      <div className="as-sec"><div className="as-sec-row"><span className="as-sec-label">History</span><span className="as-sec-rule"/></div></div>
      <MarkdownEditor value={form.history} onChange={v => setForm(p => ({ ...p, history: v }))} placeholder="Historical events…" minHeight="60px" />

      <div className="as-sec"><div className="as-sec-row"><span className="as-sec-label">DM Notes</span><span className="as-sec-rule"/></div></div>
      <MarkdownEditor value={form.dm_notes} onChange={v => setForm(p => ({ ...p, dm_notes: v }))} placeholder="Private DM notes…" minHeight="60px" />
    </div>
  );
}

/* ── Lore Detail ── */

const LORE_CATEGORIES = ['history', 'artifact', 'creature', 'magic', 'religion'];

type LoreForm = {
  title: string;
  category: string;
  content: string;
  dm_only: boolean;
};

function LoreDetail({ entry, onDelete }: { entry: LoreEntry; onDelete: () => void }) {
  const { upsertLore } = useCampaign();

  const [form, setForm] = useState<LoreForm>({
    title: entry.title,
    category: entry.category ?? 'history',
    content: entry.content ?? '',
    dm_only: entry.dm_only ?? false,
  });

  const { status } = useAutoSave({
    data: form,
    onSave: async (data) => {
      await upsertLore({
        id: entry.id,
        title: data.title.trim() || entry.title,
        category: data.category,
        content: data.content || null,
        dm_only: data.dm_only,
      });
    },
    delay: 800,
  });

  return (
    <div className="cm-detail">
      <SaveBar status={status} onDelete={onDelete} label="lore entry" />
      <div className="as-ey">Lore</div>
      <input
        className="as-title"
        value={form.title}
        onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
        placeholder="Lore entry title…"
      />

      <div className="as-meta">
        <div className="as-meta-item">
          <span className="as-meta-label">Category</span>
          <select className="as-sel" style={{ width: 'auto' }} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
            {LORE_CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </div>
        <div className="as-meta-item">
          <span className="as-meta-label">DM Only</span>
          <button
            className={`as-tog${form.dm_only ? ' is-on' : ''}`}
            onClick={() => setForm(p => ({ ...p, dm_only: !p.dm_only }))}
          >
            {form.dm_only ? 'Yes' : 'No'}
          </button>
        </div>
      </div>

      <div className="as-sec"><div className="as-sec-row"><span className="as-sec-label">Content</span><span className="as-sec-rule"/></div></div>
      <MarkdownEditor value={form.content} onChange={v => setForm(p => ({ ...p, content: v }))} placeholder="What does this lore entry describe?" minHeight="200px" />
    </div>
  );
}

/* ── Inline Create Panels ── */

function LocationCreatePanel({ onCancel, onCreate }: {
  onCancel: () => void;
  onCreate: (loc: Parameters<ReturnType<typeof useCampaign>['upsertLocation']>[0]) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [locationType, setLocationType] = useState('other');
  const [region, setRegion] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onCreate({ name: name.trim(), region: region || null, location_type: locationType, population: null, status: 'active', description: description || null, history: null, dm_notes: null });
    setSaving(false);
  };

  return (
    <div className="cm-detail">
      <div className="as-ey">Location</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <FormField label="Name"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="Location name" /></FormField>
          <FormField label="Type">
            <select style={inputStyle} value={locationType} onChange={e => setLocationType(e.target.value)}>
              {LOCATION_TYPES.map(t => <option key={t} value={t}>{formatType(t)}</option>)}
            </select>
          </FormField>
        </div>
        <FormField label="Region"><input style={inputStyle} value={region} onChange={e => setRegion(e.target.value)} placeholder="e.g. Northern Reaches" /></FormField>
        <FormField label="Description"><MarkdownEditor value={description} onChange={setDescription} placeholder="What is this place like?" minHeight="100px" /></FormField>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="text-sm px-4 py-2 rounded font-semibold" style={{ backgroundColor: '#a07830', color: '#e8dcc4', border: 'none', cursor: 'pointer', fontFamily: 'var(--serif)' }} onClick={handleCreate} disabled={!name.trim() || saving}>{saving ? 'Creating…' : 'Create Location'}</button>
          <button className="text-sm px-4 py-2 rounded" style={{ color: '#b9ac90', border: '1px solid #2e2820', background: 'none', cursor: 'pointer' }} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function LoreCreatePanel({ onCancel, onCreate }: {
  onCancel: () => void;
  onCreate: (l: Parameters<ReturnType<typeof useCampaign>['upsertLore']>[0]) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('history');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const CATEGORIES = ['history', 'artifact', 'creature', 'magic', 'religion'];

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onCreate({ title: title.trim(), category, content: content || null, dm_only: false });
    setSaving(false);
  };

  return (
    <div className="cm-detail">
      <div className="as-ey">Lore</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <FormField label="Title"><input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} autoFocus placeholder="Entry title" /></FormField>
          <FormField label="Category">
            <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </FormField>
        </div>
        <FormField label="Content"><MarkdownEditor value={content} onChange={setContent} placeholder="What does this lore entry describe?" minHeight="120px" /></FormField>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="text-sm px-4 py-2 rounded font-semibold" style={{ backgroundColor: '#a07830', color: '#e8dcc4', border: 'none', cursor: 'pointer', fontFamily: 'var(--serif)' }} onClick={handleCreate} disabled={!title.trim() || saving}>{saving ? 'Creating…' : 'Create Lore Entry'}</button>
          <button className="text-sm px-4 py-2 rounded" style={{ color: '#b9ac90', border: '1px solid #2e2820', background: 'none', cursor: 'pointer' }} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
