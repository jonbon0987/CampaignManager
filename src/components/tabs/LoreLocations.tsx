import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import type { Location } from '../../types';

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

const LOCATION_TYPES: Location['type'][] = [
  'region', 'city', 'town', 'dungeon', 'building', 'landmark', 'wilderness', 'other'
];

const emptyLocation = (): Omit<Location, 'id'> => ({
  name: '',
  type: 'other',
  description: '',
  lore: '',
  currentInfo: '',
});

const typeColors: Record<Location['type'], string> = {
  region:     '#4a3080',
  city:       '#2a5a7a',
  town:       '#2a5a4a',
  dungeon:    '#6a2a2a',
  building:   '#4a4a2a',
  landmark:   '#2a4a6a',
  wilderness: '#2a5a3a',
  other:      '#3a3a4a',
};

export default function LoreLocations() {
  const { data, setData } = useCampaign();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [form, setForm] = useState(emptyLocation());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<Location['type'] | 'all'>('all');

  const filtered = data.locations.filter(loc => {
    if (filterType !== 'all' && loc.type !== filterType) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      loc.name.toLowerCase().includes(q) ||
      loc.description.toLowerCase().includes(q) ||
      loc.lore.toLowerCase().includes(q)
    );
  });

  const openAdd = () => {
    setEditingLocation(null);
    setForm(emptyLocation());
    setModalOpen(true);
  };

  const openEdit = (loc: Location) => {
    setEditingLocation(loc);
    setForm({
      name: loc.name,
      type: loc.type,
      description: loc.description,
      lore: loc.lore,
      currentInfo: loc.currentInfo,
    });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (editingLocation) {
      setData(prev => ({
        ...prev,
        locations: prev.locations.map(loc => loc.id === editingLocation.id ? { ...loc, ...form } : loc),
      }));
    } else {
      setData(prev => ({
        ...prev,
        locations: [...prev.locations, { id: generateId(), ...form }],
      }));
    }
    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this location?')) {
      setData(prev => ({ ...prev, locations: prev.locations.filter(loc => loc.id !== id) }));
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
          onChange={e => setFilterType(e.target.value as Location['type'] | 'all')}
          style={{ ...inputStyle, maxWidth: '160px' }}
        >
          <option value="all">All Types</option>
          {LOCATION_TYPES.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#6a6490' }}>
          {search || filterType !== 'all' ? 'No locations match your filters.' : 'No locations yet. Add your first location!'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(loc => (
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
                  <h3 className="font-bold text-lg flex-1 pr-2" style={{ color: '#e8d5b0', fontFamily: 'Georgia, serif' }}>
                    {loc.name || 'Unnamed Location'}
                  </h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className="text-xs px-2 py-0.5 rounded capitalize"
                      style={{ backgroundColor: typeColors[loc.type] + 'aa', color: '#e8d5b0' }}
                    >
                      {loc.type}
                    </span>
                    <span className="text-xs ml-1" style={{ color: '#6a6490' }}>
                      {expandedId === loc.id ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {loc.description && (
                  <p className="text-sm mt-2" style={{ color: '#c9b88a', lineHeight: '1.5' }}>
                    {expandedId === loc.id ? loc.description : loc.description.substring(0, 120) + (loc.description.length > 120 ? '...' : '')}
                  </p>
                )}

                {expandedId === loc.id && (
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: '#3a3660' }}>
                    {loc.lore && (
                      <div className="mb-3">
                        <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#c9a84c' }}>Lore & History</div>
                        <p className="text-sm" style={{ color: '#e8d5b0', lineHeight: '1.6' }}>{loc.lore}</p>
                      </div>
                    )}
                    {loc.currentInfo && (
                      <div className="mb-3">
                        <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#c9a84c' }}>Current Information</div>
                        <p className="text-sm" style={{ color: '#e8d5b0', lineHeight: '1.6' }}>{loc.currentInfo}</p>
                      </div>
                    )}
                    {!loc.lore && !loc.currentInfo && (
                      <p className="text-sm" style={{ color: '#6a6490', fontStyle: 'italic' }}>No lore or current information recorded.</p>
                    )}
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
          ))}
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
              value={form.type}
              onChange={e => setForm(prev => ({ ...prev, type: e.target.value as Location['type'] }))}
              style={inputStyle}
            >
              {LOCATION_TYPES.map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label="Description">
          <textarea
            value={form.description}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            placeholder="What does this place look like? Who lives here? What is it known for?"
            style={{ ...textareaStyle, minHeight: '80px' }}
          />
        </FormField>
        <FormField label="Lore & History">
          <textarea
            value={form.lore}
            onChange={e => setForm(prev => ({ ...prev, lore: e.target.value }))}
            placeholder="Historical events, ancient secrets, myths, and legends..."
            style={{ ...textareaStyle, minHeight: '120px' }}
          />
        </FormField>
        <FormField label="Current Information">
          <textarea
            value={form.currentInfo}
            onChange={e => setForm(prev => ({ ...prev, currentInfo: e.target.value }))}
            placeholder="What is currently happening here? Active plot points, recent events..."
            style={{ ...textareaStyle, minHeight: '100px' }}
          />
        </FormField>
      </Modal>
    </div>
  );
}
