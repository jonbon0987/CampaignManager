import { describe, it, expect } from 'vitest';
import { OggOpusMuxer, OPUS_SILENCE, opusPacketSamples, readOggPages } from './ogg.js';
import { DiscordTrackWriter, type WrittenChunk } from './trackWriter.js';

// A 20 ms stereo CELT packet like the ones Discord sends (TOC 0xfc: config 31, stereo, one frame).
const voice = (fill = 7) => Uint8Array.of(0xfc, ...new Array(60).fill(fill));
const join = (chunks: WrittenChunk[]) => {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.bytes.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c.bytes, at); at += c.bytes.length; }
  return out;
};

describe('Ogg Opus muxing', () => {
  it('reads Opus packet lengths from the TOC byte', () => {
    expect(opusPacketSamples(OPUS_SILENCE)).toBe(960);            // CELT 20 ms
    expect(opusPacketSamples(Uint8Array.of(0x08))).toBe(960);      // SILK 20 ms
    expect(opusPacketSamples(Uint8Array.of(0xfd))).toBe(1920);     // two 20 ms frames
    expect(opusPacketSamples(Uint8Array.of(0xfb, 0x03))).toBe(2880); // code 3: three 20 ms frames
    expect(opusPacketSamples(new Uint8Array())).toBe(0);
  });

  it('writes header pages and data pages that read back with valid CRCs and granules', () => {
    const m = new OggOpusMuxer(1234);
    const bytes = new Uint8Array([...m.headers(), ...(() => { for (let i = 0; i < 300; i++) m.add(voice()); return m.flush(true); })()]);
    const pages = readOggPages(bytes);
    expect(pages.every(p => p.crcOk)).toBe(true);
    expect(pages[0].flags).toBe(0x02);
    expect(new TextDecoder().decode(pages[0].packets[0].subarray(0, 8))).toBe('OpusHead');
    expect(new TextDecoder().decode(pages[1].packets[0].subarray(0, 8))).toBe('OpusTags');
    expect(pages.length).toBeGreaterThan(3);                       // 300 packets don't fit one page
    expect(pages.at(-1)!.flags).toBe(0x04);
    expect(pages.at(-1)!.granule).toBe(300 * 960);
    expect(pages.slice(2).flatMap(p => p.packets)).toHaveLength(300);
    expect(new Set(pages.map(p => p.seq)).size).toBe(pages.length);
  });
});

describe('DiscordTrackWriter', () => {
  const t0 = 1_000_000;
  const talk = (w: DiscordTrackWriter, fromMs: number, ms: number) => {
    for (let t = 0; t < ms; t += 20) w.push(voice(), t0 + fromMs + t);
  };

  it('fills short pauses with silence and starts a new chunk after a long one', () => {
    const chunks: WrittenChunk[] = [];
    const w = new DiscordTrackWriter(t0, c => chunks.push(c));
    talk(w, 0, 2_000);       // a sentence
    talk(w, 3_000, 1_000);   // a beat later: same stretch, 1 s of silence between
    talk(w, 20_000, 500);    // after a long quiet: new chunk
    w.finish();
    expect(chunks.map(c => [c.seq, c.startMs, c.durationMs])).toEqual([[0, 0, 4_000], [1, 20_000, 500]]);
    const pages = readOggPages(join(chunks));
    expect(pages.every(p => p.crcOk)).toBe(true);
    expect(pages.at(-1)!.granule).toBe(4_500 * 48);
    expect(pages.at(-1)!.flags).toBe(0x04);
    // Only the first chunk carries the stream headers.
    expect(new TextDecoder().decode(chunks[1].bytes.subarray(0, 4))).toBe('OggS');
    expect(readOggPages(chunks[1].bytes).some(p => p.flags & 0x02)).toBe(false);
  });

  it('treats late packets as jitter, not silence', () => {
    const chunks: WrittenChunk[] = [];
    const w = new DiscordTrackWriter(t0, c => chunks.push(c));
    for (let i = 0; i < 100; i++) w.push(voice(), t0 + i * 20 + (i % 3) * 25); // up to 50 ms late
    w.finish();
    expect(chunks).toHaveLength(1);
    expect(chunks[0].durationMs).toBe(2_000);
  });

  it('splits long talking into contiguous chunks', () => {
    const chunks: WrittenChunk[] = [];
    const w = new DiscordTrackWriter(t0, c => chunks.push(c), { maxChunkMs: 1_000 });
    talk(w, 500, 2_500);
    w.finish();
    expect(chunks.map(c => [c.startMs, c.durationMs])).toEqual([[500, 1_000], [1_500, 1_000], [2_500, 500]]);
  });

  it('starts a fresh stretch after a pause, and writes nothing for an empty finish', () => {
    const chunks: WrittenChunk[] = [];
    const w = new DiscordTrackWriter(t0, c => chunks.push(c));
    talk(w, 0, 1_000);
    w.pause();
    talk(w, 4_000, 1_000); // only 3 s later, but paused: not joined with silence
    w.pause();
    w.finish();
    expect(chunks.map(c => [c.startMs, c.durationMs])).toEqual([[0, 1_000], [4_000, 1_000]]);
    expect(w.audioMs).toBe(2_000);
  });
});
