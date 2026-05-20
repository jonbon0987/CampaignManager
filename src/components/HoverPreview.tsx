import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useCampaign } from '../context/CampaignContext';
import type { NPC, PlayerCharacter, Faction, Location, LoreEntry } from '../lib/database.types';

export type HoverKind = 'npc' | 'pc' | 'faction' | 'location' | 'lore';

type HoverEntity = NPC | PlayerCharacter | Faction | Location | LoreEntry;

interface HoverPreviewProps {
  entity: HoverEntity;
  kind: HoverKind;
  anchorRect: DOMRect;
}

function HoverPreviewCard({ entity, kind, anchorRect }: HoverPreviewProps) {
  const { factions } = useCampaign();

  const cardH = 220;
  const top = Math.max(8, Math.min(anchorRect.top, window.innerHeight - cardH - 8));
  const left = anchorRect.right + 12;

  // Don't render if card would be mostly off-screen
  if (left > window.innerWidth - 60) return null;

  const eyebrow = kind === 'pc' ? 'Player Character'
    : kind === 'npc' ? `NPC · ${(entity as NPC).status || 'active'}`
    : kind === 'faction' ? `Faction · ${(entity as Faction).faction_type || ''}`
    : kind === 'location' ? `Place · ${(entity as Location).location_type || ''}`
    : 'Lore';

  const name = kind === 'pc' ? (entity as PlayerCharacter).character_name
    : kind === 'lore' ? (entity as LoreEntry).title
    : (entity as NPC | Faction | Location).name;

  const sub = kind === 'pc'
    ? [(entity as PlayerCharacter).race, (entity as PlayerCharacter).class].filter(Boolean).join(' ')
    : kind === 'npc' ? (entity as NPC).role
    : kind === 'faction' ? (entity as Faction).faction_type
    : kind === 'location' ? (entity as Location).region
    : null;

  const desc = kind === 'npc' ? (entity as NPC).description
    : kind === 'location' ? (entity as Location).description
    : kind === 'lore' ? (entity as LoreEntry).content
    : kind === 'pc' ? (entity as PlayerCharacter).background
    : null;

  const locationText = kind === 'npc' ? (entity as NPC).location : null;

  const factionIds = kind === 'npc' ? (entity as NPC).faction_ids
    : kind === 'pc' ? (entity as PlayerCharacter).faction_ids
    : [];
  const entityFactions = factions.filter(f => factionIds?.includes(f.id));

  return createPortal(
    <div className="v6-hp" style={{ position: 'fixed', top, left, zIndex: 9999 }}>
      <div className="v6-hp-head">
        <div className="v6-hp-ey">{eyebrow}</div>
        <div className="v6-hp-name">{name || 'Untitled'}</div>
        {sub && <div className="v6-hp-sub">{sub}</div>}
      </div>
      <div className="v6-hp-body">
        {desc && <div className="v6-hp-desc">{desc}</div>}
        {locationText && (
          <div className="v6-hp-meta-row">
            <span style={{ color: 'var(--moss)' }}>✦</span>
            <span>{locationText}</span>
          </div>
        )}
        {entityFactions.length > 0 && (
          <div className="v6-hp-factions">
            {entityFactions.map(f => (
              <span key={f.id} className="v6-hp-faction">❖ {f.name}</span>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

interface ListRowWithHoverProps {
  entity: HoverEntity;
  kind: HoverKind;
  children: React.ReactNode;
}

export function ListRowWithHover({ entity, kind, children }: ListRowWithHoverProps) {
  const [hovered, setHovered] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onEnter = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (rowRef.current) {
        setRect(rowRef.current.getBoundingClientRect());
        setHovered(true);
      }
    }, 300);
  }, []);

  const onLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setHovered(false);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return (
    <div ref={rowRef} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {children}
      {hovered && rect && (
        <HoverPreviewCard entity={entity} kind={kind} anchorRect={rect} />
      )}
    </div>
  );
}
