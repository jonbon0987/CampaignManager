import { useState, useEffect } from 'react';
import {
  ScrollText, Users, User, Map, Shield, Lightbulb,
  BookOpen, Skull, Swords, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { FormField, inputStyle } from '../FormField';
import { SectionHeader } from '../ui/SectionHeader';
import { Button } from '../ui/Button';
import { MarkdownEditor } from '../ui/MarkdownEditor';
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

  // Derived dashboard data
  const activeHooks = hooks.filter(h => h.is_active);
  const readyEncounters = encounters.filter(e => e.status === 'ready');
  const activeModules = modules.filter(m => m.status === 'active');
  const activePCs = pcs.filter(pc => pc.is_active);
  const recentSessions = [...sessions]
    .sort((a, b) => b.session_number - a.session_number)
    .slice(0, 3);

  const stats = [
    { label: 'Sessions', count: sessions.length, tab: 'sessions' as Tab, icon: ScrollText },
    { label: 'PCs', count: pcs.length, tab: 'characters' as Tab, icon: User },
    { label: 'NPCs', count: npcs.length, tab: 'characters' as Tab, icon: Users },
    { label: 'Locations', count: locations.length, tab: 'lore' as Tab, icon: Map },
    { label: 'Factions', count: factions.length, tab: 'factions' as Tab, icon: Shield },
    { label: 'Hooks', count: hooks.length, tab: 'hooks' as Tab, icon: Lightbulb },
    { label: 'Lore', count: lore.length, tab: 'lore' as Tab, icon: BookOpen },
    { label: 'Modules', count: modules.length, tab: 'modules' as Tab, icon: BookOpen },
    { label: 'Creatures', count: monsterStatblocks.length, tab: 'creatures' as Tab, icon: Skull },
    { label: 'Encounters', count: encounters.length, tab: 'encounters' as Tab, icon: Swords },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      {/* Campaign title */}
      {overview.title && (
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: '#c9a84c', fontFamily: 'Georgia, Cambria, serif' }}
          >
            {overview.title}
          </h1>
          {overview.plotSummary && (
            <p className="text-sm mt-1 line-clamp-2" style={{ color: '#9990b0' }}>
              {overview.plotSummary}
            </p>
          )}
        </div>
      )}

      {/* Quick Stats */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}
      >
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <button
              key={s.label}
              onClick={() => onNavigate(s.tab)}
              className="rounded-lg border text-center py-3 px-2 transition-colors"
              style={{
                backgroundColor: '#1a1828',
                borderColor: '#2e2c4a',
                cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#3a3660')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#2e2c4a')}
            >
              <Icon size={16} strokeWidth={1.5} style={{ color: '#6a6490', margin: '0 auto 4px' }} />
              <div className="text-lg font-bold" style={{ color: '#e8d5b0' }}>{s.count}</div>
              <div className="text-xs" style={{ color: '#6a6490' }}>{s.label}</div>
            </button>
          );
        })}
      </div>

      {/* Dashboard panels grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Party Summary */}
        <DashboardCard
          title="Party"
          count={activePCs.length}
          icon={User}
          onClick={() => onNavigate('characters')}
          empty={activePCs.length === 0}
          emptyText="No active PCs"
        >
          <div className="space-y-1.5">
            {activePCs.map(pc => (
              <div key={pc.id} className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: '#e8d5b0' }}>
                  {pc.character_name}
                </span>
                {(pc.race || pc.class) && (
                  <span className="text-xs" style={{ color: '#6a6490' }}>
                    {[pc.race, pc.class].filter(Boolean).join(' ')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </DashboardCard>

        {/* Active Hooks */}
        <DashboardCard
          title="Active Hooks"
          count={activeHooks.length}
          icon={Lightbulb}
          onClick={() => onNavigate('hooks')}
          empty={activeHooks.length === 0}
          emptyText="No active hooks"
        >
          <div className="space-y-1.5">
            {activeHooks.slice(0, 5).map(h => (
              <div key={h.id} className="flex items-center gap-2">
                <span className="text-sm" style={{ color: '#e8d5b0' }}>{h.title}</span>
                {h.category && (
                  <span
                    className="text-xs px-1.5 rounded"
                    style={{
                      backgroundColor: '#2a2040',
                      color: '#9990b0',
                      fontSize: '0.65rem',
                    }}
                  >
                    {h.category.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
            ))}
            {activeHooks.length > 5 && (
              <div className="text-xs" style={{ color: '#6a6490' }}>
                +{activeHooks.length - 5} more
              </div>
            )}
          </div>
        </DashboardCard>

        {/* Ready Encounters */}
        <DashboardCard
          title="Ready Encounters"
          count={readyEncounters.length}
          icon={Swords}
          onClick={() => onNavigate('encounters')}
          empty={readyEncounters.length === 0}
          emptyText="No ready encounters"
        >
          <div className="space-y-1.5">
            {readyEncounters.slice(0, 4).map(e => (
              <div key={e.id} className="flex items-center gap-2">
                <span className="text-sm" style={{ color: '#e8d5b0' }}>{e.name}</span>
                {e.difficulty && (
                  <span
                    className="text-xs px-1.5 rounded"
                    style={{
                      fontSize: '0.65rem',
                      backgroundColor: difficultyColor(e.difficulty).bg,
                      color: difficultyColor(e.difficulty).text,
                    }}
                  >
                    {e.difficulty}
                  </span>
                )}
              </div>
            ))}
            {readyEncounters.length > 4 && (
              <div className="text-xs" style={{ color: '#6a6490' }}>
                +{readyEncounters.length - 4} more
              </div>
            )}
          </div>
        </DashboardCard>

        {/* Active Modules */}
        <DashboardCard
          title="Active Modules"
          count={activeModules.length}
          icon={BookOpen}
          onClick={() => onNavigate('modules')}
          empty={activeModules.length === 0}
          emptyText="No active modules"
        >
          <div className="space-y-1.5">
            {activeModules.slice(0, 4).map(m => (
              <div key={m.id} className="flex items-center gap-2">
                {m.chapter && (
                  <span className="text-xs shrink-0" style={{ color: '#6a6490' }}>
                    Ch.{m.chapter}
                  </span>
                )}
                <span className="text-sm" style={{ color: '#e8d5b0' }}>{m.title}</span>
              </div>
            ))}
            {activeModules.length > 4 && (
              <div className="text-xs" style={{ color: '#6a6490' }}>
                +{activeModules.length - 4} more
              </div>
            )}
          </div>
        </DashboardCard>

        {/* Recent Sessions — full width */}
        <DashboardCard
          title="Recent Sessions"
          count={sessions.length}
          icon={ScrollText}
          onClick={() => onNavigate('sessions')}
          empty={recentSessions.length === 0}
          emptyText="No sessions yet"
          className="md:col-span-2"
        >
          <div className="space-y-2">
            {recentSessions.map(s => (
              <div
                key={s.id}
                className="flex items-start gap-3 rounded px-3 py-2"
                style={{ backgroundColor: '#14132a' }}
              >
                <span
                  className="text-xs font-bold shrink-0 mt-0.5 px-2 py-0.5 rounded"
                  style={{ backgroundColor: '#2a2040', color: '#c9a84c' }}
                >
                  #{s.session_number}
                </span>
                <div className="min-w-0 flex-1">
                  {s.session_date && (
                    <div className="text-xs mb-0.5" style={{ color: '#6a6490' }}>
                      {s.session_date}
                    </div>
                  )}
                  {s.summary ? (
                    <div
                      className="text-sm line-clamp-2"
                      style={{ color: '#9990b0' }}
                    >
                      {s.summary}
                    </div>
                  ) : (
                    <div className="text-sm italic" style={{ color: '#4a4470' }}>
                      No summary
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DashboardCard>
      </div>

      {/* Collapsible Campaign Info */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{ backgroundColor: '#1a1828', borderColor: '#2e2c4a' }}
      >
        <button
          onClick={() => setInfoOpen(o => !o)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left"
          style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <span
            className="text-sm font-semibold"
            style={{ color: '#c9a84c', fontFamily: 'Georgia, Cambria, serif' }}
          >
            Campaign Info
          </span>
          {dirty && (
            <span className="text-xs" style={{ color: '#c9a84c' }}>• unsaved</span>
          )}
          <div className="flex-1" />
          {infoOpen ? (
            <ChevronUp size={16} style={{ color: '#6a6490' }} />
          ) : (
            <ChevronDown size={16} style={{ color: '#6a6490' }} />
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
              <MarkdownEditor
                value={form.plotSummary}
                onChange={v => updateField('plotSummary', v)}
                placeholder="The overarching story, main conflicts, and campaign themes..."
                minHeight="160px"
              />
            </FormField>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Major Characters">
                <MarkdownEditor
                  value={form.majorCharacters}
                  onChange={v => updateField('majorCharacters', v)}
                  placeholder="Key villains, allies, and important figures..."
                  minHeight="120px"
                />
              </FormField>

              <FormField label="World Info & Additional Notes">
                <MarkdownEditor
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

/* ── Dashboard Card ── */

interface DashboardCardProps {
  title: string;
  count: number;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>;
  onClick: () => void;
  children: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
  className?: string;
}

function DashboardCard({ title, count, icon: Icon, onClick, children, empty, emptyText, className = '' }: DashboardCardProps) {
  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${className}`}
      style={{ backgroundColor: '#1a1828', borderColor: '#2e2c4a' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#3a3660')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#2e2c4a')}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} strokeWidth={1.5} style={{ color: '#6a6490' }} />
        <span
          className="text-sm font-semibold"
          style={{ color: '#c9a84c', fontFamily: 'Georgia, Cambria, serif' }}
        >
          {title}
        </span>
        <span className="text-xs px-1.5 rounded" style={{ backgroundColor: '#2a2040', color: '#6a6490' }}>
          {count}
        </span>
        <div className="flex-1" />
        <button
          onClick={onClick}
          className="text-xs transition-colors"
          style={{
            color: '#6a6490',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'Georgia, Cambria, serif',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#c9a84c')}
          onMouseLeave={e => (e.currentTarget.style.color = '#6a6490')}
        >
          View all →
        </button>
      </div>

      {empty ? (
        <div className="text-xs py-4 text-center" style={{ color: '#4a4470', fontStyle: 'italic' }}>
          {emptyText}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/* ── Helpers ── */

function difficultyColor(d: string): { bg: string; text: string } {
  switch (d) {
    case 'easy':   return { bg: '#1a2a1a', text: '#6ab87a' };
    case 'medium': return { bg: '#2a2a1a', text: '#c9a84c' };
    case 'hard':   return { bg: '#2a1a1a', text: '#c08060' };
    case 'deadly': return { bg: '#3a1a1a', text: '#e05c5c' };
    default:       return { bg: '#2a2040', text: '#9990b0' };
  }
}
