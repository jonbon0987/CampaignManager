/**
 * Shared AI provider abstraction.
 *
 * Reads the provider from the request body (`provider` field) or falls back to
 * the VITE_AI_PROVIDER env var, defaulting to "gemini" (free tier).
 *
 * This module exposes thin helpers so each endpoint can call Claude or Gemini
 * without duplicating provider-selection logic.
 */

import './_env.js';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI, type GenerateContentRequest, type GenerationConfig, type Part } from '@google/generative-ai';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AIProvider = 'claude' | 'gemini';

// Gemini model id — overridable via env so it can track new releases without a
// code change. Defaults to gemini-3.6-flash: the current Flash model, and (per
// the AI Studio rate-limits table) free-tier eligible at generous limits.
// Fall back to gemini-2.5-flash-lite via GEMINI_MODEL if a given account/region
// doesn't have free access to 3.6.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

export function resolveProvider(bodyProvider?: string): AIProvider {
  // Default provider is Gemini (free tier). Set the request `provider` field or
  // VITE_AI_PROVIDER=claude to use Anthropic instead.
  const p = (bodyProvider || process.env.VITE_AI_PROVIDER || 'gemini').toLowerCase();
  if (p === 'claude') return 'claude';
  return 'gemini';
}

// ── Clients (lazy singletons) ──────────────────────────────────────────────────

let _anthropic: Anthropic | null = null;
export function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      // In production, env vars come from the host (e.g. Vercel Project
      // Settings), not from .env.local. A missing key otherwise surfaces as the
      // SDK's opaque "Could not resolve authentication method" error.
      throw new Error('ANTHROPIC_API_KEY is not set in this environment. Add it to your host\'s environment variables (Production scope) and redeploy.');
    }
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}

let _gemini: GoogleGenerativeAI | null = null;
export function getGeminiClient(): GoogleGenerativeAI {
  if (!_gemini) {
    const key = process.env.GOOGLE_AI_API_KEY;
    if (!key) throw new Error('GOOGLE_AI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey');
    _gemini = new GoogleGenerativeAI(key);
  }
  return _gemini;
}

// ── Simple text generation (non-streaming) ─────────────────────────────────────

export interface SimpleGenerateOpts {
  provider: AIProvider;
  prompt: string;
  system?: string;
  maxTokens?: number;
  /**
   * Ask the model for strict JSON. On Gemini this switches on JSON mode
   * (responseMimeType: application/json), which guarantees syntactically valid,
   * properly-escaped JSON — without it, long free-text fields can contain raw
   * newlines/quotes and JSON.parse fails with "Unterminated string". Claude is
   * reliable enough at JSON that no special flag is needed there.
   */
  json?: boolean;
}

/** Generate a single text response (used by creature/encounter endpoints). */
export async function generateText(opts: SimpleGenerateOpts): Promise<string> {
  const { provider, prompt, system, maxTokens = 2048, json = false } = opts;

  if (provider === 'gemini') {
    const client = getGeminiClient();
    // The deprecated @google/generative-ai SDK forwards generationConfig verbatim
    // to the REST API, so thinkingConfig (absent from its types) still reaches
    // Gemini. gemini-3.x flash "thinks" by default and those tokens count against
    // the output budget — for a one-shot structured generation that can consume
    // the whole budget and leave the JSON empty or truncated ("unexpected end of
    // JSON" / "Unterminated string"). Disable thinking and give an explicit budget.
    const generationConfig = {
      maxOutputTokens: maxTokens,
      ...(json ? { responseMimeType: 'application/json' } : {}),
      thinkingConfig: { thinkingBudget: 0 },
    } as GenerationConfig;
    const model = client.getGenerativeModel({ model: GEMINI_MODEL, generationConfig });
    const parts: Part[] = [];
    if (system) parts.push({ text: system + '\n\n' });
    parts.push({ text: prompt });
    const result = await model.generateContent({ contents: [{ role: 'user', parts }] } as GenerateContentRequest);
    const text = result.response.text();
    if (!text.trim()) throw new Error('The model returned an empty response. Try again, or shorten the prompt.');
    return text;
  }

  // Claude
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as Anthropic.TextBlock).text)
    .join('');
}

// ── Streaming chat ─────────────────────────────────────────────────────────────

export interface StreamChatOpts {
  provider: AIProvider;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  system: string;
  maxTokens?: number;
  /** Called for each text chunk */
  onText: (text: string) => void;
}

