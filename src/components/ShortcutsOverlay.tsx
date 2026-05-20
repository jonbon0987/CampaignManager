interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

const GROUPS = [
  { title: 'Navigation', shortcuts: [
    { keys: ['⌘', 'K'], label: 'Command bar / search' },
    { keys: ['⌘', '\\'], label: 'Toggle sidebar' },
    { keys: ['⌘', '.'], label: 'Toggle scratchpad' },
  ]},
  { title: 'Lists', shortcuts: [
    { keys: ['↑', '↓'], label: 'Navigate list items' },
    { keys: ['↵'], label: 'Open selected item' },
    { keys: ['⌘', '⌫'], label: 'Delete selected' },
  ]},
  { title: 'Create', shortcuts: [
    { keys: ['⌘', '⇧', 'N'], label: 'New NPC' },
    { keys: ['⌘', '⇧', 'L'], label: 'New location' },
    { keys: ['⌘', '⇧', 'S'], label: 'New session' },
    { keys: ['⌘', '⇧', 'E'], label: 'New encounter' },
  ]},
  { title: 'Editing', shortcuts: [
    { keys: ['@'], label: 'Insert entity mention' },
    { keys: ['⌘', 'S'], label: 'Force save' },
    { keys: ['Esc'], label: 'Close panel / overlay' },
  ]},
  { title: 'Session', shortcuts: [
    { keys: ['⌘', '⇧', 'R'], label: 'Toggle Run Session' },
    { keys: ['Space'], label: 'Next initiative turn' },
  ]},
  { title: 'Overlays', shortcuts: [
    { keys: ['?'], label: 'Show shortcuts' },
    { keys: ['Esc'], label: 'Close overlays' },
  ]},
];

export default function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  if (!open) return null;

  return (
    <div className="v6-ks-back" onClick={onClose}>
      <div className="v6-ks" onClick={e => e.stopPropagation()}>
        <div className="v6-ks-head">
          <span className="v6-ks-title">Keyboard Shortcuts</span>
          <div style={{ flex: 1 }} />
          <span className="v6-ks-key">?</span>
          <button className="v6-ks-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="v6-ks-grid">
          {GROUPS.map((g, gi) => (
            <div key={gi} className="v6-ks-group">
              <div className="v6-ks-group-title">{g.title}</div>
              {g.shortcuts.map((s, si) => (
                <div key={si} className="v6-ks-row">
                  <span className="v6-ks-label">{s.label}</span>
                  <span className="v6-ks-keys">
                    {s.keys.map((k, ki) => (
                      <span key={ki} className="v6-ks-kbd">{k}</span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
