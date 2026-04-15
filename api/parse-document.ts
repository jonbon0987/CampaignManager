import './_env';
import Anthropic from '@anthropic-ai/sdk';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import mammoth from 'mammoth';

type RequestBody = {
  kind: 'text' | 'docx' | 'pdf' | 'gdocs-url';
  payload: string;          // raw text, base64 for docx/pdf, or URL for gdocs-url
  filename?: string;
  campaignContext: string;  // pre-formatted campaign entity listing
  userInstructions?: string; // optional DM instructions to guide the parse
};

// ── Tool schema builder ─────────────────────────────────────────────────────
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

// ── Extraction passes ───────────────────────────────────────────────────────
// Each pass extracts a subset of entity types. This keeps each API call small
// enough to complete within timeout limits, even for very large documents.

interface ExtractionPass {
  label: string;           // shown to user as progress text
  focusInstruction: string; // tells Claude what to focus on
  actionSchemas: ReturnType<typeof propertiesForAction>[];
}

const extractionPasses: ExtractionPass[] = [
  {
    label: 'characters',
    focusInstruction: 'Extract ONLY player characters (PCs) and NPCs from the document. Include all details: roles, affiliations, statuses, descriptions, motivations, locations, and whether PCs have met them.',
    actionSchemas: [
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
  {
    label: 'locations & factions',
    focusInstruction: 'Extract ONLY locations and factions from the document. Include all details: regions, types, populations, histories, descriptions, agendas, and key figures.',
    actionSchemas: [
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
    ],
  },
  {
    label: 'sessions, hooks & lore',
    focusInstruction: 'Extract ONLY sessions, plot hooks, and lore entries from the document. For sessions include recaps, combats, loot, and DM notes. For hooks include categories, descriptions, and active status. For lore include titles, categories, and content.',
    actionSchemas: [
      propertiesForAction('upsertSession', {
        session_number: { type: 'number' },
        session_date: { type: ['string', 'null'] },
        summary: { type: ['string', 'null'] },
        combats: { type: ['string', 'null'] },
        loot_rewards: { type: ['string', 'null'] },
        hooks_notes: { type: ['string', 'null'] },
        dm_notes: { type: ['string', 'null'] },
      }, ['session_number']),
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
    ],
  },
  {
    label: 'modules & scenes',
    focusInstruction: 'Extract ONLY modules, submodules, and scenes from the document. For modules include chapter numbers, synopses, statuses, encounters, and rewards. For submodules and scenes include parent IDs, summaries, and content.',
    actionSchemas: [
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
    ],
  },
];

function buildPassSchema(pass: ExtractionPass) {
  return {
    type: 'object' as const,
    properties: {
      actions: {
        type: 'array',
        items: {
          oneOf: pass.actionSchemas,
        },
      },
    },
    required: ['actions'],
    additionalProperties: false,
  };
}

function buildExtractionSystemPrompt(campaignContext: string, pass: ExtractionPass): string {
  return `You extract campaign updates from a DM's session document and propose structured changes.

${campaignContext}

== YOUR TASK ==

${pass.focusInstruction}

Return your proposals via the propose_import_actions tool. If the document has no relevant content for this category, return an empty actions array.

== RULES ==

1. **Matching**: Set "matched_id" to the existing entity's id (shown in [id:...] brackets above) when updating an existing entity. Set to null for new entities. Be willing to match across minor naming differences.

2. **Reasoning**: Always populate "reasoning" with a short sentence explaining the match decision.

3. **met_by_pcs**: When the document shows PCs encountering an NPC, set "met_by_pcs": true.

4. **Do not fabricate**: Only include fields supported by content in the document. Leave unchanged fields out of the payload.

5. **Never delete anything**.

6. **Never invent IDs**. faction_ids, module_id, submodule_id, from_id, to_id must come from existing campaign data. If you can't find a matching id, skip.

7. **Sessions**: Use ISO date format (YYYY-MM-DD).

8. **Hooks**: category must be main_plot, side_quest, character_arc, faction, or null.

9. **Prefer updates over near-duplicates**.

Return ONLY via the propose_import_actions tool call. Do not emit plain text.`;
}

function buildSummarySystemPrompt(campaignContext: string): string {
  return `You are a D&D campaign assistant. The DM has uploaded a document for you to analyze.

${campaignContext}

Read the document and write a brief 2-3 sentence summary of what you found — what kind of document it is, what entities it mentions, and what updates you'll be proposing to the campaign. Be specific about names and numbers (e.g. "This session recap covers 3 NPCs, 2 new locations, and advances the main plot hook. I'll extract all changes now.").

IMPORTANT RULES:
- Do NOT ask follow-up questions. Do NOT ask the user what to prioritize or what they'd like to do.
- End with a statement like "Extracting changes now..." because the system will automatically extract all structured data after your summary.
- Keep it to 2-3 sentences maximum. No bullet points, no lists.`;
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

// ── Run a single extraction pass with retry ─────────────────────────────────

async function runExtractionPass(
  client: Anthropic,
  campaignContext: string,
  userContent: Anthropic.ContentBlockParam[],
  pass: ExtractionPass,
): Promise<unknown[]> {
  const schema = buildPassSchema(pass);
  const systemPrompt = buildExtractionSystemPrompt(campaignContext, pass);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const stream = client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: systemPrompt,
        tools: [
          {
            name: 'propose_import_actions',
            description: `Propose ${pass.label} actions extracted from the DM document.`,
            input_schema: schema as unknown as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: 'propose_import_actions' },
        messages: [{ role: 'user', content: userContent }],
      });

      const finalMessage = await stream.finalMessage();

      const toolUse = finalMessage.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );

      if (!toolUse) return [];

      const toolInput = toolUse.input as { actions?: unknown[] };
      return Array.isArray(toolInput.actions) ? toolInput.actions : [];
    } catch (err) {
      const isRetryable = err instanceof Anthropic.APIError &&
        (err.status === 529 || err.status === 503 || err.status === 500);
      if (isRetryable && attempt < 2) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
        continue;
      }
      throw err;
    }
  }
  return [];
}

