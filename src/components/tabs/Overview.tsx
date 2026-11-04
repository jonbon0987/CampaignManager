import { useEffect } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useOpenRecord } from '../../context/NavigationContext';
import { usePlanNextSession } from '../../hooks/useSessionLifecycle';
import { useChroniclePipelineMaybe } from '../../context/ChroniclePipelineContext';
import { STAGE_LABEL } from '../../lib/recording/pipeline';
import { Button } from '../ui/Button';
import { PlayerPageCard } from '../player/PlayerPageCard';
import { CampaignDateCard } from '../calendar/CampaignDate';
import { PreviouslyOn } from '../session/PreviouslyOn';
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
    overview, selectedCampaign,
    sessions, pcs, hooks, modules, ideas,
  } = useCampaign();
  const openRecord = useOpenRecord();

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
  // The campaign's name (renamed in Settings); the old separate title only as a fallback.
  const campaignTitle = selectedCampaign?.name || overview.title || 'Untitled Campaign';
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
                <Button variant="link" onClick={() => onNavigate('threads')}>
                  {inbox} {inbox === 1 ? 'idea' : 'ideas'} in the Inbox ›
                </Button>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* What to read as the next session opens */}
      {last && (
        <section className="ov-prev" aria-labelledby="ov-prev-title">
          <div className="ov-card-head">
            <span className="ov-card-title" id="ov-prev-title">Last time · {sessionName(last)}{last.session_date ? ` · ${formatSessionDate(last.session_date)}` : ''}</span>
          </div>
          <PreviouslyOn sessions={sessions} before={next?.session_number} onOpenSession={id => openRecord('sessions', id)} />
        </section>
      )}

      {/* Threads in motion, full width */}
      <div className="ov-grid is-single">
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
                      {`Lv ${pc.level ?? '—'} · HP ${pc.max_hp ?? '—'} · AC ${pc.armor_class ?? '—'}${pc.passive_perception ? ` · PP ${pc.passive_perception}` : ''}`}
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

      <CampaignDateCard />

      <PlayerPageCard />

    </div>
  );
}

/* ── Helpers ── */

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/\s+\S*$/, '') + '…';
}
