// Threads: one board, from the first note to the resolved thread.
//   Inbox → Seed → Active → Cold → Resolved
// An idea waits in the Inbox until it's promoted (to a thread, a lore entry or
// a place). A thread's column is its state: drag it to another, or set it in
// the thread's own page.

import { useEffect, useState, type DragEvent } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useOpenRecord, useReportRecord } from '../../context/NavigationContext';
import { markDraft } from '../../hooks/useDiscardBlankDraft';
import { limitFor } from '../../lib/fieldLimits';
import { plainText } from '../../lib/sessionLifecycle';
import { formatThreadKind, hookCategoryStyles, threadStateMeta, THREAD_STATES } from '../../lib/theme';
import { PageHeader } from '../ui/PageHeader';
import { SearchBar } from '../ui/SearchBar';
import { Button } from '../ui/Button';
import { ThreadEditor, type ThreadFields } from '../entity/ThreadEditor';
import { PromoteThreadModal } from './PromoteThreadModal';
import type { Hook, Idea } from '../../lib/database.types';

type Column = 'inbox' | (typeof THREAD_STATES)[number];
const DRAG_THREAD = 'application/x-thread';
const DRAG_IDEA = 'application/x-idea';

const stateOf = (h: Hook) => h.state ?? (h.is_active ? 'active' : 'resolved');
const firstWords = (text: string, n = 8) => text.trim().split(/\s+/).slice(0, n).join(' ') || 'Untitled';

// Compact relative age, e.g. "2d", "3w", "just now".
function formatAge(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const wks = Math.floor(days / 7);
  if (wks < 5) return `${wks}w`;
  return `${Math.floor(days / 30)}mo`;
}

function IdeaCard({ idea, onPromote, onDismiss }: {
  idea: Idea;
  onPromote: (idea: Idea, to: 'thread' | 'lore' | 'location') => void;
  onDismiss: (idea: Idea) => void;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="cm-idea th-idea" draggable onDragStart={e => { e.dataTransfer.setData(DRAG_IDEA, idea.id); e.dataTransfer.effectAllowed = 'move'; }}>
      <div className="cm-idea-top">
        <span className="cm-idea-glyph" aria-hidden>✎</span>
        {idea.tag && <span className="cm-idea-tag">{idea.tag}</span>}
        <span className="cm-idea-age">{formatAge(idea.created_at)}</span>
      </div>
      <p className="cm-idea-text">{idea.text || <span style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>Empty note</span>}</p>
      <div className="cm-idea-actions">
        <div className="cm-promote-wrap">
          <Button variant="secondary" size="xs" onClick={() => setMenu(m => !m)}>Promote ▾</Button>
          {menu && (
            <>
              <div className="cm-promote-scrim" onClick={() => setMenu(false)} />
              <div className="cm-promote-menu">
                <button onClick={() => { setMenu(false); onPromote(idea, 'thread'); }}><span style={{ color: 'var(--orange)' }}>✧</span> to a Thread</button>
                <button onClick={() => { setMenu(false); onPromote(idea, 'lore'); }}><span style={{ color: 'var(--gold)' }}>❡</span> to a Lore entry</button>
                <button onClick={() => { setMenu(false); onPromote(idea, 'location'); }}><span style={{ color: 'var(--moss)' }}>✦</span> to a Location</button>
              </div>
            </>
          )}
        </div>
        <Button variant="link" onClick={() => onDismiss(idea)}>Dismiss</Button>
      </div>
    </div>
  );
}

/** Jot an idea straight into the Inbox. */
function IdeaComposer({ onAdd }: { onAdd: (text: string, tag: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [tag, setTag] = useState('');
  const save = async () => {
    if (!text.trim()) return;
    await onAdd(text.trim(), tag.trim());
    setText(''); setTag(''); setOpen(false);
  };
  if (!open) return <Button variant="ghost" size="sm" className="th-add" onClick={() => setOpen(true)}>+ Add idea</Button>;
  return (
    <div className="th-compose">
      <textarea className="cm-drawer-text th-compose-text" autoFocus value={text} onChange={e => setText(e.target.value)}
        placeholder="A spark, a twist, a scene, a name…" maxLength={limitFor('ideas', 'text')} aria-label="Idea"
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save(); if (e.key === 'Escape') setOpen(false); }} />
      <input className="cm-drawer-tag" value={tag} onChange={e => setTag(e.target.value)} placeholder="Tag (optional)"
        maxLength={limitFor('ideas', 'tag')} aria-label="Tag" onKeyDown={e => { if (e.key === 'Enter') void save(); }} />
      <div className="th-compose-foot">
        <Button variant="ghost" size="xs" onClick={() => setOpen(false)}>Cancel</Button>
        <Button variant="primary" size="xs" onClick={() => void save()} disabled={!text.trim()}>Save idea</Button>
      </div>
    </div>
  );
}

