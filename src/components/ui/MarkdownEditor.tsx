import { useState, useRef, useCallback } from 'react';
import type { RefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Mode = 'write' | 'preview';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
  /** Expose the textarea ref for external toolbars (e.g. creature link) */
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}

const toolbarBtnStyle: React.CSSProperties = {
  backgroundColor: 'transparent',
  border: 'none',
  color: '#6a6490',
  cursor: 'pointer',
  padding: '2px 6px',
  borderRadius: '3px',
  fontSize: '13px',
  fontFamily: 'monospace',
  lineHeight: 1,
};

function wrapSelection(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
  onChange: (v: string) => void,
) {
  const { selectionStart, selectionEnd, value } = textarea;
  const selected = value.slice(selectionStart, selectionEnd);
  const replacement = `${before}${selected || 'text'}${after}`;
  const next = value.slice(0, selectionStart) + replacement + value.slice(selectionEnd);
  onChange(next);
  // Restore cursor inside the wrapper
  requestAnimationFrame(() => {
    textarea.focus();
    const cursorPos = selectionStart + before.length;
    const cursorEnd = cursorPos + (selected.length || 4); // "text".length
    textarea.setSelectionRange(cursorPos, cursorEnd);
  });
}

function prefixLine(
  textarea: HTMLTextAreaElement,
  prefix: string,
  onChange: (v: string) => void,
) {
  const { selectionStart, value } = textarea;
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
  onChange(next);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(selectionStart + prefix.length, selectionStart + prefix.length);
  });
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  minHeight = '160px',
  textareaRef: externalRef,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<Mode>('write');
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const taRef = externalRef ?? internalRef;

  const handleBold = useCallback(() => {
    if (taRef.current) wrapSelection(taRef.current, '**', '**', onChange);
  }, [taRef, onChange]);

  const handleItalic = useCallback(() => {
    if (taRef.current) wrapSelection(taRef.current, '_', '_', onChange);
  }, [taRef, onChange]);

  const handleHeading = useCallback(() => {
    if (taRef.current) prefixLine(taRef.current, '### ', onChange);
  }, [taRef, onChange]);

  const handleList = useCallback(() => {
    if (taRef.current) prefixLine(taRef.current, '- ', onChange);
  }, [taRef, onChange]);

  const handleLink = useCallback(() => {
    if (taRef.current) wrapSelection(taRef.current, '[', '](url)', onChange);
  }, [taRef, onChange]);

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: '3px 10px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    border: 'none',
    backgroundColor: active ? '#2a2840' : 'transparent',
    color: active ? '#c9a84c' : '#6a6490',
    fontFamily: 'Georgia, Cambria, serif',
  });

  return (
    <div
      className="rounded-md overflow-hidden"
      style={{ border: '1px solid #3a3660', backgroundColor: '#1a1830' }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-1 px-2 py-1"
        style={{ borderBottom: '1px solid #2e2c4a', backgroundColor: '#14132a' }}
      >
        <div className="flex gap-0.5 mr-2">
          <button onClick={() => setMode('write')} style={pillStyle(mode === 'write')}>Write</button>
          <button onClick={() => setMode('preview')} style={pillStyle(mode === 'preview')}>Preview</button>
        </div>

        {mode === 'write' && (
          <>
            <div style={{ width: 1, height: 16, backgroundColor: '#2e2c4a', margin: '0 4px' }} />
            <button onClick={handleBold} style={toolbarBtnStyle} title="Bold"
              onMouseEnter={e => (e.currentTarget.style.color = '#e8d5b0')}
              onMouseLeave={e => (e.currentTarget.style.color = '#6a6490')}
            ><b>B</b></button>
            <button onClick={handleItalic} style={toolbarBtnStyle} title="Italic"
              onMouseEnter={e => (e.currentTarget.style.color = '#e8d5b0')}
              onMouseLeave={e => (e.currentTarget.style.color = '#6a6490')}
            ><i>I</i></button>
            <button onClick={handleHeading} style={toolbarBtnStyle} title="Heading"
              onMouseEnter={e => (e.currentTarget.style.color = '#e8d5b0')}
              onMouseLeave={e => (e.currentTarget.style.color = '#6a6490')}
            >H</button>
            <button onClick={handleList} style={toolbarBtnStyle} title="List"
              onMouseEnter={e => (e.currentTarget.style.color = '#e8d5b0')}
              onMouseLeave={e => (e.currentTarget.style.color = '#6a6490')}
            >•</button>
            <button onClick={handleLink} style={toolbarBtnStyle} title="Link"
              onMouseEnter={e => (e.currentTarget.style.color = '#e8d5b0')}
              onMouseLeave={e => (e.currentTarget.style.color = '#6a6490')}
            >🔗</button>
          </>
        )}
      </div>

      {/* Content area */}
      {mode === 'write' ? (
        <textarea
          ref={taRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            minHeight,
            backgroundColor: '#1a1830',
            color: '#e8d5b0',
            border: 'none',
            outline: 'none',
            padding: '10px 12px',
            fontSize: '0.875rem',
            fontFamily: 'Georgia, Cambria, serif',
            lineHeight: '1.6',
            resize: 'vertical',
          }}
        />
      ) : (
        <div
          className="markdown-preview"
          style={{
            minHeight,
            padding: '10px 12px',
            fontSize: '0.875rem',
            fontFamily: 'Georgia, Cambria, serif',
            lineHeight: '1.6',
            color: '#e8d5b0',
          }}
        >
          {value ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          ) : (
            <span style={{ color: '#4a4470', fontStyle: 'italic' }}>Nothing to preview</span>
          )}
        </div>
      )}
    </div>
  );
}
