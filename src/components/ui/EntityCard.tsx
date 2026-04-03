import type { ReactNode, CSSProperties } from 'react';

interface EntityCardProps {
  children: ReactNode;
  isEditing?: boolean;
  className?: string;
  onClick?: () => void;
  style?: CSSProperties;
}

export function EntityCard({ children, isEditing, className = '', onClick, style }: EntityCardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg p-4 transition-colors duration-150 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        backgroundColor: '#1a1828',
        border: `1px solid ${isEditing ? '#c9a84c' : '#2e2c4a'}`,
        ...style,
      }}
      onMouseEnter={e => {
        if (!isEditing) (e.currentTarget as HTMLDivElement).style.borderColor = '#4a4870';
      }}
      onMouseLeave={e => {
        if (!isEditing) (e.currentTarget as HTMLDivElement).style.borderColor = '#2e2c4a';
      }}
    >
      {children}
    </div>
  );
}
