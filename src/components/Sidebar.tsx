import { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import type { Tab } from '../App';
import { useCampaign } from '../context/CampaignContext';
import { useWorld } from '../context/WorldContext';

interface NavItem {
  id: Tab;
  label: string;
  glyph: string;
}

const TABS: NavItem[] = [
  { id: 'overview',  label: 'Overview',  glyph: '❖' },
  { id: 'cast',      label: 'Cast',      glyph: '◇' },
  { id: 'lore',      label: 'Lore',      glyph: '❦' },
  { id: 'locations', label: 'Locations', glyph: '✦' },
  { id: 'threads',   label: 'Threads',   glyph: '✧' },
  { id: 'ideas',     label: 'Ideas',     glyph: '✎' },
  { id: 'modules',   label: 'Modules',   glyph: '❧' },
  { id: 'sessions',  label: 'Sessions',  glyph: '❂' },
  { id: 'combat',    label: 'Combat',    glyph: '⚔' },
  { id: 'settings',  label: 'Settings',  glyph: '⚙' },
];

// Recently viewed entries
interface RecentEntry {
  kind: string;
  id: string;
  label: string;
  tab: Tab;
}

const recentStore: RecentEntry[] = [];

export function pushRecent(entry: RecentEntry) {
  const idx = recentStore.findIndex(r => r.kind === entry.kind && r.id === entry.id);
  if (idx >= 0) recentStore.splice(idx, 1);
  recentStore.unshift(entry);
  if (recentStore.length > 6) recentStore.length = 6;
  window.dispatchEvent(new CustomEvent('recent-changed'));
}

export function getRecents() {
  return [...recentStore];
}

interface SidebarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  isOpen: boolean;
  onToggle: () => void;
  onToggleRun?: () => void;
  onOpenAI?: () => void;
  onOpenDice?: () => void;
  proposalCount?: number;
  runMode?: boolean;
  isMobile: boolean;
  onCloseMobile: () => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  isOpen,
  onToggle,
  onToggleRun,
  onOpenAI,
  onOpenDice,
  proposalCount = 0,
  runMode = false,
  isMobile,
  onCloseMobile,
}: SidebarProps) {
  const { selectedCampaign } = useCampaign();
  const { backToWorld, activeWorld } = useWorld();
  const collapsed = !isOpen && !isMobile;

  const handleNavClick = (tab: Tab) => {
    setActiveTab(tab);
    if (isMobile) onCloseMobile();
  };

  // Recently viewed
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  useEffect(() => {
    const handler = () => setRecents(getRecents());
    window.addEventListener('recent-changed', handler);
    return () => window.removeEventListener('recent-changed', handler);
  }, []);

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`cm-side ${collapsed ? 'is-collapsed' : ''}`}
        style={{
          ...(isMobile ? {
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            zIndex: 50,
            transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
            width: '200px',
          } : {}),
        }}
      >
        {/* Header */}
        <div className="cm-side-head">
          <div
            className="cm-crest"
            onClick={collapsed ? onToggle : undefined}
            style={collapsed ? { cursor: 'pointer' } : undefined}
            title={collapsed ? 'Expand sidebar' : undefined}
          >
            ❖
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cm-side-eyebrow">Chronicle</div>
            <div className="cm-side-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedCampaign?.name || 'DM Lair'}
            </div>
          </div>
          {!isMobile && !collapsed && (
            <button
              className="cm-side-toggle"
              onClick={onToggle}
              title="Collapse sidebar"
            >
              ‹
            </button>
          )}
        </div>

        {/* Back to World */}
        {!collapsed && (
          <button className="w-back-btn" onClick={backToWorld} style={{ margin: '8px 12px 0', width: 'calc(100% - 24px)' }}>
            <span>←</span> {activeWorld.name}
          </button>
        )}

        {/* Navigation */}
        <nav className="cm-nav">
          <div className="cm-nav-section">Campaign</div>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`cm-nav-item ${activeTab === t.id ? 'is-active' : ''}`}
              onClick={() => handleNavClick(t.id)}
            >
              <span className="cm-nav-glyph">{t.glyph}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
            </button>
          ))}

          <div className="cm-nav-section">Tools</div>
          <button
            className="cm-nav-item cm-nav-assist"
            onClick={() => { onOpenAI?.(); if (isMobile) onCloseMobile(); }}
            title="Campaign Assistant (⌘K)"
          >
            <span className="cm-nav-glyph">✦</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Assistant</span>
            {proposalCount > 0 && <span className="cm-nav-badge" title={`${proposalCount} pending`}>{collapsed ? '' : proposalCount}</span>}
            {!collapsed && proposalCount === 0 && <span className="cm-nav-kbd">⌘K</span>}
          </button>
          <button
            className="cm-nav-item"
            onClick={() => { onOpenDice?.(); if (isMobile) onCloseMobile(); }}
            title="Dice roller"
          >
            <span className="cm-nav-glyph">⚄</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Dice</span>
          </button>
        </nav>

        {/* Recently Viewed */}
        {recents.length > 0 && (
          <div className="rv">
            <div className="rv-label">Recent</div>
            {recents.map((r, i) => (
              <button
                key={i}
                className="rv-item"
                onClick={() => handleNavClick(r.tab)}
              >
                <span className="rv-glyph">·</span>
                <span className="rv-name">{r.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="cm-side-foot">
          <button
            className={`cm-run-btn ${runMode ? 'is-on' : ''}`}
            onClick={onToggleRun}
          >
            <span style={{ fontSize: '14px' }}>⚜</span>
            <span>{runMode ? 'Exit Session' : 'Run Session'}</span>
          </button>
          {selectedCampaign && (
            <div className="cm-side-meta">
              <div>{selectedCampaign.name}</div>
            </div>
          )}
        </div>

        {/* Mobile close */}
        {isMobile && (
          <div style={{ padding: '8px 14px', borderTop: '1px solid var(--rule-soft)' }}>
            <button
              onClick={onCloseMobile}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px',
                background: 'transparent',
                border: 'none',
                color: 'var(--ink-3)',
                cursor: 'pointer',
                fontFamily: 'var(--serif)',
                fontSize: '13px',
              }}
            >
              <Menu size={14} />
              <span>Close menu</span>
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
