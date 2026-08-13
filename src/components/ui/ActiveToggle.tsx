interface ActiveToggleProps {
  isActive: boolean;
  onChange: (value: boolean) => void;
}

export function ActiveToggle({ isActive, onChange }: ActiveToggleProps) {
  return (
    <div style={{ display: 'inline-flex', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--rule)' }}>
      <button
        type="button"
        onClick={() => onChange(true)}
        style={{
          padding: '4px 12px',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: 'var(--serif)',
          border: 'none',
          cursor: 'pointer',
          backgroundColor: isActive ? 'var(--success-bg)' : 'var(--paper-2)',
          color: isActive ? 'var(--success)' : 'var(--ink-3)',
          transition: 'all 0.15s',
        }}
      >
        Active
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        style={{
          padding: '4px 12px',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: 'var(--serif)',
          border: 'none',
          borderLeft: '1px solid var(--rule)',
          cursor: 'pointer',
          backgroundColor: !isActive ? 'var(--red-bg)' : 'var(--paper-2)',
          color: !isActive ? 'var(--red)' : 'var(--ink-3)',
          transition: 'all 0.15s',
        }}
      >
        Inactive
      </button>
    </div>
  );
}
