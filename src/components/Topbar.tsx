import type { User } from '@supabase/supabase-js';
import type { Tab } from '../App';
import CampaignSelector from './CampaignSelector';

interface ViewOption { id: string; label: string; }

interface TopbarProps {
  user: User;
  activeTab: Tab;
  tabLabel: string;
  onOpenMobileMenu: () => void;
  onOpenSearch: () => void;
  onToggleDice: () => void;
  onOpenAI: () => void;
  onOpenInbox: () => void;
  onOpenCapture: () => void;
  onToggleRun: () => void;
  runMode: boolean;
  isMobile: boolean;
  proposalCount?: number;
  viewMode?: string;
  setViewMode?: (v: string) => void;
  viewOptions?: ViewOption[];
}

export default function Topbar({
  activeTab,
  tabLabel,
  onOpenMobileMenu,
  onOpenSearch,
  onToggleDice,
  onOpenAI,
  onOpenInbox,
  onOpenCapture,
  onToggleRun,
  runMode,
  isMobile,
  proposalCount = 0,
  viewMode,
  setViewMode,
  viewOptions,
}: TopbarProps) {
  return (
    <header className="cm-top">
      {/* Mobile hamburger */}
      {isMobile && (
        <button onClick={onOpenMobileMenu} className="cm-top-btn" aria-label="Open menu">
          ☰
        </button>
      )}

      {/* Breadcrumb */}
      <div className="cm-top-crumbs">
        <span className="cm-top-crumb cm-top-crumb-root" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
          <CampaignSelector compact />
        </span>
        <span className="cm-top-crumb-sep">/</span>
        <span className="cm-top-crumb">{tabLabel}</span>
      </div>

      {/* View mode segment — only shown on tabs that have it */}
      {viewOptions && viewOptions.length > 0 && setViewMode && (
        <div className="cm-vm">
          {viewOptions.map(o => (
            <button
              key={o.id}
              className={`cm-vm-btn ${viewMode === o.id ? 'is-active' : ''}`}
              onClick={() => setViewMode(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <div className="cm-top-spacer" />

      {/* Right cluster */}
      <div className="cm-top-actions">
        {/* Proposals */}
        {proposalCount > 0 && (
          <button
            onClick={onOpenInbox}
            className="cm-top-btn"
            title="AI Proposals"
            style={{ borderColor: 'var(--gold)', color: 'var(--ink)' }}
          >
            <span className="cm-top-btn-glyph">✎</span>
            {!isMobile && <span>Proposals</span>}
            <span className="cm-top-badge">{proposalCount}</span>
          </button>
        )}

        {/* Search */}
        <button onClick={onOpenSearch} className="cm-top-btn" title="Search (⌘K)">
          <span className="cm-top-btn-glyph">⌕</span>
          {!isMobile && <span>Search</span>}
          {!isMobile && <kbd>⌘K</kbd>}
        </button>

        {/* AI Assistant */}
        <button onClick={onOpenAI} className="cm-top-btn" title="Campaign Assistant">
          <span className="cm-top-btn-glyph">✦</span>
          {!isMobile && <span>Assistant</span>}
        </button>

        {/* Post-Session Capture */}
        <button onClick={onOpenCapture} className="cm-top-btn" title="Post-session capture">
          <span className="cm-top-btn-glyph">✍</span>
          {!isMobile && <span>Capture</span>}
        </button>

        {/* Session Bar / Tools */}
        <button onClick={onToggleDice} className="cm-top-btn" title="Session tools (Initiative · Dice · Search)">
          <span className="cm-top-btn-glyph">⚄</span>
          {!isMobile && <span>Session Tools</span>}
        </button>

        {/* Run Session — primary gold button */}
        <button
          onClick={onToggleRun}
          className={`cm-top-btn cm-top-btn-primary ${runMode ? 'is-on' : ''}`}
          title={runMode ? 'Exit Session' : 'Run Session'}
        >
          <span className="cm-top-btn-glyph">⚜</span>
          <span>{runMode ? 'Exit' : 'Run Session'}</span>
        </button>
      </div>
    </header>
  );
}
