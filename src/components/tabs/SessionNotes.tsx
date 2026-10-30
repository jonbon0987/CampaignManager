import { useState, useEffect, useRef } from 'react';
import { useOpenRecord, useReportRecord } from '../../context/NavigationContext';
import { SlashField } from '../ui/SlashField';
import { limitFor, maxFor } from '../../lib/fieldLimits';
import { Swords, Gift, Lightbulb, Eye, Plus, Search } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { OverflowMenu } from '../ui/OverflowMenu';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import { Button } from '../ui/Button';
import { useAutoSave } from '../../hooks/useAutoSave';
import { RecorderPanel } from '../session/RecorderPanel';
import { SessionPrep } from '../session/SessionPrep';
import { SessionChronicles } from '../session/SessionChronicles';
import { LeftOpenToInbox } from '../session/LeftOpenToInbox';
import { blankSession, formatSessionDate, nextSessionNumber, plainText, clip, STATUS_LABEL } from '../../lib/sessionLifecycle';
import { noteStamp } from '../../lib/playTime';
import type { Session, SessionPlan, SessionStatus } from '../../lib/database.types';

type SessionForm = {
  session_number: number;
  session_date: string | null;
  title: string | null;
  status: SessionStatus;
  prep_notes: string | null;
  plan: SessionPlan;
  summary: string | null;
  combats: string | null;
  loot_rewards: string | null;
  hooks_notes: string | null;
  dm_notes: string | null;
};

const toForm = (s: Session): SessionForm => ({
  session_number: s.session_number,
  session_date: s.session_date,
  title: s.title,
  status: s.status,
  prep_notes: s.prep_notes,
  plan: s.plan ?? {},
  summary: s.summary,
  combats: s.combats,
  loot_rewards: s.loot_rewards,
  hooks_notes: s.hooks_notes,
  dm_notes: s.dm_notes,
});

// The plan is an object, so compare by value.
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

type Phase = 'prep' | 'recap';
const PHASES: { id: Phase; label: string }[] = [
  { id: 'prep', label: 'Prep' },
  { id: 'recap', label: 'Recap' },
];

/* Section label with rule */
function SectionLabel({ label }: { label: string }) {
  return (
    <div className="cm-section-head" style={{ marginBottom: 8 }}>
      <span className="cm-section-title">{label}</span>
      <div className="cm-section-rule" />
    </div>
  );
}

/* Collapsible section for structured fields */
function SessionSection({
  icon: Icon,
  label,
  dmOnly,
  filled,
  children,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  dmOnly?: boolean;
  /** Has something in it, so it starts open. */
  filled?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!filled);
  return (
    <div
      className="rounded border overflow-hidden"
      style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--bg-2)' }}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-medium transition-colors duration-150"
        style={{ color: 'var(--gold)', letterSpacing: '0.06em' }}
      >
        <span style={{ color: 'var(--ink-3)', fontSize: '10px' }}>{open ? '▾' : '▸'}</span>
        <Icon size={12} strokeWidth={1.8} />
        <span style={{ textTransform: 'uppercase', fontSize: '0.65rem' }}>{label}</span>
        {dmOnly && (
          <span
            className="ml-auto text-[9px] px-1.5 py-0.5 rounded"
            style={{ backgroundColor: 'rgba(201,168,76,0.08)', color: 'var(--gold)', border: '1px solid var(--rule)' }}
          >
            DM Only
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3" style={{ borderTop: '1px solid var(--rule)' }}>
          <div className="pt-2">{children}</div>
        </div>
      )}
    </div>
  );
}

