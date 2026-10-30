// The one place editor, used in the world and in its campaigns.

import { useMemo, useState } from 'react';
import { useConfirm } from '../../context/ConfirmContext';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useDiscardBlankDraft } from '../../hooks/useDiscardBlankDraft';
import { limitFor } from '../../lib/fieldLimits';
import { OriginBand } from '../ui/OriginBand';
import { OverflowMenu } from '../ui/OverflowMenu';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import { SlashField } from '../ui/SlashField';
import { SessionHistory } from '../session/SessionHistory';
import { SessionUpdateBand } from '../session/SessionUpdateBand';
import { useCanonLock } from './useCanonLock';
import { useOptionalSections } from './useOptionalSections';
import { AddSections } from './AddSections';
import type { EntityCanon, EntityScope } from './types';
import type { Location } from '../../lib/database.types';

export type LocationFields = Pick<Location,
  'name' | 'region' | 'location_type' | 'parent_id' | 'population' | 'status' | 'description' | 'history' | 'dm_notes'>;

const toFields = (l: Location): LocationFields => ({
  name: l.name, region: l.region, location_type: l.location_type, parent_id: l.parent_id, population: l.population,
  status: l.status, description: l.description, history: l.history, dm_notes: l.dm_notes,
});

const LOCATION_TYPES = ['continent', 'city', 'town', 'dungeon', 'faction_hq', 'landmark', 'other'] as const;
const STATUSES = ['active', 'destroyed', 'unknown', 'compromised'] as const;
const formatType = (t: string) => t.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bHq\b/, 'HQ');
const isEmpty = (v: string | null | undefined) => !v?.trim();

/** Ids that can't hold `id`: itself and everything inside it (that would make a loop). */
function insideOf(id: string, all: Pick<Location, 'id' | 'parent_id'>[]): Set<string> {
  const bad = new Set<string>([id]);
  let added = true;
  while (added) {
    added = false;
    for (const l of all) {
      if (l.parent_id && bad.has(l.parent_id) && !bad.has(l.id)) { bad.add(l.id); added = true; }
    }
  }
  return bad;
}

type Optional = 'history' | 'notes';
const OPTIONAL_LABEL: Record<Optional, string> = { history: 'History', notes: 'DM notes' };

