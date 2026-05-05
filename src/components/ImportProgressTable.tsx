import type { ImportAction } from '../lib/documentImport';
import { entityMeta, describeAction } from '../lib/documentImport';

const badgeColors: Record<string, { bg: string; text: string; border: string }> = {
  gold:   { bg: '#2a2418', text: '#c9a84c', border: '#5a4a20' },
  green:  { bg: '#1a2a1a', text: '#6ab87a', border: '#2a5a2a' },
  red:    { bg: '#3a1a1a', text: '#e05c5c', border: '#6a2a2a' },
  blue:   { bg: '#1a2a3a', text: '#70a0e0', border: '#2a4a7a' },
  muted:  { bg: '#1a1828', text: '#9990b0', border: '#3a3660' },
  yellow: { bg: '#2a2a1a', text: '#d0c060', border: '#6a6020' },
  orange: { bg: '#3a2010', text: '#e09050', border: '#7a4a20' },
};

export default function ImportProgressTable({ actions, appliedIds, failedIds, phase, onApply, onDismiss }: {
  actions: ImportAction[];
  appliedIds: Set<string>;
  failedIds: Set<string>;
  phase: 'pending_confirmation' | 'applying' | 'done';
  onApply?: () => void;
  onDismiss?: () => void;
}) {
  const doneCount = appliedIds.size + failedIds.size;
  return (
    <div style={{ marginTop: '12px', borderTop: '1px solid #3a3660', paddingTop: '10px' }}>
      <div style={{ fontSize: '11px', color: '#9990b0', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {phase === 'pending_confirmation' ? (
          <>Proposed {actions.length} change{actions.length === 1 ? '' : 's'}:</>
        ) : phase === 'applying' ? (
          <>Applying changes ({doneCount}/{actions.length})…</>
        ) : (
          <>Applied {appliedIds.size} of {actions.length} changes
            {failedIds.size > 0 && <span style={{ color: '#e05c5c' }}> ({failedIds.size} failed)</span>}
          </>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {actions.map(action => {
          const meta = entityMeta[action.type];
          const bc = badgeColors[meta.badgeColor] ?? badgeColors.muted;
          const applied = appliedIds.has(action.action_id);
          const failed = failedIds.has(action.action_id);
          const pending = !applied && !failed;
          return (
            <div
              key={action.action_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                opacity: pending && phase === 'applying' ? 0.5 : 1,
              }}
            >
              <span style={{ width: '16px', textAlign: 'center', fontSize: '11px', flexShrink: 0 }}>
                {applied ? '✓' : failed ? '✕' : '·'}
              </span>
              <span
                style={{
                  display: 'inline-block',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontSize: '10px',
                  fontWeight: 600,
                  backgroundColor: bc.bg,
                  color: bc.text,
                  border: `1px solid ${bc.border}`,
                  flexShrink: 0,
                }}
              >
                {meta.label}
              </span>
              <span style={{
                color: applied ? '#6ab87a' : failed ? '#e05c5c' : '#e8d5b0',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {describeAction(action)}
              </span>
            </div>
          );
        })}
      </div>
      {phase === 'pending_confirmation' && onApply && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          <button
            onClick={onApply}
            style={{
              backgroundColor: '#c9a84c',
              color: '#0f0e17',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Apply changes
          </button>
          {onDismiss && (
            <button
              onClick={onDismiss}
              style={{
                background: 'none',
                border: '1px solid #3a3660',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                color: '#9990b0',
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
