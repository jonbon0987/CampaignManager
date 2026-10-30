// The one NPC editor, used in the world and in its campaigns. The page around
// it says where the NPC lives and how to save it; in a campaign it also shows
// where the NPC came from (canon or this table) and what sessions did with it.

import { useState } from 'react';
import { useConfirm } from '../../context/ConfirmContext';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useDiscardBlankDraft } from '../../hooks/useDiscardBlankDraft';
import { limitFor, maxFor, minFor } from '../../lib/fieldLimits';
import { OriginBand } from '../ui/OriginBand';
import { OverflowMenu } from '../ui/OverflowMenu';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import { SlashField } from '../ui/SlashField';
import { FactionPillSelector } from '../ui/FactionPillSelector';
import { SearchableSelect } from '../ui/SearchableSelect';
import { Button } from '../ui/Button';
import { SessionHistory } from '../session/SessionHistory';
import { SessionUpdateBand } from '../session/SessionUpdateBand';
import { useCanonLock } from './useCanonLock';
import { useOptionalSections } from './useOptionalSections';
import { AddSections } from './AddSections';
import type { EntityCanon, EntityScope } from './types';
import type { Faction, NPC } from '../../lib/database.types';

/** What the editor writes back: every field it shows. */
export type NPCFields = Pick<NPC,
  'name' | 'role' | 'affiliation' | 'status' | 'disposition' | 'description' | 'hooks_motivations'
  | 'dm_notes' | 'location' | 'first_session' | 'met_by_pcs' | 'faction_ids' | 'statblock_id'>;

const toFields = (npc: NPC): NPCFields => ({
  name: npc.name,
  role: npc.role,
  affiliation: npc.affiliation,
  status: npc.status,
  disposition: npc.disposition,
  description: npc.description,
  hooks_motivations: npc.hooks_motivations,
  dm_notes: npc.dm_notes,
  location: npc.location,
  first_session: npc.first_session,
  met_by_pcs: npc.met_by_pcs,
  faction_ids: npc.faction_ids ?? [],
  statblock_id: npc.statblock_id,
});

// ── Voice, kept in this browser by NPC id ────────────────────────────────────
interface VoiceData { accent?: string; patterns?: string; phrase?: string; tics?: string }
const VOICE_KEY = (id: string) => `npc-voice-${id}`;
function loadVoice(id: string): VoiceData { try { return JSON.parse(localStorage.getItem(VOICE_KEY(id)) ?? '{}'); } catch { return {}; } }
function saveVoice(id: string, v: VoiceData) { try { localStorage.setItem(VOICE_KEY(id), JSON.stringify(v)); } catch { /* storage full or blocked */ } }

const isEmpty = (v: string | null | undefined) => !v?.trim();

type Optional = 'hooks' | 'voice' | 'notes' | 'statblock';
const OPTIONAL_LABEL: Record<Optional, string> = { hooks: 'Hooks & motivations', voice: 'Voice', notes: 'DM notes', statblock: 'Stat sheet' };

