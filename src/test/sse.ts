// src/test/sse.ts
// Helpers to fake the /api/chat streaming Response consumed by streamChatText
// in generateWorld/generateCampaign. Each SSE line is `data: <json>\n\n` where
// json is { type: 'text', text } or { type: 'error', message }.

function reader(payloads: Uint8Array[]) {
  let i = 0;
  return {
    read: async () =>
      i < payloads.length
        ? { done: false, value: payloads[i++] }
        : { done: true, value: undefined },
  };
}

const enc = new TextEncoder();
const line = (obj: unknown) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);

/** A successful stream that emits each string as a separate `text` event. */
export function sseChunks(...texts: string[]) {
  return { ok: true, body: { getReader: () => reader(texts.map(t => line({ type: 'text', text: t }))) } };
}

/** A stream that emits an `error` event mid-flight. */
export function sseError(message: string) {
  return { ok: true, body: { getReader: () => reader([line({ type: 'error', message })]) } };
}

/** A non-2xx HTTP response (optionally carrying a JSON { error } body). */
export function httpError(status: number, body?: { error?: string }) {
  return { ok: false, status, body: null, json: async () => body ?? {} };
}
