// The thread editor, on the same pattern as the other entity editors: it
// saves as you type, and empty parts wait in an Add row.

import { useState } from 'react';
import { TitleInput } from '../ui/TitleInput';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
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
import { ClockControl } from '../ui/ThreadClock';
import { ShareToggle } from '../ui/ShareToggle';
import { usePlayerShares } from '../../context/playerShares';
import { Button } from '../ui/Button';
import { AddSections } from './AddSections';
import { useOptionalSections } from './useOptionalSections';
import { LinkList, SingleLink, type LinkOption } from './LinkPicker';
import { CLOCK_SIZES, clockFullNote, stateAfterClock } from '../../lib/threadClock';
import type { Hook } from '../../lib/database.types';
import { SegmentedControl } from '../ui/SegmentedControl';

export type ThreadFields = Pick<Hook, 'title' | 'category' | 'state' | 'description'
  | 'clock_size' | 'clock_filled' | 'clock_label' | 'npc_ids' | 'location_ids' | 'faction_ids' | 'module_id' | 'player_text'>;

const toFields = (h: Hook): ThreadFields => ({
  title: h.title, category: h.category ?? 'side_quest', state: h.state ?? (h.is_active ? 'active' : 'resolved'), description: h.description,
  clock_size: h.clock_size ?? null, clock_filled: h.clock_filled ?? 0, clock_label: h.clock_label ?? null,
  npc_ids: h.npc_ids ?? [], location_ids: h.location_ids ?? [], faction_ids: h.faction_ids ?? [], module_id: h.module_id ?? null,
  player_text: h.player_text ?? null,
});

type Optional = 'clock' | 'links';
const OPTIONAL_LABEL: Record<Optional, string> = { clock: 'Clock', links: 'Links' };

/** What a thread can link to, and where each one opens. */
export interface ThreadLinkOptions {
  npcs: LinkOption[];
  places: LinkOption[];
  factions: LinkOption[];
  modules: LinkOption[];
  open: (kind: 'npc' | 'place' | 'faction' | 'module', id: string) => void;
}

