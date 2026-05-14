import type { CSSProperties } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useStatBlockPanel } from '../../context/StatBlockPanelContext';
import { useNavigation } from '../../context/NavigationContext';

// Matches [[type:uuid]] or [[type:uuid:Display Name]]
// Supported types: creature, npc, location, session, faction, hook
const ENTITY_LINK_RE = /\[\[(creature|npc|location|session|faction|hook):([a-f0-9-]{36})(?::([^\]]*))?\]\]/g;

type EntityType = 'creature' | 'npc' | 'location' | 'session' | 'faction' | 'hook';

type Segment =
  | { type: 'text'; value: string }
  | { type: 'entity'; entityType: EntityType; id: string; displayName: string };

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  ENTITY_LINK_RE.lastIndex = 0;
  while ((match = ENTITY_LINK_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    segments.push({
      type: 'entity',
      entityType: match[1] as EntityType,
      id: match[2],
      displayName: match[3] ?? '',
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}

const entityStyles: Record<EntityType, { bg: string; color: string; border: string; icon: string }> = {
  creature: { bg: '#2a1a3a', color: '#c060d0', border: '#5a2a7a', icon: '⚔' },
  npc:      { bg: '#1a2a3a', color: '#70a0e0', border: '#2a4a7a', icon: '👤' },
  location: { bg: '#1a3a2a', color: '#60c080', border: '#2a6a4a', icon: '📍' },
  session:  { bg: '#2a2a1a', color: 'var(--gold)', border: '#5a5a2a', icon: '📜' },
  faction:  { bg: '#2a1a2a', color: '#b070b0', border: '#5a3060', icon: '🛡' },
  hook:     { bg: '#3a2a1a', color: '#e0a060', border: '#7a5a2a', icon: '💡' },
};

interface EntityChipProps {
  entityType: EntityType;
  id: string;
  displayName: string;
  /** Show an × button to remove this chip */
  onRemove?: () => void;
}

function EntityChip({ entityType, id, displayName, onRemove }: EntityChipProps) {
  const { monsterStatblocks, npcs, locations, sessions, factions, hooks } = useCampaign();
  const { openStatBlock } = useStatBlockPanel();
  const { navigateToEntity } = useNavigation();

  let label = displayName || 'Unknown';
  let missing = true;

  switch (entityType) {
    case 'creature': {
      const c = monsterStatblocks.find(m => m.id === id);
      if (c) { label = c.name; missing = false; }
      break;
    }
    case 'npc': {
      const n = npcs.find(n => n.id === id);
      if (n) { label = n.name; missing = false; }
      break;
    }
    case 'location': {
      const l = locations.find(l => l.id === id);
      if (l) { label = l.name; missing = false; }
      break;
    }
    case 'session': {
      const s = sessions.find(s => s.id === id);
      if (s) { label = `Session #${s.session_number}`; missing = false; }
      break;
    }
    case 'faction': {
      const f = factions.find(f => f.id === id);
      if (f) { label = f.name; missing = false; }
      break;
    }
    case 'hook': {
      const h = hooks.find(h => h.id === id);
      if (h) { label = h.title; missing = false; }
      break;
    }
  }

  const style = entityStyles[entityType];

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (entityType === 'creature') {
      openStatBlock(id);
    } else {
      navigateToEntity(entityType, id);
    }
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        fontSize: '0.8em',
        padding: '1px 7px',
        borderRadius: '4px',
        backgroundColor: missing ? '#2a1a1a' : style.bg,
        color: missing ? '#e05c5c' : style.color,
        border: `1px solid ${missing ? '#5a2a2a' : style.border}`,
        fontFamily: 'inherit',
        lineHeight: '1.4',
        verticalAlign: 'baseline',
        whiteSpace: 'nowrap',
      }}
    >
      <button
        onClick={handleClick}
        title={missing ? `${entityType} not found` : `${entityType}: ${label}`}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          color: 'inherit',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          lineHeight: 'inherit',
        }}
      >
        {missing ? `⚠ ${label}` : `${style.icon} ${label}`}
      </button>
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          title="Remove link"
          style={{
            background: 'none',
            border: 'none',
            padding: '0 0 0 2px',
            color: missing ? '#e05c5c' : style.color,
            cursor: 'pointer',
            fontSize: '0.85em',
            lineHeight: 1,
            opacity: 0.6,
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
        >
          ×
        </button>
      )}
    </span>
  );
}

interface StatBlockTextProps {
  text: string | null | undefined;
  as?: 'pre' | 'p' | 'div';
  style?: CSSProperties;
  className?: string;
}

export function StatBlockText({ text, as: Tag = 'p', style, className }: StatBlockTextProps) {
  if (!text) return null;

  const segments = parseSegments(text);

  // If no entity links, render the simple element to avoid any overhead
  const hasLinks = segments.some(s => s.type === 'entity');
  if (!hasLinks) {
    return <Tag style={style} className={className}>{text}</Tag>;
  }

  return (
    <Tag style={style} className={className}>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <span key={i}>{seg.value}</span>
        ) : (
          <EntityChip key={i} entityType={seg.entityType} id={seg.id} displayName={seg.displayName} />
        ),
      )}
    </Tag>
  );
}

// Export for use in MarkdownContent
export { ENTITY_LINK_RE, EntityChip, parseSegments };
export type { EntityType };
