// Client-side helpers and types for the document-import feature.
//
// Flow:
//   1. extractClientSide(file)   → turn File into { kind, payload } for the API
//   2. submitDocument(input, ctx) → POST /api/parse-document → { summary, actions }
//   3. The caller (AIAssistant) passes the actions into DocumentImportReview.

import { authHeaders } from './apiClient';
import type {
  SessionInsert,
  PlayerCharacterInsert,
  NPCInsert,
  LocationInsert,
  FactionInsert,
  HookInsert,
  LoreEntryInsert,
  ModuleInsert,
  SubmoduleInsert,
  SceneInsert,
  CharacterRelationshipInsert,
  MonsterStatblockInsert,
  TimelineEventInsert,
} from './database.types';

// ── ImportAction discriminated union ───────────────────────────────────────
// The server returns a list of these. Each has matched_id (existing entity
// id, or null for new), a reasoning string for the UI, a 0-1 confidence score,
// and the entity-specific payload. A client-side action_id is assigned on
// receipt for UI state keys.

type ImportActionBase<TType extends string, TPayload> = {
  action_id: string;      // client-assigned UUID for UI tracking
  type: TType;
  matched_id: string | null;
  reasoning: string;
  confidence: number;
  payload: Partial<TPayload>;
};

// payload is Partial<...> because the AI only fills in fields it actually
// wants to set; every other field stays at its current value on update.
export type ImportAction =
  | ImportActionBase<'upsertSession', Omit<SessionInsert, 'campaign_id'>>
  | ImportActionBase<'upsertPC', Omit<PlayerCharacterInsert, 'campaign_id'>>
  | ImportActionBase<'upsertNPC', Omit<NPCInsert, 'campaign_id'>>
  | ImportActionBase<'upsertLocation', Omit<LocationInsert, 'campaign_id'>>
  | ImportActionBase<'upsertFaction', Omit<FactionInsert, 'campaign_id'>>
  | ImportActionBase<'upsertHook', Omit<HookInsert, 'campaign_id'>>
  | ImportActionBase<'upsertLore', LoreEntryInsert>
  | ImportActionBase<'upsertModule', Omit<ModuleInsert, 'campaign_id'>>
  | ImportActionBase<'upsertSubmodule', SubmoduleInsert>
  | ImportActionBase<'upsertScene', SceneInsert>
  | ImportActionBase<'upsertRelationship', Omit<CharacterRelationshipInsert, 'campaign_id'>>
  | ImportActionBase<'upsertMonsterStatblock', Omit<MonsterStatblockInsert, 'campaign_id'>>
  | ImportActionBase<'upsertTimelineEvent', Omit<TimelineEventInsert, 'world_id'>>;

export type ImportActionType = ImportAction['type'];

// The model self-reports confidence and can omit it, send it as a percentage,
// or send junk. Anything we can't read as a 0-1 number becomes 0.7 — mid-range,
// so an unscored action reads as "worth a look" rather than trusted or alarming.
export const DEFAULT_CONFIDENCE = 0.7;

export function normalizeConfidence(raw: unknown): number {
  // Number(null) and Number('') are both 0, which would masquerade as a real
  // (very low) score — treat absent/blank as unscored instead.
  if (raw == null || raw === '') return DEFAULT_CONFIDENCE;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_CONFIDENCE;
  // Some models report a percentage (0-100) instead of a fraction. Only values
  // clearly in that range get rescaled; a small overshoot like 1.2 is a fumbled
  // fraction, not "120%", so it just clamps to 1.
  const scaled = n >= 2 ? n / 100 : n;
  return Math.min(1, Math.max(0, scaled));
}

// Entity-kind metadata for the review UI (label, badge color, staging-tray
// glyph, and which campaign list to look up the "old" values in).
export const entityMeta: Record<ImportActionType, {
  label: string;
  badgeColor: 'gold' | 'green' | 'red' | 'blue' | 'muted' | 'yellow' | 'orange';
  glyph: string;
  nameField: string;
}> = {
  upsertSession:      { label: 'Session',      badgeColor: 'blue',   glyph: '◉', nameField: 'session_number' },
  upsertPC:           { label: 'PC',           badgeColor: 'gold',   glyph: '◈', nameField: 'character_name' },
  upsertNPC:          { label: 'NPC',          badgeColor: 'orange', glyph: '◇', nameField: 'name' },
  upsertLocation:     { label: 'Location',     badgeColor: 'green',  glyph: '⬡', nameField: 'name' },
  upsertFaction:      { label: 'Faction',      badgeColor: 'yellow', glyph: '⚑', nameField: 'name' },
  upsertHook:         { label: 'Plot Hook',    badgeColor: 'red',    glyph: '↯', nameField: 'title' },
  upsertLore:         { label: 'Lore',         badgeColor: 'muted',  glyph: '✦', nameField: 'title' },
  upsertModule:       { label: 'Module',       badgeColor: 'gold',   glyph: '▣', nameField: 'title' },
  upsertSubmodule:    { label: 'Submodule',    badgeColor: 'muted',  glyph: '▣', nameField: 'title' },
  upsertScene:        { label: 'Scene',        badgeColor: 'muted',  glyph: '▸', nameField: 'title' },
  upsertRelationship:      { label: 'Relationship', badgeColor: 'muted',  glyph: '⧉', nameField: 'label' },
  upsertMonsterStatblock:  { label: 'Stat Sheet',   badgeColor: 'blue',   glyph: '☠', nameField: 'name' },
  upsertTimelineEvent:     { label: 'Timeline Event', badgeColor: 'muted', glyph: '❖', nameField: 'title' },
};

