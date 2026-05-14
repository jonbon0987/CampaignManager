import { useEffect } from 'react';
import type { useAIChat } from '../hooks/useAIChat';
import type { ImportAction } from '../lib/documentImport';
import DocumentImportReview from './DocumentImportReview';
import DocumentUploadButton from './DocumentUploadButton';
import ImportProgressTable from './ImportProgressTable';

// ── Component ──────────────────────────────────────────────────────────────

type AIChatInstance = ReturnType<typeof useAIChat>;

interface Props {
  open: boolean;
  onClose: () => void;
  chat: AIChatInstance;
  onOpenInbox: () => void;
}

export default function AIAssistant({ open, onClose, chat, onOpenInbox }: Props) {
  const {
    messages, input, setInput, loading, apiError, setApiError,
    pendingDocument, setPendingDocument, aiProvider, toggleProvider,
    sendMessage, stopGeneration, clearMessages,
    applyConfirmedActions, dismissConfirmedActions,
    handleApplyImport, dismissImportActions, handleKeyDown,
    bottomRef, textareaRef, pendingProposalCount,
  } = chat;

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 50);
  }, [open]);

  // If not open, render the collapsed strip
  if (!open) {
    return null; // Strip is handled at shell level
  }

  // Quick-action chips
  const quickActions = [
    'Summarize last session',
    'Suggest a twist for tonight',
    'What loose threads should I tie up?',
  ];

  return (
    <div className="cm-rail">
      {/* Header */}
      <div className="cm-rail-head">
        <span style={{ fontSize: '16px', color: 'var(--gold)' }}>✦</span>
        <div style={{ flex: 1 }}>
          <div className="cm-rail-title">Campaign Assistant</div>
          <div className="cm-rail-sub">
            {aiProvider === 'claude' ? 'Claude' : 'Gemini'} · campaign context
          </div>
        </div>
        <button
          onClick={toggleProvider}
          title={`Using ${aiProvider === 'claude' ? 'Claude' : 'Gemini'} — click to switch`}
          style={{
            background: 'none',
            border: '1px solid var(--rule)',
            borderRadius: '6px',
            color: aiProvider === 'gemini' ? '#4285f4' : 'var(--gold)',
            fontSize: '10px',
            cursor: 'pointer',
            padding: '3px 8px',
            fontWeight: 600,
          }}
        >
          {aiProvider === 'claude' ? '✦ Claude' : '◆ Gemini'}
        </button>
        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            style={{ background: 'none', border: '1px solid var(--rule)', borderRadius: '6px', color: 'var(--ink-3)', fontSize: '10px', cursor: 'pointer', padding: '3px 8px' }}
          >
            Clear
          </button>
        )}
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: '16px', cursor: 'pointer', padding: '2px 4px' }}
          title="Collapse assistant"
        >
          ›
        </button>
      </div>

      {/* Proposals inbox */}
      {pendingProposalCount > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          borderBottom: '1px solid var(--rule)',
          backgroundColor: 'var(--paper)',
          cursor: 'pointer',
        }}
          onClick={onOpenInbox}
        >
          <span style={{ color: 'var(--gold)', fontSize: 13 }}>✦</span>
          <span style={{ flex: 1, fontSize: 13, fontFamily: 'var(--serif)', color: 'var(--ink)' }}>
            Proposals inbox
          </span>
          <span style={{
            fontSize: 11,
            fontFamily: 'var(--mono)',
            color: 'var(--gold)',
            backgroundColor: 'var(--bg)',
            border: '1px solid var(--rule)',
            borderRadius: 4,
            padding: '1px 6px',
          }}>
            {pendingProposalCount} pending
          </span>
        </div>
      )}

      {/* Context chips */}
      {messages.length === 0 && (
        <div style={{ padding: '12px 14px 0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '11px', color: 'var(--ink-3)', fontFamily: 'var(--mono)', letterSpacing: '.1em', textTransform: 'uppercase' as const }}>
            Context
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <span className="cm-rail-chip">✦ Campaign data</span>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="cm-rail-messages">
        {messages.length === 0 && (
          <div style={{ color: 'var(--ink-3)', fontSize: '13px', lineHeight: '1.8', marginTop: '16px' }}>
            I'm watching what you're working on.
            Drop a thought, paste session notes, or ask
            me to flesh something out.
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={msg.role === 'user' ? {
              alignSelf: 'flex-end',
              backgroundColor: 'var(--paper-2)',
              color: 'var(--ink)',
              padding: '8px 12px',
              borderRadius: '10px 10px 2px 10px',
              maxWidth: '85%',
              fontSize: '13px',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap' as const,
            } : {
              alignSelf: 'flex-start',
              backgroundColor: 'var(--paper)',
              color: 'var(--ink)',
              padding: '8px 12px',
              borderRadius: '2px 10px 10px 10px',
              maxWidth: '90%',
              fontSize: '13px',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap' as const,
              border: '1px solid var(--rule)',
            }}
          >
            {msg.content || (loading && msg.role === 'assistant' ? <span style={{ color: 'var(--ink-3)' }}>Thinking…</span> : msg.content)}
            {msg.role === 'assistant' && msg.isExtracting && (
              <div style={{ color: 'var(--ink-3)', fontSize: '11px', marginTop: '6px', fontStyle: 'italic' }}>
                {msg.extractingLabel ?? 'Extracting structured changes…'}
              </div>
            )}

            {/* Auto-applied actions */}
            {msg.role === 'assistant' && msg.autoApplied && msg.importActions && msg.importActions.length > 0 && (
              <ImportProgressTable
                actions={msg.importActions}
                appliedIds={new Set(msg.importApplyState?.appliedActionIds ?? [])}
                failedIds={new Set(msg.importApplyState?.failedActionIds ?? [])}
                phase={msg.importApplyState?.phase === 'idle' ? 'pending_confirmation' : msg.importApplyState?.phase ?? 'pending_confirmation'}
                onApply={() => applyConfirmedActions(idx)}
                onDismiss={() => dismissConfirmedActions(idx)}
              />
            )}

            {/* Document import review */}
            {msg.role === 'assistant' && !msg.autoApplied && msg.importActions && msg.importActions.length > 0 && (
              <DocumentImportReview
                actions={msg.importActions}
                applyState={{
                  phase: (msg.importApplyState?.phase === 'pending_confirmation' ? 'idle' : msg.importApplyState?.phase) ?? 'idle',
                  appliedActionIds: new Set(msg.importApplyState?.appliedActionIds ?? []),
                  failedActionIds: new Set(msg.importApplyState?.failedActionIds ?? []),
                }}
                onApply={(selected: ImportAction[]) => handleApplyImport(idx, selected)}
                onDismiss={() => dismissImportActions(idx)}
              />
            )}
          </div>
        ))}

        {apiError && (
          <div style={{ color: '#e05c5c', fontSize: '12px', padding: '6px 10px', backgroundColor: 'var(--highlight)', borderRadius: '6px', border: '1px solid #6a2a2a' }}>
            {apiError}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick action chips (only when empty) */}
      {messages.length === 0 && (
        <div style={{ padding: '0 14px 8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {quickActions.map(q => (
            <button
              key={q}
              className="cm-rail-chip"
              onClick={() => { setInput(q); setTimeout(sendMessage, 50); }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ borderTop: '1px solid var(--rule)' }}>
        {/* Attachment chip */}
        {pendingDocument && (
          <div style={{ padding: '6px 14px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              backgroundColor: 'var(--paper-2)',
              border: '1px solid var(--rule)',
              borderRadius: '6px',
              padding: '3px 8px',
              fontSize: '11px',
              color: 'var(--gold)',
            }}>
              <span>📄</span>
              <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pendingDocument.kind === 'gdocs-url'
                  ? 'Google Doc'
                  : pendingDocument.filename ?? 'Document'}
              </span>
              <button
                type="button"
                onClick={() => setPendingDocument(null)}
                style={{ background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: '12px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
                title="Remove attachment"
              >
                ✕
              </button>
            </div>
          </div>
        )}
        <div className="cm-rail-input">
          <DocumentUploadButton
            disabled={loading}
            onAttach={doc => setPendingDocument(doc)}
            onError={msg => setApiError(msg)}
          />
          <textarea
            ref={textareaRef}
            rows={1}
            className="cm-rail-textarea"
            placeholder="Ask about your campaign..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {loading ? (
            <button
              className="cm-rail-send"
              style={{ backgroundColor: '#e05c5c', color: '#fff' }}
              onClick={stopGeneration}
              title="Stop generation"
            >
              Stop
            </button>
          ) : (
            <button
              className="cm-rail-send"
              style={{ opacity: (!input.trim() && !pendingDocument) ? 0.5 : 1 }}
              onClick={sendMessage}
              disabled={!input.trim() && !pendingDocument}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
