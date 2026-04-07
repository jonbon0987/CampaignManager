import type { CSSProperties } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useStatBlockPanel } from '../../context/StatBlockPanelContext';

// Matches [[creature:uuid]] or [[creature:uuid:Display Name]]
const CREATURE_LINK_RE = /\[\[creature:([a-f0-9-]{36})(?::([^\]]*))?\]\]/g;

type Segment =
  | { type: 'text'; value: string }
  | { type: 'creature'; id: string; displayName: string };

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  CREATURE_LINK_RE.lastIndex = 0;
  while ((match = CREATURE_LINK_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'creature', id: match[1], displayName: match[2] ?? '' });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}

function CreatureChip({ id, displayName }: { id: string; displayName: string }) {
  const { monsterStatblocks } = useCampaign();
  const { openStatBlock } = useStatBlockPanel();
  const creature = monsterStatblocks.find(m => m.id === id);
  const label = (creature?.name ?? displayName) || 'Unknown Creature';
  const missing = !creature;

  return (
    <button
      onClick={e => { e.stopPropagation(); openStatBlock(id); }}
      title={missing ? 'Creature not found' : `View stat block: ${label}`}
      style={{
        display: 'inline',
        fontSize: '0.8em',
        padding: '1px 7px',
        borderRadius: '4px',
        backgroundColor: missing ? '#2a1a1a' : '#2a1a3a',
        color: missing ? '#e05c5c' : '#c060d0',
        border: `1px solid ${missing ? '#5a2a2a' : '#5a2a7a'}`,
        cursor: 'pointer',
        fontFamily: 'inherit',
        lineHeight: '1.4',
        verticalAlign: 'baseline',
        whiteSpace: 'nowrap',
      }}
    >
      {missing ? `⚠ ${label}` : `⚔ ${label}`}
    </button>
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

  // If no creature links, render the simple element to avoid any overhead
  const hasLinks = segments.some(s => s.type === 'creature');
  if (!hasLinks) {
    return <Tag style={style} className={className}>{text}</Tag>;
  }

  return (
    <Tag style={style} className={className}>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <span key={i}>{seg.value}</span>
        ) : (
          <CreatureChip key={i} id={seg.id} displayName={seg.displayName} />
        ),
      )}
    </Tag>
  );
}
