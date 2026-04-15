interface ActiveToggleProps {
  isActive: boolean;
  onChange: (value: boolean) => void;
}

export function ActiveToggle({ isActive, onChange }: ActiveToggleProps) {
  return (
    <div style={{ display: 'inline-flex', borderRadius: 4, overflow: 'hidden', border: '1px solid #3a3660' }}>
      <button
        type="button"
        onClick={() => onChange(true)}
        style={{
          padding: '4px 12px',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: 'Georgia, Cambria, serif',
          border: 'none',
          cursor: 'pointer',
          backgroundColor: isActive ? '#2a4a35' : '#22203a',
          color: isActive ? '#7dce82' : '#6a6490',
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
          fontFamily: 'Georgia, Cambria, serif',
          border: 'none',
          borderLeft: '1px solid #3a3660',
          cursor: 'pointer',
          backgroundColor: !isActive ? '#3a2a2a' : '#22203a',
          color: !isActive ? '#e05c5c' : '#6a6490',
          transition: 'all 0.15s',
        }}
      >
        Inactive
      </button>
    </div>
  );
}
