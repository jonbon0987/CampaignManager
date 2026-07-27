// The Assistant Workbench — the single AI surface.
//
// Two panes: conversation on the left, staging tray on the right. Everything
// the assistant proposes (from chat or from a document import) accumulates in
// the tray as a curatable card. Nothing reaches the database until Commit.

import { useEffect, useRef } from 'react';
import { entityMeta } from '../lib/documentImport';
import type { useAIChat } from '../hooks/useAIChat';
import type { ChatMessage, IngestState, PlanState, StagedChange } from '../hooks/useAIChat';
import DocumentUploadButton from './DocumentUploadButton';
import { MarkdownContent } from './ui/MarkdownContent';

type Chat = ReturnType<typeof useAIChat>;

// ── Confidence bar ─────────────────────────────────────────────────────────

function ConfBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value > 0.85 ? 'var(--moss)' : value > 0.7 ? 'var(--gold)' : 'var(--accent)';
  return (
    <span className="conf" title={`The assistant's confidence in this change: ${pct}%`}>
      <span className="conf-bar"><i style={{ width: `${pct}%`, background: color }} /></span>
      {pct}%
    </span>
  );
}

// ── Message renderers ──────────────────────────────────────────────────────

function TypingDots() {
  return <span className="typing"><i /><i /><i /></span>;
}

