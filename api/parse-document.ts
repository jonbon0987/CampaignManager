import './_env';
import Anthropic from '@anthropic-ai/sdk';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import mammoth from 'mammoth';

type RequestBody = {
  kind: 'text' | 'docx' | 'pdf' | 'gdocs-url';
  payload: string;          // raw text, base64 for docx/pdf, or URL for gdocs-url
  filename?: string;
  campaignContext: string;  // pre-formatted campaign entity listing
};

// ── Tool schema: the shape Claude MUST return ─────────────────────────────
//
// We force tool use so we get strict structured JSON instead of having to
// strip markdown fences. Every action has matched_id (string|null) and a
// short reasoning string shown on the review card.

const propertiesForAction = (typeLiteral: string, payloadProps: Record<string, unknown>, payloadRequired: string[] = []) => ({
  type: 'object' as const,
  properties: {
    type: { type: 'string', enum: [typeLiteral] },
    matched_id: {
      type: ['string', 'null'],
      description: 'The id of the existing entity being updated, or null to create a new one.',
    },
    reasoning: {
      type: 'string',
      description: 'One sentence explaining why this action was proposed and, for updates, why this entity was matched.',
    },
    payload: {
      type: 'object',
      properties: payloadProps,
      required: payloadRequired,
      additionalProperties: false,
    },
  },
  required: ['type', 'matched_id', 'reasoning', 'payload'],
  additionalProperties: false,
});

const actionSchema = {
  type: 'object' as const,
  properties: {
    summary: {
      type: 'string',
      description: 'A 1-3 sentence plain-language summary of what was found in the document.',
    },
    actions: {
      type: 'array',
      items: {
        oneOf: [
          propertiesForAction('upsertSession', {
            session_number: { type: 'number' },
            session_date: { type: ['string', 'null'] },
            summary: { type: ['string', 'null'] },
            combats: { type: ['string', 'null'] },
            loot_rewards: { type: ['string', 'null'] },
            hooks_notes: { type: ['string', 'null'] },
            dm_notes: { type: ['string', 'null'] },
          }, ['session_number']),
          propertiesForAction('upsertPC', {
            character_name: { type: 'string' },
            player_name: { type: ['string', 'null'] },
            race: { type: ['string', 'null'] },
            class: { type: ['string', 'null'] },
            background: { type: ['string', 'null'] },
            story_hooks: { type: ['string', 'null'] },
            key_npcs: { type: ['string', 'null'] },
            dm_notes: { type: ['string', 'null'] },
            is_active: { type: 'boolean' },
            faction_ids: { type: 'array', items: { type: 'string' } },
          }, ['character_name']),
          propertiesForAction('upsertNPC', {
            name: { type: 'string' },
            role: { type: ['string', 'null'] },
            affiliation: { type: ['string', 'null'] },
            status: { type: 'string', enum: ['active', 'deceased', 'unknown'] },
            description: { type: ['string', 'null'] },
            hooks_motivations: { type: ['string', 'null'] },
            dm_notes: { type: ['string', 'null'] },
            location: { type: ['string', 'null'] },
            first_session: { type: ['number', 'null'] },
            met_by_pcs: { type: 'boolean' },
            faction_ids: { type: 'array', items: { type: 'string' } },
          }, ['name', 'status']),
          propertiesForAction('upsertLocation', {
            name: { type: 'string' },
            region: { type: ['string', 'null'] },
            location_type: { type: ['string', 'null'] },
            population: { type: ['string', 'null'] },
            status: { type: ['string', 'null'] },
            history: { type: ['string', 'null'] },
            description: { type: ['string', 'null'] },
            dm_notes: { type: ['string', 'null'] },
          }, ['name']),
          propertiesForAction('upsertFaction', {
            name: { type: 'string' },
            faction_type: { type: ['string', 'null'] },
            overview: { type: ['string', 'null'] },
            key_figures: { type: ['string', 'null'] },
            agenda: { type: ['string', 'null'] },
            dm_notes: { type: ['string', 'null'] },
          }, ['name']),
          propertiesForAction('upsertHook', {
            title: { type: 'string' },
            category: { type: ['string', 'null'], enum: ['main_plot', 'side_quest', 'character_arc', 'faction', null] },
            description: { type: ['string', 'null'] },
            last_updated_session: { type: ['number', 'null'] },
            is_active: { type: 'boolean' },
            dm_only_notes: { type: ['string', 'null'] },
          }, ['title', 'is_active']),
          propertiesForAction('upsertLore', {
            title: { type: 'string' },
            category: { type: ['string', 'null'] },
            content: { type: ['string', 'null'] },
            dm_only: { type: 'boolean' },
          }, ['title', 'dm_only']),
          propertiesForAction('upsertModule', {
            chapter: { type: ['string', 'null'] },
            title: { type: 'string' },
            synopsis: { type: ['string', 'null'] },
            status: { type: 'string', enum: ['planned', 'active', 'completed'] },
            played_session: { type: ['number', 'null'] },
            encounters: { type: ['string', 'null'] },
            rewards: { type: ['string', 'null'] },
            dm_notes: { type: ['string', 'null'] },
          }, ['title', 'status']),
          propertiesForAction('upsertSubmodule', {
            module_id: { type: 'string', description: 'UUID of the parent module this submodule belongs to.' },
            title: { type: 'string' },
            submodule_type: { type: ['string', 'null'] },
            summary: { type: ['string', 'null'] },
            content: { type: ['string', 'null'] },
            dm_notes: { type: ['string', 'null'] },
            sort_order: { type: 'number' },
          }, ['module_id', 'title']),
          propertiesForAction('upsertScene', {
            submodule_id: { type: 'string', description: 'UUID of the parent submodule this scene belongs to.' },
            title: { type: 'string' },
            scene_type: { type: ['string', 'null'] },
            summary: { type: ['string', 'null'] },
            content: { type: ['string', 'null'] },
            dm_notes: { type: ['string', 'null'] },
            sort_order: { type: 'number' },
          }, ['submodule_id', 'title']),
          propertiesForAction('upsertRelationship', {
            from_id: { type: 'string' },
            from_kind: { type: 'string', enum: ['pc', 'npc'] },
            to_id: { type: 'string' },
            to_kind: { type: 'string', enum: ['pc', 'npc'] },
            relationship_type: { type: 'string', enum: ['ally', 'rival', 'foe', 'neutral'] },
            label: { type: ['string', 'null'] },
          }, ['from_id', 'from_kind', 'to_id', 'to_kind', 'relationship_type']),
        ],
      },
    },
  },
  required: ['summary', 'actions'],
  additionalProperties: false,
};

