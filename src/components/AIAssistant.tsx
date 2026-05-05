import { useEffect } from 'react';
import { useAIChat } from '../hooks/useAIChat';
import type { ImportAction } from '../lib/documentImport';
import DocumentImportReview from './DocumentImportReview';
import DocumentUploadButton from './DocumentUploadButton';
import ImportProgressTable from './ImportProgressTable';

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AIAssistant({ open, onClose }: Props) {
  const chat = useAIChat();
  const {
    messages, input, setInput, loading, apiError, setApiError,
    pendingDocument, setPendingDocument, aiProvider, toggleProvider,
    sendMessage, stopGeneration, clearMessages,
    applyConfirmedActions, dismissConfirmedActions,
    handleApplyImport, dismissImportActions, handleKeyDown,
    bottomRef, textareaRef,
  } = chat;

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 50);
  }, [open]);

  // ── Render ─────────────────────────────────────────────────────────────

  const s = {
    panel: {
      position: 'fixed' as const,
      top: 0,
      right: 0,
      width: 'min(480px, 100vw)',
      height: '100vh',
      backgroundColor: '#0a0918',
      borderLeft: '1px solid #3a3660',
      display: 'flex',
      flexDirection: 'column' as const,
      transform: open ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform 0.3s ease',
      zIndex: 1000,
      boxShadow: open ? '-8px 0 32px rgba(0,0,0,0.6)' : 'none',
    },
    header: {
      padding: '16px 20px',
      borderBottom: '1px solid #3a3660',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      backgroundColor: '#0f0e17',
    },
    messages: {
      flex: 1,
      overflowY: 'auto' as const,
      padding: '16px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '12px',
    },
    userBubble: {
      alignSelf: 'flex-end',
      backgroundColor: '#2a2650',
      color: '#e8d5b0',
      padding: '10px 14px',
      borderRadius: '12px 12px 2px 12px',
      maxWidth: '85%',
      fontSize: '14px',
      lineHeight: '1.5',
      whiteSpace: 'pre-wrap' as const,
    },
    assistantBubble: {
      alignSelf: 'flex-start',
      backgroundColor: '#1a1830',
      color: '#e8d5b0',
      padding: '10px 14px',
      borderRadius: '2px 12px 12px 12px',
      maxWidth: '90%',
      fontSize: '14px',
      lineHeight: '1.6',
      whiteSpace: 'pre-wrap' as const,
      border: '1px solid #2a2650',
    },
    inputArea: {
      padding: '12px 16px',
      display: 'flex',
      gap: '8px',
      alignItems: 'flex-end',
    },
    textarea: {
      flex: 1,
      backgroundColor: '#1a1830',
      color: '#e8d5b0',
      border: '1px solid #3a3660',
      borderRadius: '8px',
      padding: '10px 12px',
      fontSize: '14px',
      resize: 'none' as const,
      outline: 'none',
      fontFamily: 'inherit',
      lineHeight: '1.4',
      maxHeight: '120px',
    },
    sendBtn: {
      backgroundColor: '#c9a84c',
      color: '#0f0e17',
      border: 'none',
      borderRadius: '8px',
      padding: '10px 16px',
      fontWeight: 600,
      fontSize: '14px',
      cursor: 'pointer',
      whiteSpace: 'nowrap' as const,
    },
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            zIndex: 999,
          }}
        />
      )}

      <div style={s.panel}>
        {/* Header */}
        <div style={s.header}>
          <span style={{ fontSize: '20px' }}>✦</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#c9a84c', fontWeight: 700, fontSize: '15px', fontFamily: 'Georgia, serif' }}>
              Campaign Assistant
            </div>
            <div style={{ color: '#6a6490', fontSize: '11px' }}>Ask anything about your campaign</div>
          </div>
          {/* AI Provider toggle */}
          <button
            onClick={toggleProvider}
            title={`Using ${aiProvider === 'claude' ? 'Claude' : 'Gemini'} — click to switch`}
            style={{
              background: 'none',
              border: '1px solid #3a3660',
              borderRadius: '6px',
              color: aiProvider === 'gemini' ? '#4285f4' : '#c9a84c',
              fontSize: '11px',
              cursor: 'pointer',
              padding: '4px 10px',
              fontWeight: 600,
            }}
          >
            {aiProvider === 'claude' ? '✦ Claude' : '◆ Gemini'}
          </button>
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              style={{ background: 'none', border: '1px solid #3a3660', borderRadius: '6px', color: '#6a6490', fontSize: '11px', cursor: 'pointer', padding: '4px 10px' }}
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#6a6490', fontSize: '18px', cursor: 'pointer', padding: '2px 6px' }}
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div style={s.messages}>
          {messages.length === 0 && (
            <div style={{ color: '#4a4470', fontSize: '13px', textAlign: 'center', marginTop: '40px', lineHeight: '1.8' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>✦</div>
              <div>Try asking:</div>
              <div style={{ marginTop: '8px', color: '#6a6490' }}>
                "Here are my session notes — organize them"<br />
                "Add a new NPC named Mira, a halfling fence"<br />
                "Flesh out my next module"<br />
                "Update all NPCs affiliated with the Thieves Guild"
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} style={msg.role === 'user' ? s.userBubble : s.assistantBubble}>
              {msg.content || (loading && msg.role === 'assistant' ? <span style={{ color: '#6a6490' }}>Thinking…</span> : msg.content)}
              {msg.role === 'assistant' && msg.isExtracting && (
                <div style={{ color: '#6a6490', fontSize: '12px', marginTop: '8px', fontStyle: 'italic' }}>
                  {msg.extractingLabel ?? 'Extracting structured changes…'}
                </div>
              )}

              {/* Auto-applied actions: preview table with confirm/dismiss */}
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

              {/* Document import: full review cards */}
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
            <div style={{ color: '#e05c5c', fontSize: '13px', padding: '8px 12px', backgroundColor: '#2a0f0f', borderRadius: '8px', border: '1px solid #6a2a2a' }}>
              {apiError}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ borderTop: '1px solid #3a3660' }}>
          {/* Attachment chip */}
          {pendingDocument && (
            <div style={{
              padding: '8px 16px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#2a2650',
                border: '1px solid #3a3660',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '12px',
                color: '#c9a84c',
              }}>
                <span>📄</span>
                <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pendingDocument.kind === 'gdocs-url'
                    ? 'Google Doc'
                    : pendingDocument.filename ?? 'Document'}
                </span>
                <button
                  type="button"
                  onClick={() => setPendingDocument(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6a6490',
                    fontSize: '14px',
                    cursor: 'pointer',
                    padding: '0 2px',
                    lineHeight: 1,
                  }}
                  title="Remove attachment"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
          <div style={s.inputArea}>
            <DocumentUploadButton
              disabled={loading}
              onAttach={doc => setPendingDocument(doc)}
              onError={msg => setApiError(msg)}
            />
            <textarea
              ref={textareaRef}
              rows={2}
              style={s.textarea}
              placeholder={pendingDocument
                ? 'Add instructions (optional)… then press Enter or Send'
                : 'Ask about your campaign… (Enter to send, Shift+Enter for newline)'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {loading ? (
              <button
                style={{
                  ...s.sendBtn,
                  backgroundColor: '#e05c5c',
                  color: '#fff',
                }}
                onClick={stopGeneration}
                title="Stop generation"
              >
                Stop
              </button>
            ) : (
              <button
                style={{ ...s.sendBtn, opacity: (!input.trim() && !pendingDocument) ? 0.5 : 1 }}
                onClick={sendMessage}
                disabled={!input.trim() && !pendingDocument}
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
