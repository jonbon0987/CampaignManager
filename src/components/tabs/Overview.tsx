import { useState, useEffect } from 'react';
import { SlashField } from '../ui/SlashField';
import { limitFor } from '../../lib/fieldLimits';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useOpenRecord } from '../../context/NavigationContext';
import { usePlanNextSession } from '../../hooks/useSessionLifecycle';
import { useChroniclePipelineMaybe } from '../../context/ChroniclePipelineContext';
import { STAGE_LABEL } from '../../lib/recording/pipeline';
import { FormField, inputStyle } from '../FormField';
import { Button } from '../ui/Button';
import { getHookCategoryStyle } from '../../lib/theme';
import {
  clip, formatSessionDate, lastPlayed, liveSession, nextPlanned, nextSessionNumber, planIds, plainText,
  prepDone, PREP_PARTS, sessionName, type PrepPart,
} from '../../lib/sessionLifecycle';
import type { Session } from '../../lib/database.types';
import type { Tab } from '../../App';

interface OverviewProps {
  onNavigate: (tab: Tab) => void;
  runMode: boolean;
  onToggleRun: () => void;
}

const names = (list: string[], none: string) =>
  list.length === 0 ? none : list.length <= 2 ? list.join(', ') : `${list.slice(0, 2).join(', ')} +${list.length - 2}`;

