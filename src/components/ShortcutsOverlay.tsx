interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
  /** The world shell has no search, sidebar shortcut or recorder. */
  scope?: 'campaign' | 'world';
}

interface Shortcut { keys: string[]; label: string; campaignOnly?: boolean }

// Only keys that are actually wired up belong here.
const GROUPS: { title: string; shortcuts: Shortcut[] }[] = [
  { title: 'Anywhere', shortcuts: [
    { keys: ['⌘', 'K'], label: 'Search, jump, create, roll or ask' },
    { keys: ['⌘', 'J'], label: 'Assistant' },
    { keys: ['⌘', '.'], label: 'Quick note to Ideas', campaignOnly: true },
    { keys: ['⌘', '\\'], label: 'Collapse sidebar' },
  ]},
  { title: 'Editing', shortcuts: [
    { keys: ['@'], label: 'Mention an entry' },
    { keys: ['/'], label: 'Format menu, in a text field' },
    { keys: ['⌘', 'S'], label: 'Save now' },
  ]},
  { title: 'Recording', shortcuts: [
    { keys: ['M'], label: 'Mark a moment', campaignOnly: true },
  ]},
  { title: 'Overlays', shortcuts: [
    { keys: ['?'], label: 'Show shortcuts' },
    { keys: ['Esc'], label: 'Close' },
  ]},
];

export default function ShortcutsOverlay({ open, onClose, scope = 'campaign' }: ShortcutsOverlayProps) {
  if (!open) return null;
  const groups = GROUPS
    .map(g => ({ ...g, shortcuts: g.shortcuts.filter(sc => scope === 'campaign' || !sc.campaignOnly) }))
    .filter(g => g.shortcuts.length);

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
          {groups.map((g, gi) => (
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
