import { useState, useEffect } from 'react';
import { SlashField } from '../ui/SlashField';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { FormField, inputStyle } from '../FormField';
import { Button } from '../ui/Button';
import type { Tab } from '../../App';

interface OverviewProps {
  onNavigate: (tab: Tab) => void;
}

export default function Overview({ onNavigate }: OverviewProps) {
  const {
    overview, setOverview,
    sessions, pcs, npcs, locations, factions,
    hooks, lore, modules, monsterStatblocks, encounters,
  } = useCampaign();

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

  // Derived data
  const activeHooks = hooks.filter(h => h.is_active);
  const activeModules = modules.filter(m => m.status === 'active');
  const activePCs = pcs.filter(pc => pc.is_active);
  const recentSessions = [...sessions]
    .sort((a, b) => b.session_number - a.session_number);
  const lastSession = recentSessions[0];
  const currentModule = activeModules[0];

  // Session count and next session info
  const sessionCount = sessions.length;
  const nextSessionDate = lastSession?.session_date
    ? formatNextSession(lastSession.session_date)
    : null;
  const partyName = overview.title || 'The Party';

  return (
    <div className="ov" style={{ height: '100%', overflowY: 'auto' }}>
      {/* Eyebrow */}
      <div className="ov-eyebrow">Chronicle</div>

      {/* Campaign title */}
      <h1 className="ov-title">{overview.title || 'Untitled Campaign'}</h1>

      {/* Tagline / plot summary as italic gold subtitle */}
      {overview.plotSummary && (
        <p className="ov-tagline">
          {truncate(overview.plotSummary, 120)}
        </p>
      )}

      {/* Info strip: Session count, Next session, Party */}
      <div className="ov-strip">
        <div className="ov-strip-item">
          <span className="ov-strip-label">Session</span>
          <span className="ov-strip-value">{sessionCount}</span>
        </div>
        <div className="ov-strip-item">
          <span className="ov-strip-label">Next</span>
          <span className="ov-strip-value">{nextSessionDate || '—'}</span>
        </div>
        <div className="ov-strip-item">
          <span className="ov-strip-label">Party</span>
          <span className="ov-strip-value">{activePCs.length > 0 ? `${activePCs.length} members` : '—'}</span>
        </div>
      </div>

      {/* 2-col: Current Chapter + Last Session */}
      <div className="ov-grid">
        {/* Current Chapter */}
        <div className="ov-card" onClick={() => onNavigate('modules')}>
          <div className="ov-card-head">
            <span className="ov-card-title">Current Chapter</span>
            <span className="ov-card-chevron">›</span>
          </div>
          <div className="ov-card-body">
            {currentModule ? (
              <>
                <div className="ov-card-big">{currentModule.title}</div>
                {currentModule.chapter && (
                  <div className="ov-card-sub">sessions {currentModule.chapter}</div>
                )}
                {currentModule.summary && (
                  <div className="ov-card-desc">{currentModule.summary}</div>
                )}
              </>
            ) : (
              <div style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontSize: '13px' }}>
                No active module
              </div>
            )}
          </div>
        </div>

        {/* Last Session */}
        <div className="ov-card" onClick={() => onNavigate('sessions')}>
          <div className="ov-card-head">
            <span className="ov-card-title">Last Session</span>
            <span className="ov-card-chevron">›</span>
          </div>
          <div className="ov-card-body">
            {lastSession ? (
              <>
                <div className="ov-card-big">#{lastSession.session_number}{lastSession.title ? ` · ${lastSession.title}` : ''}</div>
                {lastSession.session_date && (
                  <div className="ov-card-sub">{lastSession.session_date}</div>
                )}
                {lastSession.summary && (
                  <div className="ov-card-desc">{lastSession.summary}</div>
                )}
              </>
            ) : (
              <div style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontSize: '13px' }}>
                No sessions yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2-col: Active Hooks + Party */}
      <div className="ov-grid">
        {/* Active Hooks */}
        <div className="ov-card" onClick={() => onNavigate('sessions')}>
          <div className="ov-card-head">
            <span className="ov-card-title">Active Hooks</span>
            <span className="ov-card-chevron">›</span>
          </div>
          <div className="ov-card-body">
            {activeHooks.length === 0 ? (
              <div style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontSize: '13px' }}>
                No active hooks
              </div>
            ) : (
              <div>
                {activeHooks.slice(0, 5).map(h => (
                  <div key={h.id} className="ov-list-item">
                    <span
                      className="ov-list-dot"
                      style={{ backgroundColor: hookColor(h.category) }}
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

        {/* Party */}
        <div className="ov-card" onClick={() => onNavigate('cast')}>
          <div className="ov-card-head">
            <span className="ov-card-title">Party</span>
            <span className="ov-card-chevron">›</span>
          </div>
          <div className="ov-card-body">
            {activePCs.length === 0 ? (
              <div style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontSize: '13px' }}>
                No active PCs
              </div>
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
                      {[pc.race, pc.class].filter(Boolean).join(' ')}
                    </span>
                  </div>
                ))}
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
                style={inputStyle}
              />
            </FormField>

            <FormField label="Plot Summary">
              <SlashField
                value={form.plotSummary}
                onChange={v => updateField('plotSummary', v)}
                placeholder="The overarching story, main conflicts, and campaign themes..."
                minHeight="160px"
              />
            </FormField>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Major Characters">
                <SlashField
                  value={form.majorCharacters}
                  onChange={v => updateField('majorCharacters', v)}
                  placeholder="Key villains, allies, and important figures..."
                  minHeight="120px"
                />
              </FormField>

              <FormField label="World Info & Additional Notes">
                <SlashField
                  value={form.worldInfo}
                  onChange={v => updateField('worldInfo', v)}
                  placeholder="Setting details, house rules, tone, important context..."
                  minHeight="120px"
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

function hookColor(category?: string | null): string {
  switch (category) {
    case 'main_plot': return '#e05c5c';
    case 'side':      return '#4ab8d4';
    case 'character_arc': return '#c9a84c';
    case 'lore':      return '#8aa56b';
    default:          return '#897f68';
  }
}

function formatNextSession(lastDate: string): string | null {
  try {
    const d = new Date(lastDate);
    if (isNaN(d.getTime())) return null;
    // Show next likely session date (7 days later)
    d.setDate(d.getDate() + 7);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return null;
  }
}
