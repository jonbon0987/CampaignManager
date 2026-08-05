import CampaignSelector from './CampaignSelector';
import { useWorld } from '../context/WorldContext';
import { ToolbarButton } from './ui/ToolbarButton';

interface ViewOption { id: string; label: string; }

interface TopbarProps {
  tabLabel: string;
  onOpenMobileMenu: () => void;
  onOpenSearch: () => void;
  onToggleDice: () => void;
  onOpenCapture: () => void;
  onToggleScratch: () => void;
  onToggleShortcuts: () => void;
  scratchOpen: boolean;
  isMobile: boolean;
  viewMode?: string;
  setViewMode?: (v: string) => void;
  viewOptions?: ViewOption[];
}

export default function Topbar({
  tabLabel,
  onOpenMobileMenu,
  onOpenSearch,
  onToggleDice,
  onOpenCapture,
  onToggleScratch,
  onToggleShortcuts,
  scratchOpen,
  isMobile,
  viewMode,
  setViewMode,
  viewOptions,
}: TopbarProps) {
  const { activeWorld, backToWorld } = useWorld();

  return (
    <header className="cm-top">
      {/* Mobile hamburger */}
      {isMobile && (
        <ToolbarButton onClick={onOpenMobileMenu} aria-label="Open menu">
          ☰
        </ToolbarButton>
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
        {/* Scratchpad */}
        {!isMobile && (
          <ToolbarButton
            onClick={onToggleScratch}
            active={scratchOpen}
            glyph="✎"
            kbd="⌘."
            title="Scratchpad (⌘.)"
          >
            <span>Notes</span>
          </ToolbarButton>
        )}

        {/* Keyboard shortcuts */}
        {!isMobile && (
          <ToolbarButton onClick={onToggleShortcuts} glyph="⌨" kbd="?" title="Keyboard shortcuts (?)" />
        )}

        {/* Search */}
        <ToolbarButton onClick={onOpenSearch} glyph="⌕" kbd={!isMobile ? '⌘/' : undefined} title="Search (⌘/)">
          {!isMobile && <span>Search</span>}
        </ToolbarButton>

        {/* Post-Session Capture */}
        <ToolbarButton onClick={onOpenCapture} glyph="✍" title="Post-session capture">
          {!isMobile && <span>Capture</span>}
        </ToolbarButton>

        {/* Session Bar / Tools */}
        <ToolbarButton onClick={onToggleDice} glyph="⚄" title="Session tools (Initiative · Dice · Search)">
          {!isMobile && <span>Session Tools</span>}
        </ToolbarButton>

      </div>
    </header>
  );
}
