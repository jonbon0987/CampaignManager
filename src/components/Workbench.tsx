// The Assistant Workbench — the single AI surface.
//
// Two panes: conversation and staged changes. Everything the assistant
// proposes (from chat or from a document import) collects as a card you can
// include or leave out. Nothing reaches the database until Apply.

import { useEffect, useRef, useState } from 'react';
import { entityMeta } from '../lib/documentImport';
import type { useAIChat } from '../hooks/useAIChat';
import type { ChatMessage, IngestState, PlanState, StagedChange } from '../hooks/useAIChat';
import DocumentUploadButton from './DocumentUploadButton';
import { MarkdownContent } from './ui/MarkdownContent';
import { Button } from './ui/Button';
import { ChangeCard, type ChangeState, type ChangeTone, type ChangeView } from './review/ChangeCard';
import { ReviewTally } from './review/ReviewTally';
import { entityKindColor } from '../lib/theme';

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
//
// Staged changes show on the same card as a recording's chronicle review.

const KIND_COLOR: Partial<Record<StagedChange['kind'], string>> = {
  upsertSession: entityKindColor.session, upsertPC: entityKindColor.pc, upsertNPC: entityKindColor.npc,
  upsertLocation: entityKindColor.location, upsertFaction: entityKindColor.faction, upsertLore: entityKindColor.lore,
  upsertHook: entityKindColor.hook,
};

const stateOf = (c: StagedChange): ChangeState =>
  c.committed ? 'applied' : c.failed ? 'failed' : c.on ? 'accepted' : 'skipped';

const toneOf = (c: StagedChange): ChangeTone => (c.verb === 'create' ? 'new' : c.verb === 'delete' ? 'delete' : 'update');

function viewOf(c: StagedChange): ChangeView {
  const meta = entityMeta[c.kind];
  return {
    glyph: meta.glyph, color: KIND_COLOR[c.kind] ?? 'var(--gold)', kindLabel: meta.label, name: c.name, tone: toneOf(c),
    changes: c.fields.map(f => ({ label: f.label, before: f.old, after: f.value, added: f.add })),
  };
}

function StagingTray({ chat }: { chat: Chat }) {
  const { stage, pendingStaged, selectedStaged } = chat;

  return (
    <div className="wb-stage">
      <div className="stage-head">
        <span style={{ color: 'var(--gold)' }}>❑</span>
        <span className="ttl">Staged changes</span>
        {stage.length > 0 && <span className="cnt">{pendingStaged.length} pending</span>}
      </div>

      <div className="stage-list">
        {stage.length === 0 ? (
          <div className="stage-empty">
            <span className="g">❑</span>
            Changes the Assistant drafts will collect here. Nothing touches your {chat.scopeNoun} until you apply them.
          </div>
        ) : (
          stage.map(c => {
            const state = stateOf(c);
            const included = c.on || c.committed;
            return (
              <ChangeCard
                key={c.id}
                view={viewOf(c)}
                state={state}
                why={c.why}
                open={c.open}
                onToggleOpen={() => chat.toggleStagedOpen(c.id)}
                meta={<ConfBar value={c.confidence} />}
                actions={(
                  <span
                    className={`rv-check${included ? ' is-on' : ''}`}
                    role="checkbox"
                    aria-checked={included}
                    aria-label={`Include ${c.name}`}
                    tabIndex={c.committed ? -1 : 0}
                    onClick={() => { if (!c.committed) chat.toggleStagedOn(c.id); }}
                    onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !c.committed) { e.preventDefault(); chat.toggleStagedOn(c.id); } }}
                  >
                    {included ? '✓' : ''}
                  </span>
                )}
              />
            );
          })
        )}
      </div>

      {stage.length > 0 && (
        <div className="stage-foot">
          {pendingStaged.length > 0 ? (
            <>
              <ReviewTally items={stage.map(c => ({ state: stateOf(c), tone: toneOf(c) }))} />
              <div className="row">
                <Button size="sm" onClick={chat.discardStaged} disabled={chat.committing} style={{ flex: 1 }}>
                  Discard
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={chat.commitStaged}
                  disabled={selectedStaged.length === 0 || chat.committing}
                  style={{ flex: 1 }}
                >
                  {chat.committing ? 'Applying…' : `Apply ${selectedStaged.length}`}
                </Button>
              </div>
            </>
          ) : (
            <div className="commit-done">
              <span>✓ All changes applied to your {chat.scopeNoun}</span>
              <Button size="sm" onClick={chat.discardStaged} disabled={chat.committing} style={{ marginLeft: 'auto' }}>
                Clear
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shell ──────────────────────────────────────────────────────────────────
//
// Docked in the shell's right-hand rail (a full-screen sheet on a phone), so the
// record you're asking about stays in view. Chat and the staging tray are tabs.

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
  const [pane, setPane] = useState<'chat' | 'stage'>('chat');
  const pending = chat.pendingStaged.length;

  // Keep the newest message in view as the response streams.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages, open, pane]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const canSend = (!!chat.input.trim() || !!chat.pendingDocument) && !chat.loading;

  return (
    <aside className="wb wb-docked" aria-label={chat.title}>
      <div className="wb-head">
        <div className="wb-mark">✦</div>
        <div className="lead">
          <div className="t">{chat.title}</div>
          <div className="s">{chat.subtitle}</div>
        </div>
        {chat.messages.length > 0 && (
          <button className="icon-btn" onClick={chat.clearMessages} title="Clear conversation" aria-label="Clear conversation">⌫</button>
        )}
        <button
          className="icon-btn"
          onClick={onClose}
          title="Close (⌘J)"
          aria-label="Close assistant"
          style={{ border: '1px solid var(--rule)' }}
        >
          ×
        </button>
      </div>

      <div className="wb-tabs" role="tablist" aria-label="Assistant">
        {/* eslint-disable-next-line no-restricted-syntax -- bespoke tab, styled with its strip */}
        <button role="tab" aria-selected={pane === 'chat'} className={`wb-tab ${pane === 'chat' ? 'is-active' : ''}`} onClick={() => setPane('chat')}>Chat</button>
        {/* eslint-disable-next-line no-restricted-syntax -- bespoke tab, styled with its strip */}
        <button role="tab" aria-selected={pane === 'stage'} className={`wb-tab ${pane === 'stage' ? 'is-active' : ''}`} onClick={() => setPane('stage')}>
          Staged{pending > 0 && <span className="wb-tab-count">{pending}</span>}
        </button>
      </div>

      {pane === 'stage' ? (
        <StagingTray chat={chat} />
      ) : (
        <div className="wb-conv">
          <div className="wb-thread" ref={threadRef}>
            {chat.messages.length === 0 ? (
              <div className="wb-empty">
                <div className="mk">✦</div>
                <div className="t">What are we building tonight?</div>
                <div className="s">
                  Ask in plain language. Drafts collect under Staged; nothing changes until you apply them.
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

          {pending > 0 && (
            // eslint-disable-next-line no-restricted-syntax -- inline notice link
            <button className="wb-staged-note" onClick={() => setPane('stage')}>
              ❑ {pending} change{pending === 1 ? '' : 's'} staged · review and apply ›
            </button>
          )}

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
                aria-label="Message the assistant"
                value={chat.input}
                onChange={e => {
                  chat.setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={chat.handleKeyDown}
              />
              {chat.loading ? (
                <button className="askbar-send" onClick={chat.stopGeneration} title="Stop" aria-label="Stop">
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
      )}
    </aside>
  );
}
