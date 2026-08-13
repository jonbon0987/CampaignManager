import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import type { Tab } from '../../App';
import { Modal } from '../Modal';
import { FormField, inputStyle } from '../FormField';
import { SlashField } from '../ui/SlashField';
import { limitFor } from '../../lib/fieldLimits';
import { SectionHeader } from '../ui/SectionHeader';
import { SearchBar } from '../ui/SearchBar';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { MarkdownContent } from '../ui/MarkdownContent';
import { hookCategoryStyles, threadStateMeta, THREAD_STATES, getThreadState } from '../../lib/theme';
import type { Hook } from '../../lib/database.types';

const KINDS = ['main_plot', 'side_quest', 'character_arc', 'faction'] as const;

const formatKind = (k: string | null) =>
  !k ? 'Misc' : k.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

type ThreadForm = { title: string; category: string | null; description: string | null; state: string };
const emptyForm = (): ThreadForm => ({ title: '', category: 'side_quest', description: '', state: 'seed' });

function StateBadge({ state }: { state: string | null }) {
  const s = getThreadState(state);
  return (
    <span
      className="cm-state-badge"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.line}` }}
    >
      {s.label}
    </span>
  );
}

export default function Threads({ viewMode = 'board' }: { viewMode?: string; onNavigate?: (t: Tab) => void }) {
  const { hooks, upsertHook, deleteHook } = useCampaign();
  const confirm = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ThreadForm>(emptyForm());
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState<string>('all');

  const threads = hooks.filter(h => {
    if (search && !h.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const stateOf = (h: Hook) => h.state ?? (h.is_active ? 'active' : 'resolved');

  const openAdd = () => { setEditingId(null); setForm(emptyForm()); setModalOpen(true); };
  const openEdit = (h: Hook) => {
    setEditingId(h.id);
    setForm({ title: h.title, category: h.category, description: h.description, state: stateOf(h) });
    setModalOpen(true);
  };

  const save = async () => {
    const existing = editingId ? hooks.find(h => h.id === editingId) : null;
    await upsertHook({
      id: editingId ?? undefined,
      title: form.title,
      category: form.category,
      description: form.description,
      state: form.state,
      is_active: form.state !== 'resolved',
      last_updated_session: existing?.last_updated_session ?? null,
      dm_only_notes: existing?.dm_only_notes ?? null,
    });
    setModalOpen(false);
  };

  const changeState = async (h: Hook, state: string) => {
    await upsertHook({
      id: h.id, title: h.title, category: h.category, description: h.description,
      state, is_active: state !== 'resolved',
      last_updated_session: h.last_updated_session, dm_only_notes: h.dm_only_notes,
    });
  };

  const handleDelete = async (id: string) => {
    if (await confirm('Delete this thread?')) await deleteHook(id);
  };

  const ThreadCard = ({ h }: { h: Hook }) => {
    const st = getThreadState(stateOf(h));
    const ks = hookCategoryStyles[h.category ?? 'side_quest'] ?? hookCategoryStyles.side_quest;
    return (
      <div className="cm-threadcard" style={{ borderTopColor: st.color }}>
        <div className="cm-threadcard-top">
          <StateBadge state={stateOf(h)} />
          <span className="cm-threadcard-kind" style={{ color: ks.badge }}>{formatKind(h.category)}</span>
        </div>
        <h3 className="cm-threadcard-title">{h.title || 'Untitled Thread'}</h3>
        <div className="cm-threadcard-sum">
          {h.description
            ? <MarkdownContent text={h.description} className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: 1.55 }} />
            : <span style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>No summary yet.</span>}
        </div>
        <div className="cm-threadcard-foot">
          <select
            className="cm-state-select"
            value={stateOf(h)}
            onChange={e => changeState(h, e.target.value)}
            title="Change lifecycle state"
          >
            {THREAD_STATES.map(s => <option key={s} value={s}>{threadStateMeta[s].label}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" onClick={() => openEdit(h)} title="Edit"><Pencil size={12} strokeWidth={1.5} /></Button>
          <Button variant="danger" size="sm" onClick={() => handleDelete(h.id)}>×</Button>
        </div>
      </div>
    );
  };

  const activeCount = hooks.filter(h => stateOf(h) !== 'resolved').length;

  return (
    <div style={{ padding: '28px' }}>
      <SectionHeader
        title="Threads"
        subtitle={`${activeCount} live · ${hooks.length} total`}
        onAdd={openAdd}
        addLabel="New Thread"
        extra={
          <div style={{ width: 200 }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search threads…" />
          </div>
        }
      />

      {viewMode === 'pipeline' ? (
        /* Pipeline — a kanban by lifecycle state */
        <div className="cm-pipe">
          {THREAD_STATES.map(s => {
            const col = threads.filter(h => stateOf(h) === s);
            return (
              <div key={s} className="cm-pipe-col">
                <div className="cm-pipe-colhead" style={{ color: threadStateMeta[s].color }}>
                  {threadStateMeta[s].label}<span className="cm-pipe-coln">{col.length}</span>
                </div>
                {col.map(h => <ThreadCard key={h.id} h={h} />)}
                {col.length === 0 && <div className="cm-pipe-empty">—</div>}
              </div>
            );
          })}
        </div>
      ) : (
        /* Board — filterable grid */
        <>
          <div className="flex gap-1 flex-wrap mb-4">
            {(['all', ...THREAD_STATES] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterState(s)}
                className="text-xs px-3 py-1.5 rounded transition-colors"
                style={{
                  backgroundColor: filterState === s ? 'var(--rule)' : 'var(--paper-2)',
                  color: filterState === s ? 'var(--ink)' : 'var(--ink-2)',
                  border: '1px solid var(--rule)',
                }}
              >
                {s === 'all' ? 'All' : threadStateMeta[s].label}
              </button>
            ))}
          </div>
          {(() => {
            const shown = filterState === 'all' ? threads : threads.filter(h => stateOf(h) === filterState);
            if (shown.length === 0) {
              return (
                <EmptyState
                  message={hooks.length === 0 ? 'No threads yet. Promote an idea or add one.' : 'No threads match the current filter.'}
                  onAdd={hooks.length === 0 ? openAdd : undefined}
                  addLabel="New Thread"
                />
              );
            }
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {shown.map(h => <ThreadCard key={h.id} h={h} />)}
              </div>
            );
          })()}
        </>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Thread' : 'New Thread'} onSave={save}>
        <FormField label="Title">
          <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g., The Seventh Shard" maxLength={limitFor('hooks', 'title')} style={inputStyle} />
        </FormField>
        <FormField label="Kind">
          <div className="flex gap-2 flex-wrap">
            {KINDS.map(c => {
              const ks = hookCategoryStyles[c];
              return (
                <button
                  key={c}
                  onClick={() => setForm(p => ({ ...p, category: c }))}
                  className="text-sm px-4 py-2 rounded flex-1 transition-colors"
                  style={{
                    backgroundColor: form.category === c ? ks.badgeBg : 'var(--paper-2)',
                    color: ks.badge, border: `1px solid ${ks.border}`,
                    fontWeight: form.category === c ? 600 : 400,
                    outline: form.category === c ? `1px solid ${ks.badge}` : 'none',
                  }}
                >
                  {formatKind(c)}
                </button>
              );
            })}
          </div>
        </FormField>
        <FormField label="Lifecycle">
          <div className="flex gap-2 flex-wrap">
            {THREAD_STATES.map(s => {
              const ms = threadStateMeta[s];
              return (
                <button
                  key={s}
                  onClick={() => setForm(p => ({ ...p, state: s }))}
                  className="text-sm px-4 py-2 rounded flex-1 transition-colors"
                  style={{
                    backgroundColor: form.state === s ? ms.bg : 'var(--paper-2)',
                    color: ms.color, border: `1px solid ${ms.line}`,
                    fontWeight: form.state === s ? 600 : 400,
                  }}
                >
                  {ms.label}
                </button>
              );
            })}
          </div>
        </FormField>
        <FormField label="Summary / Notes">
          <SlashField value={form.description ?? ''} onChange={v => setForm(p => ({ ...p, description: v }))} placeholder="What is this thread about? Who and where does it touch?" minHeight="180px" maxLength={limitFor('hooks', 'description')} />
        </FormField>
      </Modal>
    </div>
  );
}
