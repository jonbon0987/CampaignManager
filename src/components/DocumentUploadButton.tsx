// Upload affordance mounted next to the AI Assistant textarea. Paperclip
// button opens a small popover with two choices: upload a file, or paste
// a Google Docs URL. Calls onAttach with a DocumentInput which the parent
// (AIAssistant) holds as a pending attachment until the user hits Send.

import { useRef, useState } from 'react';
import { extractClientSide, parseGoogleDocsUrl, type DocumentInput } from '../lib/documentImport';

interface Props {
  disabled: boolean;
  onAttach: (input: DocumentInput) => void;
  onError: (message: string) => void;
}

export default function DocumentUploadButton({ disabled, onAttach, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [gdocsUrl, setGdocsUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so same file can be picked twice
    if (!file) return;
    setLoading(true);
    try {
      const input = await extractClientSide(file);
      setOpen(false);
      onAttach(input);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to read file');
    } finally {
      setLoading(false);
    }
  }

  function handleGdocsSubmit() {
    if (!gdocsUrl.trim()) return;
    setLoading(true);
    try {
      const input = parseGoogleDocsUrl(gdocsUrl);
      setGdocsUrl('');
      setOpen(false);
      onAttach(input);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Invalid URL');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        title="Import document"
        aria-label="Import document"
        style={{
          background: 'none',
          border: '1px solid #3a3660',
          borderRadius: '8px',
          padding: '10px 12px',
          color: open ? '#c9a84c' : '#9990b0',
          fontSize: '18px',
          cursor: disabled ? 'default' : 'pointer',
          lineHeight: 1,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        ⎘
      </button>

      {open && (
        <>
          {/* Click-outside catcher */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 1001 }}
          />

          {/* Popover */}
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 8px)',
              right: 0,
              width: '280px',
              backgroundColor: '#1a1830',
              border: '1px solid #3a3660',
              borderRadius: '10px',
              padding: '14px',
              zIndex: 1002,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: '#c9a84c',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '10px',
              }}
            >
              Import Document
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              style={{
                width: '100%',
                backgroundColor: '#c9a84c',
                color: '#0f0e17',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Reading…' : 'Upload file (.txt, .md, .docx, .pdf)'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.docx,.pdf,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            <div
              style={{
                margin: '12px 0 8px',
                fontSize: '10px',
                color: '#6a6490',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <div style={{ flex: 1, height: '1px', backgroundColor: '#3a3660' }} />
              or
              <div style={{ flex: 1, height: '1px', backgroundColor: '#3a3660' }} />
            </div>

            <input
              type="text"
              placeholder="Paste Google Docs URL…"
              value={gdocsUrl}
              onChange={e => setGdocsUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleGdocsSubmit();
                }
              }}
              disabled={loading}
              style={{
                width: '100%',
                backgroundColor: '#22203a',
                color: '#e8d5b0',
                border: '1px solid #3a3660',
                borderRadius: '6px',
                padding: '8px 10px',
                fontSize: '12px',
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={handleGdocsSubmit}
              disabled={loading || !gdocsUrl.trim()}
              style={{
                marginTop: '8px',
                width: '100%',
                background: 'none',
                border: '1px solid #3a3660',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                color: '#9990b0',
                cursor: loading || !gdocsUrl.trim() ? 'default' : 'pointer',
                opacity: loading || !gdocsUrl.trim() ? 0.5 : 1,
              }}
            >
              Parse Google Doc
            </button>

            <div style={{ marginTop: '10px', fontSize: '10px', color: '#6a6490', lineHeight: 1.4 }}>
              Google Docs must be shared publicly (Anyone with the link).
            </div>
          </div>
        </>
      )}
    </div>
  );
}
