import { useState } from 'react';
import { SlashField } from '../ui/SlashField';
import { limitFor } from '../../lib/fieldLimits';
import { Pencil, Eye } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import { SectionHeader } from '../ui/SectionHeader';
import { SearchBar } from '../ui/SearchBar';
import { InlineEditCard } from '../ui/InlineEditCard';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { MarkdownContent } from '../ui/MarkdownContent';
import { factionTypeColors } from '../../lib/theme';
import type { Faction } from '../../lib/database.types';

const FACTION_TYPES = ['guild', 'government', 'religious', 'criminal', 'military', 'arcane', 'merchant', 'other'] as const;
type FactionType = (typeof FACTION_TYPES)[number];

type FactionForm = {
  name: string;
  faction_type: string | null;
  overview: string | null;
  key_figures: string | null;
  agenda: string | null;
  dm_notes: string | null;
};

const emptyForm = (): FactionForm => ({
  name: '',
  faction_type: 'guild',
  overview: '',
  key_figures: '',
  agenda: '',
  dm_notes: null,
});

const typeColors = factionTypeColors as Record<FactionType, { bg: string; text: string; border: string }>;

const typeBadgeColor: Record<FactionType, 'gold' | 'blue' | 'yellow' | 'red' | 'green' | 'orange' | 'muted'> = {
  guild:      'gold',
  government: 'blue',
  religious:  'yellow',
  criminal:   'red',
  military:   'green',
  arcane:     'muted',
  merchant:   'orange',
  other:      'muted',
};

