// The thread editor, on the same pattern as the other entity editors: it
// saves as you type, and empty parts wait in an Add row.

import { useState } from 'react';
import { useConfirm } from '../../context/ConfirmContext';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useDiscardBlankDraft } from '../../hooks/useDiscardBlankDraft';
import { limitFor } from '../../lib/fieldLimits';
import { formatThreadKind, hookCategoryStyles, threadStateMeta, THREAD_KINDS, THREAD_STATES } from '../../lib/theme';
import { IconButton } from '../ui/IconButton';
import { OverflowMenu } from '../ui/OverflowMenu';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import { SlashField } from '../ui/SlashField';
import { SessionHistory } from '../session/SessionHistory';
import { SessionUpdateBand } from '../session/SessionUpdateBand';
import type { Hook } from '../../lib/database.types';

export type ThreadFields = Pick<Hook, 'title' | 'category' | 'state' | 'description'>;

const toFields = (h: Hook): ThreadFields => ({
  title: h.title, category: h.category ?? 'side_quest', state: h.state ?? (h.is_active ? 'active' : 'resolved'), description: h.description,
});

export function ThreadEditor({ thread, save, remove, onDeleted, onPromote, onClose }: {
  thread: Hook;
  save: (fields: ThreadFields) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  onDeleted?: () => void;
  /** Turn the thread into a module, submodule or scene. */
  onPromote?: () => void;
  onClose?: () => void;
}) {
  const confirm = useConfirm();
  const [form, setForm] = useState<ThreadFields>(() => toFields(thread));
  const { status, saveNow } = useAutoSave({ data: form, onSave: async data => { await save(data); }, delay: 800 });
  useDiscardBlankDraft(thread.id, !form.title.trim() && !form.description?.trim(), remove);

  const set = <K extends keyof ThreadFields>(key: K, val: ThreadFields[K]) => setForm(f => ({ ...f, [key]: val }));

  const handleDelete = async () => {
    if (await confirm({ title: 'Delete this thread?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) {
      await remove(thread.id);
      onDeleted?.();
    }
  };

  return (
    <div className="cm-detail">
      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        <OverflowMenu items={[
          ...(onPromote ? [{ label: 'Promote to a module…', onClick: () => { void saveNow().then(onPromote); } }] : []),
          { label: 'Delete thread', danger: true, onClick: handleDelete },
        ]} />
        {onClose && <IconButton onClick={onClose} aria-label="Close" title="Close (Esc)">✕</IconButton>}
      </div>

      <SessionUpdateBand entityType="hook" entityId={thread.id} />

      <div className="cm-eyebrow">Thread</div>

      <input className="as-title" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Thread title…" maxLength={limitFor('hooks', 'title')} aria-label="Title" />

      <div className="as-fl">
        <span className="as-ll">State</span>
        <div className="as-pills" role="radiogroup" aria-label="State">
          {THREAD_STATES.map(s => (
            // eslint-disable-next-line no-restricted-syntax -- an option in its pill group
            <button key={s} type="button" role="radio" aria-checked={form.state === s} className={`as-pill-opt${form.state === s ? ' is-active' : ''}`} onClick={() => set('state', s)}>
              {threadStateMeta[s].label}
            </button>
          ))}
        </div>
      </div>

      <div className="as-fl">
        <span className="as-ll">Kind</span>
        <div className="as-pills" role="radiogroup" aria-label="Kind">
          {THREAD_KINDS.map(k => (
            // eslint-disable-next-line no-restricted-syntax -- an option in its pill group, coloured by kind
            <button key={k} type="button" role="radio" aria-checked={form.category === k} className={`as-pill-opt${form.category === k ? ' is-active' : ''}`} style={form.category === k ? undefined : { color: hookCategoryStyles[k].badge }} onClick={() => set('category', k)}>
              {formatThreadKind(k)}
            </button>
          ))}
        </div>
      </div>

      <div className="as-fl">
        <label className="as-ll">Summary</label>
        <SlashField value={form.description ?? ''} onChange={v => set('description', v || null)}
          placeholder="What is this thread about? Who and where does it touch?" minHeight="160px" maxLength={limitFor('hooks', 'description')} />
      </div>

      <div className="as-fl">
        <label className="as-ll">Session history</label>
        <SessionHistory entityType="hook" entityId={thread.id} />
      </div>
    </div>
  );
}
