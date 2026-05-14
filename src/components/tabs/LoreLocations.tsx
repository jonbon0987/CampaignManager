import { useState, useMemo } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { ListDetail, ListRow, DetailPanel, DetailSection, Pill, EmptyDetail } from '../ui/ListDetail';
import { MarkdownContent } from '../ui/MarkdownContent';
import { MarkdownEditor } from '../ui/MarkdownEditor';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { FormField, inputStyle } from '../FormField';
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
          selected ? (
            selected.kind === 'location' ? (
              <LocationDetail
                location={selected.raw as Location}
                onDelete={async () => {
                  const yes = await confirm('Delete this location?', 'This cannot be undone.');
                  if (yes) { await deleteLocation(selected.id); setSelectedId(null); }
                }}
              />
            ) : (
              <LoreDetail
                entry={selected.raw as LoreEntry}
                onDelete={async () => {
                  const yes = await confirm('Delete this lore entry?', 'This cannot be undone.');
                  if (yes) { await deleteLore(selected.id); setSelectedId(null); }
                }}
              />
            )
          ) : creating === 'location' ? (
            <LocationCreatePanel
              onCancel={() => setCreating(null)}
              onCreate={async (loc) => { await upsertLocation(loc); setCreating(null); }}
            />
          ) : creating === 'lore' ? (
            <LoreCreatePanel
              onCancel={() => setCreating(null)}
              onCreate={async (l) => { await upsertLore(l); setCreating(null); }}
            />
          ) : (
            <EmptyDetail>Select an entry from the list</EmptyDetail>
          )
        }
      />
    </>
  );
}

/* ── Location Detail ── */

function LocationDetail({ location, onDelete }: { location: Location; onDelete: () => void }) {
  const { upsertLocation } = useCampaign();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Location>>({});
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setForm({ name: location.name, region: location.region, location_type: location.location_type, population: location.population, status: location.status, description: location.description, history: location.history, dm_notes: location.dm_notes });
    setEditing(true);
  };
  const save = async () => {
    setSaving(true);
    await upsertLocation({ id: location.id, name: form.name || location.name, ...form });
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <DetailPanel eyebrow="Location" title="Editing" subtitle={form.name || location.name}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Name"><input style={inputStyle} value={form.name ?? ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></FormField>
            <FormField label="Type">
              <select style={inputStyle} value={form.location_type ?? 'other'} onChange={e => setForm(p => ({ ...p, location_type: e.target.value }))}>
                {LOCATION_TYPES.map(t => <option key={t} value={t}>{formatType(t)}</option>)}
              </select>
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Region"><input style={inputStyle} value={form.region ?? ''} onChange={e => setForm(p => ({ ...p, region: e.target.value || null }))} placeholder="e.g. Northern Reaches" /></FormField>
            <FormField label="Population"><input style={inputStyle} value={form.population ?? ''} onChange={e => setForm(p => ({ ...p, population: e.target.value || null }))} placeholder="e.g. ~12,000" /></FormField>
          </div>
          <FormField label="Status">
            <select style={inputStyle} value={form.status ?? 'active'} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
              <option value="active">Active</option><option value="destroyed">Destroyed</option><option value="unknown">Unknown</option><option value="compromised">Compromised</option>
            </select>
          </FormField>
          <FormField label="Description"><MarkdownEditor value={form.description ?? ''} onChange={v => setForm(p => ({ ...p, description: v || null }))} placeholder="Describe this place..." minHeight="100px" /></FormField>
          <FormField label="History"><MarkdownEditor value={form.history ?? ''} onChange={v => setForm(p => ({ ...p, history: v || null }))} placeholder="Historical events..." minHeight="80px" /></FormField>
          <FormField label="DM Notes"><MarkdownEditor value={form.dm_notes ?? ''} onChange={v => setForm(p => ({ ...p, dm_notes: v || null }))} placeholder="Private DM notes..." minHeight="60px" /></FormField>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="primary" size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      </DetailPanel>
    );
  }

  return (
    <DetailPanel eyebrow="Location" title={location.name} subtitle={[formatType(location.location_type), location.region].filter(Boolean).join(' · ')}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {location.status && (
          <Badge color={location.status === 'active' ? 'green' : location.status === 'destroyed' ? 'red' : 'gold'}>{location.status}</Badge>
        )}
        {location.population && <span style={{ fontSize: '13px', color: 'var(--ink-3)' }}>Pop. {location.population}</span>}
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onClick={startEdit}>Edit</Button>
        <Button variant="secondary" size="sm" onClick={onDelete}>Delete</Button>
      </div>
      {location.description && <DetailSection title="Description"><MarkdownContent content={location.description} /></DetailSection>}
      {location.history && <DetailSection title="History"><MarkdownContent content={location.history} /></DetailSection>}
      {location.dm_notes && <DetailSection title="DM Notes"><MarkdownContent content={location.dm_notes} /></DetailSection>}
    </DetailPanel>
  );
}

/* ── Lore Detail ── */

function LoreDetail({ entry, onDelete }: { entry: LoreEntry; onDelete: () => void }) {
  const { upsertLore } = useCampaign();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<LoreEntry>>({});
  const [saving, setSaving] = useState(false);
  const CATEGORIES = ['history', 'artifact', 'creature', 'magic', 'religion'];

  const startEdit = () => {
    setForm({ title: entry.title, category: entry.category, content: entry.content, dm_only: entry.dm_only });
    setEditing(true);
  };
  const save = async () => {
    setSaving(true);
    await upsertLore({ id: entry.id, title: form.title || entry.title, ...form });
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <DetailPanel eyebrow="Lore" title="Editing" subtitle={form.title || entry.title}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Title"><input style={inputStyle} value={form.title ?? ''} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></FormField>
            <FormField label="Category">
              <select style={inputStyle} value={form.category ?? 'history'} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="DM Only">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ink-2)', fontSize: '14px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.dm_only ?? false} onChange={e => setForm(p => ({ ...p, dm_only: e.target.checked }))} style={{ accentColor: 'var(--gold)' }} />
              Hidden from players
            </label>
          </FormField>
          <FormField label="Content"><MarkdownEditor value={form.content ?? ''} onChange={v => setForm(p => ({ ...p, content: v || null }))} placeholder="Lore content..." minHeight="180px" /></FormField>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="primary" size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      </DetailPanel>
    );
  }

  return (
    <DetailPanel eyebrow="Lore" title={entry.title} subtitle={entry.category ? entry.category.charAt(0).toUpperCase() + entry.category.slice(1) : undefined}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {entry.dm_only && <Badge color="gold">DM Only</Badge>}
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onClick={startEdit}>Edit</Button>
        <Button variant="secondary" size="sm" onClick={onDelete}>Delete</Button>
      </div>
      {entry.content && <DetailSection title="Content"><MarkdownContent content={entry.content} /></DetailSection>}
    </DetailPanel>
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
    <DetailPanel eyebrow="Location" title="New Location" subtitle="Fill in the details below">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
          <Button variant="primary" size="sm" onClick={handleCreate} disabled={!name.trim() || saving}>{saving ? 'Creating…' : 'Create Location'}</Button>
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </DetailPanel>
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
    <DetailPanel eyebrow="Lore" title="New Lore Entry" subtitle="Fill in the details below">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
          <Button variant="primary" size="sm" onClick={handleCreate} disabled={!title.trim() || saving}>{saving ? 'Creating…' : 'Create Lore Entry'}</Button>
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </DetailPanel>
  );
}
