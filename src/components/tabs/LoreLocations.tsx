import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import { SectionHeader } from '../ui/SectionHeader';
import { InlineEditCard } from '../ui/InlineEditCard';
import { SearchBar } from '../ui/SearchBar';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import type { Location } from '../../lib/database.types';

const LOCATION_TYPES = ['city', 'town', 'dungeon', 'faction_hq', 'landmark', 'other'] as const;

type LocationForm = {
  name: string;
  region: string | null;
  location_type: string | null;
  description: string | null;
  history: string | null;
  status: string | null;
};

const emptyForm = (): LocationForm => ({
  name: '', region: '', location_type: 'other', description: '', history: '', status: null,
});

const typeBadgeColor: Record<string, 'blue' | 'green' | 'red' | 'gold' | 'muted'> = {
  city: 'blue', town: 'green', dungeon: 'red', faction_hq: 'gold', landmark: 'blue', other: 'muted',
};

const typeColors: Record<string, string> = {
  city: '#2a5a7a', town: '#2a5a4a', dungeon: '#6a2a2a', faction_hq: '#4a3080', landmark: '#2a4a6a', other: '#3a3a4a',
};

function formatType(t: string) {
  return t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const inputEditStyle: React.CSSProperties = {
  backgroundColor: '#0f0e17', color: '#e8d5b0', border: '1px solid #3a3660',
  fontFamily: 'Georgia, Cambria, serif', fontSize: '0.875rem', borderRadius: '0.375rem',
  padding: '0.375rem 0.5rem', width: '100%',
};

const labelStyle: React.CSSProperties = {
  color: '#c9a84c', fontSize: '0.65rem', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.08em',
};

type ViewMode = 'campaign' | 'global';

export default function LoreLocations() {
  const {
    locations, globalLocations, linkedLocationIds,
    upsertLocation, deleteLocation, linkLocationToCampaign, unlinkLocationFromCampaign,
  } = useCampaign();

  const [viewMode, setViewMode] = useState<ViewMode>('campaign');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<LocationForm>(emptyForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<LocationForm | null>(null);
  const [saving, setSaving] = useState(false);

  const displayList = viewMode === 'campaign' ? locations : globalLocations;

  const filtered = displayList.filter(loc => {
    if (filterType !== 'all' && loc.location_type !== filterType) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return loc.name.toLowerCase().includes(q) || (loc.description ?? '').toLowerCase().includes(q);
  });

  const linkableGlobals = globalLocations.filter(
    l => !linkedLocationIds.includes(l.id) &&
    (linkSearch ? l.name.toLowerCase().includes(linkSearch.toLowerCase()) : true)
  );
  const alreadyLinkedCount = globalLocations.filter(l => linkedLocationIds.includes(l.id)).length;

  const openAdd = () => { setForm(emptyForm()); setModalOpen(true); };

  const handleCreate = async () => {
    await upsertLocation({ ...form, population: null, dm_notes: null }, viewMode);
    setModalOpen(false);
  };

  const startEdit = (loc: Location) => {
    setEditingId(loc.id);
    setEditForm({ name: loc.name, region: loc.region, location_type: loc.location_type, description: loc.description, history: loc.history, status: loc.status });
    setExpandedId(loc.id);
  };

  const cancelEdit = () => { setEditingId(null); setEditForm(null); };

  const saveEdit = async () => {
    if (!editForm || !editingId) return;
    const loc = displayList.find(l => l.id === editingId);
    if (!loc) return;
    const scope = loc.campaign_id === null ? 'global' : 'campaign';
    setSaving(true);
    await upsertLocation({
      id: editingId, ...editForm,
      population: loc.population, dm_notes: loc.dm_notes,
    }, scope);
    setSaving(false);
    cancelEdit();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this location?')) {
      await deleteLocation(id);
      if (expandedId === id) setExpandedId(null);
      if (editingId === id) cancelEdit();
    }
  };

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px', borderRadius: '6px', fontSize: '13px',
    fontWeight: active ? 600 : 400, cursor: 'pointer', border: 'none',
    backgroundColor: active ? '#2a2840' : 'transparent',
    color: active ? '#c9a84c' : '#9990b0', transition: 'all 0.15s',
  });

  return (
    <div>
      <SectionHeader
        title="Lore & Locations"
        onAdd={openAdd}
        addLabel="Add Location"
        extra={
          viewMode === 'campaign' ? (
            <Button variant="secondary" size="sm" onClick={() => setLinkPickerOpen(true)}>Link Global Location</Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: '#12111e' }}>
          <button style={pillStyle(viewMode === 'campaign')} onClick={() => setViewMode('campaign')}>This Campaign</button>
          <button style={pillStyle(viewMode === 'global')} onClick={() => setViewMode('global')}>Global Pool</button>
        </div>
        <div style={{ width: '200px' }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search locations…" />
        </div>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="text-sm rounded px-2 py-1.5 outline-none"
          style={{ backgroundColor: '#1a1828', color: '#e8d5b0', border: '1px solid #3a3660', fontFamily: 'Georgia, Cambria, serif' }}
        >
          <option value="all">All Types</option>
          {LOCATION_TYPES.map(t => (<option key={t} value={t}>{formatType(t)}</option>))}
        </select>
      </div>

      {viewMode === 'global' && (
        <p className="text-xs mb-4" style={{ color: '#6a6490' }}>
          Global locations are available across all campaigns.
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          message={search || filterType !== 'all' ? 'No locations match your filters.' : viewMode === 'campaign' ? 'No locations in this campaign yet.' : 'No global locations yet.'}
          onAdd={!search && filterType === 'all' ? openAdd : undefined}
          addLabel="Add Location"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(loc => {
            const isEditing = editingId === loc.id;
            const isExpanded = expandedId === loc.id;
            const isGlobal = loc.campaign_id === null;
            const isLinked = isGlobal && linkedLocationIds.includes(loc.id);

            return (
              <InlineEditCard
                key={loc.id}
                isEditing={isEditing}
                onSave={saveEdit}
                onCancel={cancelEdit}
                onDelete={() => handleDelete(loc.id)}
                saving={saving}
              >
                {isEditing && editForm ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block mb-1" style={labelStyle}>Name</label>
                        <input type="text" value={editForm.name} onChange={e => setEditForm(prev => prev ? { ...prev, name: e.target.value } : prev)} autoFocus style={inputEditStyle} />
                      </div>
                      <div>
                        <label className="block mb-1" style={labelStyle}>Type</label>
                        <select value={editForm.location_type ?? 'other'} onChange={e => setEditForm(prev => prev ? { ...prev, location_type: e.target.value } : prev)} style={inputEditStyle}>
                          {LOCATION_TYPES.map(t => (<option key={t} value={t}>{formatType(t)}</option>))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block mb-1" style={labelStyle}>Region</label>
                      <input type="text" value={editForm.region ?? ''} onChange={e => setEditForm(prev => prev ? { ...prev, region: e.target.value } : prev)} style={inputEditStyle} />
                    </div>
                    <div>
                      <label className="block mb-1" style={labelStyle}>Description</label>
                      <textarea value={editForm.description ?? ''} onChange={e => setEditForm(prev => prev ? { ...prev, description: e.target.value } : prev)} rows={3} className="w-full resize-y outline-none" style={{ ...inputEditStyle, minHeight: '60px' }} />
                    </div>
                    <div>
                      <label className="block mb-1" style={labelStyle}>Lore & History</label>
                      <textarea value={editForm.history ?? ''} onChange={e => setEditForm(prev => prev ? { ...prev, history: e.target.value } : prev)} rows={3} className="w-full resize-y outline-none" style={{ ...inputEditStyle, minHeight: '60px' }} />
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : loc.id)}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 pr-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold" style={{ color: '#e8d5b0', fontFamily: 'Georgia, Cambria, serif' }}>{loc.name || 'Unnamed'}</h3>
                            {isGlobal && <Badge label="Global" color="blue" size="xs" />}
                          </div>
                          {loc.region && <div className="text-xs mt-0.5" style={{ color: '#6a6490' }}>{loc.region}</div>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {loc.location_type && <Badge label={formatType(loc.location_type)} color={typeBadgeColor[loc.location_type] ?? 'muted'} size="xs" />}
                          <span className="text-xs ml-1" style={{ color: '#6a6490' }}>{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </div>
                      {loc.description && (
                        <p className="text-sm mt-2" style={{ color: '#c9b88a', lineHeight: '1.5' }}>
                          {isExpanded ? loc.description : loc.description.substring(0, 120) + (loc.description.length > 120 ? '…' : '')}
                        </p>
                      )}
                      {isExpanded && loc.history && (
                        <div className="mt-4 pt-4 border-t" style={{ borderColor: '#3a3660' }}>
                          <div className="mb-1" style={labelStyle}>Lore & History</div>
                          <p className="text-sm" style={{ color: '#c9b88a', lineHeight: '1.6' }}>{loc.history}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: '1px solid #2e2c4a' }}>
                      <Button variant="ghost" size="sm" onClick={() => startEdit(loc)} title="Edit"><Pencil size={12} strokeWidth={1.5} /></Button>
                      {viewMode === 'campaign' && isLinked ? (
                        <Button variant="secondary" size="sm" onClick={() => { if (confirm('Remove from campaign?')) unlinkLocationFromCampaign(loc.id); }}>Unlink</Button>
                      ) : viewMode === 'global' && !isLinked ? (
                        <Button variant="secondary" size="sm" onClick={() => linkLocationToCampaign(loc.id)} style={{ color: '#4caf7d' }}>Add to Campaign</Button>
                      ) : viewMode === 'global' && isLinked ? (
                        <Button variant="secondary" size="sm" onClick={() => { if (confirm('Remove from campaign?')) unlinkLocationFromCampaign(loc.id); }} style={{ color: '#4ab8d4' }}>In Campaign ✓</Button>
                      ) : (
                        <Button variant="danger" size="sm" onClick={() => handleDelete(loc.id)}>Delete</Button>
                      )}
                    </div>
                  </div>
                )}
              </InlineEditCard>
            );
          })}
        </div>
      )}

      {/* Link picker modal */}
      <Modal isOpen={linkPickerOpen} onClose={() => { setLinkPickerOpen(false); setLinkSearch(''); }} title="Link Global Location" onSave={undefined} wide>
        <p className="text-sm mb-3" style={{ color: '#9990b0' }}>
          Select global locations to add.{alreadyLinkedCount > 0 && ` (${alreadyLinkedCount} already linked)`}
        </p>
        <input type="text" value={linkSearch} onChange={e => setLinkSearch(e.target.value)} placeholder="Search…" style={{ ...inputStyle, marginBottom: '12px' }} />
        {linkableGlobals.length === 0 ? (
          <div className="text-center py-8" style={{ color: '#6a6490' }}>{linkSearch ? 'No matches.' : 'All already linked.'}</div>
        ) : (
          <div className="flex flex-col gap-2" style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {linkableGlobals.map(loc => {
              const color = typeColors[loc.location_type ?? 'other'] ?? typeColors.other;
              return (
                <div key={loc.id} className="flex items-center justify-between p-3 rounded-lg border" style={{ backgroundColor: '#12111e', borderColor: '#3a3660' }}>
                  <div>
                    <span className="font-semibold text-sm" style={{ color: '#e8d5b0' }}>{loc.name}</span>
                    {loc.region && <span className="text-xs ml-2" style={{ color: '#9990b0' }}>{loc.region}</span>}
                    {loc.location_type && <span className="text-xs ml-2 px-1.5 py-0.5 rounded" style={{ backgroundColor: color + 'aa', color: '#e8d5b0' }}>{formatType(loc.location_type)}</span>}
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => linkLocationToCampaign(loc.id)} style={{ color: '#4caf7d' }}>+ Add</Button>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* Create-only modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={viewMode === 'global' ? 'New Global Location' : 'New Location'} onSave={handleCreate} wide>
        {viewMode === 'global' && <p className="text-xs mb-4" style={{ color: '#6a6490' }}>Creating a Global Location — available across all campaigns.</p>}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Name"><input type="text" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., The Forgotten Vale" style={inputStyle} /></FormField>
          <FormField label="Type">
            <select value={form.location_type ?? 'other'} onChange={e => setForm(prev => ({ ...prev, location_type: e.target.value }))} style={inputStyle}>
              {LOCATION_TYPES.map(t => (<option key={t} value={t}>{formatType(t)}</option>))}
            </select>
          </FormField>
        </div>
        <FormField label="Region"><input type="text" value={form.region ?? ''} onChange={e => setForm(prev => ({ ...prev, region: e.target.value }))} placeholder="e.g., The Northern Reaches" style={inputStyle} /></FormField>
        <FormField label="Description"><textarea value={form.description ?? ''} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} placeholder="What does this place look like?" style={{ ...textareaStyle, minHeight: '80px' }} /></FormField>
        <FormField label="Lore & History"><textarea value={form.history ?? ''} onChange={e => setForm(prev => ({ ...prev, history: e.target.value }))} placeholder="Historical events, ancient secrets…" style={{ ...textareaStyle, minHeight: '120px' }} /></FormField>
      </Modal>
    </div>
  );
}