// ── Main handler ────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body as RequestBody;
  if (!body || !body.kind || !body.campaignContext) {
    return res.status(400).json({ error: 'Missing kind or campaignContext' });
  }

  // Switch to SSE streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  function send(event: Record<string, unknown>) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  try {
    // ── 1. Turn the input into something we can send to Claude ──────────────
    let userContent: Anthropic.ContentBlockParam[];

    switch (body.kind) {
      case 'text': {
        if (!body.payload?.trim()) {
          send({ type: 'error', message: 'Empty document' });
          res.end();
          return;
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
          send({ type: 'error', message: 'Invalid base64 payload for docx' });
          res.end();
          return;
        }
        const { value: extracted } = await mammoth.extractRawText({ buffer });
        if (!extracted?.trim()) {
          send({ type: 'error', message: 'No text could be extracted from that .docx file.' });
          res.end();
          return;
        }
        userContent = [
          { type: 'text', text: `Document: ${body.filename ?? 'uploaded.docx'}\n\n${extracted}` },
        ];
        break;
      }
      case 'pdf': {
        if (!body.payload) {
          send({ type: 'error', message: 'Missing pdf payload' });
          res.end();
          return;
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
        let text: string;
        try {
          text = await fetchGoogleDocAsText(body.payload);
        } catch (err) {
          send({ type: 'error', message: err instanceof Error ? err.message : 'Failed to fetch Google Doc' });
          res.end();
          return;
        }
        if (!text.trim()) {
          send({ type: 'error', message: 'The Google Doc appears to be empty.' });
          res.end();
          return;
        }
        userContent = [
          { type: 'text', text: `Document (Google Docs): ${body.payload}\n\n${text}` },
        ];
        break;
      }
      default:
        send({ type: 'error', message: `Unknown kind: ${(body as { kind: string }).kind}` });
        res.end();
        return;
    }

    // ── 2. Append user instructions if provided ─────────────────────────────
    const instructionsSuffix = body.userInstructions?.trim()
      ? `\n\nDM's instructions: ${body.userInstructions.trim()}`
      : '';

    if (instructionsSuffix) {
      userContent.push({ type: 'text', text: instructionsSuffix });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // ── 3. Phase 1: stream a summary of what was found ──────────────────────
    const summaryMessages: Anthropic.MessageParam[] = [
      { role: 'user', content: userContent },
    ];

    let summaryDone = false;
    for (let attempt = 0; attempt < 3 && !summaryDone; attempt++) {
      try {
        const summaryStream = client.messages.stream({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          system: buildSummarySystemPrompt(body.campaignContext),
          messages: summaryMessages,
        });

        for await (const event of summaryStream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            send({ type: 'text', text: event.delta.text });
          }
        }
        summaryDone = true;
      } catch (err) {
        const isRetryable = err instanceof Anthropic.APIError &&
          (err.status === 529 || err.status === 503 || err.status === 500);
        if (isRetryable && attempt < 2) {
          await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
          continue;
        }
        throw err;
      }
    }

    // ── 4. Phase 2: chunked extraction — one pass per entity category ───────
    send({ type: 'extracting' });

    // Send SSE heartbeats every 5s to keep the connection alive
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 5000);

    const allActions: unknown[] = [];
    try {
      for (let pi = 0; pi < extractionPasses.length; pi++) {
        const pass = extractionPasses[pi];
        // Tell the client which pass we're on
        send({ type: 'pass', index: pi, total: extractionPasses.length, label: pass.label });

        try {
          const passActions = await runExtractionPass(client, body.campaignContext, userContent, pass);

          // Stream each action to the client immediately
          for (const action of passActions) {
            send({ type: 'action', action });
            allActions.push(action);
          }
        } catch (err) {
          // Log but continue with remaining passes
          const msg = err instanceof Error ? err.message : 'Unknown error';
          send({ type: 'text', text: `\n\n_Warning: failed to extract ${pass.label} (${msg}). Continuing with remaining categories..._` });
        }
      }
    } finally {
      clearInterval(heartbeat);
    }

    send({ type: 'done', count: allActions.length });
    res.end();
  } catch (err) {
    send({ type: 'error', message: friendlyError(err) });
    res.end();
  }
}

function friendlyError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    if (err.status === 529) {
      return 'Claude is currently overloaded. Please wait a moment and try again.';
    }
    // The SDK exposes the parsed error body on err.error
    const body = err.error as { error?: { message?: string; type?: string } } | undefined;
    if (body?.error?.message) return body.error.message;
    if (err.status) return `API error (${err.status}): ${err.message}`;
    return err.message || 'Unknown API error';
  }
  return err instanceof Error ? err.message : 'Unknown error';
}
