import { describe, it, expect } from 'vitest';
import { audioToSessionMs, utterancesToSegments, findEchoes, buildKeyterms, MAX_KEYTERMS, type ChunkTiming } from './transcript';

// A table track: 60 s of audio, a 30 s pause, then 20 s more.
const chunks: ChunkTiming[] = [
  { seq: 0, start_ms: 0, duration_ms: 60_000 },
  { seq: 1, start_ms: 90_000, duration_ms: 20_000 },
];

describe('audioToSessionMs', () => {
  it('maps audio before a pause straight through, plus the track offset', () => {
    expect(audioToSessionMs(10_000, chunks, 0)).toBe(10_000);
    expect(audioToSessionMs(10_000, chunks, 5_000)).toBe(15_000);
  });

  it('shifts audio after a pause by the paused time', () => {
    expect(audioToSessionMs(65_000, chunks, 0)).toBe(95_000);
  });

  it('handles chunks out of order and times past the last chunk', () => {
    expect(audioToSessionMs(65_000, [chunks[1], chunks[0]], 0)).toBe(95_000);
    expect(audioToSessionMs(85_000, chunks, 0)).toBe(115_000);
  });

  it('maps uploads (no chunks) straight through', () => {
    expect(audioToSessionMs(42_000, [], 0)).toBe(42_000);
  });
});

describe('utterancesToSegments', () => {
  const table = { id: 't1', recording_id: 'r1', source: 'table' as const, label: 'Table mic', pc_id: null, offset_ms: 0 };

  it('labels diarized voices and places them on the session clock', () => {
    const segs = utterancesToSegments([
      { speaker: 'A', start: 1_000, end: 4_000, text: ' The water is knee-deep. ' },
      { speaker: 'B', start: 61_000, end: 63_000, text: 'I check the stair.' },
      { speaker: 'A', start: 70_000, end: 70_500, text: '   ' },
    ], table, chunks);
    expect(segs).toEqual([
      expect.objectContaining({ track_id: 't1', speaker_label: 'Speaker A', start_ms: 1_000, end_ms: 4_000, text: 'The water is knee-deep.', pc_id: null }),
      expect.objectContaining({ speaker_label: 'Speaker B', start_ms: 91_000, end_ms: 93_000 }),
    ]);
  });

  it('attributes a Discord track to its player', () => {
    const discord = { ...table, id: 't2', source: 'discord' as const, label: 'dana', pc_id: 'pc-mirela', offset_ms: 2_000 };
    const [seg] = utterancesToSegments([{ speaker: 'A', start: 0, end: 1_000, text: 'Detect Magic on the stair.' }], discord, []);
    expect(seg).toMatchObject({ speaker_label: 'dana', pc_id: 'pc-mirela', start_ms: 2_000 });
  });

  it('caps a very long turn at the column limit', () => {
    const [seg] = utterancesToSegments([{ speaker: 'A', start: 0, end: 1, text: 'x'.repeat(9_000) }], table, []);
    expect(seg.text).toHaveLength(8_000);
  });
});

describe('findEchoes', () => {
  it('drops a table line that repeats a Discord line at about the same moment', () => {
    const drop = findEchoes([
      { id: 'd1', source: 'discord', start_ms: 10_000, text: 'I want to cast Detect Magic on the stair.' },
      { id: 't1', source: 'table', start_ms: 10_400, text: 'want to cast detect magic on the stair' },
      { id: 't2', source: 'table', start_ms: 30_000, text: 'I want to cast Detect Magic on the stair.' }, // same words, much later
      { id: 't3', source: 'table', start_ms: 10_200, text: 'Roll initiative, everyone.' },              // same moment, different words
    ]);
    expect(drop).toEqual(['t1']);
  });

  it('ignores one-word lines and recordings with no Discord track', () => {
    expect(findEchoes([
      { id: 'd1', source: 'discord', start_ms: 0, text: 'Yeah.' },
      { id: 't1', source: 'table', start_ms: 100, text: 'Yeah.' },
    ])).toEqual([]);
    expect(findEchoes([{ id: 't1', source: 'table', start_ms: 0, text: 'Hello there friends' }])).toEqual([]);
  });
});

describe('buildKeyterms', () => {
  it('dedupes, trims and drops blanks and phrases over six words', () => {
    expect(buildKeyterms(['Kutter', ' kutter ', null, '', 'Ysolde  Varn', 'The Very Long Name Of A Sunken Library'])).toEqual(['Kutter', 'Ysolde Varn']);
  });

  it('keeps the first names when there are too many', () => {
    const many = Array.from({ length: 250 }, (_, i) => `Name ${i}`);
    const terms = buildKeyterms(many);
    expect(terms).toHaveLength(MAX_KEYTERMS);
    expect(terms[0]).toBe('Name 0');
  });
});
