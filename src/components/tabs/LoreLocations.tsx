import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
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
  name: '',
  region: '',
  location_type: 'other',
  description: '',
  history: '',
  status: null,
});

const typeColors: Record<string, string> = {
  city:       '#2a5a7a',
  town:       '#2a5a4a',
  dungeon:    '#6a2a2a',
  faction_hq: '#4a3080',
  landmark:   '#2a4a6a',
  other:      '#3a3a4a',
};

function formatType(t: string) {
  return t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function LoreLocations() {
  const { locations, upsertLocation, deleteLocation } = useCampaign();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [form, setForm] = useState<LocationForm>(emptyForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const filtered = locations.filter(loc => {
    if (filterType !== 'all' && loc.location_type !== filterType) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      loc.name.toLowerCase().includes(q) ||
      (loc.description ?? '').toLowerCase().includes(q) ||
      (loc.history ?? '').toLowerCase().includes(q)
    );
  });

  const openAdd = () => {
    setEditingLocation(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (loc: Location) => {
    setEditingLocation(loc);
    setForm({
      name: loc.name,
      region: loc.region,
      location_type: loc.location_type,
      description: loc.description,
      history: loc.history,
      status: loc.status,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    await upsertLocation({
      ...(editingLocation ? { id: editingLocation.id } : {}),
      ...form,
      population: editingLocation?.population ?? null,
      dm_notes: editingLocation?.dm_notes ?? null,
    });
    setModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this location?')) {
      await deleteLocation(id);
      if (expandedId === id) setExpandedId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold" style={{ color: '#c9a84c', fontFamily: 'Georgia, serif' }}>
          Lore & Locations
        </h2>
        <button
          onClick={openAdd}
          className="px-4 py-2 rounded text-sm font-semibold transition-colors"
          style={{ backgroundColor: '#a07830', color: '#e8d5b0' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#c9a84c')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#a07830')}
        >
          + Add Location
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search locations..."
          style={{ ...inputStyle, maxWidth: '280px' }}
        />
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          style={{ ...inputStyle, maxWidth: '160px' }}
        >
          <option value="all">All Types</option>
          {LOCATION_TYPES.map(t => (
            <option key={t} value={t}>{formatType(t)}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#6a6490' }}>
          {search || filterType !== 'all' ? 'No locations match your filters.' : 'No locations yet. Add your first location!'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(loc => {
            const color = typeColors[loc.location_type ?? 'other'] ?? typeColors.other;
            return (
              <div
                key={loc.id}
                className="rounded-lg border flex flex-col"
                style={{ backgroundColor: '#1a1828', borderColor: '#3a3660' }}
              >
                <div
                  className="p-4 cursor-pointer flex-1"
                  onClick={() => setExpandedId(expandedId === loc.id ? null : loc.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 pr-2">
                      <h3 className="font-bold text-lg" style={{ color: '#e8d5b0', fontFamily: 'Georgia, serif' }}>
                        {loc.name || 'Unnamed Location'}
                      </h3>
                      {loc.region && (
                        <div className="text-xs mt-0.5" style={{ color: '#6a6490' }}>{loc.region}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {loc.location_type && (
                        <span
                          className="text-xs px-2 py-0.5 rounded"
                          style={{ backgroundColor: color + 'aa', color: '#e8d5b0' }}
                        >
                          {formatType(loc.location_type)}
                        </span>
                      )}
                      <span className="text-xs ml-1" style={{ color: '#6a6490' }}>
                        {expandedId === loc.id ? '▲' : '▼'}
                      </span>
                    </div>
                  </div>

                  {loc.description && (
                    <p className="text-sm mt-2" style={{ color: '#c9b88a', lineHeight: '1.5' }}>
                      {expandedId === loc.id
                        ? loc.description
                        : loc.description.substring(0, 120) + (loc.description.length > 120 ? '...' : '')}
                    </p>
                  )}

                  {expandedId === loc.id && loc.history && (
                    <div className="mt-4 pt-4 border-t" style={{ borderColor: '#3a3660' }}>
                      <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#c9a84c' }}>
                        Lore & History
                      </div>
                      <p className="text-sm" style={{ color: '#e8d5b0', lineHeight: '1.6' }}>{loc.history}</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 p-3 pt-0">
                  <button
                    onClick={() => openEdit(loc)}
                    className="text-xs px-2 py-1 rounded flex-1 transition-colors"
                    style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(loc.id)}
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={{ backgroundColor: '#22203a', color: '#e05c5c', border: '1px solid #3a3660' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingLocation ? 'Edit Location' : 'New Location'}
        onSave={handleSave}
        wide
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Name">
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., The Forgotten Vale"
              style={inputStyle}
            />
          </FormField>
          <FormField label="Type">
            <select
              value={form.location_type ?? 'other'}
              onChange={e => setForm(prev => ({ ...prev, location_type: e.target.value }))}
              style={inputStyle}
            >
              {LOCATION_TYPES.map(t => (
                <option key={t} value={t}>{formatType(t)}</option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label="Region">
          <input
            type="text"
            value={form.region ?? ''}
            onChange={e => setForm(prev => ({ ...prev, region: e.target.value }))}
            placeholder="e.g., The Northern Reaches"
            style={inputStyle}
          />
        </FormField>
        <FormField label="Description">
          <textarea
            value={form.description ?? ''}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            placeholder="What does this place look like? Who lives here? What is it known for?"
            style={{ ...textareaStyle, minHeight: '80px' }}
          />
        </FormField>
        <FormField label="Lore & History">
          <textarea
            value={form.history ?? ''}
            onChange={e => setForm(prev => ({ ...prev, history: e.target.value }))}
            placeholder="Historical events, ancient secrets, myths, and legends..."
            style={{ ...textareaStyle, minHeight: '120px' }}
          />
        </FormField>
      </Modal>
    </div>
  );
}
