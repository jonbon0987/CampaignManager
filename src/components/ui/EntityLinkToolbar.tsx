import { useState } from 'react';
import type { RefObject } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import type { EntityType } from './StatBlockText';
import { serializeRef } from '../../lib/slashMarkdown';

const entityConfig: Partial<Record<EntityType, { icon: string; label: string; color: string; bg: string; border: string }>> = {
  statblock: { icon: '⚔', label: 'Stat Sheet', color: '#c060d0', bg: '#2a1a3a', border: '#5a2a7a' },
  npc:      { icon: '👤', label: 'NPC',      color: '#70a0e0', bg: '#1a2a3a', border: '#2a4a7a' },
  location: { icon: '📍', label: 'Location', color: '#60c080', bg: '#1a3a2a', border: '#2a6a4a' },
  session:  { icon: '📜', label: 'Session',  color: 'var(--gold)', bg: '#2a2a1a', border: '#5a5a2a' },
  faction:  { icon: '🛡', label: 'Faction',  color: '#b070b0', bg: '#2a1a2a', border: '#5a3060' },
  hook:     { icon: '💡', label: 'Hook',     color: '#e0a060', bg: '#3a2a1a', border: '#7a5a2a' },
};
const CONFIG_TYPES = Object.keys(entityConfig) as EntityType[];

interface EntityItem {
  id: string;
  name: string;
  subtitle?: string;
  entityType: EntityType;
}

interface EntityLinkToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onInsert: (markup: string) => void;
}

export function EntityLinkToolbar({ textareaRef, onInsert }: EntityLinkToolbarProps) {
  const { monsterStatblocks, npcs, locations, sessions, factions, hooks } = useCampaign();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeType, setActiveType] = useState<EntityType | 'all'>('all');

  // Build a unified searchable list
  const allEntities: EntityItem[] = [
    ...monsterStatblocks.map(m => ({
      id: m.id,
      name: m.name,
      subtitle: [m.creature_type, m.challenge_rating ? `CR ${m.challenge_rating}` : null].filter(Boolean).join(' · ') || undefined,
      entityType: 'statblock' as EntityType,
    })),
    ...npcs.map(n => ({
      id: n.id,
      name: n.name,
      subtitle: [n.role, n.affiliation].filter(Boolean).join(' · ') || undefined,
      entityType: 'npc' as EntityType,
    })),
    ...locations.map(l => ({
      id: l.id,
      name: l.name,
      subtitle: [l.location_type, l.region].filter(Boolean).join(' · ') || undefined,
      entityType: 'location' as EntityType,
    })),
    ...sessions.map(s => ({
      id: s.id,
      name: `Session #${s.session_number}`,
      subtitle: s.session_date ? new Date(s.session_date).toLocaleDateString() : undefined,
      entityType: 'session' as EntityType,
    })),
    ...factions.map(f => ({
      id: f.id,
      name: f.name,
      subtitle: f.faction_type || undefined,
      entityType: 'faction' as EntityType,
    })),
    ...hooks.filter(h => h.is_active).map(h => ({
      id: h.id,
      name: h.title,
      subtitle: h.category?.replace('_', ' ') || undefined,
      entityType: 'hook' as EntityType,
    })),
  ];

  const filtered = allEntities.filter(e => {
    if (activeType !== 'all' && e.entityType !== activeType) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.name.toLowerCase().includes(q) ||
      (e.subtitle?.toLowerCase().includes(q) ?? false)
    );
  });

  function handlePick(entity: EntityItem) {
    const markup = serializeRef(entity.entityType, entity.id, entity.name);
    onInsert(markup);
    setPickerOpen(false);
    setSearch('');
    setActiveType('all');
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
        {CONFIG_TYPES.map(type => {
          const cfg = entityConfig[type]!;
          return (
            <button
              key={type}
              type="button"
              onClick={() => { setActiveType(type); setPickerOpen(true); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.72rem',
                padding: '3px 10px',
                borderRadius: '4px',
                backgroundColor: cfg.bg,
                color: cfg.color,
                border: `1px solid ${cfg.border}`,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {cfg.icon} {cfg.label}
            </button>
          );
        })}
      </div>

      <Modal
        isOpen={pickerOpen}
        onClose={() => { setPickerOpen(false); setSearch(''); setActiveType('all'); }}
        title="Link an Entity"
      >
        <div className="space-y-3">
          {/* Type filter tabs */}
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setActiveType('all')}
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                borderRadius: '4px',
                backgroundColor: activeType === 'all' ? 'var(--rule)' : 'var(--paper)',
                color: activeType === 'all' ? 'var(--ink)' : 'var(--ink-3)',
                border: '1px solid #3a3660',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              All
            </button>
            {CONFIG_TYPES.map(type => {
              const cfg = entityConfig[type]!;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setActiveType(type)}
                  style={{
                    fontSize: '0.75rem',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    backgroundColor: activeType === type ? cfg.bg : 'var(--paper)',
                    color: activeType === type ? cfg.color : 'var(--ink-3)',
                    border: `1px solid ${activeType === type ? cfg.border : 'var(--rule)'}`,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {cfg.icon} {cfg.label}
                </button>
              );
            })}
          </div>

          {/* Search input */}
          <input
            type="text"
            placeholder="Search entities..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              backgroundColor: 'var(--paper)',
              color: 'var(--ink)',
              border: '1px solid #3a3660',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '0.875rem',
              outline: 'none',
            }}
          />

          {/* Results list */}
          {allEntities.length === 0 ? (
            <p style={{ color: 'var(--ink-3)', fontSize: '0.875rem', fontStyle: 'italic' }}>
              No entities yet. Add some to your campaign first.
            </p>
          ) : filtered.length === 0 ? (
            <p style={{ color: 'var(--ink-3)', fontSize: '0.875rem', fontStyle: 'italic' }}>
              No entities match your search.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '360px', overflowY: 'auto' }}>
              {filtered.map(entity => {
                const cfg = entityConfig[entity.entityType]!;
                return (
                  <button
                    key={`${entity.entityType}-${entity.id}`}
                    type="button"
                    onClick={() => handlePick(entity)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--paper)',
                      border: '1px solid #3a3660',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--paper-2)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--paper)')}
                  >
                    <span
                      style={{
                        fontSize: '0.65rem',
                        padding: '1px 7px',
                        borderRadius: '4px',
                        border: `1px solid ${cfg.border}`,
                        backgroundColor: cfg.bg,
                        color: cfg.color,
                        textTransform: 'capitalize',
                        flexShrink: 0,
                        minWidth: '60px',
                        textAlign: 'center',
                      }}
                    >
                      {cfg.icon} {cfg.label}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: 'var(--ink)',
                        fontFamily: 'var(--display)',
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {entity.name}
                    </span>
                    {entity.subtitle && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--ink-3)',
                          flexShrink: 0,
                          maxWidth: '140px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {entity.subtitle}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
