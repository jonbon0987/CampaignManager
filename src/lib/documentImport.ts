// Client-side helpers and types for the document-import feature.
//
// Flow:
//   1. extractClientSide(file)   → turn File into { kind, payload } for the API
//   2. submitDocument(input, ctx) → POST /api/parse-document → { summary, actions }
//   3. The caller (AIAssistant) passes the actions into DocumentImportReview.

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
} from './database.types';

// ── ImportAction discriminated union ───────────────────────────────────────
// The server returns a list of these. Each has matched_id (existing entity
// id, or null for new), a reasoning string for the UI, and the entity-specific
// payload. A client-side action_id is assigned on receipt for UI state keys.

type ImportActionBase<TType extends string, TPayload> = {
  action_id: string;      // client-assigned UUID for UI tracking
  type: TType;
  matched_id: string | null;
  reasoning: string;
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
  | ImportActionBase<'upsertRelationship', Omit<CharacterRelationshipInsert, 'campaign_id'>>;

export type ImportActionType = ImportAction['type'];

// Entity-kind metadata for the review UI (label, badge color, which campaign
// list to look up the "old" values in).
export const entityMeta: Record<ImportActionType, {
  label: string;
  badgeColor: 'gold' | 'green' | 'red' | 'blue' | 'muted' | 'yellow' | 'orange';
  nameField: string;
}> = {
  upsertSession:      { label: 'Session',      badgeColor: 'blue',   nameField: 'session_number' },
  upsertPC:           { label: 'PC',           badgeColor: 'gold',   nameField: 'character_name' },
  upsertNPC:          { label: 'NPC',          badgeColor: 'orange', nameField: 'name' },
  upsertLocation:     { label: 'Location',     badgeColor: 'green',  nameField: 'name' },
  upsertFaction:      { label: 'Faction',      badgeColor: 'yellow', nameField: 'name' },
  upsertHook:         { label: 'Plot Hook',    badgeColor: 'red',    nameField: 'title' },
  upsertLore:         { label: 'Lore',         badgeColor: 'muted',  nameField: 'title' },
  upsertModule:       { label: 'Module',       badgeColor: 'gold',   nameField: 'title' },
  upsertSubmodule:    { label: 'Submodule',    badgeColor: 'muted',  nameField: 'title' },
  upsertScene:        { label: 'Scene',        badgeColor: 'muted',  nameField: 'title' },
  upsertRelationship: { label: 'Relationship', badgeColor: 'muted',  nameField: 'label' },
};

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

export async function extractClientSide(file: File): Promise<DocumentInput> {
  const name = file.name;
  const lower = name.toLowerCase();

  if (lower.endsWith('.txt') || lower.endsWith('.md') || file.type.startsWith('text/')) {
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

// ── API call ───────────────────────────────────────────────────────────────

export interface ParseDocumentResponse {
  summary: string;
  actions: ImportAction[];
}

export async function submitDocument(
  input: DocumentInput,
  campaignContext: string,
): Promise<ParseDocumentResponse> {
  const res = await fetch('/api/parse-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, campaignContext }),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json() as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  const data = await res.json() as { summary?: string; actions?: Omit<ImportAction, 'action_id'>[] };
  const actions = (data.actions ?? []).map((a, i) => ({
    ...a,
    action_id: `imp-${Date.now()}-${i}`,
  })) as ImportAction[];
  return { summary: data.summary ?? '', actions };
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