function ThreadCard({ h, onOpen }: { h: Hook; onOpen: () => void }) {
  const ks = hookCategoryStyles[h.category ?? 'side_quest'] ?? hookCategoryStyles.side_quest;
  const sum = h.description ? plainText(h.description) : '';
  return (
    <div className="th-card" role="button" tabIndex={0} draggable
      style={{ borderLeftColor: ks.badge }}
      onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      onDragStart={e => { e.dataTransfer.setData(DRAG_THREAD, h.id); e.dataTransfer.effectAllowed = 'move'; }}>
      <span className="th-card-kind" style={{ color: ks.badge }}>{formatThreadKind(h.category)}</span>
      <span className="th-card-title">{h.title || 'Untitled thread'}</span>
      {sum && <span className="th-card-sum">{sum}</span>}
      {h.last_updated_session != null && <span className="th-card-foot">Session {h.last_updated_session}</span>}
    </div>
  );
}

export default function Threads({ openId, onOpenConsumed }: { openId?: string | null; onOpenConsumed?: () => void }) {
  const { hooks, ideas, upsertHook, deleteHook, upsertIdea, deleteIdea, promoteIdea, upsertLore, upsertLocation } = useCampaign();
  const confirm = useConfirm();
  const openRecord = useOpenRecord();
  const [search, setSearch] = useState('');
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<Hook | null>(null);
  const [over, setOver] = useState<Column | null>(null);
  useReportRecord('threads', openThreadId);

  // Open a thread requested from outside the tab (search, Recent).
  useEffect(() => {
    if (!openId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hooks.some(h => h.id === openId)) setOpenThreadId(openId);
    onOpenConsumed?.();
  }, [openId, hooks, onOpenConsumed]);

  const openThread = hooks.find(h => h.id === openThreadId) ?? null;
  useEffect(() => {
    if (!openThread) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenThreadId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openThread]);

  const q = search.trim().toLowerCase();
  const matches = (...texts: (string | null)[]) => !q || texts.some(t => t?.toLowerCase().includes(q));
  const inbox = ideas.filter(i => !i.promoted_hook_id && matches(i.text, i.tag));
  const shown = hooks.filter(h => matches(h.title, h.description));
  const live = hooks.filter(h => stateOf(h) !== 'resolved').length;

  const saveThread = (h: Hook) => (f: ThreadFields) => upsertHook({
    id: h.id, ...f, is_active: f.state !== 'resolved',
    last_updated_session: h.last_updated_session, dm_only_notes: h.dm_only_notes,
  });

  const moveThread = async (h: Hook, state: string) => {
    if (stateOf(h) === state) return;
    await saveThread(h)({ title: h.title, category: h.category, description: h.description, state });
  };

  const addThread = async () => {
    const h = await upsertHook({ title: '', category: 'side_quest', description: null, state: 'seed', is_active: true, last_updated_session: null, dm_only_notes: null });
    if (h) { markDraft(h.id); setOpenThreadId(h.id); }
  };

  const promote = async (idea: Idea, to: 'thread' | 'lore' | 'location', state = 'seed') => {
    if (to === 'thread') {
      const h = await promoteIdea(idea, 'side_quest');
      if (h && state !== 'seed') await moveThread(h, state);
      return;
    }
    if (to === 'lore') {
      const entry = await upsertLore({ title: firstWords(idea.text), category: null, content: idea.text, dm_only: false, world_id: null });
      await deleteIdea(idea.id);
      openRecord('lore', entry.id);
      return;
    }
    const place = await upsertLocation({
      name: firstWords(idea.text), location_type: 'landmark', region: null, parent_id: null,
      description: idea.text, dm_notes: null, history: null, population: null, status: null, world_id: null,
    });
    await deleteIdea(idea.id);
    openRecord('locations', place.id);
  };

  const dismiss = async (idea: Idea) => {
    if (await confirm('Dismiss this idea?')) await deleteIdea(idea.id);
  };

  // Dragging: a thread to another state, or an idea out of the Inbox.
  const accepts = (col: Column, e: DragEvent) =>
    col !== 'inbox' && (e.dataTransfer.types.includes(DRAG_THREAD) || e.dataTransfer.types.includes(DRAG_IDEA));
  const drop = (col: Column) => (e: DragEvent) => {
    setOver(null);
    if (col === 'inbox') return;
    const threadId = e.dataTransfer.getData(DRAG_THREAD);
    const ideaId = e.dataTransfer.getData(DRAG_IDEA);
    const h = threadId ? hooks.find(x => x.id === threadId) : null;
    const idea = ideaId ? ideas.find(x => x.id === ideaId) : null;
    if (h) void moveThread(h, col);
    else if (idea) void promote(idea, 'thread', col);
  };

  const columns: Column[] = ['inbox', ...THREAD_STATES];

  return (
    <div className="th">
      <PageHeader title="Threads" eyebrow={`${live} live · ${hooks.length} total · ${ideas.filter(i => !i.promoted_hook_id).length} in the inbox`}>
        <div style={{ width: 220 }}><SearchBar value={search} onChange={setSearch} placeholder="Search threads and ideas…" /></div>
        <Button variant="secondary" size="sm" onClick={() => void addThread()}>+ Add thread</Button>
      </PageHeader>

      <div className="th-board">
        {columns.map(col => {
          const meta = col === 'inbox' ? { label: 'Inbox', color: 'var(--sky)' } : threadStateMeta[col];
          const cards = col === 'inbox' ? [] : shown.filter(h => stateOf(h) === col);
          const count = col === 'inbox' ? inbox.length : cards.length;
          return (
            <section key={col} aria-label={meta.label} className={`th-col${over === col ? ' is-over' : ''}${col === 'inbox' ? ' is-inbox' : ''}`}
              onDragOver={e => { if (accepts(col, e)) { e.preventDefault(); setOver(col); } }}
              onDragLeave={() => setOver(o => (o === col ? null : o))}
              onDrop={drop(col)}>
              <div className="th-col-head" style={{ color: meta.color }}>
                {meta.label}<span className="cm-pipe-coln">{count}</span>
              </div>
              {col === 'inbox' && (
                <>
                  <IdeaComposer onAdd={(text, tag) => upsertIdea({ text, tag: tag || null, promoted_hook_id: null })} />
                  {inbox.map(i => <IdeaCard key={i.id} idea={i} onPromote={(idea, to) => void promote(idea, to)} onDismiss={idea => void dismiss(idea)} />)}
                  {inbox.length === 0 && <p className="th-empty">{q ? 'No ideas match.' : 'Nothing waiting. Jot ideas here, or anywhere with ⌘.'}</p>}
                </>
              )}
              {cards.map(h => <ThreadCard key={h.id} h={h} onOpen={() => setOpenThreadId(h.id)} />)}
              {col !== 'inbox' && cards.length === 0 && <p className="th-empty">—</p>}
            </section>
          );
        })}
      </div>

      <div className={`cm-drawer-wrap${openThread ? ' is-open' : ''}`} aria-hidden={!openThread}>
        <div className="cm-drawer-back" onClick={() => setOpenThreadId(null)} />
        <div className="cm-drawer th-drawer" role="dialog" aria-label={openThread?.title || 'Thread'}>
          {openThread && (
            <ThreadEditor key={openThread.id} thread={openThread} save={saveThread(openThread)} remove={deleteHook}
              onDeleted={() => setOpenThreadId(null)} onPromote={() => { setPromoting(openThread); setOpenThreadId(null); }}
              onClose={() => setOpenThreadId(null)} />
          )}
        </div>
      </div>

      {promoting && <PromoteThreadModal thread={promoting} onClose={() => setPromoting(null)} />}
    </div>
  );
}
