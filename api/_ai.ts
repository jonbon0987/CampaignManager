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
import Groq from 'groq-sdk';
import { GoogleGenerativeAI, GoogleGenerativeAIFetchError, type GenerateContentRequest, type GenerationConfig, type Part } from '@google/generative-ai';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AIProvider = 'claude' | 'gemini' | 'groq';

// Gemini model id — overridable via env so it can track new releases without a
// code change. Defaults to gemini-3.5-flash-lite: cheaper/faster than the full
// Flash model and free-tier eligible. Unlike gemini-3.5-flash, -lite (and
// -latest) variants reject an explicit thinkingConfig — see the guard in
// generateText below, which omits it for those model ids.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
// -lite/-latest Gemini variants error on an explicit thinkingConfig (they have
// no "thinking" mode to configure), so generateText must not send one for them.
const GEMINI_SUPPORTS_THINKING_CONFIG = !/-lite\b|-latest\b/.test(GEMINI_MODEL);

// Groq chat model. Free tier, OpenAI-compatible. llama-3.3-70b-versatile is the
// quality default; override via GROQ_MODEL (e.g. llama-3.1-8b-instant for volume).
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

export function resolveProvider(bodyProvider?: string): AIProvider {
  // Default provider is Gemini (free tier). Set the request `provider` field or
  // VITE_AI_PROVIDER to override. Chat resolves its own provider separately (see
  // CHAT_AI_PROVIDER in api/chat.ts) so it can run on Groq while imports stay on
  // Gemini's large-context free tier.
  const p = (bodyProvider || process.env.VITE_AI_PROVIDER || 'gemini').toLowerCase();
  if (p === 'claude') return 'claude';
  if (p === 'groq') return 'groq';
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

let _groq: Groq | null = null;
export function getGroqClient(): Groq {
  if (!_groq) {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error('GROQ_API_KEY is not set. Get a free key at https://console.groq.com/keys');
    _groq = new Groq({ apiKey: key });
  }
  return _groq;
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
    // JSON" / "Unterminated string"). Disable thinking and give an explicit budget
    // — except on -lite/-latest models, which have no thinking mode and reject
    // the field outright (see GEMINI_SUPPORTS_THINKING_CONFIG above).
    const generationConfig = {
      maxOutputTokens: maxTokens,
      ...(json ? { responseMimeType: 'application/json' } : {}),
      ...(GEMINI_SUPPORTS_THINKING_CONFIG ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
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

  if (provider === 'groq') {
    // OpenAI-compatible: system is the first message, then the turn history.
    // Retry only transient 5xx — a 429 (free-tier cap) surfaces immediately via
    // friendlyError so the user is told to wait rather than silently looping.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const client = getGroqClient();
        const stream = await client.chat.completions.create({
          model: GROQ_MODEL,
          max_tokens: maxTokens,
          stream: true,
          messages: [{ role: 'system', content: system }, ...messages],
        });
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) onText(text);
        }
        return;
      } catch (err) {
        const status = err instanceof Groq.APIError ? err.status : undefined;
        const isRetryable = status != null && status >= 500 && attempt < 2;
        if (isRetryable) {
          await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
          continue;
        }
        throw err;
      }
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

// Recover as many complete objects as possible from the `actions` array of a
// truncated JSON response. gemini-*-lite can hit the output-token cap mid-array,
// producing JSON that never closes — rather than lose the whole extraction pass
// (and surface a raw "Expected ',' or ']'" parser error to the DM), salvage the
// action objects that finished streaming before the cutoff. Quote/escape-aware
// so braces inside string values don't throw off the depth count.
function salvageActionsArray(text: string): unknown[] | null {
  const keyIdx = text.indexOf('"actions"');
  if (keyIdx < 0) return null;
  const arrStart = text.indexOf('[', keyIdx);
  if (arrStart < 0) return null;

  const objects: string[] = [];
  let depth = 0, objStart = -1, inStr = false, escaped = false;
  for (let i = arrStart + 1; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') { if (depth === 0) objStart = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) { objects.push(text.slice(objStart, i + 1)); objStart = -1; }
    } else if (ch === ']' && depth === 0) break; // reached a clean array close
  }

  const parsed: unknown[] = [];
  for (const obj of objects) {
    try { parsed.push(JSON.parse(obj)); } catch { /* trailing partial object — skip */ }
  }
  return parsed.length ? parsed : null;
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
        // Without an explicit cap this falls back to the model's default —
        // noticeably smaller on -lite tiers than on full Flash. JSON mode still
        // returns syntactically valid JSON when the response is cut short, so a
        // too-small default silently truncates the actions array (a handful of
        // entities instead of everything the document actually has) rather than
        // erroring. 8192 matches the cap Claude's branch below uses for parity.
        maxOutputTokens: 8192,
      },
    });

    const jsonSchemaHint = `\n\nYou MUST respond with valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}\n\nReturn ONLY the JSON object, no other text.`;

    // A document import fires several of these calls back to back (one per
    // extraction pass, plus the summary/title calls) — enough to tip over a
    // free-tier per-minute rate limit partway through. Unlike the Claude branch
    // below, this had no retry at all: a single transient/rate-limit error on
    // one pass silently zeroed out that whole category of entities (the outer
    // per-pass catch in parse-document.ts logs a warning and moves on). Retry
    // with backoff — honoring Google's suggested retryDelay on a 429 — so a
    // rate-limited pass gets a second chance instead of coming back empty.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: userContent + jsonSchemaHint }] }],
        } as GenerateContentRequest);

        const text = result.response.text();
        try {
          return JSON.parse(text);
        } catch {
          // The model wrapped the object in prose (rare with JSON mode) — retry a
          // clean parse of just the outermost object.
          const match = text.match(/\{[\s\S]*\}/);
          if (match) {
            try { return JSON.parse(match[0]); } catch { /* likely truncated — fall through to salvage */ }
          }
          // The response was cut off (usually the output-token cap) mid-array.
          // Recover whatever complete actions finished before the cutoff rather
          // than failing the whole pass.
          const salvaged = salvageActionsArray(text);
          if (salvaged) return { actions: salvaged };
          throw new Error('This section of the document was too long for the AI to read in one pass. Try a smaller document, or split it into sections and import them separately.');
        }
      } catch (err) {
        const isRateLimit = err instanceof GoogleGenerativeAIFetchError && err.status === 429;
        const isRetryable = isRateLimit ||
          (err instanceof GoogleGenerativeAIFetchError && (err.status === 503 || err.status === 500));
        if (isRetryable && attempt < 2) {
          const suggested = isRateLimit ? retryDelaySeconds((err as GoogleGenerativeAIFetchError).errorDetails) : null;
          // Cap the honored wait so one slow pass can't stall the whole import.
          const waitMs = suggested != null ? Math.min(suggested, 20) * 1000 : (attempt + 1) * 3000;
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        throw err;
      }
    }
    throw new Error('Gemini structured extraction failed after retries');
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

