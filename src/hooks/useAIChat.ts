import { useState, useRef, useEffect } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { useToast } from '../context/ToastContext';
import useLocalStorage from './useLocalStorage';
import type {
  Session, PlayerCharacter, NPC, Location,
  Faction, Hook, LoreEntry, Module, MonsterStatblock,
  SessionInsert, PlayerCharacterInsert, NPCInsert, LocationInsert,
  FactionInsert, HookInsert, LoreEntryInsert, ModuleInsert,
  MonsterStatblockInsert,
} from '../lib/database.types';
import { submitDocument, type ImportAction, type DocumentInput, lookupExistingEntity, stripInternalFields } from '../lib/documentImport';
import { formatCampaignContext } from '../lib/campaignContext';
import { getAIProvider, setAIProvider, type AIProvider } from '../lib/aiProvider';
import { authHeaders } from '../lib/apiClient';

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

export interface ImportApplyState {
  phase: 'idle' | 'pending_confirmation' | 'applying' | 'done';
  appliedActionIds: string[];
  failedActionIds: string[];
}

export type ChatMessage =
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      isExtracting?: boolean;
      extractingLabel?: string;
      pendingActions?: PendingAction[];
      importActions?: ImportAction[];
      importApplyState?: ImportApplyState;
      autoApplied?: boolean;
      proposalTitle?: string;
      proposalSource?: string;
      proposalTimestamp?: number;
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

// ── Hook ──────────────────────────────────────────────────────────────────

export function useAIChat() {
  const campaign = useCampaign();
  const { sessions, pcs, npcs, locations, factions, hooks, lore, modules, monsterStatblocks, overview } = campaign;
  const toast = useToast();

  const [messages, setMessages] = useLocalStorage<ChatMessage[]>('ai-chat-messages', []);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [pendingDocument, setPendingDocument] = useState<DocumentInput | null>(null);
  const [aiProvider, setAiProvider] = useState<AIProvider>(getAIProvider);
  const importPlaceholderRef = useRef<number>(-1);
  const abortControllerRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // On mount, reset any messages stuck in 'applying' phase (e.g. from a page refresh mid-apply)
  useEffect(() => {
    setMessages(prev => prev.map(m => {
      if (m.role !== 'assistant') return m;
      if (m.importApplyState?.phase === 'applying') {
        return { ...m, importApplyState: { ...m.importApplyState, phase: 'idle' as const } };
      }
      return m;
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

  async function sendMessage() {
    const hasText = !!input.trim();
    const hasDoc = !!pendingDocument;
    if ((!hasText && !hasDoc) || loading) return;
    setApiError('');

    if (hasDoc) {
      const doc = pendingDocument;
      const instructions = input.trim();
      setPendingDocument(null);
      setInput('');
      handleDocumentImport(doc, instructions);
      return;
    }

    const userPrompt = input.trim();
    const userMsg: ChatMessage = { role: 'user', content: userPrompt };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    const systemPrompt = buildSystemPrompt({
      sessions, pcs, npcs, locations, factions, hooks, lore, modules, monsterStatblocks,
      overviewTitle: overview.title,
      overviewPlot: overview.plotSummary,
    });

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

    function stripJsonBlocks(text: string): string {
      let result = text.replace(/```json[\s\S]*?```/g, '');
      result = result.replace(/```json[\s\S]*$/, '');
      return result.trim();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

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
            const displayText = stripJsonBlocks(fullText);
            setMessages(prev => prev.map((m, i) =>
              i === streamingIdx ? { ...m, content: displayText } : m
            ));
          } else if (event.type === 'error') {
            throw new Error(event.message ?? 'Stream error');
          }
        }
      }

      const parsedActions = parseActions(fullText);
      const displayText = stripJsonBlocks(fullText);

      if (parsedActions.length > 0) {
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

        setMessages(prev => prev.map((m, i) =>
          i === streamingIdx
            ? {
                role: 'assistant' as const,
                content: displayText || `I'd like to make ${parsedActions.length} change${parsedActions.length === 1 ? '' : 's'} to your campaign:`,
                autoApplied: true,
                pendingActions: parsedActions,
                importActions,
                importApplyState: { phase: 'pending_confirmation', appliedActionIds: [], failedActionIds: [] },
                proposalTitle: userPrompt.length > 60 ? userPrompt.slice(0, 57) + '…' : userPrompt,
                proposalSource: 'Ask Campaign Assistant',
                proposalTimestamp: Date.now(),
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

  async function applyConfirmedActions(msgIdx: number) {
    const msg = messages[msgIdx];
    if (!msg || msg.role !== 'assistant' || !msg.importActions) return;

    const importActions = msg.importActions;
    const chatActions = msg.pendingActions;

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
          const action = importActions[ai];
          const existing = lookupExistingEntity(campaign, action.type, action.matched_id);
          const payload = existing
            ? { ...stripInternalFields(existing), ...(action.payload as Record<string, unknown>), id: action.matched_id }
            : { ...(action.payload as Record<string, unknown>) };
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

  async function handleDocumentImport(docInput: DocumentInput, userInstructions?: string) {
    setApiError('');

    const label = docInput.kind === 'gdocs-url'
      ? 'Imported Google Doc'
      : `Uploaded ${docInput.filename ?? 'document'}`;
    const userContent = userInstructions
      ? `📄 ${label}\n${userInstructions}`
      : `📄 ${label}`;
    const userMsg: ChatMessage = { role: 'user', content: userContent };

    setMessages(prev => {
      importPlaceholderRef.current = prev.length + 1;
      return [...prev, userMsg, { role: 'assistant', content: '' }];
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
        aiProvider,
      );

      if (actions.length > 0) {
        const filename = docInput.kind === 'gdocs-url' ? 'Google Doc' : (docInput.filename ?? 'document');
        const title = userInstructions
          ? (userInstructions.length > 60 ? userInstructions.slice(0, 57) + '…' : userInstructions)
          : `Import ${filename}`;
        updatePlaceholder(m => ({
          ...m,
          isExtracting: false,
          importActions: actions,
          importApplyState: { phase: 'pending_confirmation', appliedActionIds: [], failedActionIds: [] },
          proposalTitle: title,
          proposalSource: filename,
          proposalTimestamp: Date.now(),
        }));
      } else {
        updatePlaceholder(m => ({
          ...m,
          isExtracting: false,
          content: (m.content ? m.content + '\n\n' : '') +
            'No changes were extracted. The document may have been too large for a single pass, or the extraction timed out. Try uploading again, or break the document into smaller sections.',
        }));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
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
        const existing = lookupExistingEntity(campaign, action.type, action.matched_id);
        const payload = existing
          ? { ...stripInternalFields(existing), ...(action.payload as Record<string, unknown>), id: action.matched_id }
          : { ...(action.payload as Record<string, unknown>) };

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
      }

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

  // Count messages with unresolved import proposals (not yet applied or dismissed)
  const pendingProposalCount = messages.reduce((count, m) => {
    if (m.role !== 'assistant') return count;
    if (!m.importActions?.length) return count;
    if (m.importApplyState?.phase === 'done') return count;
    return count + m.importActions.length;
  }, 0);

  return {
    messages,
    input,
    setInput,
    loading,
    apiError,
    setApiError,
    pendingDocument,
    setPendingDocument,
    aiProvider,
    toggleProvider,
    sendMessage,
    stopGeneration,
    clearMessages,
    applyConfirmedActions,
    dismissConfirmedActions,
    handleApplyImport,
    dismissImportActions,
    handleKeyDown,
    bottomRef,
    textareaRef,
    pendingProposalCount,
  };
}
