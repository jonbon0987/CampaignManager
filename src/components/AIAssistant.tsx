import { useState, useRef, useEffect } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { useToast } from '../context/ToastContext';
import useLocalStorage from '../hooks/useLocalStorage';
import type {
  Session, PlayerCharacter, NPC, Location,
  Faction, Hook, LoreEntry, Module,
  SessionInsert, PlayerCharacterInsert, NPCInsert, LocationInsert,
  FactionInsert, HookInsert, LoreEntryInsert, ModuleInsert,
} from '../lib/database.types';
import { submitDocument, type ImportAction, type DocumentInput } from '../lib/documentImport';
import { formatCampaignContext } from '../lib/campaignContext';
import DocumentImportReview from './DocumentImportReview';
import DocumentUploadButton from './DocumentUploadButton';

// ── Types ──────────────────────────────────────────────────────────────────

type PendingAction =
  | { type: 'upsertSession';   payload: SessionInsert & { id?: string } }
  | { type: 'upsertNPC';       payload: NPCInsert & { id?: string } }
  | { type: 'upsertPC';        payload: PlayerCharacterInsert & { id?: string } }
  | { type: 'upsertLocation';  payload: LocationInsert & { id?: string } }
  | { type: 'upsertFaction';   payload: FactionInsert & { id?: string } }
  | { type: 'upsertHook';      payload: HookInsert & { id?: string } }
  | { type: 'upsertLore';      payload: LoreEntryInsert & { id?: string } }
  | { type: 'upsertModule';    payload: ModuleInsert & { id?: string } }
  | { type: 'deleteSession';   id: string; label: string }
  | { type: 'deleteNPC';       id: string; label: string }
  | { type: 'deletePC';        id: string; label: string }
  | { type: 'deleteLocation';  id: string; label: string }
  | { type: 'deleteFaction';   id: string; label: string }
  | { type: 'deleteHook';      id: string; label: string }
  | { type: 'deleteLore';      id: string; label: string }
  | { type: 'deleteModule';    id: string; label: string };

interface ImportApplyState {
  phase: 'idle' | 'applying' | 'done';
  appliedActionIds: string[];
  failedActionIds: string[];
}

type ChatMessage =
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      pendingActions?: PendingAction[];
      importActions?: ImportAction[];
      importApplyState?: ImportApplyState;
    };

// ── Helpers ────────────────────────────────────────────────────────────────

function actionLabel(action: PendingAction): string {
  switch (action.type) {
    case 'upsertSession':
      return `${action.payload.id ? 'Update' : 'Create'} session #${action.payload.session_number}`;
    case 'upsertNPC':
      return `${action.payload.id ? 'Update' : 'Add'} NPC: ${action.payload.name}`;
    case 'upsertPC':
      return `${action.payload.id ? 'Update' : 'Add'} PC: ${action.payload.character_name}`;
    case 'upsertLocation':
      return `${action.payload.id ? 'Update' : 'Add'} location: ${action.payload.name}`;
    case 'upsertFaction':
      return `${action.payload.id ? 'Update' : 'Add'} faction: ${action.payload.name}`;
    case 'upsertHook':
      return `${action.payload.id ? 'Update' : 'Add'} hook: ${action.payload.title}`;
    case 'upsertLore':
      return `${action.payload.id ? 'Update' : 'Add'} lore: ${action.payload.title}`;
    case 'upsertModule':
      return `${action.payload.id ? 'Update' : 'Add'} module: ${action.payload.title}`;
    case 'deleteSession':   return `Delete session: ${action.label}`;
    case 'deleteNPC':       return `Delete NPC: ${action.label}`;
    case 'deletePC':        return `Delete PC: ${action.label}`;
    case 'deleteLocation':  return `Delete location: ${action.label}`;
    case 'deleteFaction':   return `Delete faction: ${action.label}`;
    case 'deleteHook':      return `Delete hook: ${action.label}`;
    case 'deleteLore':      return `Delete lore: ${action.label}`;
    case 'deleteModule':    return `Delete module: ${action.label}`;
  }
}