// Pull the RetryInfo "retryDelay" (e.g. "37s") out of a Gemini error's details,
// so a rate-limit message can tell the user roughly how long to wait.
function retryDelaySeconds(details: unknown): number | null {
  if (!Array.isArray(details)) return null;
  for (const d of details) {
    const rec = d as Record<string, unknown>;
    const type = rec['@type'];
    if (typeof type === 'string' && type.includes('RetryInfo') && typeof rec.retryDelay === 'string') {
      const m = rec.retryDelay.match(/(\d+)/);
      if (m) return parseInt(m[1], 10);
    }
  }
  return null;
}

const RATE_LIMIT_MESSAGE =
  "The free-tier limit was reached (rate or daily quota). Wait a moment and try again — the per-minute limit clears quickly, and the daily quota resets at midnight Pacific.";

export function friendlyError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    if (err.status === 429) return `Claude: ${RATE_LIMIT_MESSAGE}`;
    if (err.status === 529 || err.status === 502) return 'Claude is temporarily unavailable. Please wait a moment and try again.';
    const body = err.error as { error?: { message?: string } } | undefined;
    if (body?.error?.message) return body.error.message;
    if (err.status) return `API error (${err.status}): ${err.message}`;
    return err.message || 'Unknown API error';
  }

  // Groq (chat) — free tier is capped at 30 req/min and ~1K req/day per model.
  if (err instanceof Groq.APIError) {
    if (err.status === 429) return `Groq: ${RATE_LIMIT_MESSAGE}`;
    if (err.status != null && err.status >= 500) return 'Groq is temporarily unavailable. Please wait a moment and try again.';
    if (err.status) return `Groq API error (${err.status}): ${err.message}`;
    return err.message || 'Unknown Groq API error';
  }

  // Gemini (imports/generation) — a 429 means the free-tier rate/quota was hit.
  if (err instanceof GoogleGenerativeAIFetchError) {
    if (err.status === 429) {
      const wait = retryDelaySeconds(err.errorDetails);
      const lead = wait ? `Wait about ${wait}s and try again` : 'Wait a moment and try again';
      return `Gemini's free-tier limit was reached (rate or daily quota). ${lead}. The daily quota resets at midnight Pacific.`;
    }
    if (err.status === 503 || err.status === 500) return 'Gemini is temporarily unavailable. Please wait a moment and try again.';
    if (err.status) return `Gemini API error (${err.status}): ${err.message}`;
  }

  // Last resort: some SDK errors get wrapped and only carry the signal in text.
  const msg = err instanceof Error ? err.message : String(err);
  if (/\b429\b|RESOURCE_EXHAUSTED|rate limit|quota/i.test(msg)) {
    return `An AI provider free-tier limit was reached. ${RATE_LIMIT_MESSAGE}`;
  }
  return err instanceof Error ? err.message : 'Unknown error';
}
