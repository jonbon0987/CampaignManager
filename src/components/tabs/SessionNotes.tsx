import { useState, useRef } from 'react';
import { Swords, Gift, Lightbulb, Eye, Plus, Search } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { FormField, inputStyle } from '../FormField';
import { Button } from '../ui/Button';
import { MarkdownContent } from '../ui/MarkdownContent';
import { EntityLinkToolbar } from '../ui/EntityLinkToolbar';
import { MarkdownEditor } from '../ui/MarkdownEditor';
import { insertAtCursor } from '../../lib/textUtils';
import type { Session } from '../../lib/database.types';

type SessionForm = {
  session_number: number;
  session_date: string | null;
  summary: string | null;
  combats: string | null;
  loot_rewards: string | null;
  hooks_notes: string | null;
  dm_notes: string | null;
};

const emptyForm = (): SessionForm => ({
  session_number: 1,
  session_date: new Date().toISOString().split('T')[0],
  summary: '',
  combats: null,
  loot_rewards: null,
  hooks_notes: null,
  dm_notes: null,
});

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
  children,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  dmOnly?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
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

/* Detail panel — view or edit a single session */
function SessionDetail({
  session,
  onDeleted,
}: {
  session: Session;
  onDeleted: () => void;
}) {
  const { upsertSession, deleteSession } = useCampaign();
  const confirm = useConfirm();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<SessionForm>({
    session_number: session.session_number,
    session_date: session.session_date,
    summary: session.summary,
    combats: session.combats,
    loot_rewards: session.loot_rewards,
    hooks_notes: session.hooks_notes,
    dm_notes: session.dm_notes,
  });
  const summaryRef = useRef<HTMLTextAreaElement>(null);

  // Sync form when session changes
  const startEdit = () => {
    setEditForm({
      session_number: session.session_number,
      session_date: session.session_date,
      summary: session.summary,
      combats: session.combats,
      loot_rewards: session.loot_rewards,
      hooks_notes: session.hooks_notes,
      dm_notes: session.dm_notes,
    });
    setIsEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    await upsertSession({
      session_number: editForm.session_number,
      session_date: editForm.session_date,
      summary: editForm.summary,
      combats: editForm.combats,
      loot_rewards: editForm.loot_rewards,
      hooks_notes: editForm.hooks_notes,
      dm_notes: editForm.dm_notes,
    });
    setSaving(false);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (await confirm('Delete this session?')) {
      await deleteSession(session.id);
      onDeleted();
    }
  };

  const inputFieldStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg)',
    color: 'var(--ink)',
    border: '1px solid var(--rule)',
    fontFamily: 'var(--serif)',
    fontSize: '0.875rem',
    borderRadius: 'var(--radius)',
    padding: '6px 10px',
    width: '100%',
    outline: 'none',
  };

  const fieldLabelStyle: React.CSSProperties = {
    color: 'var(--gold)',
    fontSize: '0.65rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    display: 'block',
    marginBottom: 4,
  };

  return (
    <div className="cm-detail">
      <div className="cm-detail-head">
        <div className="cm-detail-eyebrow">Session #{session.session_number}</div>
        <h1 className="cm-detail-title">
          {session.session_date
            ? new Date(session.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : `Session ${session.session_number}`}
        </h1>
        {session.session_date && (
          <div className="cm-detail-sub">{session.session_date}</div>
        )}
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2 mb-6">
        {!isEditing ? (
          <>
            <button
              onClick={startEdit}
              className="cm-md-add"
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="cm-md-add"
              style={{ color: 'var(--accent)', borderColor: 'var(--accent-2)' }}
            >
              Delete
            </button>
          </>
        ) : (
          <>
            <Button variant="primary" size="sm" onClick={saveEdit} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)} disabled={saving}>
              Cancel
            </Button>
          </>
        )}
      </div>

      <div className="cm-detail-body">
        {isEditing ? (
          <>
            {/* Edit: number + date */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={fieldLabelStyle}>Session #</label>
                <input
                  type="number"
                  value={editForm.session_number}
                  onChange={e => setEditForm(prev => ({ ...prev, session_number: parseInt(e.target.value) || 1 }))}
                  min={1}
                  style={{ ...inputFieldStyle, colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label style={fieldLabelStyle}>Date</label>
                <input
                  type="date"
                  value={editForm.session_date ?? ''}
                  onChange={e => setEditForm(prev => ({ ...prev, session_date: e.target.value || null }))}
                  style={{ ...inputFieldStyle, colorScheme: 'dark' }}
                />
              </div>
            </div>

            {/* Summary */}
            <div className="cm-section">
              <SectionLabel label="Session Notes" />
              <MarkdownEditor
                value={editForm.summary ?? ''}
                onChange={v => setEditForm(prev => ({ ...prev, summary: v || null }))}
                placeholder="What happened this session..."
                minHeight="200px"
                textareaRef={summaryRef}
              />
              <EntityLinkToolbar
                textareaRef={summaryRef}
                onInsert={markup => setEditForm(prev => ({ ...prev, summary: insertAtCursor(summaryRef, prev.summary ?? '', markup) }))}
              />
            </div>

            {/* Structured fields */}
            <div className="flex flex-col gap-2">
              <SessionSection icon={Swords} label="Combat Summary">
                <MarkdownEditor
                  value={editForm.combats ?? ''}
                  onChange={v => setEditForm(prev => ({ ...prev, combats: v || null }))}
                  placeholder="Describe combats that took place…"
                  minHeight="80px"
                />
              </SessionSection>
              <SessionSection icon={Gift} label="Loot &amp; Rewards">
                <MarkdownEditor
                  value={editForm.loot_rewards ?? ''}
                  onChange={v => setEditForm(prev => ({ ...prev, loot_rewards: v || null }))}
                  placeholder="Items, gold, or rewards gained…"
                  minHeight="60px"
                />
              </SessionSection>
              <SessionSection icon={Lightbulb} label="Hook Follow-ups">
                <MarkdownEditor
                  value={editForm.hooks_notes ?? ''}
                  onChange={v => setEditForm(prev => ({ ...prev, hooks_notes: v || null }))}
                  placeholder="Which hooks were advanced or introduced…"
                  minHeight="60px"
                />
              </SessionSection>
              <SessionSection icon={Eye} label="DM Notes" dmOnly>
                <MarkdownEditor
                  value={editForm.dm_notes ?? ''}
                  onChange={v => setEditForm(prev => ({ ...prev, dm_notes: v || null }))}
                  placeholder="Private notes, reminders, secrets…"
                  minHeight="60px"
                />
              </SessionSection>
            </div>
          </>
        ) : (
          <>
            {/* View: recap */}
            <div className="cm-section">
              <SectionLabel label="Recap" />
              {session.summary ? (
                <MarkdownContent
                  text={session.summary}
                  className="text-sm"
                  style={{ color: 'var(--ink)', fontFamily: 'var(--serif)', lineHeight: '1.7' }}
                />
              ) : (
                <p style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontSize: 14 }}>
                  No notes recorded for this session.
                </p>
              )}
            </div>

            {/* Structured fields — only when content exists */}
            {(session.combats || session.loot_rewards || session.hooks_notes || session.dm_notes) && (
              <div className="flex flex-col gap-2">
                {session.combats && (
                  <SessionSection icon={Swords} label="Combat Summary">
                    <MarkdownContent text={session.combats} className="text-sm" style={{ color: 'var(--ink)', fontFamily: 'var(--serif)', lineHeight: '1.7' }} />
                  </SessionSection>
                )}
                {session.loot_rewards && (
                  <SessionSection icon={Gift} label="Loot & Rewards">
                    <MarkdownContent text={session.loot_rewards} className="text-sm" style={{ color: 'var(--ink)', fontFamily: 'var(--serif)', lineHeight: '1.7' }} />
                  </SessionSection>
                )}
                {session.hooks_notes && (
                  <SessionSection icon={Lightbulb} label="Hook Follow-ups">
                    <MarkdownContent text={session.hooks_notes} className="text-sm" style={{ color: 'var(--ink)', fontFamily: 'var(--serif)', lineHeight: '1.7' }} />
                  </SessionSection>
                )}
                {session.dm_notes && (
                  <SessionSection icon={Eye} label="DM Notes" dmOnly>
                    <MarkdownContent text={session.dm_notes} className="text-sm" style={{ color: 'var(--ink)', fontFamily: 'var(--serif)', lineHeight: '1.7' }} />
                  </SessionSection>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* Session log — master-detail layout */
function SessionLog() {
  const { sessions, upsertSession } = useCampaign();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<SessionForm>(emptyForm());
  const newSummaryRef = useRef<HTMLTextAreaElement>(null);

  const filtered = sessions
    .filter(s => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (s.summary ?? '').toLowerCase().includes(q) ||
        (s.session_date ?? '').includes(q) ||
        String(s.session_number).includes(q) ||
        (s.combats ?? '').toLowerCase().includes(q) ||
        (s.loot_rewards ?? '').toLowerCase().includes(q) ||
        (s.hooks_notes ?? '').toLowerCase().includes(q) ||
        (s.dm_notes ?? '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.session_number - a.session_number);

  const selected = filtered.find(s => s.id === selectedId) ?? filtered[0] ?? null;

  const openAdd = () => {
    const nextNumber = sessions.length > 0
      ? Math.max(...sessions.map(s => s.session_number)) + 1
      : 1;
    setForm({ ...emptyForm(), session_number: nextNumber });
    setSelectedId(null);
    setCreating(true);
  };

  const handleCreate = async () => {
    await upsertSession({
      session_number: form.session_number,
      session_date: form.session_date,
      summary: form.summary,
      combats: form.combats,
      loot_rewards: form.loot_rewards,
      hooks_notes: form.hooks_notes,
      dm_notes: form.dm_notes,
    });
    setCreating(false);
  };

  return (
    <div className="cm-md" style={{ height: '100%' }}>
      {/* Left: list */}
      <div className="cm-md-list">
        {/* List header */}
        <div className="cm-md-list-head">
          <div>
            <div className="cm-md-eyebrow">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</div>
            <div className="cm-md-title">Sessions</div>
          </div>
          <button className="cm-md-add" onClick={openAdd} title="Add session">
            <Plus size={13} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'middle' }} />
            {' '}Add
          </button>
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
            filtered.map(s => (
              <button
                key={s.id}
                className={`cm-row ${selected?.id === s.id ? 'is-active' : ''}`}
                onClick={() => setSelectedId(s.id)}
              >
                <span className="cm-row-glyph" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                  #{s.session_number}
                </span>
                <div className="cm-row-body">
                  <span className="cm-row-title">
                    {s.session_date
                      ? new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : `Session ${s.session_number}`}
                  </span>
                  {s.summary && (
                    <span className="cm-row-sub">
                      {s.summary.replace(/[#*_`]/g, '').slice(0, 60)}{s.summary.length > 60 ? '…' : ''}
                    </span>
                  )}
                </div>
                <span className="cm-row-meta">{s.session_date ? s.session_date.slice(0, 4) : ''}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: detail */}
      <div className="cm-md-detail">
        {creating ? (
          <div className="cm-detail">
            <div className="cm-detail-head">
              <div className="cm-detail-eyebrow">New Session</div>
              <h1 className="cm-detail-title">Session #{form.session_number}</h1>
            </div>
            <div className="cm-detail-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <FormField label="Session #">
                  <input type="number" value={form.session_number} onChange={e => setForm(prev => ({ ...prev, session_number: parseInt(e.target.value) || 1 }))} min={1} style={inputStyle} />
                </FormField>
                <FormField label="Date">
                  <input type="date" value={form.session_date ?? ''} onChange={e => setForm(prev => ({ ...prev, session_date: e.target.value || null }))} style={{ ...inputStyle, colorScheme: 'dark' }} />
                </FormField>
              </div>
              <div className="cm-section">
                <SectionLabel label="Session Notes" />
                <MarkdownEditor value={form.summary ?? ''} onChange={v => setForm(prev => ({ ...prev, summary: v || null }))} placeholder="What happened this session..." minHeight="200px" textareaRef={newSummaryRef} />
                <EntityLinkToolbar textareaRef={newSummaryRef} onInsert={markup => setForm(prev => ({ ...prev, summary: insertAtCursor(newSummaryRef, prev.summary ?? '', markup) }))} />
              </div>
              <div className="flex flex-col gap-2">
                <SessionSection icon={Swords} label="Combat Summary">
                  <MarkdownEditor value={form.combats ?? ''} onChange={v => setForm(prev => ({ ...prev, combats: v || null }))} placeholder="Describe combats that took place…" minHeight="80px" />
                </SessionSection>
                <SessionSection icon={Gift} label="Loot &amp; Rewards">
                  <MarkdownEditor value={form.loot_rewards ?? ''} onChange={v => setForm(prev => ({ ...prev, loot_rewards: v || null }))} placeholder="Items, gold, or rewards gained…" minHeight="60px" />
                </SessionSection>
                <SessionSection icon={Lightbulb} label="Hook Follow-ups">
                  <MarkdownEditor value={form.hooks_notes ?? ''} onChange={v => setForm(prev => ({ ...prev, hooks_notes: v || null }))} placeholder="Which hooks were advanced or introduced…" minHeight="60px" />
                </SessionSection>
                <SessionSection icon={Eye} label="DM Notes" dmOnly>
                  <MarkdownEditor value={form.dm_notes ?? ''} onChange={v => setForm(prev => ({ ...prev, dm_notes: v || null }))} placeholder="Private notes, reminders, secrets…" minHeight="60px" />
                </SessionSection>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button className="cm-md-add" onClick={handleCreate}>Save Session</button>
                <button className="cm-md-add" onClick={() => setCreating(false)} style={{ color: 'var(--ink-3)' }}>Cancel</button>
              </div>
            </div>
          </div>
        ) : selected ? (
          <SessionDetail
            key={selected.id}
            session={selected}
            onDeleted={() => setSelectedId(null)}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center', color: 'var(--ink-3)' }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>✧</div>
              <div style={{ fontStyle: 'italic', fontSize: 14 }}>
                {sessions.length === 0 ? (
                  <>No sessions yet. <button onClick={openAdd} style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontFamily: 'var(--serif)', fontSize: 14, textDecoration: 'underline', textDecorationColor: 'var(--rule)' }}>Add your first session.</button></>
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
  const sorted = [...sessions].sort((a, b) => a.session_number - b.session_number);
  const nextNum = sorted.length > 0 ? sorted[sorted.length - 1].session_number + 1 : 1;

  const formatDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const stripMd = (t: string) => t.replace(/[#*_`[\]]/g, '');

  return (
    <div className="st-wrap">
      <div className="st-head">
        <span className="cm-section-title">Session Timeline</span>
        <span className="st-meta">{sorted.length} session{sorted.length !== 1 ? 's' : ''}</span>
      </div>

      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--ink-3)', fontStyle: 'italic', fontSize: 13, paddingTop: 24 }}>
          No sessions yet.
        </div>
      ) : (
        <div className="st-track">
          {sorted.map((s, i) => {
            const isLeft = i % 2 === 0; // even → content on left, odd → content on right
            const content = (
              <>
                <span className="st-num">#{s.session_number}</span>
                {s.session_date && <span className="st-date">{formatDate(s.session_date)}</span>}
                <span className="st-title">
                  {s.summary ? stripMd(s.summary).slice(0, 60) + (s.summary.length > 60 ? '…' : '') : `Session ${s.session_number}`}
                </span>
                {s.summary && s.summary.length > 60 && (
                  <span className="st-summary">
                    {stripMd(s.summary).slice(60, 180)}{s.summary.length > 180 ? '…' : ''}
                  </span>
                )}
              </>
            );

            return (
              <div key={s.id} className="st-row">
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

          {/* Planned next session */}
          <div className="st-row is-planned">
            <div className="st-empty" />
            <div className="st-dot-col">
              <div className="st-dot" />
            </div>
            <div className="st-right">
              <span className="st-num">#{nextNum}</span>
              <span className="st-planned-label">Next session — planned</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Session Prep (guided workflow) ──────────────────────────────────────────

const PREP_STEPS = [
  { id: 'recap',      label: 'Recap',          glyph: '✧' },
  { id: 'notes',      label: 'Prep Notes',     glyph: '❧' },
  { id: 'hooks',      label: 'Hooks to Dangle', glyph: '❂' },
  { id: 'encounters', label: 'Encounters',      glyph: '⚔' },
  { id: 'loose',      label: 'Loose Threads',   glyph: '⚠' },
] as const;
type PrepStep = (typeof PREP_STEPS)[number]['id'];

function SessionPrepView() {
  const { sessions, hooks, encounters, sessionPreps, upsertSessionPrep } = useCampaign();
  const [step, setStep] = useState<number>(0);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Most recent session for recap; next number for prep
  const sorted = [...sessions].sort((a, b) => b.session_number - a.session_number);
  const lastSession = sorted[0] ?? null;
  const nextNum = lastSession ? lastSession.session_number + 1 : 1;

  // Existing prep note for next session, if any
  const existingPrep = sessionPreps.find(p => p.session_number === nextNum) ?? null;
  const [prepText, setPrepText] = useState(existingPrep?.notes ?? '');
  const [savingPrep, setSavingPrep] = useState(false);

  const savePrep = async () => {
    setSavingPrep(true);
    await upsertSessionPrep({
      session_number: nextNum,
      prep_date: new Date().toISOString().split('T')[0],
      notes: prepText || null,
    });
    setSavingPrep(false);
  };

  const activeHooks = hooks.filter(h => h.is_active);
  const plannedEncounters = encounters.filter(e => e.status === 'planned');

  return (
    <div className="pw">
      {/* Header */}
      <div className="pw-head">
        <div>
          <div className="cm-md-eyebrow">Guided prep</div>
          <div className="cm-md-title">Session {nextNum} Prep</div>
        </div>
      </div>

      {/* Step bar */}
      <div className="pw-steps">
        {PREP_STEPS.map((s, i) => (
          <button
            key={s.id}
            className={`pw-step${i === step ? ' is-active' : ''}${i < step ? ' is-done' : ''}`}
            onClick={() => setStep(i)}
          >
            <span className="pw-step-glyph">{i < step ? '✓' : s.glyph}</span>
            <span className="pw-step-label">{s.label}</span>
          </button>
        ))}
      </div>

      {/* Step content */}
      <div className="pw-content">
        {step === 0 && (
          <div className="pw-section">
            <h3 className="pw-title">Last time…</h3>
            {lastSession ? (
              <>
                <div className="pw-card" style={{ cursor: 'default' }}>
                  <div className="pw-card-eyebrow">Session #{lastSession.session_number} · {lastSession.session_date ?? '—'}</div>
                  <p className="pw-card-body" style={{ marginTop: 0 }}>
                    {lastSession.summary
                      ? lastSession.summary.replace(/[#*_`]/g, '').slice(0, 400) + (lastSession.summary.length > 400 ? '…' : '')
                      : <em style={{ color: 'var(--ink-3)' }}>No summary recorded.</em>}
                  </p>
                </div>
                {lastSession.hooks_notes && (
                  <div className="pw-card" style={{ cursor: 'default' }}>
                    <div className="pw-card-eyebrow">Hook follow-ups from last session</div>
                    <p className="pw-card-body" style={{ marginTop: 0 }}>{lastSession.hooks_notes.replace(/[#*_`]/g, '')}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="pw-empty">No previous sessions recorded yet.</p>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="pw-section">
            <h3 className="pw-title">Prep Notes</h3>
            <MarkdownEditor
              value={prepText}
              onChange={v => setPrepText(v)}
              placeholder="Reminders, NPC motivations, plot threads, encounter plans…"
              minHeight="240px"
              textareaRef={notesRef}
            />
            <EntityLinkToolbar
              textareaRef={notesRef}
              onInsert={markup => setPrepText(prev => insertAtCursor(notesRef, prev, markup))}
            />
            <div>
              <button className="pw-action pw-action-primary" onClick={savePrep} disabled={savingPrep}>
                {savingPrep ? 'Saving…' : 'Save prep notes'}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="pw-section">
            <h3 className="pw-title">Hooks to Dangle</h3>
            {activeHooks.length === 0 ? (
              <p className="pw-empty">No active hooks. Add some in the Hooks & Ideas tab.</p>
            ) : activeHooks.map(h => (
              <div key={h.id} className="pw-hook">
                <span className="pw-hook-glyph">❂</span>
                <div>
                  <div className="pw-hook-title">{h.title}</div>
                  {h.description && <div className="pw-hook-desc">{h.description.replace(/[#*_`]/g, '').slice(0, 120)}</div>}
                </div>
                <button
                  className={`pw-action${done[h.id] ? '' : ''}`}
                  style={done[h.id] ? { color: 'var(--moss)', borderColor: 'var(--moss)' } : {}}
                  onClick={() => setDone(d => ({ ...d, [h.id]: !d[h.id] }))}
                >
                  {done[h.id] ? '✓ done' : 'mark done'}
                </button>
              </div>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="pw-section">
            <h3 className="pw-title">Encounters Prepped</h3>
            {plannedEncounters.length === 0 ? (
              <p className="pw-empty">No planned encounters. Add some in the Encounters tab.</p>
            ) : plannedEncounters.map(e => (
              <div key={e.id} className="pw-card" style={{ cursor: 'default' }}>
                <div className="pw-card-eyebrow">{e.status}</div>
                <div className="pw-card-title">{e.name}</div>
                {e.description && <p className="pw-card-body">{e.description.replace(/[#*_`]/g, '').slice(0, 120)}</p>}
              </div>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="pw-section">
            <h3 className="pw-title">Loose Threads</h3>
            <p className="pw-loose-sub">Sessions or notes that may need follow-up.</p>
            {sorted.slice(0, 5).map(s => (
              <div key={s.id} className="pw-loose">
                <span className="pw-loose-glyph">✧</span>
                <div>
                  <strong>Session #{s.session_number}</strong>
                  {s.session_date && <span className="pw-loose-from"> · {s.session_date}</span>}
                  {s.hooks_notes && <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>{s.hooks_notes.replace(/[#*_`]/g, '').slice(0, 80)}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Nav */}
      <div className="pw-nav">
        <button className="pw-action" disabled={step === 0} onClick={() => setStep(s => s - 1)}>← Previous</button>
        <span className="pw-nav-count">{step + 1} / {PREP_STEPS.length}</span>
        <button className="pw-action pw-action-primary" disabled={step === PREP_STEPS.length - 1} onClick={() => setStep(s => s + 1)}>Next →</button>
      </div>
    </div>
  );
}

// ─── shell ────────────────────────────────────────────────────────────────────

export default function SessionNotes({ viewMode = 'log' }: { viewMode?: string; setViewMode?: (v: string) => void }) {
  return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      {viewMode === 'log'      && <SessionLog />}
      {viewMode === 'timeline' && <SessionTimeline />}
      {viewMode === 'prep'     && <SessionPrepView />}
      {viewMode === 'hooks'    && <HooksIdeasLazy />}
    </div>
  );
}

// Lazy import for HooksIdeas to avoid circular deps
function HooksIdeasLazy() {
  const [mod, setMod] = useState<{ default: React.ComponentType } | null>(null);
  if (!mod) {
    import('./HooksIdeas').then(setMod);
    return <div style={{ padding: '32px', color: 'var(--ink-3)', textAlign: 'center' }}>Loading...</div>;
  }
  const HooksIdeas = mod.default;
  return <HooksIdeas />;
}
