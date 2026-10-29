// bot/src/ogg.ts
// -----------------------------------------------------------
// A minimal Ogg Opus muxer. Discord hands the bot raw Opus packets (one per
// 20 ms while someone talks); wrapping them in Ogg pages gives a file that
// speech-to-text services and browsers play without re-encoding.
//
// One logical stream per player. Pages hold whole packets only (Discord's are
// a few hundred bytes), so a page never continues a packet from the last one.
// Spec: RFC 3533 (Ogg) and RFC 7845 (Opus in Ogg).
// -----------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();

/** Ogg's CRC-32 (polynomial 0x04c11db7, not reflected, no final xor). */
export function oggCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (const b of bytes) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ b) & 0xff]) >>> 0;
  return crc;
}

const BOS = 0x02;
const EOS = 0x04;
const MAX_SEGMENTS = 255;

/** Samples (at 48 kHz) in one Opus packet, from its TOC byte (RFC 6716 §3.1). */
export function opusPacketSamples(packet: Uint8Array): number {
  if (packet.length === 0) return 0;
  const toc = packet[0];
  const config = toc >> 3;
  const frame = config < 12 ? [480, 960, 1920, 2880][config & 3]
    : config < 16 ? [480, 960][config & 1]
    : [120, 240, 480, 960][config & 3];
  const code = toc & 3;
  const frames = code === 0 ? 1 : code === 3 ? (packet.length > 1 ? packet[1] & 0x3f : 0) : 2;
  return frame * frames;
}

/** 20 ms of silence: the packet Discord itself sends when someone stops talking. */
export const OPUS_SILENCE = Uint8Array.of(0xf8, 0xff, 0xfe);

export const SAMPLES_PER_MS = 48;

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

function lacing(length: number): number[] {
  const out = new Array(Math.floor(length / 255)).fill(255);
  out.push(length % 255);
  return out;
}

export class OggOpusMuxer {
  private seq = 0;
  private granule = 0;
  private queue: Uint8Array[] = [];
  private queuedGranule = 0;

  constructor(private readonly serial = (Math.random() * 0xffffffff) >>> 0, private readonly channels = 2) {}

  /** Samples written so far (48 kHz). */
  get samples(): number { return this.granule + this.queuedGranule; }

  /** The two header pages (OpusHead, OpusTags) that start the stream. */
  headers(): Uint8Array {
    const head = new Uint8Array(19);
    head.set(new TextEncoder().encode('OpusHead'));
    const v = new DataView(head.buffer);
    v.setUint8(8, 1);                 // version
    v.setUint8(9, this.channels);
    v.setUint16(10, 0, true);         // pre-skip: the packets come mid-stream, there's no encoder delay to skip
    v.setUint32(12, 48_000, true);    // original sample rate
    v.setInt16(16, 0, true);          // output gain
    v.setUint8(18, 0);                // channel mapping family
    const vendor = new TextEncoder().encode('DM Lair');
    const tags = new Uint8Array(8 + 4 + vendor.length + 4);
    tags.set(new TextEncoder().encode('OpusTags'));
    new DataView(tags.buffer).setUint32(8, vendor.length, true);
    tags.set(vendor, 12);
    return concat([this.page([head], 0, BOS), this.page([tags], 0, 0)]);
  }

  /** Queues a packet; it's written by the next flush. */
  add(packet: Uint8Array): void {
    this.queue.push(packet);
    this.queuedGranule += opusPacketSamples(packet);
  }

  /** Writes the queued packets as pages. `end` marks the last page of the stream. */
  flush(end = false): Uint8Array {
    const pages: Uint8Array[] = [];
    let batch: Uint8Array[] = [];
    let segments = 0;
    const emit = (last: boolean) => {
      if (!batch.length) return;
      for (const p of batch) this.granule += opusPacketSamples(p);
      pages.push(this.page(batch, this.granule, last && end ? EOS : 0));
      batch = [];
      segments = 0;
    };
    for (const p of this.queue) {
      const need = lacing(p.length).length;
      if (segments + need > MAX_SEGMENTS) emit(false);
      batch.push(p);
      segments += need;
    }
    emit(true);
    this.queue = [];
    this.queuedGranule = 0;
    return concat(pages);
  }

  private page(packets: Uint8Array[], granule: number, flags: number): Uint8Array {
    const table = packets.flatMap(p => lacing(p.length));
    const header = new Uint8Array(27 + table.length);
    header.set(new TextEncoder().encode('OggS'));
    const v = new DataView(header.buffer);
    v.setUint8(4, 0);                                  // version
    v.setUint8(5, flags);
    v.setBigUint64(6, BigInt(granule), true);
    v.setUint32(14, this.serial, true);
    v.setUint32(18, this.seq++, true);
    v.setUint32(22, 0, true);                          // CRC, filled in below
    v.setUint8(26, table.length);
    header.set(table, 27);
    const page = concat([header, ...packets]);
    new DataView(page.buffer).setUint32(22, oggCrc(page), true);
    return page;
  }
}

// --------------- Reading (for tests and the local rehearsal script) ---------------

export interface OggPage { flags: number; granule: number; serial: number; seq: number; packets: Uint8Array[]; crcOk: boolean }

/** Splits an Ogg file into pages and packets, checking each page's CRC. */
export function readOggPages(bytes: Uint8Array): OggPage[] {
  const pages: OggPage[] = [];
  let at = 0;
  let carry: Uint8Array[] = [];
  while (at + 27 <= bytes.length) {
    if (String.fromCharCode(...bytes.subarray(at, at + 4)) !== 'OggS') throw new Error(`No Ogg page at byte ${at}`);
    const v = new DataView(bytes.buffer, bytes.byteOffset + at);
    const count = v.getUint8(26);
    const table = bytes.subarray(at + 27, at + 27 + count);
    const bodyLen = table.reduce((n, x) => n + x, 0);
    const end = at + 27 + count + bodyLen;
    const page = bytes.slice(at, end);
    const stored = new DataView(page.buffer).getUint32(22, true);
    new DataView(page.buffer).setUint32(22, 0, true);
    const packets: Uint8Array[] = [];
    let off = at + 27 + count;
    for (const lace of table) {
      carry.push(bytes.subarray(off, off + lace));
      off += lace;
      if (lace < 255) { packets.push(concat(carry)); carry = []; }
    }
    pages.push({
      flags: v.getUint8(5), granule: Number(v.getBigUint64(6, true)), serial: v.getUint32(14, true),
      seq: v.getUint32(18, true), packets, crcOk: oggCrc(page) === stored,
    });
    at = end;
  }
  return pages;
}