function buildSystemPrompt(campaignContext: string): string {
  return `You extract campaign updates from a DM's session document and propose a batch of structured changes.

${campaignContext}

== YOUR TASK ==

Read the document the DM has provided and identify every create-or-update that should be made to the campaign data above. Return your proposals via the propose_import_actions tool.

== RULES ==

1. **Matching**: For each proposed change, decide whether it updates an existing entity or creates a new one.
   - Set "matched_id" to the existing entity's id (shown in brackets above) when you're confident it's the same thing. Be willing to match across minor naming differences (e.g. "the high priestess" vs "Zarethyl" if Zarethyl is established as a high priestess).
   - Set "matched_id" to null ONLY when the entity genuinely doesn't exist yet.
   - Always populate "reasoning" with a short sentence explaining the match decision. The DM will see this on their review card.

2. **Coverage**: Propose updates to every relevant section, not just the obvious one. Typical patterns:
   - A session recap → upsertSession AND upsertNPC for each NPC mentioned (updating description / met_by_pcs / location), AND upsertHook for every plot beat that advanced, AND upsertPC for any PC backstory detail revealed.
   - A prep doc for a future session → upsertSubmodule or upsertScene under a module, plus any new NPCs/locations referenced.
   - A character arc document → upsertPC for the PC, plus upsertHook for the arc, plus upsertNPC for any related NPCs.

3. **met_by_pcs**: When the document shows PCs encountering an NPC for the first (or any) time, set "met_by_pcs": true on the NPC upsert.

4. **Do not fabricate**: Only include fields supported by content in the document. Leave unchanged fields out of the payload entirely — do not re-emit existing values unless the document changes them. For creates, only include fields the document actually describes.

5. **Never delete anything**. No deletion actions exist in the schema.

6. **Never invent IDs**. faction_ids, statblock_id, module_id, submodule_id, from_id, to_id must all come from the existing campaign data listed above. If you can't find a matching id, skip the action rather than making one up.

7. **Sessions**: If proposing upsertSession with session_date, use ISO format (YYYY-MM-DD).

8. **Hooks**: category must be one of main_plot, side_quest, character_arc, faction (or null).

9. **Summary**: Write a brief (1-3 sentence) human-readable summary of what you found. This appears in the chat bubble before the review cards.

10. **Prefer updates over near-duplicates**: If a candidate match exists, prefer updating it rather than creating a duplicate with a slightly different name.

Return ONLY via the propose_import_actions tool call. Do not emit plain text.`;
}

