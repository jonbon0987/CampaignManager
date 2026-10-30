// The one lore editor, used in the world and in its campaigns.

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
import type { EntityCanon, EntityScope } from './types';
import type { LoreEntry } from '../../lib/database.types';

export type LoreFields = Pick<LoreEntry, 'title' | 'category' | 'dm_only' | 'content'>;

const toFields = (e: LoreEntry): LoreFields => ({ title: e.title, category: e.category, dm_only: e.dm_only ?? false, content: e.content });

const CATEGORIES = ['history', 'artifact', 'creature', 'magic', 'religion'] as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function LoreEditor({ entry, scope, save, remove, onDeleted, canon }: {
  entry: LoreEntry;
  scope: EntityScope;
  save: (fields: LoreFields) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  onDeleted?: () => void;
  canon?: EntityCanon<LoreFields>;
}) {
  const confirm = useConfirm();
  const [form, setForm] = useState<LoreFields>(() => toFields(entry));
  const { locked, unlock } = useCanonLock(canon?.origin);

  const { status, saveNow } = useAutoSave({ data: form, onSave: async data => { await save(data); }, delay: 800 });
  useDiscardBlankDraft(entry.id, !form.title.trim() && !form.content?.trim(), remove);

  const set = <K extends keyof LoreFields>(key: K, val: LoreFields[K]) => setForm(f => ({ ...f, [key]: val }));

  const handleDelete = async () => {
    if (await confirm({ title: 'Delete this lore entry?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) {
      await remove(entry.id);
      onDeleted?.();
    }
  };

  return (
    <div className="cm-detail">
      {canon && (
        <OriginBand origin={canon.origin} noun="lore entry" locked={locked} onUnlock={unlock}
          onOpenInCanon={canon.onOpenInCanon} onPublish={() => void saveNow().then(() => canon.onPublish(form))} onDetach={canon.onDetach} />
      )}

      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        <OverflowMenu items={[{ label: 'Delete entry', danger: true, onClick: handleDelete }]} />
      </div>

      {scope === 'campaign' && <SessionUpdateBand entityType="lore" entityId={entry.id} />}

      <div className="cm-eyebrow">{scope === 'world' ? 'World lore' : 'Lore'}</div>

      <fieldset className="as-fieldset" disabled={locked}>
        <input className="as-title" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Entry title…" maxLength={limitFor('lore_entries', 'title')} aria-label="Title" />

        <div className="as-meta">
          <div className="as-mi">
            <label className="as-ml" htmlFor={`lore-cat-${entry.id}`}>Category</label>
            <select id={`lore-cat-${entry.id}`} className="as-select" value={form.category ?? 'history'} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{cap(c)}</option>)}
            </select>
          </div>
          <div className="as-mi">
            <span className="as-ml">Players</span>
            <div className="as-pills">
              {/* eslint-disable-next-line no-restricted-syntax -- an on/off option, styled with its pill group */}
              <button type="button" className={`as-pill-opt${form.dm_only ? ' is-active' : ''}`} onClick={() => set('dm_only', !form.dm_only)}>
                {form.dm_only ? 'Hidden from players' : 'Visible to players'}
              </button>
            </div>
          </div>
        </div>

        <div className="as-fl">
          <label className="as-ll">Content</label>
          <SlashField value={form.content ?? ''} onChange={v => set('content', v || null)} placeholder="Lore content…" minHeight="184px" maxLength={limitFor('lore_entries', 'content')} readOnly={locked} />
        </div>
      </fieldset>

      {scope === 'campaign' && (
        <div className="as-fl">
          <label className="as-ll">Session history</label>
          <SessionHistory entityType="lore" entityId={entry.id} />
        </div>
      )}
    </div>
  );
}
