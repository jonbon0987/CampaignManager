import { useMemo } from 'react';
import { useEntityRefs } from '../context/EntityRefContext';
import type { RefKind } from '../lib/slashMarkdown';
import type { SelectedEntity } from '../lib/campaignContext';

/** An entity picked in the EntityContextPicker to feed an AI generator. */
export interface ContextRef {
  kind: RefKind;
  id: string;
}

// Resolve picked {kind,id} refs into the rich shape buildSelectedContextBlock
// wants, pulling label / subtitle / description / meta from the shared index.
export function useSelectedContextEntities(selected: ContextRef[]): SelectedEntity[] {
  const { refById, detailFor } = useEntityRefs();
  return useMemo(() => selected.map(r => {
    const ref = refById(r.kind, r.id);
    const d = detailFor(r.kind, r.id);
    // detailFor substitutes a "No description yet." placeholder — drop it so it
    // never leaks into the prompt as if it were real description text.
    const desc = d.desc === 'No description yet.' ? '' : d.desc;
    return {
      kind: r.kind,
      id: r.id,
      label: d.label || ref?.label || r.id,
      sub: d.sub || ref?.sub || '',
      desc,
      meta: d.meta,
    } satisfies SelectedEntity;
  }), [selected, refById, detailFor]);
}
