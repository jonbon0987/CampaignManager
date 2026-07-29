import { useState, useRef, useCallback, useMemo } from 'react';
import type { RefObject } from 'react';
import { EntityChip } from './StatBlockText';
import type { EntityType } from './StatBlockText';
import { MarkdownContent } from './MarkdownContent';

// Legacy [[kind:uuid:Name]] reference matcher (this editor is superseded by SlashField;
// kept self-contained so it still round-trips older content).
const ENTITY_LINK_RE = /\[\[(creature|npc|location|session|faction|hook):([a-f0-9-]{36})(?::([^\]]*))?\]\]/g;

type Mode = 'write' | 'preview';

interface EntityLink {
  entityType: EntityType;
  id: string;
  displayName: string;
  /** The full raw markup, e.g. [[npc:uuid:Name]] */
  raw: string;
}

/** Extract all entity links from the raw text */
function extractEntityLinks(text: string): EntityLink[] {
  const links: EntityLink[] = [];
  ENTITY_LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ENTITY_LINK_RE.exec(text)) !== null) {
    links.push({
      entityType: match[1] as EntityType,
      id: match[2],
      displayName: match[3] ?? '',
      raw: match[0],
    });
  }
  return links;
}

/** Strip all entity link markup from text.
 *  Preserves all user-typed whitespace including trailing spaces and newlines. */
function stripEntityLinks(text: string): string {
  let result = text;
  // Remove each entity link and any single newline immediately before it
  // (the newline is the separator we insert in handleDisplayChange)
  result = result.replace(/\n?\[\[(creature|npc|location|session|faction|hook):[a-f0-9-]{36}(?:[^\]]*)?]]/g, '');
  return result;
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
  /** Expose the textarea ref for external toolbars (e.g. entity link insertion) */
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}

const toolbarBtnStyle: React.CSSProperties = {
  backgroundColor: 'transparent',
  border: 'none',
  color: 'var(--ink-3)',
  cursor: 'pointer',
  padding: '2px 6px',
  borderRadius: 'var(--radius)',
  fontSize: '13px',
  fontFamily: 'monospace',
  lineHeight: 1,
};

function wrapSelection(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
  onChange: (v: string) => void,
  /** The full raw value including entity links (not the display value) */
  rawValue: string,
  /** The display value shown in the textarea (entity links stripped) */
  displayValue: string,
) {
  const { selectionStart, selectionEnd } = textarea;
  const selected = displayValue.slice(selectionStart, selectionEnd);
  const replacement = `${before}${selected || 'text'}${after}`;
  // Apply the edit to the display value, then re-append entity links
  const newDisplay = displayValue.slice(0, selectionStart) + replacement + displayValue.slice(selectionEnd);
  // Reconstruct: entity links from raw + edited text
  const entityLinks = extractEntityLinks(rawValue);
  const entityMarkup = entityLinks.map(l => l.raw).join('');
  onChange(newDisplay + (entityMarkup ? '\n' + entityMarkup : ''));
  // Restore cursor
  requestAnimationFrame(() => {
    textarea.focus();
    const cursorPos = selectionStart + before.length;
    const cursorEnd = cursorPos + (selected.length || 4);
    textarea.setSelectionRange(cursorPos, cursorEnd);
  });
}

