import { useState, useRef, useEffect } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { useToast } from '../context/ToastContext';
import useLocalStorage from '../hooks/useLocalStorage';
import type {
  Session, PlayerCharacter, NPC, Location,
  Faction, Hook, LoreEntry, Module, MonsterStatblock,
  SessionInsert, PlayerCharacterInsert, NPCInsert, LocationInsert,
  FactionInsert, HookInsert, LoreEntryInsert, ModuleInsert,
  MonsterStatblockInsert,
} from '../lib/database.types';
import { submitDocument, type ImportAction, type DocumentInput, entityMeta, describeAction } from '../lib/documentImport';
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

interface ImportApplyState {
  phase: 'idle' | 'pending_confirmation' | 'applying' | 'done';
  appliedActionIds: string[];
  failedActionIds: string[];
}

type ChatMessage =
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      isExtracting?: boolean;
      extractingLabel?: string; // e.g. "Extracting characters (1/4)..."
      pendingActions?: PendingAction[];
      importActions?: ImportAction[];
      importApplyState?: ImportApplyState;
      autoApplied?: boolean; // true when actions were auto-applied (user gave instructions)
    };

// ── Helpers ────────────────────────────────────────────────────────────────

function pendingActionToImportType(a: PendingAction): ImportAction['type'] {
  switch (a.type) {
    case 'upsertSession':   return 'upsertSession';
    case 'upsertNPC':       return 'upsertNPC';
    case 'upsertPC':        return 'upsertPC';
    case 'upsertLocation':  return 'upsertLocation';
    case 'upsertFaction':   return 'upsertFaction';
    case 'upsertHook':      return 'upsertHook';
    case 'upsertLore':      return 'upsertLore';
    case 'upsertModule':    return 'upsertModule';
    case 'upsertMonsterStatblock': return 'upsertMonsterStatblock';
    // Delete actions don't have ImportAction equivalents — map to closest upsert for display
    case 'deleteSession':   return 'upsertSession';
    case 'deleteNPC':       return 'upsertNPC';
    case 'deletePC':        return 'upsertPC';
    case 'deleteLocation':  return 'upsertLocation';
    case 'deleteFaction':   return 'upsertFaction';
    case 'deleteHook':      return 'upsertHook';
    case 'deleteLore':      return 'upsertLore';
    case 'deleteModule':    return 'upsertModule';
    case 'deleteMonsterStatblock': return 'upsertMonsterStatblock';
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
  monsterStatblocks: MonsterStatblock[];
  overviewTitle: string;
  overviewPlot: string;
}): string {
  return `You are a D&D campaign assistant. You help the DM organize campaign data by creating/updating/deleting records.

${formatCampaignContext(data)}

== CRITICAL RULES ==

1. When the DM asks you to create, update, or change campaign data, you MUST respond with:
   - 1-2 SHORT sentences saying what you're doing
   - IMMEDIATELY followed by a \`\`\`json code block with an array of actions
   This is MANDATORY. Never skip the JSON block when changes are requested.

2. Your JSON actions ARE automatically applied to the database. You CAN and DO make changes. NEVER say "I can't execute", "you'll need to manually", "copy/paste", or "let me do that now". Just output the JSON block and it happens.

3. Do NOT ask follow-up questions before making changes. Do NOT ask what to prioritize. Just do everything the DM asked for in one response.

4. Do NOT write long summaries, bullet lists, or explanations. The user sees a preview table. Keep text minimal.

5. You can ONLY work with data from the conversation and the campaign data above. If the DM references an uploaded document, the document import system handles that separately — do not pretend to parse a document you cannot see.

6. If the DM is just asking a question (not requesting changes), respond normally without JSON.

== ACTION FORMAT ==

Upsert (include "id" to update existing, omit for new):
  { "type": "upsertNPC", "payload": { "name": "...", "role": "...", "affiliation": "...", "status": "active|deceased|unknown", "description": "...", "hooks_motivations": "...", "dm_notes": "...", "location": "...", "first_session": null } }
  { "type": "upsertSession", "payload": { "session_number": 1, "session_date": "2024-01-01", "summary": "...", "combats": "...", "loot_rewards": "...", "hooks_notes": "...", "dm_notes": "..." } }
  { "type": "upsertPC", "payload": { "character_name": "...", "player_name": "...", "race": "...", "class": "...", "background": "...", "story_hooks": "...", "key_npcs": "...", "dm_notes": "...", "is_active": true } }
  { "type": "upsertLocation", "payload": { "name": "...", "region": "...", "location_type": "city|town|dungeon|faction_hq|landmark", "population": "...", "status": "...", "history": "...", "description": "...", "dm_notes": "..." } }
  { "type": "upsertFaction", "payload": { "name": "...", "faction_type": "...", "overview": "...", "key_figures": "...", "agenda": "...", "dm_notes": "..." } }
  { "type": "upsertHook", "payload": { "title": "...", "category": "main_plot|side_quest|character_arc|faction", "description": "...", "last_updated_session": null, "is_active": true, "dm_only_notes": "..." } }
  { "type": "upsertLore", "payload": { "title": "...", "category": "history|artifact|creature|magic|religion", "content": "...", "dm_only": false } }
  { "type": "upsertModule", "payload": { "chapter": "1", "title": "...", "synopsis": "...", "status": "planned|active|completed", "played_session": null, "encounters": "...", "rewards": "...", "dm_notes": "..." } }
  { "type": "upsertMonsterStatblock", "payload": { "name": "...", "creature_type": "Medium humanoid", "challenge_rating": "5", "armor_class": 15, "ac_descriptor": "chain shirt", "hit_points": 65, "hit_dice": "10d8+20", "speed": "30 ft.", "str": 16, "dex": 14, "con": 14, "int": 10, "wis": 12, "cha": 8, "saving_throws": "Str +6, Con +5", "skills": "Athletics +6", "damage_immunities": null, "damage_resistances": null, "condition_immunities": null, "senses": "passive Perception 11", "languages": "Common", "content": "### Traits\\n**Brave.** Advantage on saves vs frightened.\\n\\n### Actions\\n**Multiattack.** Two longsword attacks.\\n\\n**Longsword.** +6 to hit, 1d8+3 slashing.", "dm_notes": "...", "tags": "humanoid, soldier" } }

Delete: { "type": "deleteNPC", "id": "<id>", "label": "<name>" } (same for deleteSession, deletePC, deleteLocation, deleteFaction, deleteHook, deleteLore, deleteModule, deleteMonsterStatblock)

Always use existing record IDs when updating. Only include fields you want to set.`;
}

