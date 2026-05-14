import { useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Button } from './ui/Button';

type ModalSize = 'default' | 'wide' | 'xl';

const sizeClasses: Record<ModalSize, string> = {
  default: 'w-full max-w-xl',
  wide: 'w-full max-w-3xl',
  xl: 'w-full max-w-5xl',
};

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  onSave?: () => void;
  saveLabel?: string;
  /** @deprecated Use size="wide" instead */
  wide?: boolean;
  size?: ModalSize;
  footer?: ReactNode;
  onBeforeClose?: () => Promise<void>;
}

export function Modal({ isOpen, onClose, title, children, onSave, saveLabel = 'Save', wide = false, size, footer, onBeforeClose }: ModalProps) {
  const resolvedSize: ModalSize = size ?? (wide ? 'wide' : 'default');

  const handleClose = useCallback(async () => {
    if (onBeforeClose) await onBeforeClose();
    onClose();
  }, [onBeforeClose, onClose]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    if (isOpen) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className={`rounded-lg border flex flex-col ${sizeClasses[resolvedSize]}`}
        style={{ backgroundColor: 'var(--paper)', borderColor: 'var(--rule)', maxHeight: '90vh' }}
      >
        <div className="flex items-center justify-between p-4 border-b shrink-0" style={{ borderColor: 'var(--rule)' }}>
          <h2 className="text-xl font-bold" style={{ color: 'var(--gold)', fontFamily: 'var(--display)' }}>
            {title}
          </h2>
          <button
            onClick={handleClose}
            className="text-2xl leading-none w-8 h-8 flex items-center justify-center rounded transition-colors text-muted hover:text-parchment"
          >
            ×
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {children}
        </div>
        {footer ? (
          <div className="p-4 border-t shrink-0" style={{ borderColor: 'var(--rule)' }}>
            {footer}
          </div>
        ) : onSave ? (
          <div className="flex justify-end gap-2 p-4 border-t shrink-0" style={{ borderColor: 'var(--rule)' }}>
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button variant="primary" onClick={onSave}>{saveLabel}</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
