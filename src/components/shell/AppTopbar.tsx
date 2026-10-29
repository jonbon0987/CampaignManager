// One topbar for both scopes: where you are, the tab's view switch, and three
// controls, the ⌘K bar, a quick note and the assistant. Replaces Topbar and
// WorldTopbar.

import type { ReactNode } from 'react';
import { ToolbarButton } from '../ui/ToolbarButton';

export interface Crumb { label: string; onClick?: () => void }
interface ViewOption { id: string; label: string }

interface AppTopbarProps {
  crumbs: Crumb[];
  isMobile: boolean;
  onOpenMobileMenu: () => void;
  viewOptions?: ViewOption[];
  viewMode?: string;
  setViewMode?: (v: string) => void;
  /** Shown first on the right, e.g. the recording indicator. */
  status?: ReactNode;
  onOpenPalette: () => void;
  /** Absent where there's nowhere to keep a note (the world). */
  onToggleNote?: () => void;
  noteOpen?: boolean;
  onToggleAssistant: () => void;
  assistantOpen: boolean;
}

export default function AppTopbar({
  crumbs, isMobile, onOpenMobileMenu, viewOptions, viewMode, setViewMode, status,
  onOpenPalette, onToggleNote, noteOpen = false, onToggleAssistant, assistantOpen,
}: AppTopbarProps) {
  return (
    <header className="cm-top">
      {isMobile && (
        <ToolbarButton onClick={onOpenMobileMenu} aria-label="Open menu">☰</ToolbarButton>
      )}

      <nav className="cm-top-crumbs" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={i} className="cm-top-crumb-wrap">
            {i > 0 && <span className="cm-top-crumb-sep" aria-hidden="true">/</span>}
            {c.onClick ? (
              // eslint-disable-next-line no-restricted-syntax -- breadcrumb link
              <button className="cm-top-crumb cm-top-crumb-link" onClick={c.onClick}>{c.label}</button>
            ) : (
              <span className="cm-top-crumb" aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.label}</span>
            )}
          </span>
        ))}
      </nav>

      {viewOptions && viewOptions.length > 0 && setViewMode && (
        <div className="cm-vm" role="group" aria-label="View">
          {viewOptions.map(o => (
            <button
              key={o.id}
              className={`cm-vm-btn ${viewMode === o.id ? 'is-active' : ''}`}
              aria-pressed={viewMode === o.id}
              onClick={() => setViewMode(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <div className="cm-top-spacer" />

      <div className="cm-top-actions">
        {status}
        <ToolbarButton onClick={onOpenPalette} glyph="⌕" kbd={!isMobile ? '⌘K' : undefined} title="Search, jump, create or ask (⌘K)" className="cm-top-palette">
          {!isMobile && <span>Search, jump, create…</span>}
        </ToolbarButton>
        {onToggleNote && (
          <ToolbarButton onClick={onToggleNote} active={noteOpen} glyph="✎" kbd={!isMobile ? '⌘.' : undefined} title="Quick note (⌘.)" aria-label="Quick note">
            {!isMobile && <span>Note</span>}
          </ToolbarButton>
        )}
        <ToolbarButton onClick={onToggleAssistant} active={assistantOpen} glyph="✦" title="Assistant (⌘J)" aria-label="Assistant" aria-pressed={assistantOpen} />
      </div>
    </header>
  );
}
