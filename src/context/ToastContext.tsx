import { createContext, useContext, useState, useCallback, useRef } from 'react';

type ToastType = 'success' | 'error';

/** A button on the toast, such as Undo. A toast with one stays up longer. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, action?: ToastAction) => void;
}

const SHOW_MS = 3000;
const SHOW_WITH_ACTION_MS = 8000;
const ACTION_STYLE = {
  marginLeft: '12px', padding: 0, border: 'none', background: 'none', cursor: 'pointer',
  font: 'inherit', fontWeight: 600, color: 'inherit', textDecoration: 'underline',
} as const;

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx.toast;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const toast = useCallback((message: string, type: ToastType = 'success', action?: ToastAction) => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, message, type, action }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, action ? SHOW_WITH_ACTION_MS : SHOW_MS);
  }, []);

  const dismiss = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      {toasts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            pointerEvents: 'none',
          }}
        >
          {toasts.map(t => (
            <div
              key={t.id}
              onClick={() => dismiss(t.id)}
              style={{
                pointerEvents: 'auto',
                padding: '10px 16px',
                borderRadius: 'var(--radius)',
                fontSize: '13px',
                fontFamily: 'var(--serif)',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                animation: 'toast-slide-in 0.2s ease-out',
                backgroundColor: t.type === 'error' ? 'var(--red-bg)' : '#1a301a',
                color: t.type === 'error' ? 'var(--red)' : 'var(--success)',
                border: `1px solid ${t.type === 'error' ? 'var(--red-line)' : '#2a6a2a'}`,
              }}
            >
              {t.type === 'error' ? '✕ ' : '✓ '}{t.message}
              {t.action && (
                // eslint-disable-next-line no-restricted-syntax -- a link-like action inside the toast, styled with it
                <button type="button" style={ACTION_STYLE} onClick={e => { e.stopPropagation(); dismiss(t.id); t.action?.onClick(); }}>
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <style>{`
        @keyframes toast-slide-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
