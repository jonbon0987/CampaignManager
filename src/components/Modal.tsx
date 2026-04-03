import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Button } from './ui/Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  onSave?: () => void;
  saveLabel?: string;
  wide?: boolean;
}

export function Modal({ isOpen, onClose, title, children, onSave, saveLabel = 'Save', wide = false }: ModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`rounded-lg border flex flex-col ${wide ? 'w-full max-w-3xl' : 'w-full max-w-xl'}`}
        style={{ backgroundColor: '#1a1828', borderColor: '#3a3660', maxHeight: '90vh' }}
      >
        <div className="flex items-center justify-between p-4 border-b shrink-0" style={{ borderColor: '#3a3660' }}>
          <h2 className="text-xl font-bold" style={{ color: '#c9a84c', fontFamily: 'Georgia, serif' }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none w-8 h-8 flex items-center justify-center rounded transition-colors text-muted hover:text-parchment"
          >
            ×
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {children}
        </div>
        {onSave && (
          <div className="flex justify-end gap-2 p-4 border-t shrink-0" style={{ borderColor: '#3a3660' }}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={onSave}>{saveLabel}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
