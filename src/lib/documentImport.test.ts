import { describe, it, expect, vi } from 'vitest';

// documentImport imports `./apiClient`, which imports `./supabase` — and
// supabase.ts throws at import time without VITE_SUPABASE_* env vars. Mock it
// so submitDocument's SSE-parsing tests stay hermetic.
vi.mock('./apiClient', () => ({ authHeaders: vi.fn().mockResolvedValue({ 'Content-Type': 'application/json' }) }));

import { normalizeConfidence, computeDiffRows, passProgressText, submitDocument, importSizeError, MAX_IMPORT_BYTES, DEFAULT_CONFIDENCE } from './documentImport';

/** A File stub of a given byte size without allocating the bytes. */
function fileOfSize(name: string, bytes: number, type = ''): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: bytes, configurable: true });
  return f;
}

/** Build a fetch Response streaming the given SSE `data: ` lines. */
function sseResponse(events: unknown[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

describe('importSizeError', () => {
  it('allows a file at or under the limit', () => {
    expect(importSizeError(fileOfSize('notes.txt', MAX_IMPORT_BYTES))).toBeNull();
    expect(importSizeError(fileOfSize('bible.docx', 1024))).toBeNull();
  });

  it('rejects an oversized non-text file with a plain-text conversion tip', () => {
    const err = importSizeError(fileOfSize('bible.docx', MAX_IMPORT_BYTES + 1));
    expect(err).toContain('imports are limited to');
    expect(err).toContain('plain text');
  });

  it('rejects an oversized text file with a split tip (not a convert-to-text tip)', () => {
    const err = importSizeError(fileOfSize('huge.txt', MAX_IMPORT_BYTES + 1, 'text/plain'));
    expect(err).toContain('splitting it into smaller sections');
    expect(err).not.toContain('plain text');
  });

  it('reports the actual file size in the message', () => {
    const err = importSizeError(fileOfSize('big.pdf', 3.5 * 1024 * 1024));
    expect(err).toContain('3.5 MB');
  });
});

describe('passProgressText', () => {
  it('renders a 1-based step counter and the pass label', () => {
    expect(passProgressText({ index: 0, total: 5, label: 'characters' }))
      .toBe('Extracting characters… (1 of 5)');
    expect(passProgressText({ index: 4, total: 5, label: 'campaigns' }))
      .toBe('Extracting campaigns… (5 of 5)');
  });
});

describe('normalizeConfidence', () => {
  it('passes through a valid 0-1 number', () => {
    expect(normalizeConfidence(0.82)).toBe(0.82);
  });
  it('rescales a percentage the model sent as 0-100', () => {
    expect(normalizeConfidence(88)).toBeCloseTo(0.88);
  });
  it('clamps out-of-range values', () => {
    expect(normalizeConfidence(1.4)).toBe(1);
    expect(normalizeConfidence(-3)).toBe(0);
  });
  it('parses a numeric string', () => {
    expect(normalizeConfidence('0.75')).toBe(0.75);
  });
  it('falls back to the default for junk or absent values', () => {
    expect(normalizeConfidence(undefined)).toBe(DEFAULT_CONFIDENCE);
    expect(normalizeConfidence('high')).toBe(DEFAULT_CONFIDENCE);
    expect(normalizeConfidence(null)).toBe(DEFAULT_CONFIDENCE);
    expect(normalizeConfidence(NaN)).toBe(DEFAULT_CONFIDENCE);
  });
});

describe('submitDocument — title event', () => {
  it('delivers a streamed title event to onTitle as soon as it arrives', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      { type: 'text', text: 'A summary. ' },
      { type: 'title', name: 'The Drowned Archive', tagline: 'Every secret it has ever swallowed.' },
      { type: 'extracting' },
      { type: 'done', count: 0 },
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const onTitle = vi.fn();
    const result = await submitDocument(
      { kind: 'text', payload: 'doc text' }, 'context', undefined,
      undefined, undefined, undefined, undefined, undefined, 'world',
      true, onTitle,
    );

    expect(onTitle).toHaveBeenCalledWith({ name: 'The Drowned Archive', tagline: 'Every secret it has ever swallowed.' });
    expect(result.summary).toBe('A summary.');
    // deriveTitle is forwarded in the request body so the server knows to run it.
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.deriveTitle).toBe(true);
    expect(body.scope).toBe('world');

    vi.unstubAllGlobals();
  });

  it('never calls onTitle when the server sends no title event', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      { type: 'text', text: 'A summary.' },
      { type: 'done', count: 0 },
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const onTitle = vi.fn();
    await submitDocument(
      { kind: 'text', payload: 'doc text' }, 'context', undefined,
      undefined, undefined, undefined, undefined, undefined, 'campaign',
      undefined, onTitle,
    );

    expect(onTitle).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('submitDocument — warning event', () => {
  it('delivers a failed-pass warning to onWarning without polluting the summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      { type: 'text', text: 'A clean summary.' },
      { type: 'extracting' },
      { type: 'pass', index: 0, total: 2, label: 'locations & factions' },
      { type: 'warning', label: 'locations & factions', message: 'rate limited' },
      { type: 'pass', index: 1, total: 2, label: 'characters' },
      { type: 'action', action: { type: 'upsertNPC', matched_id: null, reasoning: '', confidence: 0.9, payload: { name: 'Kutter' } } },
      { type: 'done', count: 1 },
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const onWarning = vi.fn();
    const result = await submitDocument(
      { kind: 'text', payload: 'doc text' }, 'context', undefined,
      undefined, undefined, undefined, undefined, undefined, 'world',
      undefined, undefined, onWarning,
    );

    expect(onWarning).toHaveBeenCalledWith({ label: 'locations & factions', message: 'rate limited' });
    // The warning must not leak into the text the gates turn into a premise/tagline.
    expect(result.summary).toBe('A clean summary.');
    // The rest of the parse still completes — other passes' actions still land.
    expect(result.actions).toHaveLength(1);

    vi.unstubAllGlobals();
  });

  it('never calls onWarning when every pass succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      { type: 'text', text: 'A summary.' },
      { type: 'done', count: 0 },
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const onWarning = vi.fn();
    await submitDocument(
      { kind: 'text', payload: 'doc text' }, 'context', undefined,
      undefined, undefined, undefined, undefined, undefined, 'campaign',
      undefined, undefined, onWarning,
    );

    expect(onWarning).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('computeDiffRows', () => {
  it('reports every payload field as new when there is no existing record', () => {
    const rows = computeDiffRows(null, { name: 'Sable', role: 'Rogue' });
    expect(rows).toEqual([
      { key: 'name', oldValue: null, newValue: 'Sable' },
      { key: 'role', oldValue: null, newValue: 'Rogue' },
    ]);
  });
  it('only reports fields that actually changed', () => {
    const existing = { name: 'Sable', role: 'Rogue', status: 'active' };
    const rows = computeDiffRows(existing, { name: 'Sable', role: 'Assassin' });
    expect(rows).toEqual([{ key: 'role', oldValue: 'Rogue', newValue: 'Assassin' }]);
  });
  it('hides foreign-key and internal fields', () => {
    const rows = computeDiffRows(null, { name: 'X', faction_ids: ['a'], id: 'z', campaign_id: 'c' });
    expect(rows.map(r => r.key)).toEqual(['name']);
  });
  it('treats null and empty string as equal (no spurious diff)', () => {
    const rows = computeDiffRows({ note: null }, { note: '' });
    expect(rows).toEqual([]);
  });
});
