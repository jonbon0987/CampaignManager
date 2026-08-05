import { useState, useRef, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import useLocalStorage from './useLocalStorage';
import type {
  SessionInsert, PlayerCharacterInsert, NPCInsert, LocationInsert,
  FactionInsert, HookInsert, LoreEntryInsert, ModuleInsert,
  MonsterStatblockInsert,
} from '../lib/database.types';
import {
  submitDocument, entityMeta, computeDiffRows, fieldLabel, actionName, normalizeConfidence,
  type ImportAction, type ImportActionType, type DocumentInput,
} from '../lib/documentImport';
import { getAIProvider, setAIProvider, type AIProvider } from '../lib/aiProvider';
import { authHeaders } from '../lib/apiClient';
import { errorMessage } from '../lib/errors';
import {
  extractBlock, stripBlocks, parseCompleteObjects, parsePlanBlock, splitAnnotations,
  type StepState, type PlanState,
} from '../lib/assistantParse';
import type { AssistantBackend } from './assistantBackend';

export type { StepState, PlanStep, PlanState } from '../lib/assistantParse';

// ── Types ──────────────────────────────────────────────────────────────────

export type PendingAction =
  | { type: 'upsertSession';   payload: SessionInsert & { id?: string } }
  | { type: 'upsertNPC';       payload: NPCInsert & { id?: string } }
  | { type: 'upsertPC';        payload: PlayerCharacterInsert & { id?: string } }
  | { type: 'upsertLocation';  payload: LocationInsert & { id?: string } }
  | { type: 'upsertFaction';   payload: FactionInsert & { id?: string } }
  | { type: 'upsertHook';      payload: HookInsert & { id?: string } }
  | { type: 'upsertLore';      payload: LoreEntryInsert & { id?: string } }
  | { type: 'upsertModule';    payload: ModuleInsert & { id?: string } }
  | { type: 'upsertMonsterStatblock'; payload: MonsterStatblockInsert & { id?: string } }
  | { type: 'deleteSession';   id: string; label: string }
  | { type: 'deleteNPC';       id: string; label: string }
  | { type: 'deletePC';        id: string; label: string }
  | { type: 'deleteLocation';  id: string; label: string }
  | { type: 'deleteFaction';   id: string; label: string }
  | { type: 'deleteHook';      id: string; label: string }
  | { type: 'deleteLore';      id: string; label: string }
  | { type: 'deleteModule';    id: string; label: string }
  | { type: 'deleteMonsterStatblock'; id: string; label: string };

export type StageVerb = 'create' | 'update' | 'delete';

export interface StagedField {
  label: string;
  old?: string;
  value: string;
  add?: boolean;
}

// One curatable card in the staging tray. `importAction` drives the diff UI;
// `chatAction` (present only for chat-authored changes) is the preferred apply
// path because it carries deletes, which imports never propose.
export interface StagedChange {
  id: string;
  verb: StageVerb;
  kind: ImportActionType;
  name: string;
  why: string;
  confidence: number;
  fields: StagedField[];
  on: boolean;
  open: boolean;
  committed: boolean;
  failed?: boolean;
  importAction: ImportAction;
  chatAction?: PendingAction;
}

export interface IngestCount { n: number; label: string }
export interface IngestPass { label: string; state: StepState; count?: number }

export interface IngestState {
  phase: 'reading' | 'outline' | 'extracting' | 'done';
  filename: string;
  size: string;
  counts: IngestCount[];
  passes: IngestPass[];
}

export type ChatMessage =
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      plan?: PlanState;
      ingest?: IngestState;
      error?: boolean;
    };

// ── Helpers ────────────────────────────────────────────────────────────────

const CHAT_ACTION_TYPES: Record<string, ImportActionType> = {
  upsertSession: 'upsertSession', deleteSession: 'upsertSession',
  upsertNPC: 'upsertNPC',         deleteNPC: 'upsertNPC',
  upsertPC: 'upsertPC',           deletePC: 'upsertPC',
  upsertLocation: 'upsertLocation', deleteLocation: 'upsertLocation',
  upsertFaction: 'upsertFaction', deleteFaction: 'upsertFaction',
  upsertHook: 'upsertHook',       deleteHook: 'upsertHook',
  upsertLore: 'upsertLore',       deleteLore: 'upsertLore',
  upsertModule: 'upsertModule',   deleteModule: 'upsertModule',
  upsertMonsterStatblock: 'upsertMonsterStatblock',
  deleteMonsterStatblock: 'upsertMonsterStatblock',
};

