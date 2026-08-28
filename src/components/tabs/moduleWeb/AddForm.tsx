/* moduleWeb/AddForm.tsx — the name-it-and-pick-a-type form, in its two
   homes: the bubble anchored to a body on the stage, and the dashed
   "New part / New scene" row at the bottom of the inspector rail. */
import { useEffect, useRef, useState } from 'react';
import { typeInfo, SUBMODULE_TYPES, SCENE_TYPES } from '../moduleDetail/pickers';
import { limitFor } from '../../../lib/fieldLimits';

const typesFor = (kind: 'sub' | 'scene') => (kind === 'sub' ? SUBMODULE_TYPES : SCENE_TYPES);

/** Shared body: text field, 2-column type grid, Add / Cancel. */
function AddFields({ kind, onAdd, onCancel, autoFocus }: {
  kind: 'sub' | 'scene';
  onAdd: (title: string, type: string) => void;
  onCancel: () => void;
  autoFocus?: boolean;
}) {
  const types = typesFor(kind);
  const [title, setTitle] = useState('');
  const [type, setType] = useState(types[0]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  const commit = () => { if (title.trim()) onAdd(title.trim(), type); };

  return (
    <>
      <input ref={inputRef} className="orr-input" value={title} placeholder="Name it…"
        maxLength={limitFor(kind === 'sub' ? 'submodules' : 'scenes', 'title')}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
        }} />
      <div className="orr-type-grid">
        {types.map(t => {
          const i = typeInfo(t);
          return (
            // eslint-disable-next-line no-restricted-syntax -- bespoke type-swatch in the design's 2-column grid
            <button key={t} className={`orr-type ${type === t ? 'is-active' : ''}`} title={i.label} onClick={() => setType(t)}>
              <span style={{ color: i.color }}>{i.glyph}</span>{i.label}
            </button>
          );
        })}
      </div>
      <div className="orr-add-actions">
        {/* eslint-disable-next-line no-restricted-syntax -- bespoke stage-scale controls sized to the bubble */}
        <button className="orr-btn is-primary" disabled={!title.trim()} onClick={commit}>Add</button>
        {/* eslint-disable-next-line no-restricted-syntax -- bespoke stage-scale control */}
        <button className="orr-btn" onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}

/** Anchored beside the body it belongs to — the paint loop positions it every frame. */
export function AddBubble({ bubbleRef, kind, onAdd, onClose }: {
  bubbleRef: React.RefObject<HTMLDivElement | null>;
  kind: 'sub' | 'scene';
  onAdd: (title: string, type: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="orr-bubble" ref={bubbleRef} onPointerDown={e => e.stopPropagation()}>
      <div className="orr-bubble-head">New {kind === 'sub' ? 'part' : 'scene'}</div>
      <AddFields kind={kind} onAdd={onAdd} onCancel={onClose} autoFocus />
    </div>
  );
}

/** The dashed row in the rail that expands into the same form in place. */
export function AddRow({ label, kind, onAdd }: {
  label: string;
  kind: 'sub' | 'scene';
  onAdd: (title: string, type: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      // eslint-disable-next-line no-restricted-syntax -- bespoke dashed add-row affordance, not an action button
      <button className="orr-add-row" onClick={() => setOpen(true)}>
        <span className="orr-add-plus">+</span>{label}
      </button>
    );
  }
  return (
    <div className="orr-add-open">
      <AddFields kind={kind} autoFocus
        onAdd={(t, ty) => { onAdd(t, ty); setOpen(false); }}
        onCancel={() => setOpen(false)} />
    </div>
  );
}
