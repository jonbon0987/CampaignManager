// An AssistantBackend is everything the Workbench/useAIChat orchestrator needs
// that differs between scopes. The campaign backend works over CampaignContext;
// the world backend works over WorldContext. The UI, streaming, staging tray,
// and commit loop are identical for both — only the prompt, the entity lookup,
// and the write path change.

import { useEffect, useRef } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { useWorld } from '../context/WorldContext';
import { formatCampaignContext } from '../lib/campaignContext';
import { SUBMODULE_TYPES, SCENE_TYPES } from '../lib/moduleStructure';
import {
  lookupExistingEntity, stripInternalFields,
  type ImportAction, type ImportActionType,
} from '../lib/documentImport';
import { normalizeAssistantPayload } from '../lib/assistantNormalize';
import type { PendingAction } from './useAIChat';
import type { WorldTimelineEvent } from '../types/world';

export interface AssistantBackend {
  /** Header title, e.g. "Campaign Assistant". */
  title: string;
  /** Header subtitle line under the title. */
  subtitle: string;
  /** Noun for toasts/tray copy: "campaign" | "world". */
  scopeNoun: string;
  /** Which document-extraction pass set + prompt vocabulary the server uses. */
  scope: 'campaign' | 'world';
  /** localStorage namespace so scopes keep separate threads + trays. */
  storageKey: string;
  /** Whether the composer offers document attachment. */
  supportsDocuments: boolean;
  /** Composer placeholder text. */
  composerPlaceholder: string;
  /** Empty-state sample prompts. */
  samples: { glyph: string; text: string }[];
  /** Full system prompt (entity listing + action catalog + rules). */
  buildSystemPrompt: () => string;
  /** Entity listing for document import (campaign only today). */
  formatContext: () => string;
  /** The existing record a proposed action would touch, for diffs + merge. */
  lookupExisting: (type: ImportActionType, id: string | null) => Record<string, unknown> | null;
  /** Apply a chat-authored action (may be a delete) exactly as written. */
  applyChatAction: (action: PendingAction) => Promise<void>;
  /** Apply an import/chat-upsert action, merging onto the existing record. */
  applyImportAction: (action: ImportAction) => Promise<void>;
}

// ── Campaign backend ───────────────────────────────────────────────────────