// ── Field diffing for the staging tray ────────────────────────────────────
// Fields that are foreign keys, internal refs, or handled elsewhere — never
// meaningful to show the DM as a diff row.
const hiddenFields = new Set([
  'faction_ids', 'statblock_id', 'module_id', 'submodule_id', 'sort_order',
  'from_id', 'from_kind', 'to_id', 'to_kind', 'linked_monster_ids', 'linked_encounter_ids',
  'id', 'campaign_id',
  // Parent pointers the assistant uses to hang a submodule/scene off something
  // it is proposing in the same batch — plumbing, resolved away on commit.
  'ref', 'module_ref', 'submodule_ref',
]);

export function fieldLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export interface DiffRow {
  key: string;
  oldValue: unknown;
  newValue: unknown;
}

// Which fields the AI's payload actually changes against the current record.
// currentEntity is null for creates, so every field reads as new.
export function computeDiffRows(
  currentEntity: Record<string, unknown> | null,
  payload: Record<string, unknown>,
): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const [key, newValue] of Object.entries(payload)) {
    if (hiddenFields.has(key)) continue;
    const oldValue = currentEntity?.[key] ?? null;
    const oldStr = oldValue == null ? '' : String(oldValue);
    const newStr = newValue == null ? '' : String(newValue);
    if (oldStr === newStr) continue;
    rows.push({ key, oldValue, newValue });
  }
  return rows;
}

export function actionName(a: ImportAction, existing: Record<string, unknown> | null): string {
  const meta = entityMeta[a.type];
  const payload = a.payload as Record<string, unknown>;
  const raw = payload[meta.nameField] ?? existing?.[meta.nameField];
  const name = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
  if (!name) return '(unnamed)';
  return a.type === 'upsertSession' ? `Session ${name}` : name;
}

export function describeAction(a: ImportAction): string {
  const meta = entityMeta[a.type];
  const verb = a.matched_id ? 'Update' : 'Add';
  // Safely read the name field off a Partial payload
  const payload = a.payload as Record<string, unknown>;
  const name = payload[meta.nameField];
  const displayName = typeof name === 'string' || typeof name === 'number'
    ? String(name)
    : '(unnamed)';
  if (a.type === 'upsertSession') return `${verb} session #${displayName}`;
  return `${verb} ${meta.label}: ${displayName}`;
}

// ── File extraction ────────────────────────────────────────────────────────

export type DocumentInput =
  | { kind: 'text';      payload: string; filename?: string }
  | { kind: 'docx';      payload: string; filename?: string } // base64
  | { kind: 'pdf';       payload: string; filename?: string } // base64
  | { kind: 'gdocs-url'; payload: string };

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  // Works in browsers. Chunked to avoid call stack overflow for large files.
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Upload ceiling for a single import. Kept well under Vercel's ~4.5 MB
// request-body limit — .docx/.pdf are base64-encoded for transport, which
// inflates their size by ~33% — and in a range the extraction model can read
// completely. Enforced client-side so an oversized file gets a clear message
// here instead of an opaque 413 from Vercel before the function even runs.
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_LABEL = '2 MB';

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isTextFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return lower.endsWith('.txt') || lower.endsWith('.md') || file.type.startsWith('text/');
}

/**
 * Returns a user-facing error string if a file is too large to import, or null
 * if it's fine. Shared so a gate can reject the moment a file is picked (before
 * staging) and extractClientSide can guard the actual read — one message, one
 * limit. The advice is tailored: a file that's already plain text can only be
 * split, but anything else usually shrinks dramatically once exported to text.
 */
export function importSizeError(file: File): string | null {
  if (file.size <= MAX_IMPORT_BYTES) return null;
  const shrinkTip = isTextFile(file)
    ? 'Try splitting it into smaller sections and importing them one at a time.'
    : 'Saving it as plain text (.txt or .md) strips out images and formatting and usually shrinks it well under the limit — or split it into smaller sections and import them one at a time.';
  return `That file is ${formatMB(file.size)} — imports are limited to ${MAX_IMPORT_LABEL}. ${shrinkTip}`;
}

