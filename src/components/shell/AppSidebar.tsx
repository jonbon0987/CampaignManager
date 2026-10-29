// One sidebar for both scopes. A campaign groups its tabs by the job (Play,
// Story, Compendium); a world shows its compendium and its campaigns. The scope
// switcher sits on top; Settings, shortcuts and Log out sit in a footer menu.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Tab } from '../../App';
import type { WorldCampaign } from '../../types/world';
import { useWorld } from '../../context/WorldContext';
import { useConfirm } from '../../context/ConfirmContext';
import { signOut } from '../../lib/auth';
import { getRecents, type RecentEntry } from '../../lib/recent';
import { OverflowMenu, type OverflowMenuEntry } from '../ui/OverflowMenu';
import ScopeSwitcher from './ScopeSwitcher';
import CampaignCreationGate from '../world/CampaignCreationGate';

interface NavItem { id: string; label: string; glyph: string; count?: number }
interface NavGroup { label: string; items: NavItem[] }

const CAMPAIGN_NAV: NavGroup[] = [
  { label: 'Play', items: [
    { id: 'overview', label: 'Home', glyph: '❖' },
    { id: 'sessions', label: 'Sessions', glyph: '❧' },
  ] },
  { label: 'Story', items: [
    { id: 'modules', label: 'Modules', glyph: '◇' },
    { id: 'threads', label: 'Threads', glyph: '✧' },
    { id: 'combat', label: 'Encounters', glyph: '⚔' },
  ] },
  { label: 'Compendium', items: [
    { id: 'cast', label: 'Cast', glyph: '❦' },
    { id: 'locations', label: 'Locations', glyph: '✦' },
    { id: 'lore', label: 'Lore', glyph: '❡' },
  ] },
];

// Status-adaptive copy for the world's campaign cards.
const CAMPAIGN_EYEBROW: Record<WorldCampaign['status'], string> = {
  active: 'Now playing',
  paused: 'Paused campaign',
  completed: 'Completed',
};
const CAMPAIGN_CTA: Record<WorldCampaign['status'], string> = {
  active: 'Continue session ›',
  paused: 'Resume campaign ›',
  completed: 'Reopen chronicle ›',
};
const STATUS_LABEL: Record<WorldCampaign['status'], string> = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
};