export function NPCEditor({ npc, scope, factions, statblocks, save, remove, onDeleted, onOpenStatBlock, canon }: {
  npc: NPC;
  scope: EntityScope;
  /** Factions it can belong to, in the same scope. */
  factions: Faction[];
  statblocks: { id: string; name: string }[];
  save: (fields: NPCFields) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  onDeleted?: () => void;
  onOpenStatBlock?: (id: string) => void;
  canon?: EntityCanon<NPCFields>;
}) {
  const confirm = useConfirm();
  const [form, setForm] = useState<NPCFields>(() => toFields(npc));
  const { locked, unlock } = useCanonLock(canon?.origin);

  const { status, saveNow } = useAutoSave({ data: form, onSave: async data => { await save(data); }, delay: 800 });

  const [voice, setVoice] = useState<VoiceData>(() => loadVoice(npc.id));
  const setVoiceField = (field: keyof VoiceData, val: string) => {
    const next = { ...voice, [field]: val || undefined };
    setVoice(next);
    saveVoice(npc.id, next);
  };

  useDiscardBlankDraft(npc.id, isEmpty(form.name) && isEmpty(form.role) && isEmpty(form.affiliation) && isEmpty(form.description)
    && isEmpty(form.hooks_motivations) && isEmpty(form.dm_notes) && isEmpty(form.location) && isEmpty(form.disposition), remove);

  const sections = useOptionalSections<Optional>({
    hooks: !isEmpty(form.hooks_motivations),
    voice: Object.values(voice).some(v => !isEmpty(v)),
    notes: !isEmpty(form.dm_notes),
    statblock: !!form.statblock_id,
  });

  const set = <K extends keyof NPCFields>(key: K, val: NPCFields[K]) => setForm(f => ({ ...f, [key]: val }));

  const handleDelete = async () => {
    const message = canon?.origin === 'imported'
      ? 'This is world canon: deleting it removes it from the world and every campaign. To drop it from this campaign only, detach it instead.'
      : 'This cannot be undone.';
    if (await confirm({ title: 'Delete this NPC?', message, confirmLabel: 'Delete', danger: true })) {
      await remove(npc.id);
      onDeleted?.();
    }
  };

  return (
    <div className="cm-detail">
      {canon && (
        <OriginBand origin={canon.origin} noun="NPC" locked={locked} onUnlock={unlock}
          onOpenInCanon={canon.onOpenInCanon} onPublish={() => void saveNow().then(() => canon.onPublish(form))} onDetach={canon.onDetach} />
      )}

      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        <OverflowMenu items={[{ label: 'Delete NPC', danger: true, onClick: handleDelete }]} />
      </div>

      {scope === 'campaign' && <SessionUpdateBand entityType="npc" entityId={npc.id} />}

      <div className="cm-eyebrow">{scope === 'world' ? 'World NPC' : 'Non-Player Character'}</div>

      <fieldset className="as-fieldset" disabled={locked}>
        <input className="as-title" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Character name…" maxLength={limitFor('npcs', 'name')} aria-label="Name" />
        <input className="as-sub" value={form.role ?? ''} onChange={e => set('role', e.target.value || null)} placeholder="Role or title…" maxLength={limitFor('npcs', 'role')} aria-label="Role" />

        <div className="as-meta">
          <div className="as-mi">
            <span className="as-ml">Status</span>
            <div className="as-pills">
              {(['active', 'deceased', 'unknown'] as NPC['status'][]).map(s => (
                // eslint-disable-next-line no-restricted-syntax -- a status option, styled with its pill group
                <button key={s} type="button" className={`as-pill-opt${form.status === s ? ' is-active' : ''}`} onClick={() => set('status', s)}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="as-mi">
            <span className="as-ml">Met by PCs</span>
            {/* eslint-disable-next-line no-restricted-syntax -- an on/off toggle, styled .as-tog */}
            <button type="button" className={`as-tog${form.met_by_pcs ? ' is-on' : ''}`} onClick={() => set('met_by_pcs', !form.met_by_pcs)}>
              {form.met_by_pcs ? 'Yes' : 'No'}
            </button>
          </div>
        </div>

        <div className="as-grid-2">
          <div className="as-fl">
            <label className="as-ll" htmlFor={`npc-aff-${npc.id}`}>Affiliation</label>
            <input id={`npc-aff-${npc.id}`} className="as-input" value={form.affiliation ?? ''} onChange={e => set('affiliation', e.target.value || null)} placeholder="Guild, city, group…" maxLength={limitFor('npcs', 'affiliation')} />
          </div>
          <div className="as-fl">
            <label className="as-ll" htmlFor={`npc-loc-${npc.id}`}>Location</label>
            <input id={`npc-loc-${npc.id}`} className="as-input" value={form.location ?? ''} onChange={e => set('location', e.target.value || null)} placeholder="Where found…" maxLength={limitFor('npcs', 'location')} />
          </div>
          <div className="as-fl">
            <label className="as-ll" htmlFor={`npc-disp-${npc.id}`}>Toward the party</label>
            <input id={`npc-disp-${npc.id}`} className="as-input" value={form.disposition ?? ''} onChange={e => set('disposition', e.target.value || null)} placeholder="Wary, friendly, owes them a favor…" maxLength={limitFor('npcs', 'disposition')} />
          </div>
          {scope === 'campaign' && (
            <div className="as-fl">
              <label className="as-ll" htmlFor={`npc-first-${npc.id}`}>First session #</label>
              <input id={`npc-first-${npc.id}`} className="as-input" type="number" min={minFor('npcs', 'first_session')} max={maxFor('npcs', 'first_session')}
                value={form.first_session ?? ''} onChange={e => set('first_session', e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="e.g. 3" />
            </div>
          )}
        </div>

        <div className="as-fl">
          <label className="as-ll">Description</label>
          <SlashField value={form.description ?? ''} onChange={v => set('description', v || null)} placeholder="Physical appearance, personality, quirks…" minHeight="120px" maxLength={limitFor('npcs', 'description')} readOnly={locked} />
        </div>

        <div className="as-fl">
          <label className="as-ll">Factions</label>
          <FactionPillSelector selectedIds={form.faction_ids} onChange={ids => set('faction_ids', ids)} factions={factions} />
        </div>

        {sections.shown('hooks') && (
          <div className="as-fl">
            <label className="as-ll">Hooks &amp; motivations</label>
            <SlashField value={form.hooks_motivations ?? ''} onChange={v => set('hooks_motivations', v || null)} placeholder="What drives this NPC? What plot hooks do they offer?" minHeight="96px" maxLength={limitFor('npcs', 'hooks_motivations')} readOnly={locked} />
          </div>
        )}

        {sections.shown('voice') && (
          <div className="as-fl">
            <label className="as-ll">Voice</label>
            <div className="as-grid-2">
              {([
                ['accent', 'Accent & delivery', 'e.g. Gravelly baritone, speaks slowly'],
                ['patterns', 'Speech patterns', 'e.g. Never finishes sentences'],
                ['phrase', 'Signature phrase', 'e.g. "The gods have long ears…"'],
                ['tics', 'Personality tics', 'e.g. Drums fingers, avoids eye contact'],
              ] as const).map(([key, label, ph]) => (
                <div key={key} className="as-fl">
                  <label className="as-ll" htmlFor={`npc-voice-${key}-${npc.id}`}>{label}</label>
                  <input id={`npc-voice-${key}-${npc.id}`} className="as-input" value={voice[key] ?? ''} onChange={e => setVoiceField(key, e.target.value)} placeholder={ph} />
                </div>
              ))}
            </div>
          </div>
        )}

        {sections.shown('notes') && (
          <div className="as-fl">
            <label className="as-ll">DM notes</label>
            <SlashField value={form.dm_notes ?? ''} onChange={v => set('dm_notes', v || null)} placeholder="Private notes, secrets, plans…" minHeight="96px" maxLength={limitFor('npcs', 'dm_notes')} readOnly={locked} />
          </div>
        )}

        {sections.shown('statblock') && (
          <div className="as-fl">
            <label className="as-ll">Stat sheet</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <SearchableSelect value={form.statblock_id} onChange={id => set('statblock_id', id)}
                options={statblocks.map(m => ({ id: m.id, label: m.name }))} placeholder="Select stat sheet…" searchPlaceholder="Search stat sheets…" />
              {form.statblock_id && onOpenStatBlock && (
                <Button variant="primary" size="xs" onClick={() => onOpenStatBlock(form.statblock_id!)}>View</Button>
              )}
            </div>
          </div>
        )}

        <AddSections hidden={sections.hidden} labels={OPTIONAL_LABEL} onAdd={sections.add} disabled={locked} />
      </fieldset>

      {scope === 'campaign' && (
        <div className="as-fl">
          <label className="as-ll">Session history</label>
          <SessionHistory entityType="npc" entityId={npc.id} />
        </div>
      )}
    </div>
  );
}