/* Detail panel — one session from plan to recap, autosaved */
function SessionDetail({
  session,
  sessions,
  onDeleted,
  onOpenSession,
}: {
  session: Session;
  sessions: Session[];
  onDeleted: () => void;
  onOpenSession: (id: string) => void;
}) {
  const { upsertSession, deleteSession } = useCampaign();
  const confirm = useConfirm();

  const [form, setForm] = useState<SessionForm>(() => toForm(session));
  // A session still to play opens on its prep; one played opens on its recap,
  // and so does one the moment it's ended.
  const [phase, setPhase] = useState<Phase>(session.status === 'done' ? 'recap' : 'prep');
  const lastStatus = useRef(session.status);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- following the session's end
    if (lastStatus.current === 'live' && session.status === 'done') setPhase('recap');
    lastStatus.current = session.status;
  }, [session.status]);
  const tableNotes = session.play?.notes ?? [];

  // The session as last seen from the server, to tell outside changes from the DM's edits.
  const lastSaved = useRef(session);

  // Take in changes made elsewhere (a recording's write-back, the assistant,
  // starting or ending the session) for fields the DM hasn't touched here.
  // Without this the form kept the old value and autosave would write it back
  // over the new one.
  useEffect(() => {
    const prev = lastSaved.current;
    lastSaved.current = session;
    if (prev.id !== session.id) return;
    const before = toForm(prev);
    const after = toForm(session);
    setForm(f => {
      let changed = false;
      const next = { ...f };
      for (const k of Object.keys(f) as (keyof SessionForm)[]) {
        if (!same(after[k], before[k]) && same(f[k], before[k])) {
          (next as Record<string, unknown>)[k] = after[k];
          changed = true;
        }
      }
      return changed ? next : f;
    });
  }, [session]);

  const { status, saveNow } = useAutoSave({
    data: form,
    onSave: async (data) => {
      await upsertSession({ id: session.id, ...data });
    },
    delay: 800,
  });

  const set = <K extends keyof SessionForm>(k: K, v: SessionForm[K]) => setForm(prev => ({ ...prev, [k]: v }));

  const handleDelete = async () => {
    if (await confirm('Delete this session?')) {
      await deleteSession(session.id);
      onDeleted();
    }
  };

  return (
    <div className="cm-detail">
      {/* Action bar */}
      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        <OverflowMenu items={[
          { label: 'Delete session', onClick: handleDelete, danger: true },
        ]} />
      </div>

      <div className="cm-detail-body">
        <header className="ss-head">
          <div className="cm-detail-eyebrow">
            Session {form.session_number}
            {form.status === 'live' && <span className="ss-live"> · ● Live</span>}
          </div>
          <input
            className="as-title"
            value={form.title ?? ''}
            onChange={e => set('title', e.target.value || null)}
            placeholder="Untitled session"
            aria-label="Session title"
            maxLength={limitFor('sessions', 'title')}
          />
          <div className="ss-meta">
            <div className="as-fl">
              <label className="as-ll" htmlFor={`ss-num-${session.id}`}>Session #</label>
              <input
                id={`ss-num-${session.id}`}
                className="as-input"
                type="number"
                style={{ width: 80, colorScheme: 'dark' }}
                value={form.session_number}
                min={1}
                max={maxFor('sessions', 'session_number')}
                onChange={e => set('session_number', parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="as-fl">
              <label className="as-ll" htmlFor={`ss-date-${session.id}`}>{form.status === 'done' ? 'Played on' : 'Date'}</label>
              <input
                id={`ss-date-${session.id}`}
                className="as-input"
                type="date"
                style={{ colorScheme: 'dark' }}
                value={form.session_date ?? ''}
                onChange={e => set('session_date', e.target.value || null)}
              />
            </div>
            <div className="as-fl">
              <span className="as-ll" id={`ss-status-${session.id}`}>Status</span>
              <div className="flex gap-1" role="radiogroup" aria-labelledby={`ss-status-${session.id}`}>
                {(['planned', 'done'] as const).map(st => (
                  // eslint-disable-next-line no-restricted-syntax -- a status pill, styled by .cm-pill
                  <button className={`cm-pill is-subtle${form.status === st ? ' is-active' : ''}`}
                    key={st}
                    type="button"
                    role="radio"
                    aria-checked={form.status === st}
                    onClick={() => set('status', st)}
                  >
                    {STATUS_LABEL[st]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        <div className="cm-subtabs" role="tablist" aria-label="Session phase">
          {PHASES.map(p => (
            // eslint-disable-next-line no-restricted-syntax -- a phase tab, styled with its strip
            <button className={`cm-subtab${phase === p.id ? ' is-active' : ''}`}
              key={p.id}
              type="button"
              role="tab"
              aria-selected={phase === p.id}
              onClick={() => setPhase(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {phase === 'prep' ? (
          <SessionPrep
            session={session}
            sessions={sessions}
            plan={form.plan}
            prepNotes={form.prep_notes}
            onPlan={plan => set('plan', plan)}
            onPrepNotes={v => set('prep_notes', v)}
            onOpenSession={onOpenSession}
          />
        ) : (
          <>
            <RecorderPanel session={session} />

            {/* Recap / Summary */}
            <div className="cm-section">
              <SectionLabel label="Recap" />
              <SlashField
                value={form.summary ?? ''}
                onChange={v => set('summary', v || null)}
                placeholder="What happened this session… A recording writes this for you once it's transcribed."
                maxLength={limitFor('sessions', 'summary')}
              />
            </div>

            {/* What the recording's chronicle wrote into the campaign */}
            <SessionChronicles sessionId={session.id} />

            {tableNotes.length > 0 && (
              <div className="cm-section">
                <SectionLabel label="Noted at the table" />
                <ul className="ss-notes">
                  {tableNotes.map(n => (
                    <li key={n.id} className="ss-note">
                      <span className="pt-stamp">{noteStamp(n.at, session.play?.started_at)}</span>
                      <span>{n.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* The session's own fields, filled by the chronicle or by hand */}
            <div className="flex flex-col gap-2">
              <SessionSection icon={Swords} label="Combat Summary" filled={!!form.combats}>
                <SlashField
                value={form.combats ?? ''}
                onChange={v => set('combats', v || null)}
                placeholder="Describe combats that took place…"
                maxLength={limitFor('sessions', 'combats')}
              />
              </SessionSection>
              <SessionSection icon={Gift} label="Loot & Rewards" filled={!!form.loot_rewards}>
                <SlashField
                value={form.loot_rewards ?? ''}
                onChange={v => set('loot_rewards', v || null)}
                placeholder="Items, gold, or rewards gained…"
                maxLength={limitFor('sessions', 'loot_rewards')}
              />
              </SessionSection>
              <SessionSection icon={Lightbulb} label="Left open for next time" filled={!!form.hooks_notes}>
                <SlashField
                value={form.hooks_notes ?? ''}
                onChange={v => set('hooks_notes', v || null)}
                placeholder="Questions and threads to pick up next session. They show in its prep…"
                maxLength={limitFor('sessions', 'hooks_notes')}
              />
                <LeftOpenToInbox text={form.hooks_notes} sessionNumber={form.session_number} />
              </SessionSection>
              <SessionSection icon={Eye} label="DM Notes" dmOnly filled={!!form.dm_notes}>
                <SlashField
                value={form.dm_notes ?? ''}
                onChange={v => set('dm_notes', v || null)}
                placeholder="Private notes, reminders, secrets…"
                maxLength={limitFor('sessions', 'dm_notes')}
              />
              </SessionSection>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* Session log — master-detail layout */
function SessionLog({ openId, onOpenConsumed }: { openId?: string | null; onOpenConsumed?: () => void }) {
  const { sessions, upsertSession } = useCampaign();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useReportRecord('sessions', selectedId);

  // Select a session requested from outside the tab (search, the REC pill),
  // clearing the list search so it isn't filtered out.
  useEffect(() => {
    if (!openId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedId(openId);
    setSearch('');
    onOpenConsumed?.();
  }, [openId, onOpenConsumed]);

  const filtered = sessions
    .filter(s => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (s.title ?? '').toLowerCase().includes(q) ||
        (s.summary ?? '').toLowerCase().includes(q) ||
        (s.session_date ?? '').includes(q) ||
        String(s.session_number).includes(q) ||
        (s.prep_notes ?? '').toLowerCase().includes(q) ||
        (s.combats ?? '').toLowerCase().includes(q) ||
        (s.loot_rewards ?? '').toLowerCase().includes(q) ||
        (s.hooks_notes ?? '').toLowerCase().includes(q) ||
        (s.dm_notes ?? '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.session_number - a.session_number);

  const selected = filtered.find(s => s.id === selectedId) ?? filtered[0] ?? null;
  const played = sessions.filter(s => s.status === 'done').length;

  // A new session is planned: it gets a date when it's played.
  const handleAdd = async () => {
    const result = await upsertSession(blankSession(nextSessionNumber(sessions)));
    if (result?.id) setSelectedId(result.id);
  };

  return (
    <div className="cm-md" style={{ height: '100%' }}>
      {/* Left: list */}
      <div className="cm-md-list">
        {/* List header */}
        <div className="cm-md-list-head">
          <div>
            <div className="cm-md-eyebrow">{played} played</div>
            <div className="cm-md-title">Sessions</div>
          </div>
          <Button variant="secondary" size="sm" onClick={handleAdd} title="Plan the next session">
            <Plus size={13} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'middle' }} />
            {' '}New
          </Button>
        </div>

        {/* Search */}
        <div className="cm-md-search">
          <Search size={13} className="cm-md-search-glyph" strokeWidth={1.8} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search sessions…"
          />
        </div>

        {/* List scroll */}
        <div className="cm-md-list-scroll">
          {filtered.length === 0 ? (
            <div style={{ padding: '24px 12px', color: 'var(--ink-3)', fontSize: 13, fontStyle: 'italic', textAlign: 'center' }}>
              {search ? 'No sessions match your search.' : 'No sessions yet.'}
            </div>
          ) : (
            filtered.map(s => {
              const date = s.session_date ? formatSessionDate(s.session_date) : null;
              const sub = [s.title ? date : null, s.summary ? clip(plainText(s.summary), 60) : null].filter(Boolean).join(' · ');
              return (
                <button
                  key={s.id}
                  className={`cm-row ${selected?.id === s.id ? 'is-active' : ''}`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <span className="cm-row-glyph" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                    #{s.session_number}
                  </span>
                  <div className="cm-row-body">
                    <span className="cm-row-title">{s.title || date || `Session ${s.session_number}`}</span>
                    {sub && <span className="cm-row-sub">{sub}</span>}
                  </div>
                  {s.status !== 'done' && (
                    <span className={`cm-tag ${s.status === 'live' ? 'cm-tag-active' : 'cm-tag-planned'}`}>{STATUS_LABEL[s.status]}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right: detail */}
      <div className="cm-md-detail">
        {selected ? (
          <SessionDetail
            key={selected.id}
            session={selected}
            sessions={sessions}
            onDeleted={() => setSelectedId(null)}
            onOpenSession={id => { setSearch(''); setSelectedId(id); }}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center', color: 'var(--ink-3)' }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>✧</div>
              <div style={{ fontStyle: 'italic', fontSize: 14 }}>
                {sessions.length === 0 ? (
                  <>No sessions yet. <Button variant="link" onClick={handleAdd}>Plan your first session.</Button></>
                ) : 'Select a session to view its notes.'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Session Timeline ─────────────────────────────────────────────────────────

function SessionTimeline() {
  const { sessions } = useCampaign();
  const openRecord = useOpenRecord();
  const sorted = [...sessions].sort((a, b) => a.session_number - b.session_number);
  const played = sorted.filter(s => s.status === 'done');
  const ahead = sorted.filter(s => s.status !== 'done');

  return (
    <div className="st-wrap">
      <div className="st-head">
        <span className="cm-section-title">Session Timeline</span>
        <span className="st-meta">{played.length} played{ahead.length ? ` · ${ahead.length} ahead` : ''}</span>
      </div>

      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--ink-3)', fontStyle: 'italic', fontSize: 13, paddingTop: 24 }}>
          No sessions yet.
        </div>
      ) : (
        <div className="st-track">
          {sorted.map((s, i) => {
            const isLeft = i % 2 === 0; // even → content on left, odd → content on right
            const summary = s.summary ? plainText(s.summary) : '';
            const content = (
              <>
                <span className="st-num">#{s.session_number}{s.status !== 'done' ? ` · ${STATUS_LABEL[s.status]}` : ''}</span>
                {s.session_date && <span className="st-date">{formatSessionDate(s.session_date)}</span>}
                {/* eslint-disable-next-line no-restricted-syntax -- the timeline's title, styled by .st-title */}
                <button type="button" className="st-title" onClick={() => openRecord('sessions', s.id)}>
                  {s.title || (summary ? clip(summary, 60) : `Session ${s.session_number}`)}
                </button>
                {summary && (
                  <span className="st-summary">{clip(s.title ? summary : summary.slice(60), 140)}</span>
                )}
              </>
            );

            return (
              <div key={s.id} className={`st-row${s.status !== 'done' ? ' is-planned' : ''}`}>
                <div className={isLeft ? 'st-left' : 'st-empty'}>
                  {isLeft && content}
                </div>
                <div className="st-dot-col">
                  <div className="st-dot" />
                </div>
                <div className={!isLeft ? 'st-right' : 'st-empty'}>
                  {!isLeft && content}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── shell ────────────────────────────────────────────────────────────────────

export default function SessionNotes({ viewMode = 'log', openId, onOpenConsumed }: { viewMode?: string; setViewMode?: (v: string) => void; openId?: string | null; onOpenConsumed?: () => void }) {
  return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      {viewMode === 'timeline'
        ? <SessionTimeline />
        : <SessionLog openId={openId} onOpenConsumed={onOpenConsumed} />}
    </div>
  );
}
