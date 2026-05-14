import { createContext, useContext, useState, useCallback, useRef } from 'react';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm(): (options: ConfirmOptions | string) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be inside ConfirmProvider');
  return ctx.confirm;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    const opts = typeof options === 'string' ? { message: options } : options;
    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve;
      setState({ ...opts, resolve });
    });
  }, []);

  const handleClose = (result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <>
          <div
            onClick={() => handleClose(false)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              zIndex: 9998,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 9999,
              backgroundColor: 'var(--paper)',
              border: '1px solid #3a3660',
              borderRadius: '12px',
              padding: '24px',
              minWidth: '320px',
              maxWidth: '440px',
              boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
            }}
          >
            {state.title && (
              <h3
                style={{
                  margin: '0 0 8px',
                  fontSize: '16px',
                  fontWeight: 700,
                  color: state.danger ? '#e05c5c' : 'var(--gold)',
                  fontFamily: 'var(--serif)',
                }}
              >
                {state.title}
              </h3>
            )}
            <p
              style={{
                margin: '0 0 20px',
                fontSize: '14px',
                lineHeight: '1.5',
                color: 'var(--ink)',
              }}
            >
              {state.message}
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => handleClose(false)}
                style={{
                  background: 'none',
                  border: '1px solid #3a3660',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  color: 'var(--ink-2)',
                  cursor: 'pointer',
                  fontFamily: 'var(--serif)',
                }}
              >
                {state.cancelLabel ?? 'Cancel'}
              </button>
              <button
                onClick={() => handleClose(true)}
                autoFocus
                style={{
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--serif)',
                  backgroundColor: state.danger !== false ? '#c94c4c' : 'var(--gold)',
                  color: '#fff',
                }}
              >
                {state.confirmLabel ?? 'Delete'}
              </button>
            </div>
          </div>
        </>
      )}
    </ConfirmContext.Provider>
  );
}
