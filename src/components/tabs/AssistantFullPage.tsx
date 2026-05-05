import { useEffect } from 'react';
import { useAIChat } from '../../hooks/useAIChat';
import type { ImportAction } from '../../lib/documentImport';
import DocumentImportReview from '../DocumentImportReview';
import DocumentUploadButton from '../DocumentUploadButton';
import ImportProgressTable from '../ImportProgressTable';

export default function AssistantFullPage() {
  const {
    messages, input, setInput, loading, apiError, setApiError,
    pendingDocument, setPendingDocument, aiProvider, toggleProvider,
    sendMessage, stopGeneration, clearMessages,
    applyConfirmedActions, dismissConfirmedActions,
    handleApplyImport, dismissImportActions, handleKeyDown,
    bottomRef, textareaRef,
  } = useAIChat();

  // Focus textarea on mount
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 56px - 32px)', // viewport minus topbar minus main padding
      marginTop: '-16px', // pull up into the main padding
      marginBottom: '-16px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        paddingBottom: '16px',
        borderBottom: '1px solid #3a3660',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '24px' }}>✦</span>
        <div style={{ flex: 1 }}>
          <h1 style={{
            color: '#c9a84c',
            fontWeight: 700,
            fontSize: '20px',
            fontFamily: 'Georgia, serif',
            margin: 0,
          }}>
            Campaign Assistant
          </h1>
          <div style={{ color: '#6a6490', fontSize: '12px', marginTop: '2px' }}>
            Chat, upload documents, and manage your campaign data
          </div>
        </div>
        <button
          onClick={toggleProvider}
          title={`Using ${aiProvider === 'claude' ? 'Claude' : 'Gemini'} — click to switch`}
          style={{
            background: 'none',
            border: '1px solid #3a3660',
            borderRadius: '6px',
            color: aiProvider === 'gemini' ? '#4285f4' : '#c9a84c',
            fontSize: '12px',
            cursor: 'pointer',
            padding: '5px 12px',
            fontWeight: 600,
          }}
        >
          {aiProvider === 'claude' ? '✦ Claude' : '◆ Gemini'}
        </button>
        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            style={{
              background: 'none',
              border: '1px solid #3a3660',
              borderRadius: '6px',
              color: '#6a6490',
              fontSize: '12px',
              cursor: 'pointer',
              padding: '5px 12px',
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}>
        {messages.length === 0 && (
          <div style={{
            color: '#4a4470',
            fontSize: '14px',
            textAlign: 'center',
            marginTop: '80px',
            lineHeight: '2',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✦</div>
            <div style={{ fontSize: '16px', color: '#6a6490' }}>Try asking:</div>
            <div style={{ marginTop: '12px', color: '#6a6490', fontSize: '14px' }}>
              "Here are my session notes — organize them"<br />
              "Add a new NPC named Mira, a halfling fence"<br />
              "Flesh out my next module"<br />
              "Update all NPCs affiliated with the Thieves Guild"
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={msg.role === 'user' ? {
              alignSelf: 'flex-end',
              backgroundColor: '#2a2650',
              color: '#e8d5b0',
              padding: '12px 16px',
              borderRadius: '12px 12px 2px 12px',
              maxWidth: '70%',
              fontSize: '14px',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
            } : {
              alignSelf: 'flex-start',
              backgroundColor: '#1a1830',
              color: '#e8d5b0',
              padding: '12px 16px',
              borderRadius: '2px 12px 12px 12px',
              maxWidth: '85%',
              fontSize: '14px',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
              border: '1px solid #2a2650',
            }}
          >
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
      <div style={{ borderTop: '1px solid #3a3660', flexShrink: 0, position: 'relative', zIndex: 10 }}>
        {/* Attachment chip */}
        {pendingDocument && (
          <div style={{
            padding: '10px 4px 0',
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
              <span style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
        <div style={{
          padding: '12px 4px',
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-end',
        }}>
          <DocumentUploadButton
            disabled={loading}
            onAttach={doc => setPendingDocument(doc)}
            onError={msg => setApiError(msg)}
          />
          <textarea
            ref={textareaRef}
            rows={2}
            style={{
              flex: 1,
              backgroundColor: '#1a1830',
              color: '#e8d5b0',
              border: '1px solid #3a3660',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '14px',
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: '1.4',
              maxHeight: '160px',
            }}
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
                backgroundColor: '#e05c5c',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 16px',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              onClick={stopGeneration}
              title="Stop generation"
            >
              Stop
            </button>
          ) : (
            <button
              style={{
                backgroundColor: '#c9a84c',
                color: '#0f0e17',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 16px',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                opacity: (!input.trim() && !pendingDocument) ? 0.5 : 1,
              }}
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
