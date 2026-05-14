import { Check, Loader2, Circle, AlertCircle } from 'lucide-react';
import type { SaveStatus } from '../../hooks/useAutoSave';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  onRetry?: () => void;
}

export function SaveStatusIndicator({ status, onRetry }: SaveStatusIndicatorProps) {
  if (status === 'idle') return null;

  const config: Record<Exclude<SaveStatus, 'idle'>, { icon: React.ReactNode; text: string; color: string }> = {
    saved: {
      icon: <Check size={14} />,
      text: 'Saved',
      color: '#5a9a6a',
    },
    saving: {
      icon: <Loader2 size={14} className="animate-spin" />,
      text: 'Saving...',
      color: 'var(--ink-2)',
    },
    unsaved: {
      icon: <Circle size={10} fill="#c9a84c" />,
      text: 'Unsaved changes',
      color: 'var(--gold)',
    },
    error: {
      icon: <AlertCircle size={14} />,
      text: 'Save failed',
      color: '#e05c5c',
    },
  };

  const { icon, text, color } = config[status as Exclude<SaveStatus, 'idle'>];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color,
        fontSize: 12,
        fontFamily: 'var(--serif)',
      }}
    >
      {icon}
      {text}
      {status === 'error' && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            background: 'none',
            border: 'none',
            color: '#70a0e0',
            cursor: 'pointer',
            fontSize: 12,
            textDecoration: 'underline',
            padding: 0,
            fontFamily: 'inherit',
          }}
        >
          Retry
        </button>
      )}
    </span>
  );
}
