import { Button } from '../ui/Button';

/** The "Add" row for an entry's empty optional sections. */
export function AddSections<K extends string>({ hidden, labels, onAdd, disabled }: {
  hidden: K[];
  labels: Record<K, string>;
  onAdd: (key: K) => void;
  disabled?: boolean;
}) {
  if (hidden.length === 0) return null;
  return (
    <div className="as-addrow" aria-label="Add a section">
      <span className="as-addrow-label">Add</span>
      {hidden.map(k => (
        <Button key={k} size="xs" variant="secondary" onClick={() => onAdd(k)} disabled={disabled}>+ {labels[k]}</Button>
      ))}
    </div>
  );
}
