import { useWorld } from '../../context/WorldContext';

const WORLD_TAB_LABELS: Record<string, string> = {
  overview: 'Overview', lore: 'Lore', locations: 'Locations',
  npcs: 'NPCs', combat: 'Combat', timeline: 'Timeline',
};

interface WorldTopbarProps {
  onToggleScratch?: () => void;
  onToggleShortcuts?: () => void;
  scratchOpen?: boolean;
}

export default function WorldTopbar({ onToggleScratch, onToggleShortcuts, scratchOpen }: WorldTopbarProps) {
  const { worldTab, activeWorld } = useWorld();

  return (
    <header className="cm-top">
      <div className="cm-top-crumbs">
        <span className="cm-top-crumb cm-top-crumb-root">{activeWorld?.name ?? ''}</span>
        <span className="cm-top-crumb-sep">/</span>
        <span className="cm-top-crumb">{WORLD_TAB_LABELS[worldTab] ?? ''}</span>
        <span className="w-scope-pill" style={{ marginLeft: 8 }}>⊕ World</span>
      </div>

      <div className="cm-top-spacer" />

      <div className="cm-top-actions">
        {onToggleScratch && (
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

        {onToggleShortcuts && (
          <button onClick={onToggleShortcuts} className="cm-top-btn" title="Keyboard shortcuts (?)">
            <span className="cm-top-btn-glyph">⌨</span>
            <kbd>?</kbd>
          </button>
        )}
      </div>
    </header>
  );
}
