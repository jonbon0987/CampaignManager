import type { ReactNode } from 'react';
import { EntityCard } from './EntityCard';
import { Button } from './Button';

interface InlineEditCardProps {
  isEditing: boolean;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
  saving?: boolean;
  children: ReactNode;
  className?: string;
  /** Entity id for scroll-to-highlight navigation */
  entityId?: string;
}

export function InlineEditCard({
  isEditing,
  onSave,
  onCancel,
  onDelete,
  deleteLabel = 'Delete',
  saving,
  children,
  className = '',
  entityId,
}: InlineEditCardProps) {
  return (
    <EntityCard isEditing={isEditing} className={className} entityId={entityId}>
      {children}
      {isEditing && (
        <div className="flex items-center gap-2 mt-4 pt-3" style={{ borderTop: '1px solid #3a3660' }}>
          <Button variant="primary" size="sm" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <div className="flex-1" />
          {onDelete && (
            <Button variant="danger" size="sm" onClick={onDelete} disabled={saving}>
              {deleteLabel}
            </Button>
          )}
        </div>
      )}
    </EntityCard>
  );
}
