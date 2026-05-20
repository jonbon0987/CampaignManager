import type { User } from '@supabase/supabase-js';
import type { Tab } from '../App';
import CampaignSelector from './CampaignSelector';
import { useWorld } from '../context/WorldContext';

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
  onToggleScratch: () => void;
  onToggleShortcuts: () => void;
  scratchOpen: boolean;
  runMode: boolean;
  isMobile: boolean;
  proposalCount?: number;
  viewMode?: string;
  setViewMode?: (v: string) => void;
  viewOptions?: ViewOption[];
  onImportFromWorld?: (type: string) => void;
}

const IMPORT_MAP: Partial<Record<Tab, string>> = {
  cast: 'npc',
  world: 'location',
  combat: 'bestiary',
};

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
  onToggleScratch,
  onToggleShortcuts,
  scratchOpen,
  runMode,
  isMobile,
  proposalCount = 0,
  viewMode,
  setViewMode,
  viewOptions,
  onImportFromWorld,
}: TopbarProps) {
  const { activeWorld, backToWorld } = useWorld();
  const importType = IMPORT_MAP[activeTab];

  return (
    <header className="cm-top">
      {/* Mobile hamburger */}
      {isMobile && (
        <button onClick={onOpenMobileMenu} className="cm-top-btn" aria-label="Open menu">
          ☰
        </button>
      )}

      {/* Breadcrumb — World / Campaign / Tab */}
      <div className="cm-top-crumbs">
        <button
          className="cm-top-crumb cm-top-crumb-root"
          onClick={backToWorld}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 0, fontFamily: 'var(--display)', fontSize: 17,
            color: 'var(--ink-3)',
          }}
          title="Back to world"
        >
          {activeWorld.name}
        </button>
        <span className="cm-top-crumb-sep">/</span>
        <span className="cm-top-crumb" style={{ position: 'relative', display: 'inline-block' }}>
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
        {/* Import from World — contextual on Cast/World/Combat */}
        {importType && onImportFromWorld && (
          <button
            onClick={() => onImportFromWorld(importType)}
            className="cm-top-btn"
            title="Import from World"
          >
            <span className="cm-top-btn-glyph">⊕</span>
            <span>Import</span>
          </button>
        )}

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

        {/* Scratchpad */}
        {!isMobile && (
          <button
            onClick={onToggleScratch}
            className={`cm-top-btn${scratchOpen ? ' is-on' : ''}`}
            title="Scratchpad (⌘.)"
          >
            <span className="cm-top-btn-glyph">✎</span>
            <span>Notes</span>
            <kbd>⌘.</kbd>
          </button>
        )}

        {/* Keyboard shortcuts */}
        {!isMobile && (
          <button onClick={onToggleShortcuts} className="cm-top-btn" title="Keyboard shortcuts (?)">
            <span className="cm-top-btn-glyph">⌨</span>
            <kbd>?</kbd>
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

      </div>
    </header>
  );
}
