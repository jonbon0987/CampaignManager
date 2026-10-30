import type { Origin } from '../ui/OriginBand';

/**
 * Where an entry is being edited: the world's canon, or one campaign. Editors
 * take their record once, so mount each with key={record.id}.
 */
export type EntityScope = 'world' | 'campaign';

/**
 * In a campaign, where an entry came from and what can be done about it:
 * open it in canon, publish a local one up, or detach a canon one to a copy.
 */
export interface EntityCanon<F> {
  origin: Origin;
  onOpenInCanon: () => void;
  /** Publishes the entry, with the editor's current fields, to world canon. */
  onPublish: (fields: F) => Promise<unknown>;
  onDetach: () => void;
}