function buildSystemPrompt(data: {
  sessions: Session[];
  pcs: PlayerCharacter[];
  npcs: NPC[];
  locations: Location[];
  factions: Faction[];
  hooks: Hook[];
  lore: LoreEntry[];
  modules: Module[];
  overviewTitle: string;
  overviewPlot: string;
}): string {
  return `You are a D&D campaign assistant for the Dungeon Master. Your job is to help organize campaign data, write NPC/location/session entries, flesh out story modules, and update any campaign records.

${formatCampaignContext(data)}

== INSTRUCTIONS ==

When the DM asks you to create or modify campaign data, respond in two parts:
1. A natural language response explaining what you're doing/proposing.
2. A JSON block (wrapped in \`\`\`json ... \`\`\`) containing an array of actions to apply.

Each action has a "type" field and a "payload" or "id"+"label" field:

Upsert actions (include "id" to update an existing record, omit to create new):
  { "type": "upsertNPC", "payload": { "id": "<existing-id-or-omit>", "name": "...", "role": "...", "affiliation": "...", "status": "active"|"deceased"|"unknown", "description": "...", "hooks_motivations": "...", "dm_notes": "...", "location": "...", "first_session": null } }
  { "type": "upsertSession", "payload": { "id": "...(omit for new)", "session_number": 1, "session_date": "2024-01-01", "summary": "...", "combats": "...", "loot_rewards": "...", "hooks_notes": "...", "dm_notes": "..." } }
  { "type": "upsertPC", "payload": { "id": "...(omit for new)", "character_name": "...", "player_name": "...", "race": "...", "class": "...", "background": "...", "story_hooks": "...", "key_npcs": "...", "dm_notes": "...", "is_active": true } }
  { "type": "upsertLocation", "payload": { "id": "...(omit for new)", "name": "...", "region": "...", "location_type": "city|town|dungeon|faction_hq|landmark", "population": "...", "status": "...", "history": "...", "description": "...", "dm_notes": "..." } }
  { "type": "upsertFaction", "payload": { "id": "...(omit for new)", "name": "...", "faction_type": "...", "overview": "...", "key_figures": "...", "agenda": "...", "dm_notes": "..." } }
  { "type": "upsertHook", "payload": { "id": "...(omit for new)", "title": "...", "category": "main_plot|side_quest|character_arc|faction", "description": "...", "last_updated_session": null, "is_active": true, "dm_only_notes": "..." } }
  { "type": "upsertLore", "payload": { "id": "...(omit for new)", "title": "...", "category": "history|artifact|creature|magic|religion", "content": "...", "dm_only": false } }
  { "type": "upsertModule", "payload": { "id": "...(omit for new)", "chapter": "1", "title": "...", "synopsis": "...", "status": "planned|active|completed", "played_session": null, "encounters": "...", "rewards": "...", "dm_notes": "..." } }

Delete actions:
  { "type": "deleteNPC", "id": "<id>", "label": "<name>" }
  { "type": "deleteSession", "id": "<id>", "label": "Session #N" }
  (same pattern for deletePC, deleteLocation, deleteFaction, deleteHook, deleteLore, deleteModule)

Only include the JSON block when you actually want to make changes. If the DM is just asking a question or chatting, respond normally without a JSON block. Always use the existing record IDs (shown above in brackets) when updating existing records.`;
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AIAssistant({ open, onClose }: Props) {
  const campaign = useCampaign();
  const { sessions, pcs, npcs, locations, factions, hooks, lore, modules, overview } = campaign;
  const toast = useToast();

  const [messages, setMessages] = useLocalStorage<ChatMessage[]>('ai-chat-messages', []);
  const [appliedIdxsArr, setAppliedIdxsArr] = useLocalStorage<number[]>('ai-chat-applied', []);
  const appliedIdxs = new Set(appliedIdxsArr);
  const setAppliedIdxs = (update: Set<number> | ((prev: Set<number>) => Set<number>)) => {
    setAppliedIdxsArr(prev => {
      const prevSet = new Set(prev);
      const next = update instanceof Function ? update(prevSet) : update;
      return [...next];
    });
  };
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const [apiError, setApiError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 50);
  }, [open]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    setApiError('');

    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    const systemPrompt = buildSystemPrompt({
      sessions, pcs, npcs, locations, factions, hooks, lore, modules,
      overviewTitle: overview.title,
      overviewPlot: overview.plotSummary,
    });

    const apiMessages = nextMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Add a placeholder assistant message for streaming
    const streamingIdx = nextMessages.length;
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    let fullText = '';

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, system: systemPrompt }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const event = JSON.parse(line.slice(6)) as { type: string; text?: string; message?: string };
          if (event.type === 'text' && event.text) {
            fullText += event.text;
            setMessages(prev => prev.map((m, i) =>
              i === streamingIdx ? { ...m, content: fullText } : m
            ));
          } else if (event.type === 'error') {
            throw new Error(event.message ?? 'Stream error');
          }
        }
      }

      // Extract pending actions from JSON block
      const pendingActions = parseActions(fullText);
      const displayText = fullText.replace(/```json[\s\S]*?```/g, '').trim();

      setMessages(prev => prev.map((m, i) =>
        i === streamingIdx
          ? { role: 'assistant', content: displayText, pendingActions: pendingActions.length > 0 ? pendingActions : undefined }
          : m
      ));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && !last.content) {
          return [...prev.slice(0, -1), { role: 'assistant' as const, content: `Error: ${msg}` }];
        }
        return [...prev, { role: 'assistant' as const, content: `Error: ${msg}` }];
      });
    } finally {
      setLoading(false);
    }
  }

  function parseActions(text: string): PendingAction[] {
    const match = text.match(/```json\s*([\s\S]*?)```/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[1]);
      if (!Array.isArray(parsed)) return [];
      return parsed as PendingAction[];
    } catch {
      return [];
    }
  }

  async function applyActions(msgIdx: number, actions: PendingAction[]) {
    setApplyingIdx(msgIdx);
    try {
      for (const action of actions) {
        switch (action.type) {
          case 'upsertSession':   await campaign.upsertSession(action.payload); break;
          case 'upsertNPC':       await campaign.upsertNPC(action.payload); break;
          case 'upsertPC':        await campaign.upsertPC(action.payload); break;
          case 'upsertLocation':  await campaign.upsertLocation(action.payload); break;
          case 'upsertFaction':   await campaign.upsertFaction(action.payload); break;
          case 'upsertHook':      await campaign.upsertHook(action.payload); break;
          case 'upsertLore':      await campaign.upsertLore(action.payload); break;
          case 'upsertModule':    await campaign.upsertModule(action.payload); break;
          case 'deleteSession':   await campaign.deleteSession(action.id); break;
          case 'deleteNPC':       await campaign.deleteNPC(action.id); break;
          case 'deletePC':        await campaign.deletePC(action.id); break;
          case 'deleteLocation':  await campaign.deleteLocation(action.id); break;
          case 'deleteFaction':   await campaign.deleteFaction(action.id); break;
          case 'deleteHook':      await campaign.deleteHook(action.id); break;
          case 'deleteLore':      await campaign.deleteLore(action.id); break;
          case 'deleteModule':    await campaign.deleteModule(action.id); break;
        }
      }
      setAppliedIdxs(prev => new Set([...prev, msgIdx]));
    } catch (err) {
      alert(`Failed to apply changes: ${err instanceof Error ? err.message : err}`);
    } finally {
      setApplyingIdx(null);
    }
  }

  // ── Document import ──────────────────────────────────────────────────────

  async function handleDocumentImport(input: DocumentInput) {
    setApiError('');

    const label = input.kind === 'gdocs-url'
      ? 'Imported Google Doc'
      : `Uploaded ${input.filename ?? 'document'}`;
    const userMsg: ChatMessage = { role: 'user', content: `📄 ${label}` };
    const placeholderIdx = messages.length + 1;
    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: 'Reading document…' }]);
    setLoading(true);

    try {
      const ctx = formatCampaignContext({
        sessions, pcs, npcs, locations, factions, hooks, lore, modules,
        overviewTitle: overview.title,
        overviewPlot: overview.plotSummary,
      });
      const { summary, actions } = await submitDocument(input, ctx);

      setMessages(prev => prev.map((m, i) => {
        if (i !== placeholderIdx) return m;
        const displayText = summary || (actions.length > 0
          ? `Found ${actions.length} proposed change${actions.length === 1 ? '' : 's'}.`
          : 'No campaign updates found in that document.');
        return {
          role: 'assistant',
          content: displayText,
          importActions: actions.length > 0 ? actions : undefined,
          importApplyState: actions.length > 0
            ? { phase: 'idle', appliedActionIds: [], failedActionIds: [] }
            : undefined,
        };
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setMessages(prev => prev.map((m, i) =>
        i === placeholderIdx
          ? { role: 'assistant' as const, content: `Error importing document: ${msg}` }
          : m,
      ));
    } finally {
      setLoading(false);
    }
  }

  async function handleApplyImport(msgIdx: number, selected: ImportAction[]) {
    // Mark as applying
    setMessages(prev => prev.map((m, i) => {
      if (i !== msgIdx || m.role !== 'assistant') return m;
      return {
        ...m,
        importApplyState: { phase: 'applying', appliedActionIds: [], failedActionIds: [] },
      };
    }));

    const applied: string[] = [];
    const failed: string[] = [];

    for (const action of selected) {
      try {
        // Merge matched_id → payload.id for updates
        const payload = { ...(action.payload as Record<string, unknown>) };
        if (action.matched_id) payload.id = action.matched_id;

        switch (action.type) {
          case 'upsertSession':
            await campaign.upsertSession(payload as Parameters<typeof campaign.upsertSession>[0]);
            break;
          case 'upsertPC':
            await campaign.upsertPC(payload as Parameters<typeof campaign.upsertPC>[0]);
            break;
          case 'upsertNPC':
            await campaign.upsertNPC(payload as Parameters<typeof campaign.upsertNPC>[0]);
            break;
          case 'upsertLocation':
            await campaign.upsertLocation(payload as Parameters<typeof campaign.upsertLocation>[0]);
            break;
          case 'upsertFaction':
            await campaign.upsertFaction(payload as Parameters<typeof campaign.upsertFaction>[0]);
            break;
          case 'upsertHook':
            await campaign.upsertHook(payload as Parameters<typeof campaign.upsertHook>[0]);
            break;
          case 'upsertLore':
            await campaign.upsertLore(payload as Parameters<typeof campaign.upsertLore>[0]);
            break;
          case 'upsertModule':
            await campaign.upsertModule(payload as Parameters<typeof campaign.upsertModule>[0]);
            break;
          case 'upsertSubmodule':
            await campaign.upsertSubmodule(payload as Parameters<typeof campaign.upsertSubmodule>[0]);
            break;
          case 'upsertScene':
            await campaign.upsertScene(payload as Parameters<typeof campaign.upsertScene>[0]);
            break;
          case 'upsertRelationship':
            await campaign.upsertRelationship(payload as Parameters<typeof campaign.upsertRelationship>[0]);
            break;
          default: {
            const _exhaustive: never = action;
            void _exhaustive;
          }
        }
        applied.push(action.action_id);
      } catch (err) {
        failed.push(action.action_id);
        const msg = err instanceof Error ? err.message : 'Unknown error';
        toast(`Failed: ${msg}`, 'error');
        // Keep going — user can retry individual failures later.
      }

      // Stream progress into the message as we go
      setMessages(prev => prev.map((m, i) => {
        if (i !== msgIdx || m.role !== 'assistant') return m;
        return {
          ...m,
          importApplyState: {
            phase: 'applying',
            appliedActionIds: [...applied],
            failedActionIds: [...failed],
          },
        };
      }));
    }

    // Final state
    setMessages(prev => prev.map((m, i) => {
      if (i !== msgIdx || m.role !== 'assistant') return m;
      return {
        ...m,
        importApplyState: {
          phase: 'done',
          appliedActionIds: [...applied],
          failedActionIds: [...failed],
        },
      };
    }));

    if (failed.length === 0 && applied.length > 0) {
      toast(`Imported ${applied.length} change${applied.length === 1 ? '' : 's'}`, 'success');
    } else if (failed.length > 0 && applied.length > 0) {
      toast(`Applied ${applied.length}, ${failed.length} failed`, 'error');
    }
  }

  function dismissImportActions(msgIdx: number) {
    setMessages(prev => prev.map((m, i) => {
      if (i !== msgIdx || m.role !== 'assistant') return m;
      return { ...m, importActions: undefined, importApplyState: undefined };
    }));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

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
      borderTop: '1px solid #3a3660',
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
          {messages.length > 0 && (
            <button
              onClick={() => { setMessages([]); setAppliedIdxsArr([]); }}
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

              {/* Pending actions confirmation */}
              {msg.role === 'assistant' && msg.pendingActions && msg.pendingActions.length > 0 && (
                <div style={{
                  marginTop: '12px',
                  borderTop: '1px solid #3a3660',
                  paddingTop: '10px',
                }}>
                  <div style={{ color: '#9990b0', fontSize: '12px', marginBottom: '8px' }}>
                    Proposed changes:
                  </div>
                  <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '12px', color: '#c9a84c', lineHeight: '1.8' }}>
                    {msg.pendingActions.map((a, i) => (
                      <li key={i}>{actionLabel(a)}</li>
                    ))}
                  </ul>
                  {appliedIdxs.has(idx) ? (
                    <div style={{ marginTop: '10px', color: '#6ab87a', fontSize: '12px', fontWeight: 600 }}>
                      ✓ Applied to campaign
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <button
                        onClick={() => applyActions(idx, msg.pendingActions!)}
                        disabled={applyingIdx === idx}
                        style={{
                          backgroundColor: '#c9a84c',
                          color: '#0f0e17',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '6px 14px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: applyingIdx === idx ? 'default' : 'pointer',
                          opacity: applyingIdx === idx ? 0.6 : 1,
                        }}
                      >
                        {applyingIdx === idx ? 'Applying…' : 'Apply changes'}
                      </button>
                      <button
                        onClick={() => {
                          setMessages(prev => prev.map((m, i) =>
                            i === idx ? { ...m, pendingActions: undefined } : m
                          ));
                        }}
                        style={{
                          background: 'none',
                          border: '1px solid #3a3660',
                          borderRadius: '6px',
                          padding: '6px 14px',
                          fontSize: '12px',
                          color: '#9990b0',
                          cursor: 'pointer',
                        }}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Document import review */}
              {msg.role === 'assistant' && msg.importActions && msg.importActions.length > 0 && (
                <DocumentImportReview
                  actions={msg.importActions}
                  applyState={{
                    phase: msg.importApplyState?.phase ?? 'idle',
                    appliedActionIds: new Set(msg.importApplyState?.appliedActionIds ?? []),
                    failedActionIds: new Set(msg.importApplyState?.failedActionIds ?? []),
                  }}
                  onApply={selected => handleApplyImport(idx, selected)}
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
        <div style={s.inputArea}>
          <DocumentUploadButton
            disabled={loading}
            onSubmit={handleDocumentImport}
            onError={msg => setApiError(msg)}
          />
          <textarea
            ref={textareaRef}
            rows={2}
            style={s.textarea}
            placeholder="Ask about your campaign… (Enter to send, Shift+Enter for newline)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            style={{ ...s.sendBtn, opacity: loading || !input.trim() ? 0.5 : 1 }}
            onClick={sendMessage}
            disabled={loading || !input.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </>
  );
}