function prefixLine(
  textarea: HTMLTextAreaElement,
  prefix: string,
  onChange: (v: string) => void,
  rawValue: string,
  displayValue: string,
) {
  const { selectionStart } = textarea;
  const lineStart = displayValue.lastIndexOf('\n', selectionStart - 1) + 1;
  const newDisplay = displayValue.slice(0, lineStart) + prefix + displayValue.slice(lineStart);
  const entityLinks = extractEntityLinks(rawValue);
  const entityMarkup = entityLinks.map(l => l.raw).join('');
  onChange(newDisplay + (entityMarkup ? '\n' + entityMarkup : ''));
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

  // Parse entity links and display text from the raw value
  const entityLinks = useMemo(() => extractEntityLinks(value), [value]);
  const displayValue = useMemo(() => stripEntityLinks(value), [value]);

  /** Rebuild the raw value from edited display text + current entity links */
  const handleDisplayChange = useCallback((newDisplay: string) => {
    const entityMarkup = entityLinks.map(l => l.raw).join('');
    onChange(newDisplay + (entityMarkup ? '\n' + entityMarkup : ''));
  }, [entityLinks, onChange]);

  /** Remove a specific entity link from the raw value */
  const handleRemoveLink = useCallback((link: EntityLink) => {
    // Remove just this one occurrence of the raw markup
    const idx = value.indexOf(link.raw);
    if (idx === -1) return;
    // Also remove a preceding newline separator if present
    const start = idx > 0 && value[idx - 1] === '\n' ? idx - 1 : idx;
    let next = value.slice(0, start) + value.slice(idx + link.raw.length);
    onChange(next);
  }, [value, onChange]);

  const handleBold = useCallback(() => {
    if (taRef.current) wrapSelection(taRef.current, '**', '**', onChange, value, displayValue);
  }, [taRef, onChange, value, displayValue]);

  const handleItalic = useCallback(() => {
    if (taRef.current) wrapSelection(taRef.current, '_', '_', onChange, value, displayValue);
  }, [taRef, onChange, value, displayValue]);

  const handleHeading = useCallback(() => {
    if (taRef.current) prefixLine(taRef.current, '### ', onChange, value, displayValue);
  }, [taRef, onChange, value, displayValue]);

  const handleList = useCallback(() => {
    if (taRef.current) prefixLine(taRef.current, '- ', onChange, value, displayValue);
  }, [taRef, onChange, value, displayValue]);

  const handleLink = useCallback(() => {
    if (taRef.current) wrapSelection(taRef.current, '[', '](url)', onChange, value, displayValue);
  }, [taRef, onChange, value, displayValue]);

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: '3px 10px',
    borderRadius: 'var(--radius)',
    fontSize: '11px',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    border: 'none',
    backgroundColor: active ? 'var(--rule-soft)' : 'transparent',
    color: active ? 'var(--gold)' : 'var(--ink-3)',
    fontFamily: 'var(--serif)',
  });

  return (
    <div
      className="rounded-md overflow-hidden"
      style={{ border: '1px solid var(--rule)', backgroundColor: 'var(--paper)' }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-1 px-2 py-1"
        style={{ borderBottom: '1px solid var(--rule-soft)', backgroundColor: 'var(--bg-2)' }}
      >
        <div className="flex gap-0.5 mr-2">
          <button onClick={() => setMode('write')} style={pillStyle(mode === 'write')}>Write</button>
          <button onClick={() => setMode('preview')} style={pillStyle(mode === 'preview')}>Preview</button>
        </div>

        {mode === 'write' && (
          <>
            <div style={{ width: 1, height: 16, backgroundColor: 'var(--rule)', margin: '0 4px' }} />
            <button onClick={handleBold} style={toolbarBtnStyle} title="Bold"
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
            ><b>B</b></button>
            <button onClick={handleItalic} style={toolbarBtnStyle} title="Italic"
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
            ><i>I</i></button>
            <button onClick={handleHeading} style={toolbarBtnStyle} title="Heading"
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
            >H</button>
            <button onClick={handleList} style={toolbarBtnStyle} title="List"
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
            >•</button>
            <button onClick={handleLink} style={toolbarBtnStyle} title="Link"
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
            >🔗</button>
          </>
        )}
      </div>

      {/* Content area */}
      {mode === 'write' ? (
        <div>
          {/* Entity link chips */}
          {entityLinks.length > 0 && (
            <div
              className="flex flex-wrap gap-1.5 px-3 pt-2 pb-1"
              style={{ borderBottom: '1px solid var(--rule-soft)' }}
            >
              {entityLinks.map((link, i) => (
                <EntityChip
                  key={`${link.id}-${i}`}
                  entityType={link.entityType}
                  id={link.id}
                  displayName={link.displayName}
                  onRemove={() => handleRemoveLink(link)}
                />
              ))}
            </div>
          )}

          {/* Textarea showing only the text (no entity markup) */}
          <textarea
            ref={taRef}
            value={displayValue}
            onChange={e => handleDisplayChange(e.target.value)}
            placeholder={placeholder}
            style={{
              width: '100%',
              minHeight,
              backgroundColor: 'var(--paper)',
              color: 'var(--ink)',
              border: 'none',
              outline: 'none',
              padding: '10px 12px',
              fontSize: '0.875rem',
              fontFamily: 'var(--serif)',
              lineHeight: '1.6',
              resize: 'vertical',
            }}
          />
        </div>
      ) : (
        <div
          className="markdown-preview"
          style={{
            minHeight,
            padding: '10px 12px',
            fontSize: '0.875rem',
            fontFamily: 'var(--serif)',
            lineHeight: '1.6',
            color: 'var(--ink)',
          }}
        >
          {value ? (
            <MarkdownContent text={value} />
          ) : (
            <span style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>Nothing to preview</span>
          )}
        </div>
      )}
    </div>
  );
}