export function LocationEditor({ location, scope, allLocations, save, remove, onDeleted, canon }: {
  location: Location;
  scope: EntityScope;
  /** Places in the same scope, to pick what this one is within. */
  allLocations: Location[];
  save: (fields: LocationFields) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  onDeleted?: () => void;
  canon?: EntityCanon<LocationFields>;
}) {
  const confirm = useConfirm();
  const [form, setForm] = useState<LocationFields>(() => toFields(location));
  const { locked, unlock } = useCanonLock(canon?.origin);

  const { status, saveNow } = useAutoSave({ data: form, onSave: async data => { await save(data); }, delay: 800 });

  // A place with anything written, or with places inside it, is kept.
  useDiscardBlankDraft(location.id, isEmpty(form.name) && isEmpty(form.region) && isEmpty(form.population) && isEmpty(form.description)
    && isEmpty(form.history) && isEmpty(form.dm_notes) && !allLocations.some(l => l.parent_id === location.id), remove);

  const sections = useOptionalSections<Optional>({ history: !isEmpty(form.history), notes: !isEmpty(form.dm_notes) });
  const set = <K extends keyof LocationFields>(key: K, val: LocationFields[K]) => setForm(f => ({ ...f, [key]: val }));

  const forbidden = useMemo(() => insideOf(location.id, allLocations), [location.id, allLocations]);
  const parentOptions = allLocations.filter(l => !forbidden.has(l.id)).sort((a, b) => a.name.localeCompare(b.name));

  const handleDelete = async () => {
    if (await confirm({ title: 'Delete this place?', message: 'Any places within it move to the top level. This cannot be undone.', confirmLabel: 'Delete', danger: true })) {
      await remove(location.id);
      onDeleted?.();
    }
  };

  const id = (f: string) => `loc-${f}-${location.id}`;

  return (
    <div className="cm-detail">
      {canon && (
        <OriginBand origin={canon.origin} noun="place" locked={locked} onUnlock={unlock}
          onOpenInCanon={canon.onOpenInCanon} onPublish={() => void saveNow().then(() => canon.onPublish(form))} onDetach={canon.onDetach} />
      )}

      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        <OverflowMenu items={[{ label: 'Delete place', danger: true, onClick: handleDelete }]} />
      </div>

      {scope === 'campaign' && <SessionUpdateBand entityType="location" entityId={location.id} />}

      <div className="cm-eyebrow">{scope === 'world' ? 'World location' : 'Location'}</div>

      <fieldset className="as-fieldset" disabled={locked}>
        <input className="as-title" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Location name…" maxLength={limitFor('locations', 'name')} aria-label="Name" />
        <input className="as-sub" value={form.region ?? ''} onChange={e => set('region', e.target.value || null)} placeholder="Region…" maxLength={limitFor('locations', 'region')} aria-label="Region" />

        <div className="as-meta">
          <div className="as-mi">
            <label className="as-ml" htmlFor={id('type')}>Type</label>
            <select id={id('type')} className="as-select" value={form.location_type ?? 'landmark'} onChange={e => set('location_type', e.target.value)}>
              {LOCATION_TYPES.map(t => <option key={t} value={t}>{formatType(t)}</option>)}
            </select>
          </div>
          <div className="as-mi">
            <label className="as-ml" htmlFor={id('within')}>Within</label>
            <select id={id('within')} className="as-select" value={form.parent_id ?? ''} onChange={e => set('parent_id', e.target.value || null)}>
              <option value="">— Top level —</option>
              {parentOptions.map(l => <option key={l.id} value={l.id}>{l.name || 'Unnamed'}</option>)}
            </select>
          </div>
          <div className="as-mi">
            <label className="as-ml" htmlFor={id('status')}>Status</label>
            <select id={id('status')} className="as-select" value={form.status ?? 'active'} onChange={e => set('status', e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{formatType(s)}</option>)}
            </select>
          </div>
          <div className="as-mi">
            <label className="as-ml" htmlFor={id('pop')}>Population</label>
            <input id={id('pop')} className="as-input" value={form.population ?? ''} onChange={e => set('population', e.target.value || null)} placeholder="e.g. ~12,000" maxLength={limitFor('locations', 'population')} />
          </div>
        </div>

        <div className="as-fl">
          <label className="as-ll">Description</label>
          <SlashField value={form.description ?? ''} onChange={v => set('description', v || null)} placeholder="Describe this place…" minHeight="96px" maxLength={limitFor('locations', 'description')} readOnly={locked} />
        </div>

        {sections.shown('history') && (
          <div className="as-fl">
            <label className="as-ll">History</label>
            <SlashField value={form.history ?? ''} onChange={v => set('history', v || null)} placeholder="Historical events…" minHeight="96px" maxLength={limitFor('locations', 'history')} readOnly={locked} />
          </div>
        )}

        {sections.shown('notes') && (
          <div className="as-fl">
            <label className="as-ll">DM notes</label>
            <SlashField value={form.dm_notes ?? ''} onChange={v => set('dm_notes', v || null)} placeholder="Private DM notes…" minHeight="72px" maxLength={limitFor('locations', 'dm_notes')} readOnly={locked} />
          </div>
        )}

        <AddSections hidden={sections.hidden} labels={OPTIONAL_LABEL} onAdd={sections.add} disabled={locked} />
      </fieldset>

      {scope === 'campaign' && (
        <div className="as-fl">
          <label className="as-ll">Session history</label>
          <SessionHistory entityType="location" entityId={location.id} />
        </div>
      )}
    </div>
  );
}
