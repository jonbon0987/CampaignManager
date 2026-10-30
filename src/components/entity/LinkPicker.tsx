// Links from one entry to others (an NPC's place, a faction's key figures, a
// PC's key NPCs): chips that open the entry or come off, and a search to add.

import { X } from 'lucide-react';
import { SearchableSelect } from '../ui/SearchableSelect';
import { Button } from '../ui/Button';
import { plainText } from '../../lib/sessionLifecycle';

export interface LinkOption { id: string; label: string; detail?: string }

function Chip({ option, glyph, onOpen, onRemove, disabled }: {
  option: LinkOption | undefined;
  glyph: string;
  onOpen?: () => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const label = option?.label || 'A deleted entry';
  return (
    <span className={`lk-chip${option ? '' : ' is-gone'}`}>
      <span className="lk-chip-glyph" aria-hidden>{glyph}</span>
      {onOpen && option
        ? <Button variant="link" className="lk-chip-name" onClick={onOpen}>{label}</Button>
        : <span className="lk-chip-name">{label}</span>}
      {!disabled && (
        // eslint-disable-next-line no-restricted-syntax -- the chip's own remove control
        <button type="button" className="lk-chip-x" onClick={onRemove} aria-label={`Unlink ${label}`} title="Unlink">
          <X size={11} />
        </button>
      )}
    </span>
  );
}

/** Any number of links. */
export function LinkList({ ids, options, onChange, onOpen, glyph, addLabel, empty, disabled }: {
  ids: string[];
  options: LinkOption[];
  onChange: (ids: string[]) => void;
  onOpen?: (id: string) => void;
  glyph: string;
  addLabel: string;
  /** What to say when nothing is linked yet. */
  empty?: string;
  disabled?: boolean;
}) {
  const byId = new Map(options.map(o => [o.id, o]));
  const addable = options.filter(o => !ids.includes(o.id));
  return (
    <div className="lk">
      {ids.length > 0
        ? (
          <div className="lk-chips">
            {ids.map(id => (
              <Chip key={id} option={byId.get(id)} glyph={glyph} disabled={disabled}
                onOpen={onOpen ? () => onOpen(id) : undefined} onRemove={() => onChange(ids.filter(x => x !== id))} />
            ))}
          </div>
        )
        : empty && <p className="as-empty-note">{empty}</p>}
      {!disabled && addable.length > 0 && (
        <div className="lk-add">
          <SearchableSelect value={null} onChange={v => v && onChange([...ids, v])} options={addable} placeholder={addLabel} allowClear={false} searchPlaceholder="Search…" />
        </div>
      )}
    </div>
  );
}

/** At most one link. */
export function SingleLink({ id, options, onChange, onOpen, glyph, placeholder, disabled }: {
  id: string | null;
  options: LinkOption[];
  onChange: (id: string | null) => void;
  onOpen?: (id: string) => void;
  glyph: string;
  placeholder: string;
  disabled?: boolean;
}) {
  if (id) {
    return (
      <div className="lk-chips">
        <Chip option={options.find(o => o.id === id)} glyph={glyph} disabled={disabled}
          onOpen={onOpen ? () => onOpen(id) : undefined} onRemove={() => onChange(null)} />
      </div>
    );
  }
  if (disabled) return <p className="as-empty-note">None linked.</p>;
  return (
    <div className="lk-add">
      <SearchableSelect value={null} onChange={v => v && onChange(v)} options={options} placeholder={placeholder} allowClear={false} searchPlaceholder="Search…" />
    </div>
  );
}

/**
 * Text from before a field became links, shown beside them so nothing typed
 * is lost: the DM checks the links against it, then clears it.
 */
export function WasText({ text, onClear, disabled }: { text: string | null; onClear: () => void; disabled?: boolean }) {
  if (!text?.trim()) return null;
  return (
    <div className="lk-was">
      <span className="lk-was-label">Written before as</span>
      <span className="lk-was-text">“{plainText(text)}”</span>
      {!disabled && <Button size="xs" variant="ghost" onClick={onClear} title="The links cover it; drop the text">Clear</Button>}
    </div>
  );
}
