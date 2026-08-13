import { useState, useEffect } from 'react';
import { SlashField } from '../ui/SlashField';
import { Swords, Gift, Lightbulb, Eye, Plus, Search } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { MarkdownContent } from '../ui/MarkdownContent';
import { OverflowMenu } from '../ui/OverflowMenu';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import { Button } from '../ui/Button';
import { useAutoSave } from '../../hooks/useAutoSave';
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

/* Detail panel — autosave inline editing */
function SessionDetail({
  session,
  onDeleted,
}: {
  session: Session;
  onDeleted: () => void;
}) {
  const { upsertSession, deleteSession } = useCampaign();
  const confirm = useConfirm();

  const [form, setForm] = useState<SessionForm>({
    session_number: session.session_number,
    session_date: session.session_date,
    summary: session.summary,
    combats: session.combats,
    loot_rewards: session.loot_rewards,
    hooks_notes: session.hooks_notes,
    dm_notes: session.dm_notes,
  });

  // Reset form when session changes
  useEffect(() => {
    setForm({
      session_number: session.session_number,
      session_date: session.session_date,
      summary: session.summary,
      combats: session.combats,
      loot_rewards: session.loot_rewards,
      hooks_notes: session.hooks_notes,
      dm_notes: session.dm_notes,
    });
  }, [session.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { status, saveNow } = useAutoSave({
    data: form,
    onSave: async (data) => {
      await upsertSession({ id: session.id, ...data });
    },
    delay: 800,
  });

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
        {/* Header: session number + date */}
        <div className="as-grid-2" style={{ marginBottom: 16 }}>
          <div className="as-fl">
            <label className="as-ll">Session #</label>
            <input
              className="as-input"
              type="number"
              style={{ width: 80, colorScheme: 'dark' }}
              value={form.session_number}
              min={1}
              onChange={e => setForm(prev => ({ ...prev, session_number: parseInt(e.target.value) || 1 }))}
            />
          </div>
          <div className="as-fl">
            <label className="as-ll">Date</label>
            <input
              className="as-input"
              type="date"
              style={{ colorScheme: 'dark' }}
              value={form.session_date ?? ''}
              onChange={e => setForm(prev => ({ ...prev, session_date: e.target.value || null }))}
            />
          </div>
        </div>

        {/* Recap / Summary */}
        <div className="cm-section">
          <SectionLabel label="Recap" />
          <SlashField
            value={form.summary ?? ''}
            onChange={v => setForm(prev => ({ ...prev, summary: v || null }))}
            placeholder="What happened this session..."
          />
        </div>

        {/* Structured fields */}
        <div className="flex flex-col gap-2">
          <SessionSection icon={Swords} label="Combat Summary">
            <SlashField
            value={form.combats ?? ''}
            onChange={v => setForm(prev => ({ ...prev, combats: v || null }))}
            placeholder="Describe combats that took place…"
          />
          </SessionSection>
          <SessionSection icon={Gift} label="Loot & Rewards">
            <SlashField
            value={form.loot_rewards ?? ''}
            onChange={v => setForm(prev => ({ ...prev, loot_rewards: v || null }))}
            placeholder="Items, gold, or rewards gained…"
          />
          </SessionSection>
          <SessionSection icon={Lightbulb} label="Hook Follow-ups">
            <SlashField
            value={form.hooks_notes ?? ''}
            onChange={v => setForm(prev => ({ ...prev, hooks_notes: v || null }))}
            placeholder="Which hooks were advanced or introduced…"
          />
          </SessionSection>
          <SessionSection icon={Eye} label="DM Notes" dmOnly>
            <SlashField
            value={form.dm_notes ?? ''}
            onChange={v => setForm(prev => ({ ...prev, dm_notes: v || null }))}
            placeholder="Private notes, reminders, secrets…"
          />
          </SessionSection>
        </div>
      </div>
    </div>
  );
}

/* Session log — master-detail layout */
function SessionLog() {
  const { sessions, upsertSession } = useCampaign();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const handleAdd = async () => {
    const nextNumber = sessions.length > 0
      ? Math.max(...sessions.map(s => s.session_number)) + 1
      : 1;
    const today = new Date().toISOString().split('T')[0];
    const result = await upsertSession({
      session_number: nextNumber,
      session_date: today,
      summary: null,
      combats: null,
      loot_rewards: null,
      hooks_notes: null,
      dm_notes: null,
    });
    if (result?.id) setSelectedId(result.id);
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
          <Button variant="secondary" size="sm" onClick={handleAdd} title="New session">
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
        {selected ? (
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
                  <>No sessions yet. <button onClick={handleAdd} style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontFamily: 'var(--serif)', fontSize: 14, textDecoration: 'underline', textDecorationColor: 'var(--rule)' }}>Add your first session.</button></>
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

  // Most recent session for recap; next number for prep
  const sorted = [...sessions].sort((a, b) => b.session_number - a.session_number);
  const lastSession = sorted[0] ?? null;
  const nextNum = lastSession ? lastSession.session_number + 1 : 1;

  // Existing prep note for next session, if any
  const existingPrep = sessionPreps.find(p => p.session_number === nextNum) ?? null;
  const [prepText, setPrepText] = useState(existingPrep?.notes ?? '');
  const [savingPrep, setSavingPrep] = useState(false);
  const [dangledIds, setDangledIds] = useState<string[]>(existingPrep?.dangled_hook_ids ?? []);
  const [hookPickerOpen, setHookPickerOpen] = useState(false);
  const [savingHooks, setSavingHooks] = useState(false);

  const savePrep = async () => {
    setSavingPrep(true);
    await upsertSessionPrep({
      session_number: nextNum,
      prep_date: new Date().toISOString().split('T')[0],
      notes: prepText || null,
      dangled_hook_ids: dangledIds,
    });
    setSavingPrep(false);
  };

  const saveDangledHooks = async (ids: string[]) => {
    setDangledIds(ids);
    setSavingHooks(true);
    await upsertSessionPrep({
      session_number: nextNum,
      prep_date: existingPrep?.prep_date ?? new Date().toISOString().split('T')[0],
      notes: prepText || null,
      dangled_hook_ids: ids,
    });
    setSavingHooks(false);
  };

  const activeHooks = hooks.filter(h => h.is_active);
  const availableHooks = activeHooks.filter(h => !dangledIds.includes(h.id));
  const dangledHooks = dangledIds.map(id => hooks.find(h => h.id === id)).filter((h): h is typeof hooks[number] => !!h && h.is_active);
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
                <div className="pw-card" style={{ cursor: 'default', maxHeight: 300, overflowY: 'auto' }}>
                  <div className="pw-card-eyebrow">Session #{lastSession.session_number} · {lastSession.session_date ?? '—'}</div>
                  <p className="pw-card-body" style={{ marginTop: 0 }}>
                    {lastSession.summary
                      ? lastSession.summary.replace(/[#*_`]/g, '')
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
            <SlashField
              value={prepText}
              onChange={v => setPrepText(v)}
              placeholder="Reminders, NPC motivations, plot threads, encounter plans…"
              minHeight="240px"
            />
            <div>
              <Button variant="primary" onClick={savePrep} disabled={savingPrep}>
                {savingPrep ? 'Saving…' : 'Save prep notes'}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="pw-section">
            <h3 className="pw-title">Hooks to Dangle</h3>
            <p style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 12 }}>
              Pick which hooks you plan to dangle this session.
            </p>

            {dangledHooks.length > 0 ? dangledHooks.map(h => (
              <div key={h.id} className="pw-hook">
                <span className="pw-hook-glyph">❂</span>
                <div style={{ flex: 1 }}>
                  <div className="pw-hook-title">{h.title}</div>
                  {h.description && <div className="pw-hook-desc">{h.description.replace(/[#*_`]/g, '').slice(0, 120)}</div>}
                </div>
                <Button
                  variant="secondary"
                  style={{ color: 'var(--ink-3)', borderColor: 'var(--rule)', fontSize: 11 }}
                  onClick={() => saveDangledHooks(dangledIds.filter(id => id !== h.id))}
                >
                  ✕ remove
                </Button>
              </div>
            )) : (
              <p className="pw-empty">No hooks selected yet. Add hooks you want to dangle below.</p>
            )}

            {hookPickerOpen ? (
              <div style={{ marginTop: 12, border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: 8, backgroundColor: 'var(--paper)' }}>
                {availableHooks.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--ink-3)', fontStyle: 'italic', padding: '4px 0' }}>
                    {activeHooks.length === 0 ? 'No active hooks. Add some in the Hooks & Ideas tab.' : 'All active hooks already added.'}
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 200, overflowY: 'auto' }}>
                    {availableHooks.map(h => (
                      <button
                        key={h.id}
                        onClick={() => { saveDangledHooks([...dangledIds, h.id]); setHookPickerOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 'var(--radius)', border: 'none', background: 'none', color: 'var(--ink)', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <span style={{ color: 'var(--gold)' }}>❂</span>
                        <span style={{ fontFamily: 'var(--serif)' }}>{h.title}</span>
                        {h.category && <span style={{ fontSize: 10, color: 'var(--ink-3)', marginLeft: 'auto' }}>{h.category.replace('_', ' ')}</span>}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setHookPickerOpen(false)}
                  style={{ fontSize: 11, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <Button
                variant="secondary"
                style={{ marginTop: 12, color: 'var(--gold)', borderColor: 'var(--rule)', borderStyle: 'dashed' }}
                onClick={() => setHookPickerOpen(true)}
                disabled={savingHooks}
              >
                + Add hook
              </Button>
            )}
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
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep(s => s - 1)}>← Previous</Button>
        <span className="pw-nav-count">{step + 1} / {PREP_STEPS.length}</span>
        <Button variant="primary" disabled={step === PREP_STEPS.length - 1} onClick={() => setStep(s => s + 1)}>Next →</Button>
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
    </div>
  );
}