export async function extractClientSide(file: File): Promise<DocumentInput> {
  const name = file.name;
  const lower = name.toLowerCase();

  const sizeError = importSizeError(file);
  if (sizeError) throw new Error(sizeError);

  if (isTextFile(file)) {
    const text = await file.text();
    if (!text.trim()) throw new Error('That file appears to be empty.');
    return { kind: 'text', payload: text, filename: name };
  }

  if (lower.endsWith('.docx')) {
    const buffer = await file.arrayBuffer();
    return { kind: 'docx', payload: arrayBufferToBase64(buffer), filename: name };
  }

  if (lower.endsWith('.pdf')) {
    const buffer = await file.arrayBuffer();
    return { kind: 'pdf', payload: arrayBufferToBase64(buffer), filename: name };
  }

  throw new Error(`Unsupported file type: ${name}. Supported: .txt, .md, .docx, .pdf`);
}

export function parseGoogleDocsUrl(url: string): DocumentInput {
  const trimmed = url.trim();
  if (!/^https?:\/\/docs\.google\.com\/document\/d\/[a-zA-Z0-9_-]+/.test(trimmed)) {
    throw new Error('That doesn\'t look like a Google Docs URL.');
  }
  return { kind: 'gdocs-url', payload: trimmed };
}

// ── Import progress messages ────────────────────────────────────────────────
// The parse streams a summary phase, then one extraction pass per entity
// category. These map those streaming events to a friendly one-line status the
// creation gates show while the (multi-second) parse runs.

/** Status shown once the summary phase ends and extraction begins. */
export const EXTRACTING_MESSAGE = 'Understanding what’s inside…';
/** Status shown before any streaming event has arrived. */
export const READING_MESSAGE = 'Reading your document…';

/** Progress line for a single extraction pass, e.g. "Extracting characters… (1 of 5)". */
export function passProgressText(pass: { index: number; total: number; label: string }): string {
  return `Extracting ${pass.label}… (${pass.index + 1} of ${pass.total})`;
}

// ── API call ───────────────────────────────────────────────────────────────

export interface ParseDocumentResponse {
  summary: string;
  actions: ImportAction[];
}

export async function submitDocument(
  input: DocumentInput,
  campaignContext: string,
  userInstructions?: string,
  onText?: (chunk: string) => void,
  onExtracting?: () => void,
  onPass?: (pass: { index: number; total: number; label: string }) => void,
  signal?: AbortSignal,
  provider?: string,
  scope: 'campaign' | 'world' = 'campaign',
  // Creation gates: ask the server to suggest a name + short descriptor drawn
  // from the document itself, delivered via onTitle as soon as it's ready. The
  // `tagline` field carries a world tagline or a campaign premise, per scope.
  deriveTitle?: boolean,
  onTitle?: (title: { name: string; tagline: string }) => void,
  // Fires when one extraction pass fails after retries (rate limit, transient
  // API error, malformed model output, ...) — the rest of the passes still
  // run, so this pass's entity category just comes back thinner than expected.
  onWarning?: (warning: { label: string; message: string }) => void,
): Promise<ParseDocumentResponse> {
  const endpoint = import.meta.env.VITE_MOCK_PARSE === 'true'
    ? '/api/parse-document-mock'
    : '/api/parse-document';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ ...input, campaignContext, userInstructions, provider, scope, deriveTitle }),
    signal,
  });

  if (!res.ok || !res.body) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json() as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  // Consume SSE stream — buffer partial lines across chunks
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let summary = '';
  let actions: ImportAction[] = [];
  let buffer = '';

  let actionCounter = 0;

  function processLine(line: string) {
    if (!line.startsWith('data: ')) return;
    let event: {
      type: string;
      text?: string;
      action?: Omit<ImportAction, 'action_id'>;
      // Legacy: full actions array in done event (backwards compat)
      actions?: Omit<ImportAction, 'action_id'>[];
      count?: number;
      message?: string;
      // Pass progress fields
      index?: number;
      total?: number;
      label?: string;
      // Title-derivation fields (world-creation gate only)
      name?: string;
      tagline?: string;
    };
    try {
      event = JSON.parse(line.slice(6));
    } catch {
      return; // malformed line, skip
    }

    if (event.type === 'text' && event.text) {
      summary += event.text;
      onText?.(event.text);
    } else if (event.type === 'extracting') {
      onExtracting?.();
    } else if (event.type === 'pass' && event.index != null && event.total != null && event.label) {
      onPass?.({ index: event.index, total: event.total, label: event.label });
    } else if (event.type === 'title' && event.name) {
      onTitle?.({ name: event.name, tagline: event.tagline ?? '' });
    } else if (event.type === 'warning' && event.label) {
      onWarning?.({ label: event.label, message: event.message ?? 'Unknown error' });
    } else if (event.type === 'action' && event.action) {
      // Individual action event
      actions.push({
        ...event.action,
        confidence: normalizeConfidence(event.action.confidence),
        action_id: `imp-${Date.now()}-${actionCounter++}`,
      } as ImportAction);
    } else if (event.type === 'done') {
      // Legacy: if done event includes actions array, use it
      if (event.actions && event.actions.length > 0) {
        actions = event.actions.map((a, i) => ({
          ...a,
          confidence: normalizeConfidence(a.confidence),
          action_id: `imp-${Date.now()}-${i}`,
        })) as ImportAction[];
      }
    } else if (event.type === 'error') {
      throw new Error(event.message ?? 'Unknown error from parse-document');
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // Keep the last element — it may be incomplete
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      processLine(line);
    }
  }

  // Flush any remaining data left in the buffer after stream ends
  if (buffer.trim()) {
    for (const line of buffer.split('\n')) {
      processLine(line);
    }
  }

  return { summary: summary.trim(), actions };
}