function PlanCard({ plan }: { plan: PlanState }) {
  const done = plan.steps.filter(s => s.state === 'done').length;
  return (
    <div className="plan">
      <div className="plan-head">
        <span className="g">◆</span>
        <span className="t">{plan.title}</span>
        <span className="meta">{done}/{plan.steps.length}</span>
      </div>
      <div className="plan-steps">
        {plan.steps.map((s, i) => (
          <div key={i} className={`step ${s.state}`}>
            <span className="step-dot">
              {s.state === 'done' ? '✓' : s.state === 'active' ? <span className="spin">◠</span> : i + 1}
            </span>
            <span className="step-body">
              <span className="step-label">{s.label}</span>
              {s.result && <span className="step-result"><span className="tick">✓</span> {s.result}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IngestCard({ ingest, text }: { ingest: IngestState; text: string }) {
  if (ingest.phase === 'reading') {
    return (
      <div className="msg-bubble">
        <span>Reading <b>{ingest.filename}</b>… </span>
        <TypingDots />
      </div>
    );
  }

  const donePasses = ingest.passes.filter(p => p.state === 'done').length;

  return (
    <>
      <div className="ingest-outline">
        <div className="io-head">
          <div className="doc">▤</div>
          <div className="meta">
            <div className="fn">{ingest.filename}</div>
            <div className="fs">{ingest.size}</div>
          </div>
        </div>
        {ingest.counts.length > 0 && (
          <div className="io-counts">
            {ingest.counts.map((c, i) => (
              <div key={i} className="io-count">
                <div className="n">{c.n}</div>
                <div className="l">{c.label}</div>
              </div>
            ))}
          </div>
        )}
        {text && <MarkdownContent className="io-summary wb-md" text={text} />}
        <div className="io-foot">
          <span className="note">Cross-checked against your existing records to avoid duplicates.</span>
        </div>
      </div>

      {ingest.passes.length > 0 && (
        <div className="ledger">
          <div className="ledger-head">
            <span className="g">◆</span>
            <span className="t">{ingest.phase === 'done' ? 'Extracted' : 'Extracting'}</span>
            <span className="prog">{donePasses}/{ingest.passes.length} passes</span>
          </div>
          {ingest.passes.map((p, i) => (
            <div key={i} className={`ledger-row ${p.state}`}>
              <span className="dot">
                {p.state === 'done' ? '✓' : p.state === 'active' ? <span className="spin">◠</span> : ''}
              </span>
              <span className="lbl">{p.label}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Message({ m, loading }: { m: ChatMessage; loading: boolean }) {
  if (m.role === 'user') {
    return <div className="msg user"><div className="msg-bubble">{m.content}</div></div>;
  }

  const empty = !m.content && !m.plan && !m.ingest;

  return (
    <div className="msg ai">
      <div className="msg-role">
        <span className="g">✦</span>
        <span className="n">Assistant</span>
      </div>

      {m.ingest ? (
        <IngestCard ingest={m.ingest} text={m.content} />
      ) : (
        <>
          {m.content && (
            m.error
              ? <div className="msg-bubble" style={{ color: 'var(--red)' }}>{m.content}</div>
              : <MarkdownContent className="msg-bubble wb-md" text={m.content} />
          )}
          {empty && loading && <div className="msg-bubble"><TypingDots /></div>}
          {m.plan && <div style={{ marginTop: m.content ? 8 : 0 }}><PlanCard plan={m.plan} /></div>}
        </>
      )}
    </div>
  );
}

// ── Staging tray ───────────────────────────────────────────────────────────

function StageCard({
  change,
  onToggle,
  onOpen,
}: {
  change: StagedChange;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const meta = entityMeta[change.kind];
  const checked = change.on || change.committed;

  return (
    <div className={[
      'scard',
      change.on || change.committed ? '' : 'off',
      change.open ? 'open' : '',
      change.committed ? 'committed' : '',
      change.failed ? 'failed' : '',
    ].filter(Boolean).join(' ')}>
      <div className="scard-top" onClick={() => onOpen(change.id)}>
        <span
          className={`scard-check ${checked ? 'on' : ''}`}
          role="checkbox"
          aria-checked={checked}
          aria-label={`Include ${change.name}`}
          onClick={e => { e.stopPropagation(); if (!change.committed) onToggle(change.id); }}
        >
          {checked ? '✓' : ''}
        </span>
        <span className="scard-main">
          <span className="scard-row1">
            <span className={`rverb ${change.verb}`}>{change.verb.toUpperCase()}</span>
            <span className="scard-name">{change.name}</span>
          </span>
          <span className="scard-kind">
            <span className="g">{meta.glyph}</span>
            {meta.label}
            {change.committed ? ' · committed' : change.failed ? ' · failed' : ''}
          </span>
        </span>
        <ConfBar value={change.confidence} />
        <span className="scard-chev">▸</span>
      </div>

      {change.open && (
        <div className="scard-body">
          {change.why && <div className="scard-why"><span className="g">✦</span>{change.why}</div>}
          {change.verb === 'delete' ? (
            <div className="fld-new box" style={{ color: 'var(--red)' }}>
              This record will be permanently deleted.
            </div>
          ) : change.fields.length === 0 ? (
            <div className="scard-why" style={{ fontStyle: 'italic' }}>
              No field changes — this record already matches what the assistant proposed.
            </div>
          ) : (
            <div className="scard-fields">
              {change.fields.map((f, i) => (
                <div key={i}>
                  <div className="fld-label">{f.label}</div>
                  {f.old && <div className="fld-old">{f.old}</div>}
                  <div className={`fld-new box ${f.add ? 'fld-add' : ''}`}>{f.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StagingTray({ chat }: { chat: Chat }) {
  const { stage, pendingStaged, selectedStaged } = chat;

  const newCount = selectedStaged.filter(s => s.verb === 'create').length;
  const updateCount = selectedStaged.filter(s => s.verb === 'update').length;
  const deleteCount = selectedStaged.filter(s => s.verb === 'delete').length;

  return (
    <div className="wb-stage">
      <div className="stage-head">
        <span style={{ color: 'var(--gold)' }}>❑</span>
        <span className="ttl">Staging Tray</span>
        {stage.length > 0 && <span className="cnt">{pendingStaged.length} pending</span>}
      </div>

      <div className="stage-list">
        {stage.length === 0 ? (
          <div className="stage-empty">
            <span className="g">❑</span>
            Changes the Assistant drafts will collect here. Nothing touches your {chat.scopeNoun} until you commit.
          </div>
        ) : (
          stage.map(s => (
            <StageCard
              key={s.id}
              change={s}
              onToggle={chat.toggleStagedOn}
              onOpen={chat.toggleStagedOpen}
            />
          ))
        )}
      </div>

      {stage.length > 0 && (
        <div className="stage-foot">
          {pendingStaged.length > 0 ? (
            <>
              <div className="meta">
                <span>{selectedStaged.length} of {pendingStaged.length} selected</span>
                <span className="risk">
                  ✓ {newCount} new · {updateCount} update{updateCount === 1 ? '' : 's'}
                  {deleteCount > 0 && <span style={{ color: 'var(--red)' }}> · {deleteCount} delete{deleteCount === 1 ? '' : 's'}</span>}
                </span>
              </div>
              <div className="row">
                <button className="btn btn-sm" onClick={chat.discardStaged} disabled={chat.committing}>
                  Discard
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={chat.commitStaged}
                  disabled={selectedStaged.length === 0 || chat.committing}
                >
                  {chat.committing ? 'Committing…' : `Commit ${selectedStaged.length}`}
                </button>
              </div>
            </>
          ) : (
            <div className="commit-done">
              <span>✓ All changes committed to your {chat.scopeNoun}</span>
              <button className="btn btn-sm" onClick={chat.discardStaged} disabled={chat.committing}>
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shell ──────────────────────────────────────────────────────────────────

export default function Workbench({
  open,
  onClose,
  chat,
}: {
  open: boolean;
  onClose: () => void;
  chat: Chat;
}) {
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep the newest message in view as the response streams.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const canSend = (!!chat.input.trim() || !!chat.pendingDocument) && !chat.loading;

  return (
    <div className="wb-scrim" onClick={onClose}>
      <div
        className="wb"
        role="dialog"
        aria-modal="true"
        aria-label={chat.title}
        onClick={e => e.stopPropagation()}
      >
        <div className="wb-head">
          <div className="wb-mark">✦</div>
          <div className="lead">
            <div className="t">{chat.title}</div>
            <div className="s">{chat.subtitle}</div>
          </div>
          <button
            className={`prov ${chat.aiProvider}`}
            onClick={chat.toggleProvider}
            title="Switch model"
          >
            {chat.aiProvider === 'claude' ? '✦ Claude' : '◆ Gemini'}
          </button>
          {chat.messages.length > 0 && (
            <button className="icon-btn" onClick={chat.clearMessages} title="Clear conversation">⌫</button>
          )}
          <button
            className="icon-btn"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            style={{ border: '1px solid var(--rule)' }}
          >
            ×
          </button>
        </div>

        <div className="wb-grid">
          <div className="wb-conv">
            <div className="wb-thread" ref={threadRef}>
              {chat.messages.length === 0 ? (
                <div className="wb-empty">
                  <div className="mk">✦</div>
                  <div className="t">What are we building tonight?</div>
                  <div className="s">
                    Ask in plain language. Drafts land in the staging tray on the right — you decide what to commit.
                  </div>
                  <div className="wb-samples">
                    {chat.samples.map((s, i) => (
                      <button key={i} className="wb-sample" onClick={() => chat.sendMessage(s.text)}>
                        <span className="g">{s.glyph}</span>{s.text}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                chat.messages.map((m, i) => (
                  <Message
                    key={i}
                    m={m}
                    loading={chat.loading && i === chat.messages.length - 1}
                  />
                ))
              )}
            </div>

            {chat.apiError && (
              <div className="wb-error">{chat.apiError}</div>
            )}

            {chat.pendingDocument && (
              <div className="wb-attach">
                <span className="g">▤</span>
                <span className="fn">
                  {chat.pendingDocument.kind === 'gdocs-url'
                    ? 'Google Doc'
                    : chat.pendingDocument.filename ?? 'document'}
                </span>
                <span className="hint">Send to extract, or add instructions first.</span>
                <button
                  className="icon-btn"
                  onClick={() => chat.setPendingDocument(null)}
                  title="Remove attachment"
                  aria-label="Remove attachment"
                >
                  ×
                </button>
              </div>
            )}

            <div className="wb-composer">
              <div className="wb-composer-inner">
                {chat.supportsDocuments && (
                  <DocumentUploadButton
                    disabled={chat.loading}
                    onAttach={input => { chat.setPendingDocument(input); chat.setApiError(''); }}
                    onError={msg => chat.setApiError(msg)}
                  />
                )}
                <textarea
                  ref={inputRef}
                  rows={1}
                  placeholder={chat.composerPlaceholder}
                  value={chat.input}
                  onChange={e => {
                    chat.setInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                  }}
                  onKeyDown={chat.handleKeyDown}
                />
                {chat.loading ? (
                  <button className="askbar-send" onClick={chat.stopGeneration} title="Stop">
                    ■
                  </button>
                ) : (
                  <button
                    className="askbar-send"
                    onClick={() => chat.sendMessage()}
                    disabled={!canSend}
                    title="Send"
                    aria-label="Send"
                  >
                    ↑
                  </button>
                )}
              </div>
            </div>
          </div>

          <StagingTray chat={chat} />
        </div>
      </div>
    </div>
  );
}