// ── Compact progress table for auto-applied imports ──────────────────────

const badgeColors: Record<string, { bg: string; text: string; border: string }> = {
  gold:   { bg: '#2a2418', text: '#c9a84c', border: '#5a4a20' },
  green:  { bg: '#1a2a1a', text: '#6ab87a', border: '#2a5a2a' },
  red:    { bg: '#3a1a1a', text: '#e05c5c', border: '#6a2a2a' },
  blue:   { bg: '#1a2a3a', text: '#70a0e0', border: '#2a4a7a' },
  muted:  { bg: '#1a1828', text: '#9990b0', border: '#3a3660' },
  yellow: { bg: '#2a2a1a', text: '#d0c060', border: '#6a6020' },
  orange: { bg: '#3a2010', text: '#e09050', border: '#7a4a20' },
};

function ImportProgressTable({ actions, appliedIds, failedIds, phase, onApply, onDismiss }: {
  actions: ImportAction[];
  appliedIds: Set<string>;
  failedIds: Set<string>;
  phase: 'pending_confirmation' | 'applying' | 'done';
  onApply?: () => void;
  onDismiss?: () => void;
}) {
  const doneCount = appliedIds.size + failedIds.size;
  return (
    <div style={{ marginTop: '12px', borderTop: '1px solid #3a3660', paddingTop: '10px' }}>
      <div style={{ fontSize: '11px', color: '#9990b0', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {phase === 'pending_confirmation' ? (
          <>Proposed {actions.length} change{actions.length === 1 ? '' : 's'}:</>
        ) : phase === 'applying' ? (
          <>Applying changes ({doneCount}/{actions.length})…</>
        ) : (
          <>Applied {appliedIds.size} of {actions.length} changes
            {failedIds.size > 0 && <span style={{ color: '#e05c5c' }}> ({failedIds.size} failed)</span>}
          </>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {actions.map(action => {
          const meta = entityMeta[action.type];
          const bc = badgeColors[meta.badgeColor] ?? badgeColors.muted;
          const applied = appliedIds.has(action.action_id);
          const failed = failedIds.has(action.action_id);
          const pending = !applied && !failed;
          return (
            <div
              key={action.action_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                opacity: pending && phase === 'applying' ? 0.5 : 1,
              }}
            >
              <span style={{ width: '16px', textAlign: 'center', fontSize: '11px', flexShrink: 0 }}>
                {applied ? '✓' : failed ? '✕' : '·'}
              </span>
              <span
                style={{
                  display: 'inline-block',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontSize: '10px',
                  fontWeight: 600,
                  backgroundColor: bc.bg,
                  color: bc.text,
                  border: `1px solid ${bc.border}`,
                  flexShrink: 0,
                }}
              >
                {meta.label}
              </span>
              <span style={{
                color: applied ? '#6ab87a' : failed ? '#e05c5c' : '#e8d5b0',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {describeAction(action)}
              </span>
            </div>
          );
        })}
      </div>
      {phase === 'pending_confirmation' && onApply && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          <button
            onClick={onApply}
            style={{
              backgroundColor: '#c9a84c',
              color: '#0f0e17',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Apply changes
          </button>
          {onDismiss && (
            <button
              onClick={onDismiss}
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
          )}
        </div>
      )}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AIAssistant({ open, onClose }: Props) {
  const campaign = useCampaign();
  const { sessions, pcs, npcs, locations, factions, hooks, lore, modules, monsterStatblocks, overview } = campaign;
  const toast = useToast();

  const [messages, setMessages] = useLocalStorage<ChatMessage[]>('ai-chat-messages', []);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [pendingDocument, setPendingDocument] = useState<DocumentInput | null>(null);
  const importPlaceholderRef = useRef<number>(-1);
  const abortControllerRef = useRef<AbortController | null>(null);
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

  function stopGeneration() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
  }

  async function sendMessage() {
    const hasText = !!input.trim();
    const hasDoc = !!pendingDocument;
    if ((!hasText && !hasDoc) || loading) return;
    setApiError('');

    // If a document is attached, route to the document import flow
    if (hasDoc) {
      const doc = pendingDocument;
      const instructions = input.trim();
      setPendingDocument(null);
      setInput('');
      handleDocumentImport(doc, instructions);
      return;
    }

    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    const systemPrompt = buildSystemPrompt({
      sessions, pcs, npcs, locations, factions, hooks, lore, modules, monsterStatblocks,
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

    // Strip JSON code blocks from displayed text in real-time
    function stripJsonBlocks(text: string): string {
      // Remove complete ```json...``` blocks
      let result = text.replace(/```json[\s\S]*?```/g, '');
      // Also remove an in-progress ```json block at the end (partial, no closing ```)
      result = result.replace(/```json[\s\S]*$/, '');
      return result.trim();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, system: systemPrompt }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';

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
            // Show text with JSON blocks stripped in real-time
            const displayText = stripJsonBlocks(fullText);
            setMessages(prev => prev.map((m, i) =>
              i === streamingIdx ? { ...m, content: displayText } : m
            ));
          } else if (event.type === 'error') {
            throw new Error(event.message ?? 'Stream error');
          }
        }
      }

      // Extract and auto-apply actions from JSON block
      const parsedActions = parseActions(fullText);
      const displayText = stripJsonBlocks(fullText);

      if (parsedActions.length > 0) {
        // Convert PendingActions to ImportAction-like format for the progress table
        const importActions: ImportAction[] = parsedActions.map((a, i) => {
          const isDelete = a.type.startsWith('delete');
          const payload = isDelete
            ? { name: (a as { label?: string }).label ?? '(unknown)' }
            : (a as { payload: Record<string, unknown> }).payload;
          const matchedId = isDelete
            ? (a as { id?: string }).id ?? null
            : ((payload as Record<string, unknown>).id as string) ?? null;
          return {
            action_id: `chat-${Date.now()}-${i}`,
            type: pendingActionToImportType(a),
            matched_id: matchedId,
            reasoning: '',
            payload,
          };
        }) as ImportAction[];

        // Show preview table and wait for user confirmation
        setMessages(prev => prev.map((m, i) =>
          i === streamingIdx
            ? {
                role: 'assistant' as const,
                content: displayText || `I'd like to make ${parsedActions.length} change${parsedActions.length === 1 ? '' : 's'} to your campaign:`,
                autoApplied: true,
                pendingActions: parsedActions,
                importActions,
                importApplyState: { phase: 'pending_confirmation', appliedActionIds: [], failedActionIds: [] },
              }
            : m
        ));
      } else {
        setMessages(prev => prev.map((m, i) =>
          i === streamingIdx
            ? { role: 'assistant' as const, content: displayText }
            : m
        ));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User stopped generation — keep whatever was streamed so far
        const displayText = stripJsonBlocks(fullText);
        setMessages(prev => prev.map((m, i) =>
          i === streamingIdx
            ? { role: 'assistant' as const, content: displayText || '(Stopped)' }
            : m
        ));
      } else {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && !last.content) {
            return [...prev.slice(0, -1), { role: 'assistant' as const, content: `Error: ${msg}` }];
          }
          return [...prev, { role: 'assistant' as const, content: `Error: ${msg}` }];
        });
      }
    } finally {
      abortControllerRef.current = null;
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

  // ── Apply confirmed actions (called when user clicks "Apply changes") ────
  // Handles both chat flow (pendingActions) and document import flow (importActions only)

  async function applyConfirmedActions(msgIdx: number) {
    const msg = messages[msgIdx];
    if (!msg || msg.role !== 'assistant' || !msg.importActions) return;

    const importActions = msg.importActions;
    const chatActions = msg.pendingActions; // present for chat flow, absent for doc import

    // Transition to applying
    setMessages(prev => prev.map((m, i) =>
      i === msgIdx && m.role === 'assistant'
        ? { ...m, importApplyState: { phase: 'applying' as const, appliedActionIds: [], failedActionIds: [] } }
        : m
    ));

    const applied: string[] = [];
    const failed: string[] = [];

    for (let ai = 0; ai < importActions.length; ai++) {
      const actionId = importActions[ai].action_id;
      try {
        if (chatActions && chatActions[ai]) {
          // Chat flow: use PendingAction which has the right shape for campaign methods
          const action = chatActions[ai];
          switch (action.type) {
            case 'upsertSession':   await campaign.upsertSession(action.payload); break;
            case 'upsertNPC':       await campaign.upsertNPC(action.payload); break;
            case 'upsertPC':        await campaign.upsertPC(action.payload); break;
            case 'upsertLocation':  await campaign.upsertLocation(action.payload); break;
            case 'upsertFaction':   await campaign.upsertFaction(action.payload); break;
            case 'upsertHook':      await campaign.upsertHook(action.payload); break;
            case 'upsertLore':      await campaign.upsertLore(action.payload); break;
            case 'upsertModule':    await campaign.upsertModule(action.payload); break;
            case 'upsertMonsterStatblock': await campaign.upsertMonsterStatblock(action.payload); break;
            case 'deleteSession':   await campaign.deleteSession(action.id); break;
            case 'deleteNPC':       await campaign.deleteNPC(action.id); break;
            case 'deletePC':        await campaign.deletePC(action.id); break;
            case 'deleteLocation':  await campaign.deleteLocation(action.id); break;
            case 'deleteFaction':   await campaign.deleteFaction(action.id); break;
            case 'deleteHook':      await campaign.deleteHook(action.id); break;
            case 'deleteLore':      await campaign.deleteLore(action.id); break;
            case 'deleteModule':    await campaign.deleteModule(action.id); break;
            case 'deleteMonsterStatblock': await campaign.deleteMonsterStatblock(action.id); break;
          }
        } else {
          // Document import flow: use ImportAction, merge matched_id → payload.id
          const action = importActions[ai];
          const payload = { ...(action.payload as Record<string, unknown>) };
          if (action.matched_id) payload.id = action.matched_id;
          switch (action.type) {
            case 'upsertSession':      await campaign.upsertSession(payload as Parameters<typeof campaign.upsertSession>[0]); break;
            case 'upsertPC':           await campaign.upsertPC(payload as Parameters<typeof campaign.upsertPC>[0]); break;
            case 'upsertNPC':          await campaign.upsertNPC(payload as Parameters<typeof campaign.upsertNPC>[0]); break;
            case 'upsertLocation':     await campaign.upsertLocation(payload as Parameters<typeof campaign.upsertLocation>[0]); break;
            case 'upsertFaction':      await campaign.upsertFaction(payload as Parameters<typeof campaign.upsertFaction>[0]); break;
            case 'upsertHook':         await campaign.upsertHook(payload as Parameters<typeof campaign.upsertHook>[0]); break;
            case 'upsertLore':         await campaign.upsertLore(payload as Parameters<typeof campaign.upsertLore>[0]); break;
            case 'upsertModule':       await campaign.upsertModule(payload as Parameters<typeof campaign.upsertModule>[0]); break;
            case 'upsertSubmodule':    await campaign.upsertSubmodule(payload as Parameters<typeof campaign.upsertSubmodule>[0]); break;
            case 'upsertScene':        await campaign.upsertScene(payload as Parameters<typeof campaign.upsertScene>[0]); break;
            case 'upsertRelationship': await campaign.upsertRelationship(payload as Parameters<typeof campaign.upsertRelationship>[0]); break;
            case 'upsertMonsterStatblock': await campaign.upsertMonsterStatblock(payload as Parameters<typeof campaign.upsertMonsterStatblock>[0]); break;
          }
        }
        applied.push(actionId);
      } catch {
        failed.push(actionId);
      }
      setMessages(prev => prev.map((m, i) =>
        i === msgIdx && m.role === 'assistant'
          ? { ...m, importApplyState: { phase: 'applying' as const, appliedActionIds: [...applied], failedActionIds: [...failed] } }
          : m
      ));
    }

    // Final state
    setMessages(prev => prev.map((m, i) =>
      i === msgIdx && m.role === 'assistant'
        ? { ...m, pendingActions: undefined, importApplyState: { phase: 'done' as const, appliedActionIds: [...applied], failedActionIds: [...failed] } }
        : m
    ));

    if (failed.length === 0 && applied.length > 0) toast(`Applied ${applied.length} change${applied.length === 1 ? '' : 's'}`, 'success');
    else if (failed.length > 0) toast(`Applied ${applied.length}, ${failed.length} failed`, 'error');
  }

  function dismissConfirmedActions(msgIdx: number) {
    setMessages(prev => prev.map((m, i) =>
      i === msgIdx && m.role === 'assistant'
        ? { ...m, pendingActions: undefined, importActions: undefined, importApplyState: undefined }
        : m
    ));
  }

  // ── Document import ──────────────────────────────────────────────────────

  async function handleDocumentImport(docInput: DocumentInput, userInstructions?: string) {
    setApiError('');

    const label = docInput.kind === 'gdocs-url'
      ? 'Imported Google Doc'
      : `Uploaded ${docInput.filename ?? 'document'}`;
    const userContent = userInstructions
      ? `📄 ${label}\n${userInstructions}`
      : `📄 ${label}`;
    const userMsg: ChatMessage = { role: 'user', content: userContent };

    // Use a ref to track the placeholder index — avoids stale closure issues
    setMessages(prev => {
      importPlaceholderRef.current = prev.length + 1;
      return [...prev, userMsg, { role: 'assistant', content: '' }];
    });
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Helper to update the placeholder message by ref
    function updatePlaceholder(updater: (m: ChatMessage & { role: 'assistant' }) => ChatMessage) {
      setMessages(prev => prev.map((m, i) => {
        if (i !== importPlaceholderRef.current || m.role !== 'assistant') return m;
        return updater(m as ChatMessage & { role: 'assistant' });
      }));
    }

    try {
      const ctx = formatCampaignContext({
        sessions, pcs, npcs, locations, factions, hooks, lore, modules, monsterStatblocks,
        overviewTitle: overview.title,
        overviewPlot: overview.plotSummary,
      });

      const { actions } = await submitDocument(
        docInput,
        ctx,
        userInstructions,
        (chunk) => {
          updatePlaceholder(m => ({ ...m, content: m.content + chunk }));
        },
        () => {
          updatePlaceholder(m => ({ ...m, isExtracting: true }));
        },
        (pass) => {
          updatePlaceholder(m => ({
            ...m,
            isExtracting: true,
            extractingLabel: `Extracting ${pass.label} (${pass.index + 1}/${pass.total})...`,
          }));
        },
        controller.signal,
      );

      if (actions.length > 0) {
        // Show full review cards so user can pick which changes to apply
        updatePlaceholder(m => ({
          ...m,
          isExtracting: false,
          importActions: actions,
          importApplyState: { phase: 'pending_confirmation', appliedActionIds: [], failedActionIds: [] },
        }));
      } else {
        // No actions extracted — likely a timeout or empty parse
        updatePlaceholder(m => ({
          ...m,
          isExtracting: false,
          content: (m.content ? m.content + '\n\n' : '') +
            'No changes were extracted. The document may have been too large for a single pass, or the extraction timed out. Try uploading again, or break the document into smaller sections.',
        }));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User stopped — keep whatever was streamed so far
        updatePlaceholder(m => ({
          ...m,
          isExtracting: false,
          content: m.content || '(Stopped)',
        }));
      } else {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        updatePlaceholder(() => ({ role: 'assistant', content: `Error importing document: ${msg}` }));
      }
    } finally {
      abortControllerRef.current = null;
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
          case 'upsertMonsterStatblock':
            await campaign.upsertMonsterStatblock(payload as Parameters<typeof campaign.upsertMonsterStatblock>[0]);
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
              onClick={() => { setMessages([]); }}
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