export interface AppSidebarProps {
  scope: 'campaign' | 'world';
  /** The nav item showing: a campaign Tab or a WorldTab. */
  activeId: string;
  onNavigate: (id: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  isMobile: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenShortcuts: () => void;
  /** Campaign scope only. */
  campaignId?: string | null;
  onOpenRecent?: (tab: Tab, id: string) => void;
  runMode?: boolean;
  onToggleRun?: () => void;
}

export default function AppSidebar({
  scope, activeId, onNavigate, collapsed: collapsedProp, onToggleCollapsed,
  isMobile, mobileOpen, onCloseMobile, onOpenShortcuts,
  campaignId = null, onOpenRecent, runMode = false, onToggleRun,
}: AppSidebarProps) {
  const world = useWorld();
  const confirm = useConfirm();
  // On a phone the sidebar is a drawer, always full width when it's open.
  const collapsed = collapsedProp && !isMobile;

  const go = (id: string) => { onNavigate(id); if (isMobile) onCloseMobile(); };

  const worldNav: NavGroup[] = [
    { label: 'World', items: [
      { id: 'overview', label: 'Overview', glyph: '❖' },
      { id: 'timeline', label: 'Timeline', glyph: '❂', count: world.timeline.length },
    ] },
    { label: 'Compendium', items: [
      { id: 'npcs', label: 'Cast', glyph: '❦', count: world.npcs.length + world.factions.length },
      { id: 'locations', label: 'Locations', glyph: '✦', count: world.locations.length },
      { id: 'lore', label: 'Lore', glyph: '❡', count: world.lore.length },
      { id: 'combat', label: 'Encounters', glyph: '⚔', count: world.bestiary.length + world.encounters.length + world.worldRandomEncounterTables.length },
    ] },
  ];
  const groups = scope === 'campaign' ? CAMPAIGN_NAV : worldNav;

  // Recently viewed records in this campaign.
  const [recents, setRecents] = useState<RecentEntry[]>(() => getRecents(campaignId));
  useEffect(() => {
    const refresh = () => setRecents(getRecents(campaignId));
    refresh();
    window.addEventListener('recent-changed', refresh);
    return () => window.removeEventListener('recent-changed', refresh);
  }, [campaignId]);

  const logOut = async () => {
    if (await confirm({ title: 'Log out', message: 'Log out of DM Lair?', confirmLabel: 'Log out' })) void signOut();
  };
  const footMenu: OverflowMenuEntry[] = [
    ...(scope === 'campaign' ? [{ label: 'Campaign settings', onClick: () => go('settings') }] : []),
    { label: 'Keyboard shortcuts', onClick: onOpenShortcuts },
    { sep: true },
    { label: 'Log out', onClick: () => void logOut() },
  ];

  return (
    <>
      {isMobile && mobileOpen && (
        <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onCloseMobile} aria-hidden="true" />
      )}

      <aside
        className={`cm-side ${collapsed ? 'is-collapsed' : ''} ${isMobile ? 'is-drawer' : ''} ${isMobile && mobileOpen ? 'is-open' : ''}`}
        aria-label={scope === 'campaign' ? 'Campaign navigation' : 'World navigation'}
      >
        <div className="cm-side-head">
          <ScopeSwitcher collapsed={collapsed} onExpand={onToggleCollapsed} />
          {!isMobile && !collapsed && (
            <button className="cm-side-toggle" onClick={onToggleCollapsed} title="Collapse sidebar (⌘\)" aria-label="Collapse sidebar">‹</button>
          )}
          {isMobile && (
            <button className="cm-side-toggle" onClick={onCloseMobile} title="Close menu" aria-label="Close menu">✕</button>
          )}
        </div>

        <div className="cm-side-scroll">
          <nav className="cm-nav">
            {groups.map(g => (
              <div key={g.label} className="cm-nav-group">
                <div className="cm-nav-section">{g.label}</div>
                {g.items.map(t => (
                  <button
                    key={t.id}
                    className={`cm-nav-item ${activeId === t.id ? 'is-active' : ''}`}
                    aria-current={activeId === t.id ? 'page' : undefined}
                    onClick={() => go(t.id)}
                    title={collapsed ? t.label : undefined}
                  >
                    <span className="cm-nav-glyph" aria-hidden="true">{t.glyph}</span>
                    <span className="cm-nav-label">{t.label}</span>
                    {t.count != null && !collapsed && <span className="w-nav-count">{t.count}</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {scope === 'world' && !collapsed && <WorldCampaigns />}

          {scope === 'campaign' && recents.length > 0 && !collapsed && (
            <div className="rv">
              <div className="rv-label">Recent</div>
              {recents.map(r => (
                <button
                  key={`${r.kind}:${r.id}`}
                  className="rv-item"
                  onClick={() => { onOpenRecent?.(r.tab, r.id); if (isMobile) onCloseMobile(); }}
                >
                  <span className="rv-glyph" aria-hidden="true">·</span>
                  <span className="rv-name">{r.label || 'Untitled'}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="cm-side-foot">
          {scope === 'campaign' && (
            <button className={`cm-run-btn ${runMode ? 'is-on' : ''}`} onClick={onToggleRun} title={runMode ? 'End the session' : 'Start the session'}>
              <span style={{ fontSize: '14px' }} aria-hidden="true">{runMode ? '■' : '▶'}</span>
              <span>{runMode ? 'End session' : 'Start session'}</span>
            </button>
          )}
          <div className="cm-side-account">
            <span className="cm-nav-glyph" aria-hidden="true">⚙</span>
            {!collapsed && <span className="cm-side-account-label">Settings &amp; account</span>}
            <OverflowMenu items={footMenu} up />
          </div>
        </div>
      </aside>
    </>
  );
}


// The world's campaigns: the one in play as a card, the rest as rows, each with
// a ⋯ menu for its status and Delete, and a row to start a new one.
function WorldCampaigns() {
  const { campaigns, activeCampaignId, openCampaign, deleteCampaign, updateCampaign } = useWorld();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const hero = campaigns.find(c => c.id === activeCampaignId) ?? campaigns.find(c => c.status === 'active') ?? campaigns[0] ?? null;
  const others = campaigns.filter(c => c.id !== hero?.id);

  const remove = async (c: WorldCampaign) => {
    if (await confirm({ title: 'Delete campaign', message: `Delete "${c.name}"? This cannot be undone.`, confirmLabel: 'Delete', danger: true })) {
      await deleteCampaign(c.id);
    }
  };
  const menu = (c: WorldCampaign): OverflowMenuEntry[] => [
    ...(Object.keys(STATUS_LABEL) as WorldCampaign['status'][])
      .filter(st => st !== c.status)
      .map(st => ({ label: `Mark as ${STATUS_LABEL[st].toLowerCase()}`, onClick: () => void updateCampaign(c.id, { status: st }) })),
    { sep: true },
    { label: 'Delete campaign', danger: true, onClick: () => void remove(c) },
  ];
  // Clicks and keys in a menu shouldn't open the campaign row it sits on.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div>
      <div className="wc-head"><span className="wc-head-label">Campaigns</span></div>
      <div className="wc-list">
        {hero && (
          <div
            role="button"
            tabIndex={0}
            className="wc-hero"
            onClick={() => openCampaign(hero.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') openCampaign(hero.id); }}
          >
            <div className="wc-hero-menu" onClick={stop} onKeyDown={stop}><OverflowMenu items={menu(hero)} /></div>
            <div className="wc-hero-eyebrow">
              <span className={`wc-dot wc-dot-${hero.status}`} />
              {CAMPAIGN_EYEBROW[hero.status]}
            </div>
            <div className="wc-hero-name">{hero.name}</div>
            <div className="wc-hero-meta">{hero.party ? `${hero.party} · ` : ''}{hero.sessions} session{hero.sessions === 1 ? '' : 's'}</div>
            {hero.lastPlayed && <div className="wc-hero-last">Last played · {hero.lastPlayed}</div>}
            <div className="wc-hero-cta">{CAMPAIGN_CTA[hero.status]}</div>
          </div>
        )}
        {others.length > 0 && <div className="wc-others-label">Also in this world</div>}
        {others.map(c => (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            className="wc-row"
            onClick={() => openCampaign(c.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') openCampaign(c.id); }}
          >
            <span className={`wc-dot wc-dot-${c.status}`} />
            <span className="wc-row-name">{c.name}</span>
            <span className="wc-row-n">{c.sessions} sess</span>
            <div className="wc-row-menu" onClick={stop} onKeyDown={stop}><OverflowMenu items={menu(c)} /></div>
          </div>
        ))}
        {/* eslint-disable-next-line no-restricted-syntax -- bespoke sidebar affordance */}
        <button className="wc-newrow" onClick={() => setCreating(true)}>
          <b>+</b><span>New campaign</span>
        </button>
      </div>
      {creating && createPortal(<CampaignCreationGate onClose={() => setCreating(false)} />, document.body)}
    </div>
  );
}