function formatType(t: string | null) {
  if (!t) return 'Other';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function Factions() {
  const { factions, upsertFaction, deleteFaction } = useCampaign();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<FactionType | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FactionForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FactionForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = factions
    .filter(f => {
      if (filterType !== 'all' && f.faction_type !== filterType) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        f.name.toLowerCase().includes(q) ||
        (f.overview ?? '').toLowerCase().includes(q) ||
        (f.key_figures ?? '').toLowerCase().includes(q) ||
        (f.agenda ?? '').toLowerCase().includes(q) ||
        (f.faction_type ?? '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const openAdd = () => {
    setForm(emptyForm());
    setModalOpen(true);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    await upsertFaction({
      name: form.name,
      faction_type: form.faction_type,
      overview: form.overview,
      key_figures: form.key_figures,
      agenda: form.agenda,
      dm_notes: form.dm_notes,
    });
    setModalOpen(false);
  };

  const startEdit = (f: Faction) => {
    setEditingId(f.id);
    setEditForm({
      name: f.name,
      faction_type: f.faction_type,
      overview: f.overview,
      key_figures: f.key_figures,
      agenda: f.agenda,
      dm_notes: f.dm_notes,
    });
    setExpandedId(f.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const saveEdit = async () => {
    if (!editForm || !editingId) return;
    setSaving(true);
    await upsertFaction({
      id: editingId,
      name: editForm.name,
      faction_type: editForm.faction_type,
      overview: editForm.overview,
      key_figures: editForm.key_figures,
      agenda: editForm.agenda,
      dm_notes: editForm.dm_notes,
    });
    setSaving(false);
    cancelEdit();
  };

  const handleDelete = async (id: string) => {
    if (await confirm('Delete this faction?')) {
      await deleteFaction(id);
      if (editingId === id) cancelEdit();
      if (expandedId === id) setExpandedId(null);
    }
  };

  return (
    <div>
      <SectionHeader
        title="Factions"
        subtitle={`${factions.length} faction${factions.length !== 1 ? 's' : ''}`}
        onAdd={openAdd}
        addLabel="Add Faction"
        extra={
          <div className="flex flex-wrap gap-2 items-center">
            <div style={{ width: '200px' }}>
              <SearchBar value={search} onChange={setSearch} placeholder="Search factions…" />
            </div>
            <div className="flex gap-1 flex-wrap">
              {(['all', ...FACTION_TYPES] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className="text-xs px-2.5 py-1 rounded transition-colors"
                  style={{
                    backgroundColor: filterType === t ? 'var(--rule)' : 'var(--paper-2)',
                    color: filterType === t ? 'var(--ink)' : 'var(--ink-2)',
                    border: '1px solid var(--rule)',
                  }}
                >
                  {t === 'all' ? 'All' : formatType(t)}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          message={factions.length === 0 ? 'No factions yet. Add organizations, guilds, and power groups!' : 'No factions match the current filters.'}
          onAdd={factions.length === 0 ? openAdd : undefined}
          addLabel="Add Faction"
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(faction => {
            const isEditing = editingId === faction.id;
            const isExpanded = expandedId === faction.id;
            const badgeColor = typeBadgeColor[faction.faction_type as FactionType] ?? 'muted';

            return (
              <div
                key={faction.id}
                data-entity-id={faction.id}
                className="rounded-lg border overflow-hidden transition-colors duration-150"
                style={{
                  backgroundColor: 'var(--paper)',
                  borderColor: isEditing ? 'var(--gold)' : 'var(--rule)',
                }}
              >
                {/* Header row */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer"
                  style={{ borderBottom: isExpanded ? '1px solid var(--rule)' : 'none' }}
                  onClick={() => {
                    if (!isEditing) setExpandedId(isExpanded ? null : faction.id);
                  }}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <h3 className="font-bold text-sm truncate" style={{ color: 'var(--ink)', fontFamily: 'var(--serif)' }}>
                      {faction.name}
                    </h3>
                    <Badge label={formatType(faction.faction_type)} color={badgeColor} size="xs" />
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    {!isEditing && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={e => { e.stopPropagation(); startEdit(faction); }}
                        title="Edit"
                      >
                        <Pencil size={12} strokeWidth={1.5} />
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={e => { e.stopPropagation(); handleDelete(faction.id); }}
                    >
                      ×
                    </Button>
                    <span className="text-xs ml-1" style={{ color: 'var(--ink-3)' }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="p-4">
                    {isEditing && editForm ? (
                      <div className="flex flex-col gap-3">
                        <div>
                          <label className="block text-xs mb-1" style={{ color: 'var(--gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.65rem' }}>
                            Name
                          </label>
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={e => setEditForm(prev => prev ? { ...prev, name: e.target.value } : prev)}
                            autoFocus
                            className="w-full px-2 py-1.5 rounded text-sm outline-none"
                            style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--rule)', fontFamily: 'var(--serif)' }}
                          />
                        </div>
                        <div>
                          <label className="block text-xs mb-1" style={{ color: 'var(--gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.65rem' }}>
                            Type
                          </label>
                          <div className="flex gap-1 flex-wrap">
                            {FACTION_TYPES.map(t => (
                              <button
                                key={t}
                                onClick={() => setEditForm(prev => prev ? { ...prev, faction_type: t } : prev)}
                                className="text-xs px-3 py-1 rounded transition-colors"
                                style={{
                                  backgroundColor: editForm.faction_type === t ? typeColors[t].bg : 'var(--paper-2)',
                                  color: typeColors[t].text,
                                  border: `1px solid ${typeColors[t].border}`,
                                  fontWeight: editForm.faction_type === t ? 600 : 400,
                                }}
                              >
                                {formatType(t)}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs mb-1" style={{ color: 'var(--gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.65rem' }}>
                            Overview
                          </label>
                          <SlashField value={editForm.overview ?? ''} onChange={v => setEditForm(prev => prev ? { ...prev, overview: v || null } : prev)} placeholder="Describe this faction's purpose, history, and public face…" minHeight="100px" maxLength={limitFor('factions', 'overview')} />
                        </div>
                        <div>
                          <label className="block text-xs mb-1" style={{ color: 'var(--gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.65rem' }}>
                            Key Figures
                          </label>
                          <SlashField value={editForm.key_figures ?? ''} onChange={v => setEditForm(prev => prev ? { ...prev, key_figures: v || null } : prev)} placeholder="Notable members, leaders, agents…" minHeight="60px" maxLength={limitFor('factions', 'key_figures')} />
                        </div>
                        <div>
                          <label className="block text-xs mb-1" style={{ color: 'var(--gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.65rem' }}>
                            Agenda
                          </label>
                          <SlashField value={editForm.agenda ?? ''} onChange={v => setEditForm(prev => prev ? { ...prev, agenda: v || null } : prev)} placeholder="Goals, plans, and public agenda…" minHeight="60px" maxLength={limitFor('factions', 'agenda')} />
                        </div>
                        <div
                          className="rounded border p-3"
                          style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--bg-2)' }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <Eye size={12} strokeWidth={1.8} style={{ color: 'var(--accent)' }} />
                            <label className="text-xs font-medium" style={{ color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.65rem' }}>
                              DM Notes (Hidden Agendas / Secrets)
                            </label>
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded ml-auto"
                              style={{ backgroundColor: 'var(--highlight)', color: 'var(--accent)', border: '1px solid var(--arcane-line)' }}
                            >
                              DM Only
                            </span>
                          </div>
                          <SlashField value={editForm.dm_notes ?? ''} onChange={v => setEditForm(prev => prev ? { ...prev, dm_notes: v || null } : prev)} placeholder="Hidden agendas, secret alliances, true motivations…" minHeight="60px" maxLength={limitFor('factions', 'dm_notes')} />
                        </div>
                        <div className="flex gap-2">
                          <Button variant="primary" size="sm" onClick={saveEdit} disabled={saving}>
                            {saving ? 'Saving…' : 'Save'}
                          </Button>
                          <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={saving}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {faction.overview ? (
                          <div>
                            <p className="text-xs font-medium mb-1" style={{ color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.6rem' }}>Overview</p>
                            <MarkdownContent text={faction.overview} className="text-sm" style={{ color: 'var(--ink)', fontFamily: 'var(--serif)', lineHeight: '1.7' }} />
                          </div>
                        ) : null}

                        {faction.key_figures ? (
                          <div>
                            <p className="text-xs font-medium mb-1" style={{ color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.6rem' }}>Key Figures</p>
                            <MarkdownContent text={faction.key_figures} className="text-sm" style={{ color: 'var(--ink-2)', fontFamily: 'var(--serif)', lineHeight: '1.7' }} />
                          </div>
                        ) : null}

                        {faction.agenda ? (
                          <div>
                            <p className="text-xs font-medium mb-1" style={{ color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.6rem' }}>Agenda</p>
                            <MarkdownContent text={faction.agenda} className="text-sm" style={{ color: 'var(--ink-2)', fontFamily: 'var(--serif)', lineHeight: '1.7' }} />
                          </div>
                        ) : null}

                        {faction.dm_notes ? (
                          <div
                            className="rounded border p-3 mt-1"
                            style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--bg-2)' }}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Eye size={10} strokeWidth={1.8} style={{ color: 'var(--accent)' }} />
                              <p className="text-xs font-medium" style={{ color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.6rem' }}>DM Notes</p>
                              <span
                                className="text-[9px] px-1.5 py-0.5 rounded ml-auto"
                                style={{ backgroundColor: 'var(--highlight)', color: 'var(--accent)', border: '1px solid var(--arcane-line)' }}
                              >
                                DM Only
                              </span>
                            </div>
                            <MarkdownContent text={faction.dm_notes} className="text-sm" style={{ color: 'var(--ink-2)', fontFamily: 'var(--serif)', lineHeight: '1.7' }} />
                          </div>
                        ) : null}

                        {!faction.overview && !faction.key_figures && !faction.agenda && !faction.dm_notes && (
                          <p className="text-sm" style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>No details recorded for this faction.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New Faction"
        onSave={handleCreate}
        wide
      >
        <FormField label="Name">
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g., The Crimson Veil"
            style={inputStyle}
          />
        </FormField>
        <FormField label="Type">
          <div className="flex gap-2 flex-wrap">
            {FACTION_TYPES.map(t => (
              <button
                key={t}
                onClick={() => setForm(prev => ({ ...prev, faction_type: t }))}
                className="text-sm px-3 py-1.5 rounded flex-1 transition-colors"
                style={{
                  backgroundColor: form.faction_type === t ? typeColors[t].bg : 'var(--paper-2)',
                  color: typeColors[t].text,
                  border: `1px solid ${typeColors[t].border}`,
                  fontWeight: form.faction_type === t ? 600 : 400,
                  outline: form.faction_type === t ? `1px solid ${typeColors[t].text}` : 'none',
                  minWidth: '80px',
                }}
              >
                {formatType(t)}
              </button>
            ))}
          </div>
        </FormField>
        <FormField label="Overview">
          <SlashField value={form.overview ?? ''} onChange={v => setForm(prev => ({ ...prev, overview: v || null }))} placeholder="Describe this faction's purpose, history, and public face…" minHeight="120px" maxLength={limitFor('factions', 'overview')} />
        </FormField>
        <FormField label="Key Figures">
          <SlashField value={form.key_figures ?? ''} onChange={v => setForm(prev => ({ ...prev, key_figures: v || null }))} placeholder="Notable members, leaders, agents…" minHeight="80px" maxLength={limitFor('factions', 'key_figures')} />
        </FormField>
        <FormField label="Agenda">
          <SlashField value={form.agenda ?? ''} onChange={v => setForm(prev => ({ ...prev, agenda: v || null }))} placeholder="Goals, plans, and public agenda…" minHeight="80px" maxLength={limitFor('factions', 'agenda')} />
        </FormField>
        <FormField label="DM Notes (Hidden Agendas / Secrets)">
          <SlashField value={form.dm_notes ?? ''} onChange={v => setForm(prev => ({ ...prev, dm_notes: v || null }))} placeholder="Hidden agendas, secret alliances, true motivations…" minHeight="80px" maxLength={limitFor('factions', 'dm_notes')} />
        </FormField>
      </Modal>
    </div>
  );
}
