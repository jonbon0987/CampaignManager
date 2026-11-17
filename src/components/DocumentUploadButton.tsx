// Attach affordance mounted in the Workbench composer. The ＋ button opens a
// small popover with two choices: upload a file, or paste a Google Docs URL.
// Calls onAttach with a DocumentInput which the parent holds as a pending
// attachment until the user hits Send.

import { useRef, useState } from 'react';
import { extractClientSide, parseGoogleDocsUrl, type DocumentInput } from '../lib/documentImport';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';

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
      <IconButton active={open} type="button" onClick={() => setOpen(o => !o)} disabled={disabled} title="Attach a document" aria-label="Attach a document">
        ＋
      </IconButton>

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
              left: 0,
              width: '280px',
              backgroundColor: 'var(--paper)',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px',
              zIndex: 1002,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: 'var(--gold)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '10px',
              }}
            >
              Import Document
            </div>

            <Button variant="primary" size="sm" className="w-full" type="button" onClick={() => fileInputRef.current?.click()} disabled={loading}>
              {loading ? 'Reading…' : 'Upload file (.txt, .md, .docx, .pdf)'}
            </Button>
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
                color: 'var(--ink-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--rule)' }} />
              or
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--rule)' }} />
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
                backgroundColor: 'var(--paper-2)',
                color: 'var(--ink)',
                border: '1px solid var(--rule)',
                borderRadius: 'var(--radius)',
                padding: '8px 10px',
                fontSize: '12px',
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <Button variant="secondary" size="sm" className="w-full mt-2" type="button" onClick={handleGdocsSubmit} disabled={loading || !gdocsUrl.trim()}>
              Parse Google Doc
            </Button>

            <div style={{ marginTop: '10px', fontSize: '10px', color: 'var(--ink-3)', lineHeight: 1.4 }}>
              Google Docs must be shared publicly (Anyone with the link).
            </div>
          </div>
        </>
      )}
    </div>
  );
}
