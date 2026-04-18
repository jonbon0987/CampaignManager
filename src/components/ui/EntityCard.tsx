import type { ReactNode, CSSProperties } from 'react';
import { useNavigation } from '../../context/NavigationContext';

interface EntityCardProps {
  children: ReactNode;
  isEditing?: boolean;
  className?: string;
  onClick?: () => void;
  style?: CSSProperties;
  /** Entity id for scroll-to-highlight navigation */
  entityId?: string;
}

export function EntityCard({ children, isEditing, className = '', onClick, style, entityId }: EntityCardProps) {
  const { highlightedEntityId } = useNavigation();
  const isHighlighted = entityId != null && entityId === highlightedEntityId;

  return (
    <div
      onClick={onClick}
      data-entity-id={entityId}
      className={`rounded-lg p-4 transition-colors duration-150 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        backgroundColor: '#1a1828',
        border: `1px solid ${isHighlighted ? '#c9a84c' : isEditing ? '#c9a84c' : '#2e2c4a'}`,
        boxShadow: isHighlighted ? '0 0 12px rgba(201, 168, 76, 0.4)' : undefined,
        transition: 'border-color 0.15s, box-shadow 0.5s',
        ...style,
      }}
      onMouseEnter={e => {
        if (!isEditing && !isHighlighted) (e.currentTarget as HTMLDivElement).style.borderColor = '#4a4870';
      }}
      onMouseLeave={e => {
        if (!isEditing && !isHighlighted) (e.currentTarget as HTMLDivElement).style.borderColor = '#2e2c4a';
      }}
    >
      {children}
    </div>
  );
}