export function ThreadEditor({ thread, links, save, remove, onDeleted, onPromote, onClose }: {
  thread: Hook;
  links?: ThreadLinkOptions;
  save: (fields: ThreadFields) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  onDeleted?: () => void;
  /** Turn the thread into a module, submodule or scene. */
  onPromote?: () => void;
  onClose?: () => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const knownToParty = usePlayerShares()?.isShared('thread', thread.id) ?? false;
  const [form, setForm] = useState<ThreadFields>(() => toFields(thread));
  const { status, saveNow } = useAutoSave({ data: form, onSave: async data => { await save(data); }, delay: 800 });
  useDiscardBlankDraft(thread.id, !form.title.trim() && !form.description?.trim(), remove);

  const set = <K extends keyof ThreadFields>(key: K, val: ThreadFields[K]) => setForm(f => ({ ...f, [key]: val }));

  const sections = useOptionalSections<Optional>({
    clock: !!form.clock_size,
    links: !!(form.npc_ids?.length || form.location_ids?.length || form.faction_ids?.length || form.module_id),
  });

  // A clock that fills wakes a seed or cold thread, and says so.
  const fillClock = (filled: number) => {
    const size = form.clock_size;
    if (!size) return;
    const state = form.state ?? 'seed';
    const next = stateAfterClock(state, size, filled);
    setForm(f => ({ ...f, clock_filled: filled, state: next }));
    if (filled >= size && (form.clock_filled ?? 0) < size) toast(clockFullNote(form.title, form.clock_label?.trim() || null, next !== state), 'success');
  };
  const setClockSize = (size: number) => setForm(f => ({ ...f, clock_size: size, clock_filled: Math.min(f.clock_filled ?? 0, size) }));
  const removeClock = () => setForm(f => ({ ...f, clock_size: null, clock_filled: 0, clock_label: null }));
  // Leaving for a linked entry takes the last edit with it.
  const openLink = links && ((kind: Parameters<ThreadLinkOptions['open']>[0]) => (id: string) => { void saveNow().then(() => links.open(kind, id)); });

  const handleDelete = async () => {
    if (await confirm({ title: 'Delete this thread?', message: 'You can undo this from its toast or Recently deleted.', confirmLabel: 'Delete', danger: true })) {
      await remove(thread.id);
      onDeleted?.();
    }
  };

  return (
    <div className="cm-detail">
      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        <ShareToggle kind="thread" id={thread.id} />
        <OverflowMenu items={[
          ...(onPromote ? [{ label: 'Promote to a module…', onClick: () => { void saveNow().then(onPromote); } }] : []),
          { label: 'Delete thread', danger: true, onClick: handleDelete },
        ]} />
        {onClose && <IconButton onClick={onClose} aria-label="Close" title="Close (Esc)">✕</IconButton>}
      </div>

      <SessionUpdateBand entityType="hook" entityId={thread.id} reserve={thread.last_updated_session != null} />

      <div className="cm-eyebrow">Thread</div>

      <TitleInput value={form.title} onChange={e => set('title', e.target.value)} placeholder="Thread title…" maxLength={limitFor('hooks', 'title')} aria-label="Title" />

      <div className="as-fl">
        <span className="as-ll">State</span>
        <SegmentedControl aria-label="State" value={form.state}
          options={THREAD_STATES.map(s => ({ value: s, label: threadStateMeta[s].label }))}
          onChange={s => set('state', s)} />
      </div>

      <div className="as-fl">
        <span className="as-ll">Kind</span>
        <SegmentedControl aria-label="Kind" value={form.category}
          options={THREAD_KINDS.map(k => ({ value: k, label: formatThreadKind(k), color: hookCategoryStyles[k].badge }))}
          onChange={k => set('category', k)} />
      </div>

      <div className="as-fl">
        <label className="as-ll">Summary</label>
        <SlashField value={form.description ?? ''} onChange={v => set('description', v || null)}
          placeholder="What is this thread about? Who and where does it touch?" minHeight="160px" maxLength={limitFor('hooks', 'description')} />
      </div>

      {knownToParty && (
        <div className="as-fl">
          <label className="as-ll" htmlFor={`thread-known-${thread.id}`}>What the players know</label>
          <textarea id={`thread-known-${thread.id}`} className="as-input th-known" rows={3} value={form.player_text ?? ''}
            placeholder="In their words: the harbormaster wants the letter back, and he’ll pay."
            onChange={e => set('player_text', e.target.value || null)} maxLength={limitFor('hooks', 'player_text')} />
          <span className="as-hint">The player page shows the thread’s title and this, under the quest log. Never the summary, clock or links.</span>
        </div>
      )}

      {sections.shown('clock') && (
        <div className="as-fl th-clock-field">
          <span className="as-ll">Clock</span>
          <p className="as-hint th-clock-note">Something moving on its own. Fill a segment when it gets closer; when it’s full, a seed or cold thread goes Active.</p>
          <SegmentedControl aria-label="Clock size" value={form.clock_size}
            options={CLOCK_SIZES.map(n => ({ value: n, label: `${n} segments` }))}
            onChange={setClockSize} />
          {form.clock_size && (
            <>
              <input className="as-input" value={form.clock_label ?? ''} onChange={e => set('clock_label', e.target.value || null)} aria-label="What happens when the clock fills"
                placeholder="What happens when it fills: the Tide Cult raises the crown…" maxLength={limitFor('hooks', 'clock_label')} />
              <ClockControl size={form.clock_size} filled={form.clock_filled ?? 0} onChange={fillClock} name="Clock" />
              <div><Button variant="link" onClick={removeClock}>Remove the clock</Button></div>
            </>
          )}
        </div>
      )}

      {links && sections.shown('links') && (
        <div className="as-fl th-links">
          <span className="as-ll">Links</span>
          <div>
            <span className="th-link-label">NPCs</span>
            <LinkList ids={form.npc_ids ?? []} options={links.npcs} onChange={ids => set('npc_ids', ids)} onOpen={openLink?.('npc')} glyph="❦" addLabel="+ Link an NPC" />
          </div>
          <div>
            <span className="th-link-label">Places</span>
            <LinkList ids={form.location_ids ?? []} options={links.places} onChange={ids => set('location_ids', ids)} onOpen={openLink?.('place')} glyph="✦" addLabel="+ Link a place" />
          </div>
          <div>
            <span className="th-link-label">Factions</span>
            <LinkList ids={form.faction_ids ?? []} options={links.factions} onChange={ids => set('faction_ids', ids)} onOpen={openLink?.('faction')} glyph="◈" addLabel="+ Link a faction" />
          </div>
          <div>
            <span className="th-link-label">Module</span>
            <SingleLink id={form.module_id} options={links.modules} onChange={id => set('module_id', id)} onOpen={openLink?.('module')} glyph="❧" placeholder="+ Link a module" />
          </div>
        </div>
      )}

      <AddSections hidden={links ? sections.hidden : sections.hidden.filter(k => k !== 'links')} labels={OPTIONAL_LABEL} onAdd={sections.add} />

      <div className="as-fl">
        <label className="as-ll">Session history</label>
        <SessionHistory entityType="hook" entityId={thread.id} />
      </div>
    </div>
  );
}