export function useCampaignAssistantBackend(): AssistantBackend {
  const campaign = useCampaign();
  const {
    sessions, pcs, npcs, locations, factions, hooks, lore, modules,
    submodules, scenes, monsterStatblocks, overview, loadModuleTree,
  } = campaign;

  // Submodules and scenes are otherwise loaded one branch at a time by the
  // module screens. The assistant has to see the whole tree — both to avoid
  // proposing a section that already exists and to hang new scenes off the
  // right submodule — so pull it in campaign-wide once the campaign is up.
  const selectedCampaignId = campaign.selectedCampaign?.id ?? null;
  useEffect(() => {
    if (selectedCampaignId) void loadModuleTree();
  }, [selectedCampaignId, loadModuleTree]);

  // Names the assistant gives records it is creating right now, mapped to the
  // ids they got once committed. This outlives a single commit on purpose: the
  // DM can commit the submodule cards, look them over, and commit the scene
  // cards afterwards — the scenes still find their parents.
  const refIds = useRef(new Map<string, string>());

  // Highest sort_order handed out per parent. The commit loop writes card after
  // card without React re-rendering in between, so the sibling count read off
  // context is stale for every write after the first — three submodules
  // committed in one click would all claim slot N. The cursor keeps them in the
  // order the assistant wrote them, and yields to context once it catches up.
  const orderCursor = useRef(new Map<string, number>());

  function nextOrder(parentId: string, siblingCount: number): number {
    const cursor = orderCursor.current.get(parentId);
    const next = cursor == null ? siblingCount : Math.max(cursor + 1, siblingCount);
    orderCursor.current.set(parentId, next);
    return next;
  }

  function formatContext(): string {
    return formatCampaignContext({
      sessions, pcs, npcs, locations, factions, hooks, lore, modules,
      submodules, scenes, monsterStatblocks,
      overviewTitle: overview.title,
      overviewPlot: overview.plotSummary,
    });
  }

  function buildSystemPrompt(): string {
    return `You are a D&D campaign assistant. You help the DM organize campaign data by creating/updating/deleting records.

${formatContext()}

== CRITICAL RULES ==

1. When the DM asks you to create, update, or change campaign data, you MUST respond with:
   - 1-2 SHORT sentences saying what you're doing
   - IMMEDIATELY followed by a \`\`\`json code block with an array of actions
   This is MANDATORY. Never skip the JSON block when changes are requested.

2. Your JSON actions are staged for the DM in a review tray, where they pick what to keep and commit. So propose freely and completely — but never claim a change is saved or live. Say what you are drafting, not what you have written to the campaign. Never say "I can't execute", "you'll need to manually", or "copy/paste".

3. Do NOT ask follow-up questions before making changes. Do NOT ask what to prioritize. Just do everything the DM asked for in one response.

4. Do NOT write long summaries, bullet lists, or explanations. The DM sees every change as a card with a full diff. Keep text minimal — the ONLY exception is the capture recap described below.

5. You can ONLY work with data from the conversation and the campaign data above. If the DM references an uploaded document, the document import system handles that separately — do not pretend to parse a document you cannot see.

6. If the DM is just asking a question (not requesting changes), respond normally without JSON.

7. When the DM pastes session notes, a recap, or any block of prose to log, treat it as source material to mine EXHAUSTIVELY. Sweep the entire text and propose an action for EVERY named NPC, location, faction, item of note, and EVERY plot thread or unresolved hook it mentions — not just the prominent ones. A recap that names ten NPCs should yield ten NPCs, not a representative few; a scene that leaves three threads dangling should yield three hooks. Skimming or sampling is a failure mode here: err toward including a minor, briefly-mentioned entity over silently dropping it. Before you finish, re-scan the notes once specifically for (a) proper names you have not yet emitted an action for, and (b) unresolved questions, promises, threats, or "to be continued" beats that are threads. This is a single pass — do everything in this one response; do not wait to be asked again.

== CAPTURE RECAP ==

After the JSON, when you extracted entities from pasted notes or a recap, end with a short recap so the DM can catch anything you missed at a glance. This is the one place a brief list is allowed. Keep it to 1-3 lines:
  - A count line by type, e.g. "Captured: 6 NPCs, 3 threads, 2 locations, 1 faction."
  - An "Unsure:" note for anything ambiguous — a possible duplicate, a name that might refer to an existing record, or a low-confidence guess. e.g. "Unsure: is \"the Pale Warden\" the same as Sir Aldric [existing NPC]?"
  - A "Left out:" note for anything you deliberately did NOT log and why, e.g. "Left out: the unnamed barkeep, an offhand rumor with no detail."
Omit any of these three lines that do not apply. Skip the recap entirely for single-change requests, questions, or when no prose was mined.

== PLANS ==

When a request needs several distinct pieces of work (prepping a session, fleshing out a location and its cast, building an encounter and its statblocks), open your response with a \`\`\`plan block: a title line, then one "- " step per piece of work. Keep it to 3-6 steps, each a short phrase.

\`\`\`plan
Preparing Session 13
- Review Session 12 and open threads
- Draft the Sunken Vault scenes
- Stat the vault guardian
\`\`\`

Then tag each action in your JSON with "step": <the 1-based number of the plan step it belongs to>. The DM watches steps complete as your actions arrive, so emit actions in step order. Skip the plan block entirely for single-change or question-only responses.

== ACTION FORMAT ==

Every action carries three UI fields alongside its payload:
  "reasoning": one short sentence on why you are proposing this and, for updates, why you matched this record. The DM reads this.
  "confidence": 0 to 1, how sure you are. Be honest — the DM uses it to decide what to check. Above 0.85 = the request or campaign data states this plainly. 0.7-0.85 = you inferred part of it. Below 0.7 = you are filling a gap and the DM should look. Do not score everything high.
  "step": the plan step number, when you emitted a plan.

Upsert (to update an existing record, add an "id" field set to its id from the data above; omit "id" to create new):
  { "type": "upsertNPC", "reasoning": "...", "confidence": 0.9, "payload": { "name": "...", "role": "...", "affiliation": "...", "status": "active|deceased|unknown", "description": "...", "hooks_motivations": "...", "dm_notes": "...", "location": "...", "first_session": null } }
  { "type": "upsertSession", "reasoning": "...", "confidence": 0.9, "payload": { "session_number": 1, "session_date": "2024-01-01", "summary": "...", "combats": "...", "loot_rewards": "...", "hooks_notes": "...", "dm_notes": "..." } }
  { "type": "upsertPC", "reasoning": "...", "confidence": 0.9, "payload": { "character_name": "...", "player_name": "...", "race": "...", "class": "...", "background": "...", "story_hooks": "...", "key_npcs": "...", "dm_notes": "...", "is_active": true } }
  { "type": "upsertLocation", "reasoning": "...", "confidence": 0.9, "payload": { "name": "...", "region": "...", "location_type": "continent|city|town|dungeon|faction_hq|landmark", "population": "...", "status": "...", "history": "...", "description": "...", "dm_notes": "..." } }
  { "type": "upsertFaction", "reasoning": "...", "confidence": 0.9, "payload": { "name": "...", "faction_type": "...", "overview": "...", "key_figures": "...", "agenda": "...", "dm_notes": "..." } }
  { "type": "upsertHook", "reasoning": "...", "confidence": 0.9, "payload": { "title": "...", "category": "main_plot|side_quest|character_arc|faction", "description": "...", "last_updated_session": null, "is_active": true, "dm_only_notes": "..." } }
  { "type": "upsertLore", "reasoning": "...", "confidence": 0.9, "payload": { "title": "...", "category": "history|artifact|creature|magic|religion", "content": "...", "dm_only": false } }
  { "type": "upsertModule", "reasoning": "...", "confidence": 0.9, "payload": { "chapter": "1", "title": "...", "synopsis": "...", "status": "planned|active|completed", "played_session": null, "encounters": "...", "rewards": "...", "dm_notes": "..." } }
  { "type": "upsertSubmodule", "reasoning": "...", "confidence": 0.9, "payload": { "module_id": "<id of the parent module>", "ref": "a short name for this submodule, e.g. \\"vault\\"", "title": "...", "submodule_type": "${SUBMODULE_TYPES.join('|')}", "summary": "one line for the outline rail", "content": "the full write-up — several paragraphs the DM could run from cold", "dm_notes": "secrets, contingencies, what to do if the party skips it" } }
  { "type": "upsertScene", "reasoning": "...", "confidence": 0.9, "payload": { "submodule_ref": "vault", "title": "...", "scene_type": "${SCENE_TYPES.join('|')}", "summary": "the beat in a sentence", "content": "how to run it: the sensory hook, what the party faces, the checks or tactics, the outcomes that matter", "dm_notes": "hidden info, alternate outcomes, a fallback if it stalls" } }
  { "type": "upsertMonsterStatblock", "reasoning": "...", "confidence": 0.9, "payload": { "name": "...", "creature_type": "Medium humanoid", "challenge_rating": "5", "armor_class": 15, "ac_descriptor": "chain shirt", "hit_points": 65, "hit_dice": "10d8+20", "speed": "30 ft.", "str": 16, "dex": 14, "con": 14, "int": 10, "wis": 12, "cha": 8, "saving_throws": "Str +6, Con +5", "skills": "Athletics +6", "damage_immunities": null, "damage_resistances": null, "condition_immunities": null, "senses": "passive Perception 11", "languages": "Common", "content": "### Traits\\n**Brave.** Advantage on saves vs frightened.\\n\\n### Actions\\n**Multiattack.** Two longsword attacks.\\n\\n**Longsword.** +6 to hit, 1d8+3 slashing.", "dm_notes": "...", "tags": "humanoid, soldier" } }

Delete: { "type": "deleteNPC", "reasoning": "...", "confidence": 0.9, "id": "<id>", "label": "<name>" } (same for deleteSession, deletePC, deleteLocation, deleteFaction, deleteHook, deleteLore, deleteModule, deleteMonsterStatblock). There is no delete for submodules or scenes — the DM removes those from the module screen.

== BUILDING OUT A MODULE ==

A module is a chapter. Its submodules are the chunks of play it divides into (a location to explore, a heist, a negotiation, a journey, a set-piece); a submodule's scenes are the individual beats the DM runs at the table. The MODULES listing above shows the tree that already exists — submodules marked ▸, their scenes marked ·, each with its id.

When the DM asks you to break a module down, build out a chapter, or turn a synopsis into sections and scenes, propose the whole tree in one response: an upsertSubmodule for each section, and the upsertScene actions for its beats right after it. Aim for 3-6 submodules across the module's arc — the pull-in, the middle where it can go several ways, the resolution — and 2-4 scenes under each. Vary the types; a chapter that is eight fights in a row is a bad chapter. Write each section so the DM could run it off the page cold, and leave the players' choices open rather than scripting what they do.

PARENTS. Every submodule needs a parent module and every scene needs a parent submodule:
  - Pointing at something that already exists: use its real id from the listing above — "module_id" on a submodule, "submodule_id" on a scene.
  - Pointing at something you are creating in the SAME response: give the parent a "ref" (a short lowercase nickname, unique within your response), and have the child carry "module_ref" or "submodule_ref" set to that same string. Emit the parent action BEFORE its children.
  - Never invent a UUID. If you cannot find a real parent id and are not creating the parent yourself, do not emit the action.

Scenes are ordered as you emit them, so write each submodule's beats in the order they are most likely to come up. To UPDATE an existing submodule or scene, set "id" to its id from the listing (you can then omit the parent field).

Always use existing record IDs when updating. Only include fields you want to set. Example of updating an existing hook (note the real "id" copied from the data above):
  { "type": "upsertHook", "reasoning": "Merging tonight's developments into the existing Sunken Crown thread.", "confidence": 0.88, "payload": { "id": "1f2e3d4c-0000-0000-0000-000000000000", "description": "...merged/updated text..." } }

Before creating ANY record, scan the CURRENT CAMPAIGN DATA above for a record describing the same thing and reuse its id to update it instead of making a duplicate. This matters most for plot hooks: if the DM mentions a quest, storyline, or hook that resembles one already in HOOKS & IDEAS — even when the title is reworded, shortened, or phrased differently — set that hook's id and merge the new developments into its description. Only omit the id when the hook is a genuinely new storyline with no match above.`;
  }

  function lookupExisting(type: ImportActionType, id: string | null): Record<string, unknown> | null {
    if (!id) return null;
    return (lookupExistingEntity(campaign, type, id) as Record<string, unknown> | null) ?? null;
  }

  /**
   * Turn a submodule/scene payload's parent pointer into a real id. The parent
   * is either already in the campaign (a real id) or something the assistant
   * proposed earlier in the same batch and named with a "ref" — those ids land
   * in refIds as their cards commit.
   */
  function resolveParent(
    payload: Record<string, unknown>,
    idField: 'module_id' | 'submodule_id',
    refField: 'module_ref' | 'submodule_ref',
    noun: string,
  ): string {
    const direct = payload[idField];
    if (typeof direct === 'string' && direct.trim()) return direct.trim();

    const ref = payload[refField];
    if (typeof ref === 'string' && ref.trim()) {
      const resolved = refIds.current.get(ref.trim());
      if (resolved) return resolved;
      throw new Error(`its ${noun} ("${ref.trim()}") hasn't been committed yet — commit that card first`);
    }
    throw new Error(`no ${noun} was given`);
  }

  /** Remember the id a named record got, so its children can find it. */
  function rememberRef(payload: Record<string, unknown>, id: string | undefined) {
    const ref = payload.ref;
    if (id && typeof ref === 'string' && ref.trim()) refIds.current.set(ref.trim(), id);
  }

  /**
   * Write one submodule. `raw` is the payload as the assistant wrote it (the
   * only place the ref fields survive — normalizeAssistantPayload drops them,
   * since they aren't columns); `clean` is the column-safe version.
   *
   * Ordering appends below whatever the module already has, so a committed
   * card never lands on an existing sibling's slot.
   */
  async function writeSubmodule(clean: Record<string, unknown>, raw: Record<string, unknown>) {
    const existing = typeof clean.id === 'string'
      ? campaign.submodules.find(s => s.id === clean.id)
      : undefined;
    const moduleId = existing?.module_id
      ?? resolveParent(raw, 'module_id', 'module_ref', 'parent module');
    const saved = await campaign.upsertSubmodule({
      submodule_type: null, summary: null, content: null, dm_notes: null,
      linked_monster_ids: null, linked_encounter_ids: null,
      ...clean,
      // An update keeps its place in the rail; a new section appends below.
      sort_order: clean.sort_order ?? existing?.sort_order
        ?? nextOrder(moduleId, campaign.submodules.filter(s => s.module_id === moduleId).length),
      title: (typeof clean.title === 'string' && clean.title.trim()) || existing?.title || 'Untitled Submodule',
      module_id: moduleId,
    } as Parameters<typeof campaign.upsertSubmodule>[0]);
    rememberRef(raw, saved?.id ?? existing?.id);
  }

  async function writeScene(clean: Record<string, unknown>, raw: Record<string, unknown>) {
    const existing = typeof clean.id === 'string'
      ? campaign.scenes.find(s => s.id === clean.id)
      : undefined;
    const submoduleId = existing?.submodule_id
      ?? resolveParent(raw, 'submodule_id', 'submodule_ref', 'parent submodule');
    await campaign.upsertScene({
      scene_type: null, summary: null, content: null, dm_notes: null,
      linked_monster_ids: null,
      ...clean,
      sort_order: clean.sort_order ?? existing?.sort_order
        ?? nextOrder(submoduleId, campaign.scenes.filter(s => s.submodule_id === submoduleId).length),
      title: (typeof clean.title === 'string' && clean.title.trim()) || existing?.title || 'Untitled scene',
      submodule_id: submoduleId,
    } as Parameters<typeof campaign.upsertScene>[0]);
  }

  async function applyChatAction(rawAction: PendingAction): Promise<void> {
    const rawPayload = ('payload' in rawAction ? rawAction.payload : {}) as Record<string, unknown>;
    const action = ('payload' in rawAction
      ? { ...rawAction, payload: normalizeAssistantPayload(rawAction.type, rawAction.payload) }
      : rawAction) as PendingAction;
    switch (action.type) {
      case 'upsertSubmodule': await writeSubmodule(action.payload as unknown as Record<string, unknown>, rawPayload); break;
      case 'upsertScene':     await writeScene(action.payload as unknown as Record<string, unknown>, rawPayload); break;
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
  }

  async function applyImportAction(action: ImportAction): Promise<void> {
    const existing = lookupExistingEntity(campaign, action.type, action.matched_id);
    const merged = existing
      ? { ...stripInternalFields(existing), ...(action.payload as Record<string, unknown>), id: action.matched_id }
      : { ...(action.payload as Record<string, unknown>) };
    const payload = normalizeAssistantPayload(action.type, merged);
    switch (action.type) {
      // Same writers as the chat path, so an imported submodule/scene gets the
      // same parent resolution, sort-order append, and title fallback.
      case 'upsertSubmodule':    await writeSubmodule(payload as Record<string, unknown>, action.payload as Record<string, unknown>); break;
      case 'upsertScene':        await writeScene(payload as Record<string, unknown>, action.payload as Record<string, unknown>); break;
      case 'upsertSession':      await campaign.upsertSession(payload as Parameters<typeof campaign.upsertSession>[0]); break;
      case 'upsertPC':           await campaign.upsertPC(payload as Parameters<typeof campaign.upsertPC>[0]); break;
      case 'upsertNPC':          await campaign.upsertNPC(payload as Parameters<typeof campaign.upsertNPC>[0]); break;
      case 'upsertLocation':     await campaign.upsertLocation(payload as Parameters<typeof campaign.upsertLocation>[0]); break;
      case 'upsertFaction':      await campaign.upsertFaction(payload as Parameters<typeof campaign.upsertFaction>[0]); break;
      case 'upsertHook':         await campaign.upsertHook(payload as Parameters<typeof campaign.upsertHook>[0]); break;
      case 'upsertLore':         await campaign.upsertLore(payload as Parameters<typeof campaign.upsertLore>[0]); break;
      case 'upsertModule':       await campaign.upsertModule(payload as Parameters<typeof campaign.upsertModule>[0]); break;
      case 'upsertRelationship': await campaign.upsertRelationship(payload as Parameters<typeof campaign.upsertRelationship>[0]); break;
      case 'upsertMonsterStatblock': await campaign.upsertMonsterStatblock(payload as Parameters<typeof campaign.upsertMonsterStatblock>[0]); break;
    }
  }

  return {
    title: 'Campaign Assistant',
    subtitle: `Workbench · ${campaign.selectedCampaign?.name ?? 'Campaign'} · sees your whole campaign`,
    scopeNoun: 'campaign',
    scope: 'campaign',
    storageKey: 'ai-chat',
    supportsDocuments: true,
    composerPlaceholder: 'Ask about your campaign, or describe what to build…',
    samples: [
      { glyph: '▣', text: "Prep tonight's session" },
      { glyph: '▸', text: 'Break a module into submodules and scenes' },
      { glyph: '↯', text: 'What loose threads should I tie up?' },
      { glyph: '◉', text: 'Recap where we left off last session' },
    ],
    buildSystemPrompt,
    formatContext,
    lookupExisting,
    applyChatAction,
    applyImportAction,
  };
}

// ── World backend ──────────────────────────────────────────────────────────
//
// The world is the reusable setting bible. Its writable set here is NPCs,
// Locations, and Lore — the narrative worldbuilding entities that already
// exist in the action union and whose world upserts round-trip the fields the
// world views expose. Statblocks, timeline events, factions, and document
// import are deliberately out of scope for this first pass.

const WORLD_TYPES: ReadonlySet<ImportActionType> = new Set(['upsertNPC', 'upsertLocation', 'upsertLore', 'upsertTimelineEvent']);

export function useWorldAssistantBackend(): AssistantBackend {
  const world = useWorld();
  const { activeWorld, npcs, locations, lore, factions, timeline } = world;

  // World data is exposed as reduced view types; re-express the existing record
  // in DB-field vocabulary so diffs and merges speak the same language as the
  // AI's payload (and as the world upsert functions).
  function lookupExisting(type: ImportActionType, id: string | null): Record<string, unknown> | null {
    if (!id) return null;
    if (type === 'upsertNPC') {
      const n = npcs.find(x => x.id === id);
      return n ? { name: n.name, role: n.role, status: n.status, description: n.desc, location: n.location, faction_ids: n.factions } : null;
    }
    if (type === 'upsertLocation') {
      const l = locations.find(x => x.id === id);
      return l ? { name: l.name, location_type: l.type, description: l.desc } : null;
    }
    if (type === 'upsertLore') {
      const e = lore.find(x => x.id === id);
      return e ? { title: e.title, content: e.desc } : null;
    }
    if (type === 'upsertTimelineEvent') {
      const t = timeline.find(x => x.id === id);
      return t ? { title: t.title, description: t.desc, year: t.year, display_date: t.date, event_type: t.type, era: t.era } : null;
    }
    return null;
  }

  function formatContext(): string {
    const trunc = (v: string | null | undefined, n = 400) =>
      v && v.trim() ? (v.trim().length > n ? v.trim().slice(0, n) + '…' : v.trim()) : null;
    const facName = (fid: string) => factions.find(f => f.id === fid)?.name ?? fid;
    return `World: ${activeWorld?.name ?? 'Unnamed World'}${activeWorld?.tagline ? ` — ${activeWorld.tagline}` : ''}

== CURRENT WORLD DATA ==

NPCS (${npcs.length}):
${npcs.map(n => `  ${n.name} (${n.role || '?'}, ${n.status}${n.factions.length ? `, ${n.factions.map(facName).join('/')}` : ''}) [id:${n.id}]${trunc(n.desc) ? `\n    description: "${trunc(n.desc)}"` : ''}`).join('\n') || '  (none)'}

LOCATIONS (${locations.length}):
${locations.map(l => `  ${l.name} — ${l.type || '?'} [id:${l.id}]${trunc(l.desc) ? `\n    description: "${trunc(l.desc)}"` : ''}`).join('\n') || '  (none)'}

LORE ENTRIES (${lore.length}):
${lore.map(e => `  ${e.title} [id:${e.id}]${trunc(e.desc) ? `\n    content: "${trunc(e.desc)}"` : ''}`).join('\n') || '  (none)'}

TIMELINE EVENTS (${timeline.length}):
${[...timeline].sort((a, b) => a.year - b.year).map(t => `  ${t.date || t.year} — ${t.title} (${t.type}${t.era ? `, ${t.era}` : ''}) [id:${t.id}]${trunc(t.desc, 200) ? `\n    ${trunc(t.desc, 200)}` : ''}`).join('\n') || '  (none)'}

FACTIONS (${factions.length}, reference only — you cannot edit factions):
${factions.map(f => `  ${f.name} (${f.type || '?'}) [id:${f.id}]`).join('\n') || '  (none)'}`;
  }

  function buildSystemPrompt(): string {
    return `You are a worldbuilding assistant for a tabletop RPG setting (the "world" or setting bible). You help the DM flesh out the world's cast, places, and lore. This is the setting layer shared across campaigns — do NOT invent campaign-specific things like sessions, player characters, encounters, or plot hooks.

${formatContext()}

== CRITICAL RULES ==

1. When the DM asks you to create or update world data, you MUST respond with:
   - 1-2 SHORT sentences saying what you're doing
   - IMMEDIATELY followed by a \`\`\`json code block with an array of actions
   This is MANDATORY. Never skip the JSON block when changes are requested.

2. Your JSON actions are staged for the DM in a review tray, where they pick what to keep and commit. Propose freely and completely — but never claim a change is saved or live. Say what you are drafting, not what you have written. Never say "I can't execute" or "copy/paste".

3. Do NOT ask follow-up questions before making changes. Do everything the DM asked for in one response.

4. Keep prose minimal — the DM sees every change as a card with a full diff. The ONLY exception is the capture recap described below.

5. You can ONLY create/update four kinds of world record: NPCs, Locations, Lore entries, and Timeline events. You cannot edit factions, statblocks, or anything campaign-specific (sessions, PCs, encounters, plot hooks). If asked for those, say so briefly and do what you can within these four.

6. If the DM is just asking a question (not requesting changes), respond normally without JSON.

7. When the DM pastes worldbuilding notes, a gazetteer, or any block of prose to log, treat it as source material to mine EXHAUSTIVELY. Sweep the entire text and propose an action for EVERY named NPC, EVERY named place, EVERY lore-worthy fact (a history, artifact, creature, magic, or religion detail), and EVERY datable event it mentions — not just the prominent ones. Notes that name ten places should yield ten locations, not a representative few. Skimming or sampling is a failure mode here: err toward including a minor, briefly-mentioned entity over silently dropping it. Before you finish, re-scan the notes once specifically for (a) proper names you have not yet emitted an action for, and (b) dated or datable historical beats that belong on the timeline. This is a single pass — do everything in this one response; do not wait to be asked again.

== CAPTURE RECAP ==

After the JSON, when you extracted entities from pasted notes, end with a short recap so the DM can catch anything you missed at a glance. This is the one place a brief list is allowed. Keep it to 1-3 lines:
  - A count line by type, e.g. "Captured: 5 NPCs, 4 locations, 2 lore, 1 timeline event."
  - An "Unsure:" note for anything ambiguous — a possible duplicate, or a name that might refer to an existing record. e.g. "Unsure: is \"the Sunken City\" the same as Old Vharos [existing location]?"
  - A "Left out:" note for anything you deliberately did NOT log and why, e.g. "Left out: an offhand mention of a road, no detail to record."
Omit any of these three lines that do not apply. Skip the recap entirely for single-change requests, questions, or when no prose was mined.

== PLANS ==

When a request spans several distinct pieces of work (fleshing out a region and its inhabitants, seeding a pantheon of lore entries), open with a \`\`\`plan block: a title line, then one "- " step per piece of work (3-6 steps). Then tag each action with "step": <1-based step number>, emitted in step order. Skip the plan block for single-change or question-only responses.

\`\`\`plan
Fleshing out the Drowned Coast
- Draft the harbor town
- Add its harbormaster
- Write the drowning-god lore
\`\`\`

== ACTION FORMAT ==

Every action carries these UI fields alongside its payload:
  "reasoning": one short sentence on why you propose this and, for updates, why you matched this record.
  "confidence": 0 to 1, honest. Above 0.85 = stated plainly. 0.7-0.85 = partly inferred. Below 0.7 = filling a gap, DM should check.
  "step": the plan step number, when you emitted a plan.

To UPDATE an existing record, set "id" to its id from the data above. Omit "id" to create new. Only include fields you want to set.

  { "type": "upsertNPC", "reasoning": "...", "confidence": 0.9, "payload": { "name": "...", "role": "...", "status": "active|deceased|unknown", "description": "...", "location": "..." } }
  { "type": "upsertLocation", "reasoning": "...", "confidence": 0.9, "payload": { "name": "...", "location_type": "continent|city|town|dungeon|landmark", "region": "...", "description": "...", "history": "..." } }
  { "type": "upsertLore", "reasoning": "...", "confidence": 0.9, "payload": { "title": "...", "category": "history|artifact|creature|magic|religion", "content": "..." } }
  { "type": "upsertTimelineEvent", "reasoning": "...", "confidence": 0.9, "payload": { "title": "...", "year": <integer>, "display_date": "e.g. CR 1247", "event_type": "cataclysm|founding|treaty|war|political|magical|custom", "era": "...", "description": "..." } }

A timeline event needs at least a "title" and a numeric "year" (used to order it); "display_date" is the label shown to the DM (default it to the year if none is given), and "era" groups events on the timeline — reuse an era string already present in the world data above when one fits.

Delete: { "type": "deleteNPC", "reasoning": "...", "confidence": 0.9, "id": "<id>", "label": "<name>" } (same for deleteLocation, deleteLore, deleteTimelineEvent)

Before creating ANY record, scan the CURRENT WORLD DATA above for one describing the same thing and reuse its id to update it instead of making a duplicate.`;
  }

  async function upsertWorld(type: ImportActionType, payload: Record<string, unknown>, matchedId: string | null): Promise<void> {
    // Merge the AI's sparse payload onto the existing record (world upserts
    // overwrite every column, so omitted fields would otherwise be nulled).
    const existing = matchedId ? lookupExisting(type, matchedId) : null;
    const merged = normalizeAssistantPayload(type, { ...(existing ?? {}), ...payload });

    if (type === 'upsertNPC') {
      const id = matchedId ?? (await world.createNPC());
      if (!id) throw new Error('Could not create NPC');
      await world.upsertWorldNPC({ ...merged, id } as Parameters<typeof world.upsertWorldNPC>[0]);
    } else if (type === 'upsertLocation') {
      const id = matchedId ?? (await world.createLocation());
      if (!id) throw new Error('Could not create location');
      await world.upsertWorldLocation({ ...merged, id } as Parameters<typeof world.upsertWorldLocation>[0]);
    } else if (type === 'upsertLore') {
      const id = matchedId ?? (await world.createLoreEntry());
      if (!id) throw new Error('Could not create lore entry');
      await world.upsertWorldLore({ ...merged, id } as Parameters<typeof world.upsertWorldLore>[0]);
    } else if (type === 'upsertTimelineEvent') {
      // The import/chat contract speaks DB vocabulary (event_type, display_date,
      // description); the world timeline functions take the reduced view type
      // (type, date, desc). Translate before writing.
      const m = merged as Record<string, unknown>;
      const year = Number(m.year) || 0;
      const view = {
        title: (m.title as string) ?? '',
        desc: (m.description as string) ?? '',
        year,
        date: (m.display_date as string) || String(year),
        type: (m.event_type as WorldTimelineEvent['type']) ?? 'custom',
        era: (m.era as string) ?? '',
      };
      if (matchedId) {
        await world.upsertTimelineEvent({ ...view, id: matchedId });
      } else {
        await world.createTimelineEvent(view);
      }
    } else {
      throw new Error(`The world assistant cannot write ${type}.`);
    }
  }

  async function applyChatAction(action: PendingAction): Promise<void> {
    switch (action.type) {
      case 'upsertNPC':
      case 'upsertLocation':
      case 'upsertLore':
      case 'upsertTimelineEvent': {
        const payload = action.payload as Record<string, unknown>;
        const matchedId = (payload.id as string) ?? null;
        await upsertWorld(action.type, payload, matchedId);
        break;
      }
      case 'deleteNPC':          await world.deleteWorldNPC(action.id); break;
      case 'deleteLocation':     await world.deleteWorldLocation(action.id); break;
      case 'deleteLore':         await world.deleteWorldLore(action.id); break;
      case 'deleteTimelineEvent': await world.deleteTimelineEvent(action.id); break;
      default:
        throw new Error(`The world assistant cannot write ${action.type}.`);
    }
  }

  async function applyImportAction(action: ImportAction): Promise<void> {
    if (!WORLD_TYPES.has(action.type)) {
      throw new Error(`The world assistant cannot write ${action.type}.`);
    }
    await upsertWorld(action.type, action.payload as Record<string, unknown>, action.matched_id);
  }

  return {
    title: 'World Assistant',
    subtitle: `Workbench · ${activeWorld?.name ?? 'World'} · sees your whole setting`,
    scopeNoun: 'world',
    scope: 'world',
    storageKey: 'world-ai-chat',
    supportsDocuments: true,
    composerPlaceholder: 'Ask about your world, or describe what to build…',
    samples: [
      { glyph: '⬡', text: 'Flesh out a new location' },
      { glyph: '◇', text: 'Add an NPC to the world' },
      { glyph: '❖', text: 'Add an event to the timeline' },
    ],
    buildSystemPrompt,
    formatContext,
    lookupExisting,
    applyChatAction,
    applyImportAction,
  };
}