/** Stream a multi-turn chat response (used by chat endpoint). */
export async function streamChat(opts: StreamChatOpts): Promise<void> {
  const { provider, messages, system, maxTokens = 4096, onText } = opts;

  if (provider === 'gemini') {
    const client = getGeminiClient();
    const model = client.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: { role: 'user', parts: [{ text: system }] },
    });

    // Convert messages to Gemini format
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{ text: m.content }],
    }));

    const result = await model.generateContentStream({ contents });
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) onText(text);
    }
    return;
  }

  // Claude — with retry
  let done = false;
  for (let attempt = 0; attempt < 3 && !done; attempt++) {
    try {
      const client = getAnthropicClient();
      const stream = client.messages.stream({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        system,
        messages,
      });
      stream.on('text', onText);
      await stream.finalMessage();
      done = true;
    } catch (err) {
      const isRetryable = err instanceof Anthropic.APIError &&
        (err.status === 529 || err.status === 503 || err.status === 502 || err.status === 500);
      if (isRetryable && attempt < 2) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
        continue;
      }
      throw err;
    }
  }
}

// ── Streaming summary (for document parse intro) ───────────────────────────────

export interface StreamSummaryOpts {
  provider: AIProvider;
  system: string;
  userContent: string;
  onText: (text: string) => void;
}

/** Stream a short summary (used by document parse first phase). */
export async function streamSummary(opts: StreamSummaryOpts): Promise<void> {
  const { provider, system, userContent, onText } = opts;

  if (provider === 'gemini') {
    const client = getGeminiClient();
    const model = client.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: { role: 'user', parts: [{ text: system }] },
    });
    const result = await model.generateContentStream({
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
    });
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) onText(text);
    }
    return;
  }

  // Claude — with retry
  let done = false;
  for (let attempt = 0; attempt < 3 && !done; attempt++) {
    try {
      const client = getAnthropicClient();
      const stream = client.messages.stream({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system,
        messages: [{ role: 'user', content: userContent }],
      });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          onText(event.delta.text);
        }
      }
      done = true;
    } catch (err) {
      const isRetryable = err instanceof Anthropic.APIError &&
        (err.status === 529 || err.status === 503 || err.status === 502 || err.status === 500);
      if (isRetryable && attempt < 2) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
        continue;
      }
      throw err;
    }
  }
}

// ── Structured extraction (tool use / JSON mode) ───────────────────────────────

export interface StructuredExtractOpts {
  provider: AIProvider;
  system: string;
  userContent: string;
  /** JSON schema for the expected output (used as tool schema for Claude, or JSON prompt for Gemini) */
  schema: Record<string, unknown>;
  schemaDescription: string;
}

/** Extract structured JSON using tool use (Claude) or JSON-prompted generation (Gemini). */
export async function structuredExtract(opts: StructuredExtractOpts): Promise<unknown> {
  const { provider, system, userContent, schema, schemaDescription } = opts;

  if (provider === 'gemini') {
    const client = getGeminiClient();
    const model = client.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: { role: 'user', parts: [{ text: system }] },
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const jsonSchemaHint = `\n\nYou MUST respond with valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}\n\nReturn ONLY the JSON object, no other text.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userContent + jsonSchemaHint }] }],
    } as GenerateContentRequest);

    const text = result.response.text();
    try {
      return JSON.parse(text);
    } catch {
      // Try to extract JSON from the response if it has extra text
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('Gemini returned invalid JSON for structured extraction');
    }
  }

  // Claude — tool use with retry
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const client = getAnthropicClient();
      const stream = client.messages.stream({
        model: 'claude-sonnet-5',
        max_tokens: 8192,
        system,
        tools: [
          {
            name: 'propose_import_actions',
            description: schemaDescription,
            input_schema: schema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: 'propose_import_actions' },
        messages: [{ role: 'user', content: userContent }],
      });

      const finalMessage = await stream.finalMessage();
      const toolUse = finalMessage.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );
      return toolUse ? toolUse.input : { actions: [] };
    } catch (err) {
      const isRetryable = err instanceof Anthropic.APIError &&
        (err.status === 529 || err.status === 503 || err.status === 502 || err.status === 500);
      if (isRetryable && attempt < 2) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
        continue;
      }
      throw err;
    }
  }
  return { actions: [] };
}

// ── Error formatting ───────────────────────────────────────────────────────────

export function friendlyError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    if (err.status === 529 || err.status === 502) return 'Claude is temporarily unavailable. Please wait a moment and try again.';
    const body = err.error as { error?: { message?: string } } | undefined;
    if (body?.error?.message) return body.error.message;
    if (err.status) return `API error (${err.status}): ${err.message}`;
    return err.message || 'Unknown API error';
  }
  return err instanceof Error ? err.message : 'Unknown error';
}