/** The next session, front and centre: when, how ready, and the way in. */
function NextSession({ next, runMode, onToggleRun }: { next: Session | null; runMode: boolean; onToggleRun: () => void }) {
  const { sessions, hooks, encounters, npcs, scenes, updateSession, loadModuleTree } = useCampaign();
  const openRecord = useOpenRecord();
  const planNext = usePlanNextSession();
  const hasAgenda = !!next && planIds(next.plan, 'agenda').length > 0;

  // The agenda's scene names come from the module tree, which isn't loaded up front.
  useEffect(() => { if (hasAgenda) void loadModuleTree().catch(() => {}); }, [hasAgenda, loadModuleTree]);

  if (!next) {
    const n = nextSessionNumber(sessions);
    return (
      <section className="ov-next">
        <div className="ov-next-main">
          <div className="ov-card-title">Next session</div>
          <div className="ov-next-name">Session {n}</div>
          <p className="ov-card-sub">Not planned yet.</p>
          <div className="ov-next-actions">
            <Button variant="primary" onClick={async () => { const s = await planNext(); if (s) openRecord('sessions', s.id); }}>
              Plan Session {n}
            </Button>
            <Button variant="secondary" onClick={onToggleRun}>{runMode ? '■ End session' : '▶ Start session'}</Button>
          </div>
        </div>
      </section>
    );
  }

  const live = next.status === 'live';
  const done = prepDone(next);
  const titles = (ids: string[], list: { id: string; label: string }[]) =>
    ids.map(id => list.find(x => x.id === id)?.label).filter((x): x is string => !!x);
  const agenda = planIds(next.plan, 'agenda');
  const sceneTitles = titles(agenda, scenes.map(s => ({ id: s.id, label: s.title })));
  const value: Record<PrepPart, string> = {
    agenda: agenda.length === 0 ? 'No scenes yet'
      : sceneTitles.length ? names(sceneTitles, '') : `${agenda.length} scene${agenda.length === 1 ? '' : 's'}`,
    threads: names(titles(planIds(next.plan, 'threads'), hooks.map(h => ({ id: h.id, label: h.title }))), 'None picked'),
    encounters: names(titles(planIds(next.plan, 'encounters'), encounters.map(e => ({ id: e.id, label: e.name }))), 'None picked'),
    npcs: names(titles(planIds(next.plan, 'npcs'), npcs.map(n => ({ id: n.id, label: n.name }))), 'None picked'),
    notes: next.prep_notes?.trim() ? clip(plainText(next.prep_notes), 60) : 'Empty',
  };
  const ready = Object.values(done).filter(Boolean).length;

  return (
    <section className={`ov-next${live ? ' is-live' : ''}`}>
      <div className="ov-next-main">
        <div className="ov-card-title">{live ? '● Live now' : 'Next session · planned'}</div>
        <div className="ov-next-name">{sessionName(next)}</div>
        <label className="ov-next-date">
          <span className="ov-card-sub">{next.session_date ? formatSessionDate(next.session_date) : 'No date yet.'}</span>
          <input
            type="date"
            className="as-input"
            aria-label={`Date of Session ${next.session_number}`}
            style={{ colorScheme: 'dark', width: 150 }}
            value={next.session_date ?? ''}
            onChange={e => void updateSession(next.id, { session_date: e.target.value || null }).catch(() => {})}
          />
        </label>
        <div className="ov-next-actions">
          <Button variant="primary" onClick={onToggleRun}>{runMode ? '■ End session' : '▶ Start session'}</Button>
          <Button variant="secondary" onClick={() => openRecord('sessions', next.id)}>{live ? 'Open session' : 'Continue prep'}</Button>
        </div>
      </div>
      <div className="ov-next-prep">
        <div className="ov-card-title">Prep · {ready} of {PREP_PARTS.length} ready</div>
        <ul className="ov-prep-list">
          {PREP_PARTS.map(p => (
            <li key={p.id} className={`ov-prep-item${done[p.id] ? ' is-done' : ''}`}>
              <span className="ov-prep-mark" aria-hidden>{done[p.id] ? '✓' : '○'}</span>
              <span className="ov-prep-label">{p.label}</span>
              <span className="ov-prep-value">{value[p.id]}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function Overview({ onNavigate, runMode, onToggleRun }: OverviewProps) {
  const {
    overview, setOverview, selectedCampaign,
    sessions, pcs, hooks, modules, ideas,
  } = useCampaign();
  const openRecord = useOpenRecord();

  const [form, setForm] = useState(overview);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    setForm(overview);
    setDirty(false);
  }, [overview]);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setDirty(true);
    setSaved(false);
  };

  const handleSave = () => {
    setOverview(form);
    setSaved(true);
    setDirty(false);
    setTimeout(() => setSaved(false), 2000);
  };

  // Derived data. A thread is active only in the Active state (not seeds,
  // cold or resolved); older rows without a state fall back to is_active.
  const activeHooks = hooks.filter(h => (h.state ?? (h.is_active ? 'active' : 'resolved')) === 'active');
  const currentModule = modules.find(m => m.status === 'active');
  const activePCs = pcs.filter(pc => pc.is_active);
  const next = liveSession(sessions) ?? nextPlanned(sessions);
  const last = lastPlayed(sessions);
  const played = sessions.filter(s => s.status === 'done').length;
  const inbox = ideas.filter(i => !i.promoted_hook_id).length;
  // Recordings on their way to a chronicle, and chronicles waiting for review.
  const chronicles = useChroniclePipelineMaybe().entries.filter(e => e.stage === 'ready' || e.stage === 'saving' || e.stage === 'transcribing' || e.stage === 'writing');
  // The Overview title falls back to the campaign's name, which every campaign has.
  const campaignTitle = overview.title || selectedCampaign?.name || 'Untitled Campaign';
  const meta = [
    currentModule ? [currentModule.chapter ? `Chapter ${currentModule.chapter}` : null, currentModule.title].filter(Boolean).join(' · ') : null,
    `${played} session${played === 1 ? '' : 's'} played`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="ov" style={{ height: '100%', overflowY: 'auto' }}>
      {/* Eyebrow */}
      <div className="ov-eyebrow">Chronicle</div>

      {/* Campaign title */}
      <h1 className="ov-title">{campaignTitle}</h1>
      <div className="ov-meta">{meta}</div>

      {/* Tagline / plot summary as italic gold subtitle */}
      {overview.plotSummary && (
        <p className="ov-tagline">
          {truncate(overview.plotSummary, 120)}
        </p>
      )}

      <NextSession next={next} runMode={runMode} onToggleRun={onToggleRun} />

      {(inbox > 0 || chronicles.length > 0) && (
        <div className="ov-waiting">
          <span className="ov-card-title">Waiting on you</span>
          <ul className="ov-waiting-list">
            {chronicles.map(e => {
              const s = sessions.find(x => x.id === e.recording.session_id);
              const name = s ? sessionName(s) : 'A session';
              return (
                <li key={e.recording.id} className={`ov-waiting-item${e.stage === 'ready' ? ' is-ready' : ''}`}>
                  {e.stage === 'ready' ? (
                    <Button variant="link" onClick={() => openRecord('sessions', e.recording.session_id)}>
                      {name}: the chronicle is ready to review{e.pending ? ` · ${e.pending} change${e.pending === 1 ? '' : 's'}` : ''} ›
                    </Button>
                  ) : (
                    <span><span aria-hidden="true">◐ </span>{name}: {STAGE_LABEL[e.stage].toLowerCase()}…</span>
                  )}
                </li>
              );
            })}
            {inbox > 0 && (
              <li className="ov-waiting-item">
                <Button variant="link" onClick={() => onNavigate('ideas')}>
                  {inbox} {inbox === 1 ? 'idea' : 'ideas'} in the Inbox ›
                </Button>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* 2-col: Last time + Threads in motion */}
      <div className="ov-grid">
        <div className="ov-card" onClick={() => (last ? openRecord('sessions', last.id) : onNavigate('sessions'))}>
          <div className="ov-card-head">
            <span className="ov-card-title">Last time</span>
            <span className="ov-card-chevron">›</span>
          </div>
          <div className="ov-card-body">
            {last ? (
              <>
                <div className="ov-card-big">{sessionName(last)}</div>
                {last.session_date && (
                  <div className="ov-card-sub">{formatSessionDate(last.session_date)}</div>
                )}
                {last.summary && (
                  <div className="ov-card-desc">{plainText(last.summary)}</div>
                )}
              </>
            ) : (
              <div style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontSize: '13px' }}>
                No sessions played yet
              </div>
            )}
          </div>
        </div>

        {/* Active Threads */}
        <div className="ov-card" onClick={() => onNavigate('threads')}>
          <div className="ov-card-head">
            <span className="ov-card-title">Threads in motion</span>
            <span className="ov-card-chevron">›</span>
          </div>
          <div className="ov-card-body">
            {activeHooks.length === 0 ? (
              <div style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontSize: '13px' }}>
                No active threads
              </div>
            ) : (
              <div>
                {activeHooks.slice(0, 5).map(h => (
                  <div key={h.id} className="ov-list-item">
                    <span
                      className="ov-list-dot"
                      style={{ backgroundColor: getHookCategoryStyle(h.category).badge }}
                    />
                    <span className="ov-list-name">{h.title}</span>
                    {h.category && (
                      <span className="ov-list-meta">
                        {h.category.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                ))}
                {activeHooks.length > 5 && (
                  <div style={{ color: 'var(--ink-3)', fontSize: '12px', marginTop: '4px' }}>
                    +{activeHooks.length - 5} more
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2-col: Party + Current chapter */}
      <div className="ov-grid">
        <div className="ov-card" onClick={() => onNavigate('cast')}>
          <div className="ov-card-head">
            <span className="ov-card-title">The party</span>
            <span className="ov-card-chevron">›</span>
          </div>
          <div className="ov-card-body">
            {activePCs.length === 0 ? (
              overview.party ? (
                <div>
                  <div style={{ color: 'var(--ink-2)', fontSize: '13px', lineHeight: 1.5 }}>{overview.party}</div>
                  <div style={{ color: 'var(--ink-4)', fontSize: '12px', marginTop: '6px' }}>Add full character sheets in Cast ›</div>
                </div>
              ) : (
                <div style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontSize: '13px' }}>
                  No active PCs
                </div>
              )
            ) : (
              <div>
                {activePCs.map(pc => (
                  <div key={pc.id} className="ov-list-item">
                    <span
                      className="ov-list-dot"
                      style={{ backgroundColor: 'var(--gold)' }}
                    />
                    <span className="ov-list-name">{pc.character_name}</span>
                    <span className="ov-list-meta">
                      {`Lv ${pc.level ?? '—'} · HP ${pc.max_hp ?? '—'} · AC ${pc.armor_class ?? '—'}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ov-card" onClick={() => onNavigate('modules')}>
          <div className="ov-card-head">
            <span className="ov-card-title">Current chapter</span>
            <span className="ov-card-chevron">›</span>
          </div>
          <div className="ov-card-body">
            {currentModule ? (
              <>
                <div className="ov-card-big">{currentModule.title}</div>
                {currentModule.chapter && (
                  <div className="ov-card-sub">Chapter {currentModule.chapter}</div>
                )}
                {currentModule.synopsis && (
                  <div className="ov-card-desc">{plainText(currentModule.synopsis)}</div>
                )}
              </>
            ) : (
              <div style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontSize: '13px' }}>
                No active module
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Collapsible Campaign Info */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{ backgroundColor: 'var(--paper)', borderColor: 'var(--rule)', marginTop: '24px' }}
      >
        <button
          onClick={() => setInfoOpen(o => !o)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left"
          style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <span
            className="text-sm font-semibold"
            style={{ color: 'var(--gold)', fontFamily: 'var(--display)' }}
          >
            Campaign Info
          </span>
          {dirty && (
            <span className="text-xs" style={{ color: 'var(--gold)' }}>• unsaved</span>
          )}
          <div className="flex-1" />
          {infoOpen ? (
            <ChevronUp size={16} style={{ color: 'var(--ink-3)' }} />
          ) : (
            <ChevronDown size={16} style={{ color: 'var(--ink-3)' }} />
          )}
        </button>

        {infoOpen && (
          <div className="px-6 pb-6 pt-2">
            <FormField label="Campaign Title">
              <input
                type="text"
                value={form.title}
                onChange={e => updateField('title', e.target.value)}
                placeholder="e.g., Age of Wild Magic"
                maxLength={limitFor('campaigns', 'title')}
                style={inputStyle}
              />
            </FormField>

            <FormField label="Plot Summary">
              <SlashField
                value={form.plotSummary}
                onChange={v => updateField('plotSummary', v)}
                placeholder="The overarching story, main conflicts, and campaign themes..."
                minHeight="160px"
                maxLength={limitFor('campaigns', 'plot_summary')}
              />
            </FormField>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Major Characters">
                <SlashField
                  value={form.majorCharacters}
                  onChange={v => updateField('majorCharacters', v)}
                  placeholder="Key villains, allies, and important figures..."
                  minHeight="120px"
                  maxLength={limitFor('campaigns', 'major_characters')}
                />
              </FormField>

              <FormField label="World Info & Additional Notes">
                <SlashField
                  value={form.worldInfo}
                  onChange={v => updateField('worldInfo', v)}
                  placeholder="Setting details, house rules, tone, important context..."
                  minHeight="120px"
                  maxLength={limitFor('campaigns', 'world_info')}
                />
              </FormField>
            </div>

            <div className="flex justify-end mt-4">
              <Button
                variant={saved ? 'secondary' : 'primary'}
                size="sm"
                onClick={handleSave}
                disabled={!dirty && !saved}
              >
                {saved ? 'Saved!' : 'Save Changes'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ── */

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/\s+\S*$/, '') + '…';
}