// ── Entity lookup for merge-on-apply ──────────────────────────────────────
// When applying an import action that updates an existing entity (matched_id),
// we need to merge the AI's sparse payload onto the full existing record so
// that fields the AI didn't include are preserved rather than nulled.

const internalFields = new Set([
  'user_id', 'created_at', 'updated_at', 'campaign_id',
]);

/** Strip DB-internal fields that are managed by the db/context layer. */
export function stripInternalFields(entity: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity)) {
    if (!internalFields.has(key)) result[key] = value;
  }
  return result;
}

/**
 * Look up an existing entity from the campaign context lists.
 * Returns the full entity record (as a plain object) or null.
 *
 * The `campaign` parameter is loosely typed so this utility doesn't need
 * to import the full CampaignContext type — it just needs the entity arrays.
 */
export function lookupExistingEntity(
  campaign: {
    sessions: Array<{ id: string }>;
    pcs: Array<{ id: string }>;
    npcs: Array<{ id: string }>;
    locations: Array<{ id: string }>;
    factions: Array<{ id: string }>;
    hooks: Array<{ id: string }>;
    lore: Array<{ id: string }>;
    modules: Array<{ id: string }>;
    submodules: Array<{ id: string }>;
    scenes: Array<{ id: string }>;
    relationships: Array<{ id: string }>;
    monsterStatblocks: Array<{ id: string }>;
  },
  actionType: ImportActionType,
  matchedId: string | null,
): Record<string, unknown> | null {
  if (!matchedId) return null;

  const listMap: Record<ImportActionType, Array<{ id: string }>> = {
    upsertSession: campaign.sessions,
    upsertPC: campaign.pcs,
    upsertNPC: campaign.npcs,
    upsertLocation: campaign.locations,
    upsertFaction: campaign.factions,
    upsertHook: campaign.hooks,
    upsertLore: campaign.lore,
    upsertModule: campaign.modules,
    upsertSubmodule: campaign.submodules,
    upsertScene: campaign.scenes,
    upsertRelationship: campaign.relationships,
    upsertMonsterStatblock: campaign.monsterStatblocks,
    // Timeline events are world-scoped only; the campaign context has no list
    // to match against, so a campaign lookup always reads as a create.
    upsertTimelineEvent: [],
  };

  const list = listMap[actionType];
  if (!list) return null;
  return (list.find(e => e.id === matchedId) as Record<string, unknown>) ?? null;
}

// ── Fuzzy name match utility ───────────────────────────────────────────────
// Used by the review card's "Match to…" dropdown to suggest similar-named
// existing entities the user can switch to. Simple substring + initial-letter
// bonus — no Levenshtein needed for a top-5 list.

export function fuzzyMatchByName<T extends { id: string; name?: string; title?: string; character_name?: string }>(
  query: string,
  entities: T[],
  limit = 5,
): T[] {
  if (!query) return entities.slice(0, limit);
  const q = query.toLowerCase().trim();
  const scored = entities.map(e => {
    const name = (e.name ?? e.title ?? e.character_name ?? '').toLowerCase();
    if (!name) return { e, score: 0 };
    if (name === q) return { e, score: 100 };
    if (name.includes(q)) return { e, score: 50 + (q.length / name.length) * 20 };
    if (q.includes(name)) return { e, score: 30 + (name.length / q.length) * 10 };
    // Initial-letter bonus
    if (name[0] === q[0]) return { e, score: 5 };
    return { e, score: 0 };
  });
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.e);
}
