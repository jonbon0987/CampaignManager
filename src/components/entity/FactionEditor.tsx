// The one faction editor, used in the world and in its campaigns.

import { useState } from 'react';
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
import type { Faction, NPC } from '../../lib/database.types';

export type FactionFields = Pick<Faction, 'name' | 'faction_type' | 'overview' | 'key_figures' | 'agenda' | 'dm_notes'>;

const toFields = (f: Faction): FactionFields => ({
  name: f.name, faction_type: f.faction_type, overview: f.overview, key_figures: f.key_figures, agenda: f.agenda, dm_notes: f.dm_notes,
});

const FACTION_TYPES = ['government', 'religious', 'criminal', 'military', 'scholarly', 'merchant', 'guild', 'arcane', 'other'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const isEmpty = (v: string | null | undefined) => !v?.trim();

type Optional = 'figures' | 'agenda' | 'notes';
const OPTIONAL_LABEL: Record<Optional, string> = { figures: 'Key figures', agenda: 'Agenda', notes: 'DM notes' };

export function FactionEditor({ faction, scope, npcs, save, remove, onDeleted, onOpenNPC, canon }: {
  faction: Faction;
  scope: EntityScope;
  /** NPCs in the same scope, to list its members. */
  npcs: Pick<NPC, 'id' | 'name' | 'faction_ids'>[];
  save: (fields: FactionFields) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  onDeleted?: () => void;
  onOpenNPC?: (id: string) => void;
  canon?: EntityCanon<FactionFields>;
}) {
  const confirm = useConfirm();
  const [form, setForm] = useState<FactionFields>(() => toFields(faction));
  const { locked, unlock } = useCanonLock(canon?.origin);

  const { status, saveNow } = useAutoSave({ data: form, onSave: async data => { await save(data); }, delay: 800 });

  useDiscardBlankDraft(faction.id, isEmpty(form.name) && isEmpty(form.overview) && isEmpty(form.key_figures)
    && isEmpty(form.agenda) && isEmpty(form.dm_notes), remove);

  const sections = useOptionalSections<Optional>({
    figures: !isEmpty(form.key_figures),
    agenda: !isEmpty(form.agenda),
    notes: !isEmpty(form.dm_notes),
  });

  const set = <K extends keyof FactionFields>(key: K, val: FactionFields[K]) => setForm(f => ({ ...f, [key]: val }));
  const members = npcs.filter(n => n.faction_ids?.includes(faction.id));

  const handleDelete = async () => {
    if (await confirm({ title: 'Delete this faction?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) {
      await remove(faction.id);
      onDeleted?.();
    }
  };

  return (
    <div className="cm-detail">
      {canon && (
        <OriginBand origin={canon.origin} noun="faction" locked={locked} onUnlock={unlock}
          onOpenInCanon={canon.onOpenInCanon} onPublish={() => void saveNow().then(() => canon.onPublish(form))} onDetach={canon.onDetach} />
      )}

      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        <OverflowMenu items={[{ label: 'Delete faction', danger: true, onClick: handleDelete }]} />
      </div>

      {scope === 'campaign' && <SessionUpdateBand entityType="faction" entityId={faction.id} />}

      <div className="cm-eyebrow">{scope === 'world' ? 'World faction' : 'Faction'}</div>

      <fieldset className="as-fieldset" disabled={locked}>
        <input className="as-title" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Faction name…" maxLength={limitFor('factions', 'name')} aria-label="Name" />

        <div className="as-meta">
          <div className="as-mi">
            <label className="as-ml" htmlFor={`fac-type-${faction.id}`}>Type</label>
            <select id={`fac-type-${faction.id}`} className="as-select" value={form.faction_type ?? 'other'} onChange={e => set('faction_type', e.target.value)}>
              {FACTION_TYPES.map(t => <option key={t} value={t}>{cap(t)}</option>)}
            </select>
          </div>
        </div>

        <div className="as-fl">
          <label className="as-ll">Overview</label>
          <SlashField value={form.overview ?? ''} onChange={v => set('overview', v || null)} placeholder="What is this faction about?" minHeight="120px" maxLength={limitFor('factions', 'overview')} readOnly={locked} />
        </div>

        <div className="as-fl">
          <span className="as-ll">Members</span>
          {members.length === 0 ? (
            <p className="as-empty-note">No NPCs list this faction yet. Add it from an NPC’s Factions.</p>
          ) : (
            <div className="cm-chip-list">
              {members.map(n => (
                // eslint-disable-next-line no-restricted-syntax -- a chip, styled by .cm-chip
                <button key={n.id} type="button" className="cm-chip" onClick={() => onOpenNPC?.(n.id)} disabled={!onOpenNPC}>
                  <span className="cm-chip-glyph">❦</span>{n.name || 'Unnamed NPC'}
                </button>
              ))}
            </div>
          )}
        </div>

        {sections.shown('figures') && (
          <div className="as-fl">
            <label className="as-ll">Key figures</label>
            <SlashField value={form.key_figures ?? ''} onChange={v => set('key_figures', v || null)} placeholder="Important members…" minHeight="96px" maxLength={limitFor('factions', 'key_figures')} readOnly={locked} />
          </div>
        )}

        {sections.shown('agenda') && (
          <div className="as-fl">
            <label className="as-ll">Agenda</label>
            <SlashField value={form.agenda ?? ''} onChange={v => set('agenda', v || null)} placeholder="Goals and plans…" minHeight="96px" maxLength={limitFor('factions', 'agenda')} readOnly={locked} />
          </div>
        )}

        {sections.shown('notes') && (
          <div className="as-fl">
            <label className="as-ll">DM notes</label>
            <SlashField value={form.dm_notes ?? ''} onChange={v => set('dm_notes', v || null)} placeholder="Hidden agendas, secrets…" minHeight="96px" maxLength={limitFor('factions', 'dm_notes')} readOnly={locked} />
          </div>
        )}

        <AddSections hidden={sections.hidden} labels={OPTIONAL_LABEL} onAdd={sections.add} disabled={locked} />
      </fieldset>

      {scope === 'campaign' && (
        <div className="as-fl">
          <label className="as-ll">Session history</label>
          <SessionHistory entityType="faction" entityId={faction.id} />
        </div>
      )}
    </div>
  );
}
