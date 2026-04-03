import { Button } from './Button';

interface EmptyStateProps {
  message: string;
  onAdd?: () => void;
  addLabel?: string;
}

export function EmptyState({ message, onAdd, addLabel = 'Add' }: EmptyStateProps) {
  return (
    <div className="text-center py-16">
      <p className="text-sm mb-4" style={{ color: '#6a6490' }}>{message}</p>
      {onAdd && (
        <Button variant="primary" size="sm" onClick={onAdd}>
          + {addLabel}
        </Button>
      )}
    </div>
  );
}