function extractDocIdFromGoogleDocsUrl(url: string): string | null {
  // https://docs.google.com/document/d/<id>/edit or .../d/<id>/view
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function fetchGoogleDocAsText(url: string): Promise<string> {
  const id = extractDocIdFromGoogleDocsUrl(url);
  if (!id) {
    throw new Error('Could not parse a Google Docs document id from that URL.');
  }
  const exportUrl = `https://docs.google.com/document/d/${id}/export?format=txt`;
  const res = await fetch(exportUrl);
  if (!res.ok) {
    throw new Error(
      `Couldn't fetch that Google Doc (HTTP ${res.status}). Make sure it's shared publicly ("Anyone with the link") or paste the text directly.`
    );
  }
  return await res.text();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body as RequestBody;
  if (!body || !body.kind || !body.campaignContext) {
    return res.status(400).json({ error: 'Missing kind or campaignContext' });
  }

  try {
    // ── 1. Turn the input into something we can send to Claude ──────────────
    // Either a plain-text string, or a document block (for PDFs).
    let userContent: Anthropic.ContentBlockParam[];

    switch (body.kind) {
      case 'text': {
        if (!body.payload?.trim()) {
          return res.status(400).json({ error: 'Empty document' });
        }
        userContent = [
          { type: 'text', text: `Document: ${body.filename ?? 'pasted text'}\n\n${body.payload}` },
        ];
        break;
      }
      case 'docx': {
        let buffer: Buffer;
        try {
          buffer = Buffer.from(body.payload, 'base64');
        } catch {
          return res.status(400).json({ error: 'Invalid base64 payload for docx' });
        }
        const { value: extracted } = await mammoth.extractRawText({ buffer });
        if (!extracted?.trim()) {
          return res.status(400).json({ error: 'No text could be extracted from that .docx file.' });
        }
        userContent = [
          { type: 'text', text: `Document: ${body.filename ?? 'uploaded.docx'}\n\n${extracted}` },
        ];
        break;
      }
      case 'pdf': {
        if (!body.payload) {
          return res.status(400).json({ error: 'Missing pdf payload' });
        }
        userContent = [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: body.payload },
            title: body.filename ?? 'uploaded.pdf',
          },
          { type: 'text', text: 'Parse the attached document and propose campaign updates.' },
        ];
        break;
      }
      case 'gdocs-url': {
        const text = await fetchGoogleDocAsText(body.payload);
        if (!text.trim()) {
          return res.status(400).json({ error: 'The Google Doc appears to be empty.' });
        }
        userContent = [
          { type: 'text', text: `Document (Google Docs): ${body.payload}\n\n${text}` },
        ];
        break;
      }
      default:
        return res.status(400).json({ error: `Unknown kind: ${(body as { kind: string }).kind}` });
    }

    // ── 2. Call Claude with tool use forced ────────────────────────────────
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: buildSystemPrompt(body.campaignContext),
      tools: [
        {
          name: 'propose_import_actions',
          description: 'Propose a batch of create/update actions extracted from the DM document.',
          input_schema: actionSchema as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'propose_import_actions' },
      messages: [{ role: 'user', content: userContent }],
    });

    // ── 3. Extract the tool_use block ──────────────────────────────────────
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );
    if (!toolUse) {
      return res.status(500).json({
        error: 'Claude did not return a tool_use block. Try again or simplify the document.',
      });
    }

    const input = toolUse.input as { summary?: string; actions?: unknown[] };
    return res.status(200).json({
      summary: input.summary ?? '',
      actions: Array.isArray(input.actions) ? input.actions : [],
    });
  } catch (err) {
    const message = err instanceof Anthropic.APIError
      ? `API Error (${err.status}): ${err.message}`
      : err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}
