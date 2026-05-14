import { useState, useMemo } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { ListDetail, ListRow, DetailPanel, DetailSection, Pill, FilterSep, EmptyDetail } from '../ui/ListDetail';
import { MarkdownContent } from '../ui/MarkdownContent';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../Modal';
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

  // Create modals
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [loreModalOpen, setLoreModalOpen] = useState(false);

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
      setLoreModalOpen(true);
    } else {
      setLocationModalOpen(true);
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
          ) : (
            <EmptyDetail>Select an entry from the list</EmptyDetail>
          )
        }
      />

      {locationModalOpen && (
        <LocationCreateModal onClose={() => setLocationModalOpen(false)} />
      )}
      {loreModalOpen && (
        <LoreCreateModal onClose={() => setLoreModalOpen(false)} />
      )}
    </>
  );
}

/* ── Location Detail ── */

function LocationDetail({ location, onDelete }: { location: Location; onDelete: () => void }) {
  return (
    <DetailPanel
      eyebrow="Location"
      title={location.name}
      subtitle={[formatType(location.location_type), location.region].filter(Boolean).join(' · ')}
    >
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {location.status && (
          <Badge color={location.status === 'active' ? 'green' : location.status === 'destroyed' ? 'red' : 'gold'}>
            {location.status}
          </Badge>
        )}
        {location.population && (
          <span style={{ fontSize: '13px', color: 'var(--ink-3)' }}>Pop. {location.population}</span>
        )}
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onClick={onDelete}>Delete</Button>
      </div>

      {location.description && (
        <DetailSection title="Description">
          <MarkdownContent content={location.description} />
        </DetailSection>
      )}

      {location.history && (
        <DetailSection title="History">
          <MarkdownContent content={location.history} />
        </DetailSection>
      )}

      {location.dm_notes && (
        <DetailSection title="DM Notes">
          <MarkdownContent content={location.dm_notes} />
        </DetailSection>
      )}
    </DetailPanel>
  );
}

/* ── Lore Detail ── */

function LoreDetail({ entry, onDelete }: { entry: LoreEntry; onDelete: () => void }) {
  return (
    <DetailPanel
      eyebrow="Lore"
      title={entry.title}
      subtitle={entry.category ? entry.category.charAt(0).toUpperCase() + entry.category.slice(1) : undefined}
    >
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {entry.dm_only && <Badge color="gold">DM Only</Badge>}
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onClick={onDelete}>Delete</Button>
      </div>

      {entry.content && (
        <DetailSection title="Content">
          <MarkdownContent content={entry.content} />
        </DetailSection>
      )}
    </DetailPanel>
  );
}

/* ── Quick Create Modals ── */

function LocationCreateModal({ onClose }: { onClose: () => void }) {
  const { upsertLocation } = useCampaign();
  const [name, setName] = useState('');
  const [locationType, setLocationType] = useState('other');
  const [region, setRegion] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    await upsertLocation({
      name: name.trim(),
      region: region || null,
      location_type: locationType,
      population: null,
      status: 'active',
      description: null,
      history: null,
      dm_notes: null,
    });
    onClose();
  };

  return (
    <Modal title="New Location" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <FormField label="Name">
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} autoFocus />
        </FormField>
        <FormField label="Type">
          <select style={inputStyle} value={locationType} onChange={e => setLocationType(e.target.value)}>
            {LOCATION_TYPES.map(t => (
              <option key={t} value={t}>{formatType(t)}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Region">
          <input style={inputStyle} value={region} onChange={e => setRegion(e.target.value)} placeholder="e.g. Northern Reaches" />
        </FormField>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!name.trim()}>Create</Button>
        </div>
      </div>
    </Modal>
  );
}

function LoreCreateModal({ onClose }: { onClose: () => void }) {
  const { upsertLore } = useCampaign();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('history');

  const CATEGORIES = ['history', 'artifact', 'creature', 'magic', 'religion'];

  const handleCreate = async () => {
    if (!title.trim()) return;
    await upsertLore({
      title: title.trim(),
      category,
      content: null,
      dm_only: false,
    });
    onClose();
  };

  return (
    <Modal title="New Lore Entry" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <FormField label="Title">
          <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        </FormField>
        <FormField label="Category">
          <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </FormField>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!title.trim()}>Create</Button>
        </div>
      </div>
    </Modal>
  );
}