// Returns null for anything the model invented. An unrecognised type would
// otherwise reach the tray with no entityMeta entry and throw on render.
function pendingActionToImportType(a: PendingAction): ImportActionType | null {
  return CHAT_ACTION_TYPES[a.type] ?? null;
}

function approxSize(input: DocumentInput): string {
  if (input.kind === 'gdocs-url') return 'Google Doc';
  // base64 encodes 3 bytes per 4 chars; text payloads are already bytes.
  const bytes = input.kind === 'text'
    ? input.payload.length
    : Math.floor(input.payload.length * 0.75);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let stagedSeq = 0;

// ── Hook ──────────────────────────────────────────────────────────────────

export function useAIChat(backend: AssistantBackend) {
  const toast = useToast();

  const [messages, setMessages] = useLocalStorage<ChatMessage[]>(`${backend.storageKey}-messages`, []);
  const [stage, setStage] = useLocalStorage<StagedChange[]>(`${backend.storageKey}-stage`, []);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [pendingDocument, setPendingDocument] = useState<DocumentInput | null>(null);
  const [aiProvider, setAiProvider] = useState<AIProvider>(getAIProvider);
  const importPlaceholderRef = useRef<number>(-1);
  const abortControllerRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // A reload mid-run leaves spinners frozen forever. Settle any in-flight
  // plan/ingest state on mount so nothing spins against a dead request.
  useEffect(() => {
    setMessages(prev => prev.map(m => {
      if (m.role !== 'assistant') return m;
      let next = m;
      if (m.plan?.steps.some(s => s.state === 'active')) {
        next = { ...next, plan: { ...m.plan, steps: m.plan.steps.map(s => s.state === 'active' ? { ...s, state: 'pending' as StepState } : s) } };
      }
      if (m.ingest && m.ingest.phase !== 'done') {
        next = { ...next, ingest: { ...m.ingest, phase: 'done' as const, passes: m.ingest.passes.map(p => p.state === 'active' ? { ...p, state: 'pending' as StepState } : p) } };
      }
      return next;
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  function stopGeneration() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
  }

  function toggleProvider() {
    const next = aiProvider === 'claude' ? 'gemini' : 'claude';
    setAiProvider(next);
    setAIProvider(next);
  }

  function clearMessages() {
    setMessages([]);
  }

  // ── Staging ──────────────────────────────────────────────────────────────

  // Turn one proposed action into a tray card: verb from create/update/delete,
  // fields from a diff against the record it would touch.
  function toStagedChange(
    importAction: ImportAction,
    chatAction?: PendingAction,
  ): StagedChange {
    const isDelete = !!chatAction?.type.startsWith('delete');
    const existing = importAction.matched_id
      ? backend.lookupExisting(importAction.type, importAction.matched_id)
      : null;

    const verb: StageVerb = isDelete ? 'delete' : existing ? 'update' : 'create';
    const fields: StagedField[] = isDelete ? [] : computeDiffRows(existing, importAction.payload as Record<string, unknown>)
      .map(row => ({
        label: fieldLabel(row.key),
        old: existing && row.oldValue != null && String(row.oldValue) !== '' ? String(row.oldValue) : undefined,
        value: row.newValue == null ? '—' : String(row.newValue),
        add: !existing,
      }));

    const name = isDelete
      ? (chatAction as { label?: string }).label ?? '(unknown)'
      : actionName(importAction, existing);

    return {
      id: `st-${Date.now()}-${stagedSeq++}`,
      verb,
      kind: importAction.type,
      name,
      why: importAction.reasoning,
      confidence: importAction.confidence,
      fields,
      on: true,
      open: false,
      committed: false,
      importAction,
      chatAction,
    };
  }

  function stageActions(changes: StagedChange[]) {
    if (changes.length === 0) return;
    setStage(prev => [...prev, ...changes]);
  }

  const toggleStagedOn = (id: string) =>
    setStage(prev => prev.map(s => s.id === id && !s.committed ? { ...s, on: !s.on } : s));

  const toggleStagedOpen = (id: string) =>
    setStage(prev => prev.map(s => s.id === id ? { ...s, open: !s.open } : s));

  // Empties the whole tray — pending drafts and committed receipts alike.
  // Committed changes are already saved; the card is just a receipt, so
  // dropping it doesn't undo anything.
  const discardStaged = () => setStage([]);

  const clearStage = () => setStage([]);

  // Apply the checked, uncommitted subset. Mirrors the old
  // applyConfirmedActions/handleApplyImport: chat actions apply their payload
  // as written; import actions merge onto the existing record so fields the AI
  // left out are preserved rather than nulled.
  async function commitStaged() {
    const selected = stage.filter(s => s.on && !s.committed);
    if (selected.length === 0 || committing) return;

    setCommitting(true);
    const applied: string[] = [];
    const failed: string[] = [];

    for (const change of selected) {
      try {
        if (change.chatAction) {
          await backend.applyChatAction(change.chatAction);
        } else {
          await backend.applyImportAction(change.importAction);
        }
        applied.push(change.id);
      } catch (err) {
        failed.push(change.id);
        const msg = errorMessage(err, 'Unknown error');
        toast(`Failed to commit ${change.name}: ${msg}`, 'error');
      }

      setStage(prev => prev.map(s => {
        if (applied.includes(s.id)) return { ...s, committed: true, open: false, failed: false };
        if (failed.includes(s.id)) return { ...s, failed: true };
        return s;
      }));
    }

    setCommitting(false);

    if (failed.length === 0 && applied.length > 0) {
      toast(`Committed ${applied.length} change${applied.length === 1 ? '' : 's'} to your ${backend.scopeNoun}`, 'success');
    } else if (failed.length > 0 && applied.length > 0) {
      toast(`Committed ${applied.length}, ${failed.length} failed`, 'error');
    }
  }

  // ── Chat ─────────────────────────────────────────────────────────────────

  async function sendMessage(promptOverride?: string) {
    const text = (promptOverride ?? input).trim();
    const hasDoc = !!pendingDocument;
    if ((!text && !hasDoc) || loading) return;
    setApiError('');

    if (hasDoc) {
      const doc = pendingDocument;
      setPendingDocument(null);
      setInput('');
      handleDocumentImport(doc, text);
      return;
    }

    const userMsg: ChatMessage = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    const systemPrompt = backend.buildSystemPrompt();

    // Keep only the last 10 messages to avoid token bloat across long sessions.
    // Campaign context is always in the system prompt, so old history adds little value.
    const recentMessages = nextMessages.slice(-10);
    const apiMessages = recentMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const streamingIdx = nextMessages.length;
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    let fullText = '';
    let stagedCount = 0;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    function patchStreaming(updater: (m: ChatMessage & { role: 'assistant' }) => ChatMessage) {
      setMessages(prev => prev.map((m, i) =>
        i === streamingIdx && m.role === 'assistant' ? updater(m) : m
      ));
    }

    // Stage every action the model has finished writing, and tick its plan step
    // over to done. Called on each chunk, so cards land as they are composed.
    function drainCompletedActions(final: boolean) {
      const block = extractBlock(fullText, 'json');
      if (!block) return;
      const objects = parseCompleteObjects(block);
      if (objects.length <= stagedCount) return;

      const fresh = objects.slice(stagedCount);
      stagedCount = objects.length;

      const changes: StagedChange[] = [];
      const touchedSteps = new Set<number>();

      fresh.forEach((raw, i) => {
        const { action: parsed, meta } = splitAnnotations(raw);
        if (typeof parsed.type !== 'string') return;
        const action = parsed as unknown as PendingAction;
        const kind = pendingActionToImportType(action);
        if (!kind) return;
        const isDelete = action.type.startsWith('delete');
        const payload = isDelete
          ? { name: (action as { label?: string }).label ?? '(unknown)' }
          : (action as { payload?: Record<string, unknown> }).payload;
        if (!payload || typeof payload !== 'object') return;
        let matchedId: string | null;
        if (isDelete) {
          matchedId = (action as { id?: string }).id ?? null;
        } else {
          // The model often puts the record id at the action's TOP level
          // (`id` or `matched_id`), mirroring the delete shape, instead of
          // inside `payload`. If we only read payload.id, every such upsert
          // reads as a create (wrong verb, no name to fall back on → "unnamed",
          // and a duplicate at commit). Fold whichever id we find into
          // payload.id so verb detection here AND the verbatim payload upsert
          // in applyChatAction both treat it as an update.
          const top = action as { id?: string; matched_id?: string };
          const body = payload as Record<string, unknown>;
          matchedId = (body.id as string) ?? top.id ?? top.matched_id ?? null;
          if (matchedId && body.id == null) body.id = matchedId;
        }
        // A delete with no id can't be applied and would fail at commit.
        if (isDelete && !matchedId) return;

        const importAction = {
          action_id: `chat-${Date.now()}-${stagedCount - fresh.length + i}`,
          type: kind,
          matched_id: matchedId,
          reasoning: meta.reasoning ?? '',
          confidence: normalizeConfidence(meta.confidence),
          payload,
        } as ImportAction;

        changes.push(toStagedChange(importAction, action));
        if (meta.step != null) touchedSteps.add(meta.step);
      });

      stageActions(changes);

      if (touchedSteps.size > 0) {
        patchStreaming(m => {
          if (!m.plan) return m;
          const highest = Math.max(...touchedSteps);
          return {
            ...m,
            plan: {
              ...m.plan,
              steps: m.plan.steps.map((s, idx) => {
                const stepNo = idx + 1;
                // Anything at or below the newest action's step is finished;
                // the next one is what the model is writing now.
                if (stepNo <= highest) return { ...s, state: 'done' as StepState };
                if (stepNo === highest + 1 && !final) return { ...s, state: 'active' as StepState };
                return s;
              }),
            },
          };
        });
      }
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ messages: apiMessages, system: systemPrompt, provider: aiProvider }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let planSet = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: { type: string; text?: string; message?: string };
          try { event = JSON.parse(line.slice(6)); } catch { continue; }
          if (event.type === 'text' && event.text) {
            fullText += event.text;
            const displayText = stripBlocks(fullText);

            // The plan block streams in first; render it as soon as it closes,
            // with step 1 running.
            if (!planSet) {
              const plan = parsePlanBlock(fullText);
              if (plan && /```plan[\s\S]*?```/.test(fullText)) {
                planSet = true;
                plan.steps[0].state = 'active';
                patchStreaming(m => ({ ...m, plan }));
              }
            }

            patchStreaming(m => ({ ...m, content: displayText }));
            drainCompletedActions(false);
          } else if (event.type === 'error') {
            throw new Error(event.message ?? 'Stream error');
          }
        }
      }

      drainCompletedActions(true);

      const displayText = stripBlocks(fullText);
      patchStreaming(m => ({
        ...m,
        content: displayText || (stagedCount > 0
          ? `I've drafted ${stagedCount} change${stagedCount === 1 ? '' : 's'}. Review them in the staging tray and commit what you want.`
          : ''),
        // Whatever the model did or didn't tag, the run is over — no step is
        // still in flight.
        plan: m.plan
          ? { ...m.plan, steps: m.plan.steps.map(s => ({ ...s, state: 'done' as StepState })) }
          : undefined,
      }));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        const displayText = stripBlocks(fullText);
        patchStreaming(m => ({
          ...m,
          content: displayText || '(Stopped)',
          plan: m.plan
            ? { ...m.plan, steps: m.plan.steps.map(s => s.state === 'active' ? { ...s, state: 'pending' as StepState } : s) }
            : undefined,
        }));
      } else {
        const msg = errorMessage(err, 'Unknown error');
        setApiError(msg);
        patchStreaming(m => ({ ...m, content: `Error: ${msg}`, error: true }));
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  }

  // ── Document import ──────────────────────────────────────────────────────

  async function handleDocumentImport(docInput: DocumentInput, userInstructions?: string) {
    setApiError('');

    const filename = docInput.kind === 'gdocs-url'
      ? 'Google Doc'
      : (docInput.filename ?? 'document');
    const userContent = userInstructions
      ? `📄 Attached ${filename}\n${userInstructions}`
      : `📄 Attached ${filename}`;
    const userMsg: ChatMessage = { role: 'user', content: userContent };

    setMessages(prev => {
      importPlaceholderRef.current = prev.length + 1;
      return [...prev, userMsg, {
        role: 'assistant',
        content: '',
        ingest: {
          phase: 'reading',
          filename,
          size: approxSize(docInput),
          counts: [],
          passes: [],
        },
      }];
    });
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    function updatePlaceholder(updater: (m: ChatMessage & { role: 'assistant' }) => ChatMessage) {
      setMessages(prev => prev.map((m, i) => {
        if (i !== importPlaceholderRef.current || m.role !== 'assistant') return m;
        return updater(m as ChatMessage & { role: 'assistant' });
      }));
    }

    function patchIngest(updater: (ing: IngestState) => IngestState) {
      updatePlaceholder(m => (m.ingest ? { ...m, ingest: updater(m.ingest) } : m));
    }

    try {
      const ctx = backend.formatContext();

      const { actions } = await submitDocument(
        docInput,
        ctx,
        userInstructions,
        (chunk) => {
          // The model's read-through of the doc — this is the outline prose.
          updatePlaceholder(m => ({ ...m, content: m.content + chunk }));
          patchIngest(ing => (ing.phase === 'reading' ? { ...ing, phase: 'outline' } : ing));
        },
        () => {
          patchIngest(ing => ({ ...ing, phase: 'extracting' }));
        },
        (pass) => {
          patchIngest(ing => {
            // Seed the row list the first time we learn how many passes there are.
            const passes: IngestPass[] = ing.passes.length === pass.total
              ? [...ing.passes]
              : Array.from({ length: pass.total }, (_, i) => ({ label: i === pass.index ? pass.label : '…', state: 'pending' as StepState }));
            passes.forEach((p, i) => {
              if (i < pass.index) p.state = 'done';
              else if (i === pass.index) { p.label = pass.label; p.state = 'active'; }
            });
            return { ...ing, phase: 'extracting', passes };
          });
        },
        controller.signal,
        aiProvider,
      );

      // The tool schema constrains the type, but a stray one would throw on
      // render — drop it rather than take the tray down.
      const known = actions.filter(a => !!entityMeta[a.type]);

      if (known.length > 0) {
        stageActions(known.map(a => toStagedChange(a)));

        // Counts the design shows as the "here's what I found" grid — real
        // totals, grouped by kind, now that extraction has actually run.
        const byKind = new Map<ImportActionType, number>();
        for (const a of known) byKind.set(a.type, (byKind.get(a.type) ?? 0) + 1);
        const counts: IngestCount[] = [...byKind.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([kind, n]) => ({ n, label: `${entityMeta[kind].label}${n === 1 ? '' : 's'}` }));

        patchIngest(ing => ({
          ...ing,
          phase: 'done',
          counts,
          passes: ing.passes.map(p => ({ ...p, state: 'done' as StepState })),
        }));
      } else {
        patchIngest(ing => ({ ...ing, phase: 'done', passes: ing.passes.map(p => ({ ...p, state: 'done' as StepState })) }));
        updatePlaceholder(m => ({
          ...m,
          content: (m.content ? m.content + '\n\n' : '') +
            'No changes were extracted. The document may have been too large for a single pass, or the extraction timed out. Try uploading again, or break the document into smaller sections.',
        }));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        patchIngest(ing => ({ ...ing, phase: 'done' }));
        updatePlaceholder(m => ({ ...m, content: m.content || '(Stopped)' }));
      } else {
        const msg = errorMessage(err, 'Unknown error');
        setApiError(msg);
        updatePlaceholder(() => ({ role: 'assistant', content: `Error importing document: ${msg}`, error: true }));
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const pendingStaged = stage.filter(s => !s.committed);
  const selectedStaged = pendingStaged.filter(s => s.on);

  return {
    title: backend.title,
    subtitle: backend.subtitle,
    scopeNoun: backend.scopeNoun,
    supportsDocuments: backend.supportsDocuments,
    composerPlaceholder: backend.composerPlaceholder,
    samples: backend.samples,
    messages,
    input,
    setInput,
    loading,
    committing,
    apiError,
    setApiError,
    pendingDocument,
    setPendingDocument,
    aiProvider,
    toggleProvider,
    sendMessage,
    stopGeneration,
    clearMessages,
    handleDocumentImport,
    handleKeyDown,
    bottomRef,
    textareaRef,
    // staging tray
    stage,
    pendingStaged,
    selectedStaged,
    toggleStagedOn,
    toggleStagedOpen,
    commitStaged,
    discardStaged,
    clearStage,
    pendingProposalCount: pendingStaged.length,
  };
}
