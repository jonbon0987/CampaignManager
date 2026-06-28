import './_env.js';
import Anthropic from '@anthropic-ai/sdk';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import mammoth from 'mammoth';
import { resolveProvider, streamSummary, structuredExtract, friendlyError, type AIProvider } from './_ai.js';
import { requireAuth } from './_auth.js';

type RequestBody = {
  kind: 'text' | 'docx' | 'pdf' | 'gdocs-url';
  payload: string;          // raw text, base64 for docx/pdf, or URL for gdocs-url
  filename?: string;
  campaignContext: string;  // pre-formatted campaign entity listing
  userInstructions?: string; // optional DM instructions to guide the parse
  provider?: string;
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
  {
    label: 'creature stat sheets',
    focusInstruction: `Extract ONLY creature/monster stat blocks from the document. These are mechanical game statistics for creatures, NPCs, or player characters — armor class, hit points, ability scores, actions, traits, etc.

For the "content" field, use markdown to format the stat block's traits, actions, reactions, legendary actions, and any other abilities. Use **bold** for ability names. Group them under markdown headings (### Traits, ### Actions, ### Reactions, ### Legendary Actions, etc.).

Do NOT extract NPCs, PCs, locations, or other narrative data here — only mechanical stat blocks.`,
    actionSchemas: [
      propertiesForAction('upsertMonsterStatblock', {
        name: { type: 'string' },
        creature_type: { type: ['string', 'null'], description: 'e.g. "Medium humanoid (elf)", "Large dragon"' },
        challenge_rating: { type: ['string', 'null'], description: 'e.g. "1/4", "5", "20"' },
        armor_class: { type: ['number', 'null'] },
        ac_descriptor: { type: ['string', 'null'], description: 'e.g. "natural armor", "leather armor, shield"' },
        hit_points: { type: ['number', 'null'] },
        hit_dice: { type: ['string', 'null'], description: 'e.g. "8d8+16"' },
        speed: { type: ['string', 'null'], description: 'e.g. "30 ft., fly 60 ft."' },
        str: { type: ['number', 'null'] },
        dex: { type: ['number', 'null'] },
        con: { type: ['number', 'null'] },
        int: { type: ['number', 'null'] },
        wis: { type: ['number', 'null'] },
        cha: { type: ['number', 'null'] },
        saving_throws: { type: ['string', 'null'], description: 'e.g. "Dex +5, Wis +3"' },
        skills: { type: ['string', 'null'], description: 'e.g. "Perception +5, Stealth +7"' },
        damage_immunities: { type: ['string', 'null'] },
        damage_resistances: { type: ['string', 'null'] },
        condition_immunities: { type: ['string', 'null'] },
        senses: { type: ['string', 'null'], description: 'e.g. "darkvision 60 ft., passive Perception 15"' },
        languages: { type: ['string', 'null'] },
        content: { type: ['string', 'null'], description: 'Markdown-formatted traits, actions, reactions, legendary actions, and other abilities.' },
        dm_notes: { type: ['string', 'null'] },
        tags: { type: ['string', 'null'], description: 'Comma-separated tags for filtering, e.g. "boss, undead, homebrew"' },
      }, ['name']),
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

function buildExtractionSystemPrompt(campaignContext: string, pass: ExtractionPass, userInstructions?: string): string {
  const instructionBlock = userInstructions?.trim()
    ? `\n\n== DM'S INSTRUCTIONS (HIGHEST PRIORITY) ==\n\nThe DM gave these specific instructions:\n"${userInstructions.trim()}"\n\nYou MUST follow these instructions exactly. If the DM asked to create a specific entity type (e.g. "upload as a submodule", "create a module", "add as lore"), ONLY create that entity type — do NOT extract other entity types unless the DM explicitly asked for them. The DM's instructions override the default extraction behavior.\n\nIf this extraction pass does not match what the DM asked for, return an empty actions array.`
    : '';

  return `You extract campaign updates from a DM's session document and propose structured changes.

${campaignContext}

== YOUR TASK ==

${pass.focusInstruction}${instructionBlock}

Return your proposals via the propose_import_actions tool. If the document has no relevant content for this category, return an empty actions array.

== RULES ==

1. **Matching**: Set "matched_id" to the existing entity's id (shown in [id:...] brackets above) when updating an existing entity. Set to null for new entities. Be willing to match across minor naming differences.

2. **Reasoning**: Always populate "reasoning" with a short sentence explaining the match decision.

3. **met_by_pcs**: When the document shows PCs encountering an NPC, set "met_by_pcs": true.

4. **Do not fabricate**: Only include fields you want to set. Leave unchanged fields out of the payload. When updating a text field on a matched existing entity, INCORPORATE the existing content shown in the campaign data above — do not discard it. Add, revise, or append new information from the document into the existing text. Write the merged result as a single cohesive field value.

5. **Never delete anything**.

6. **Never invent IDs**. faction_ids, module_id, submodule_id, from_id, to_id must come from existing campaign data. If you can't find a matching id, skip.

7. **Sessions**: Use ISO date format (YYYY-MM-DD).

8. **Hooks**: category must be main_plot, side_quest, character_arc, faction, or null. Match a hook to an existing entry in HOOKS & IDEAS whenever they describe the same quest or storyline — even if the document's title is reworded, shortened, or summarized differently. Set matched_id and merge the new developments into the existing description rather than proposing a duplicate hook. Only create a new hook when the storyline has no counterpart above.

9. **Prefer updates over near-duplicates**.

Return ONLY via the propose_import_actions tool call. Do not emit plain text.`;
}

function buildSummarySystemPrompt(campaignContext: string, userInstructions?: string): string {
  const instructionBlock = userInstructions?.trim()
    ? `\n\nThe DM gave these specific instructions for how to process this document:\n"${userInstructions.trim()}"\n\nYou MUST acknowledge these instructions in your summary. Describe what the document contains AND confirm you will follow the DM's instructions. For example, if they said "upload as a submodule", confirm you'll create a submodule — do NOT say you'll extract NPCs, locations, etc. unless the DM asked for that.`
    : '';

  return `You are a D&D campaign assistant. The DM has uploaded a document for you to analyze.

${campaignContext}

Read the document and write a brief 2-3 sentence summary of what you found — what kind of document it is, what entities it mentions, and what updates you'll be proposing to the campaign. Be specific about names and numbers (e.g. "This session recap covers 3 NPCs, 2 new locations, and advances the main plot hook. I'll extract all changes now.").${instructionBlock}

IMPORTANT RULES:
- Do NOT ask follow-up questions. Do NOT ask the user what to prioritize or what they'd like to do.
- End with a statement like "Extracting changes now..." because the system will automatically extract all structured data after your summary.
- Keep it to 2-3 sentences maximum. No bullet points, no lists.`;
}

function extractDocIdFromGoogleDocsUrl(url: string): string | null {
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

// ── Run a single extraction pass (provider-aware) ──────────────────────────

async function runExtractionPass(
  provider: AIProvider,
  campaignContext: string,
  userContentText: string,
  pass: ExtractionPass,
  userInstructions?: string,
  // Claude-only: full content blocks for PDF support
  claudeUserContent?: Anthropic.ContentBlockParam[],
): Promise<unknown[]> {
  const schema = buildPassSchema(pass);
  const systemPrompt = buildExtractionSystemPrompt(campaignContext, pass, userInstructions);

  if (provider === 'gemini') {
    const result = await structuredExtract({
      provider: 'gemini',
      system: systemPrompt,
      userContent: userContentText,
      schema,
      schemaDescription: `Propose ${pass.label} actions extracted from the DM document.`,
    });
    const parsed = result as { actions?: unknown[] };
    return Array.isArray(parsed?.actions) ? parsed.actions : [];
  }

  // Claude — tool use with retry (uses full content blocks for PDF support)
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
        messages: [{ role: 'user', content: claudeUserContent || userContentText }],
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

  const userId = await requireAuth(req, res);
  if (!userId) return;

  const body = req.body as RequestBody;
  if (!body || !body.kind || !body.campaignContext) {
    return res.status(400).json({ error: 'Missing kind or campaignContext' });
  }

  const provider = resolveProvider(body.provider);

  // Switch to SSE streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  function send(event: Record<string, unknown>) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  try {
    // ── 1. Turn the input into text (and optionally Claude content blocks) ──
    let userContentText = '';
    let claudeUserContent: Anthropic.ContentBlockParam[] | undefined;

    switch (body.kind) {
      case 'text': {
        if (!body.payload?.trim()) {
          send({ type: 'error', message: 'Empty document' });
          res.end();
          return;
        }
        userContentText = `Document: ${body.filename ?? 'pasted text'}\n\n${body.payload}`;
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
        userContentText = `Document: ${body.filename ?? 'uploaded.docx'}\n\n${extracted}`;
        break;
      }
      case 'pdf': {
        if (!body.payload) {
          send({ type: 'error', message: 'Missing pdf payload' });
          res.end();
          return;
        }
        if (provider === 'gemini') {
          // Gemini doesn't support PDF content blocks the same way — we note this
          send({ type: 'error', message: 'PDF parsing with Gemini is not yet supported. Please convert to .txt or .docx, or switch to Claude for PDF imports.' });
          res.end();
          return;
        }
        // Claude gets native PDF content blocks
        claudeUserContent = [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: body.payload },
            title: body.filename ?? 'uploaded.pdf',
          },
          { type: 'text', text: 'Parse the attached document and propose campaign updates.' },
        ];
        userContentText = 'Parse the attached document and propose campaign updates.';
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
        userContentText = `Document (Google Docs): ${body.payload}\n\n${text}`;
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
      userContentText += instructionsSuffix;
      if (claudeUserContent) {
        claudeUserContent.push({ type: 'text', text: instructionsSuffix });
      }
    }

    // ── 3. Phase 1: stream a summary of what was found ──────────────────────
    const summaryInput = claudeUserContent
      ? claudeUserContent.map(b => 'text' in b ? (b as { text: string }).text : '[attached file]').join('\n')
      : userContentText;

    await streamSummary({
      provider,
      system: buildSummarySystemPrompt(body.campaignContext, body.userInstructions),
      userContent: summaryInput,
      onText(text) {
        send({ type: 'text', text });
      },
    });

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
          const passActions = await runExtractionPass(
            provider,
            body.campaignContext,
            userContentText,
            pass,
            body.userInstructions,
            claudeUserContent,
          );

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
