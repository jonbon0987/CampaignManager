// src/lib/recording/webmDuration.ts
// -----------------------------------------------------------
// Writes a recording's real length into a joined webm file.
//
// MediaRecorder can't know the length while it streams, so browsers write the
// Duration as missing or as a placeholder (Chrome writes 1 ms). Players then
// show 0:00 and can't seek. fix-webm-duration adds a missing Duration but won't
// replace an existing one, so this overwrites the value in place when there is
// one, and hands the file to fix-webm-duration when there isn't.
// -----------------------------------------------------------

import fixWebmDuration from 'fix-webm-duration';

const ID_CLUSTER = [0x1f, 0x43, 0xb6, 0x75];
const ID_TIMECODE_SCALE = [0x2a, 0xd7, 0xb1];
const ID_DURATION = [0x44, 0x89];
const HEADER_SCAN_BYTES = 8192;

function findId(bytes: Uint8Array, id: number[], from: number, to: number): number {
  outer: for (let i = from; i <= to - id.length; i++) {
    for (let j = 0; j < id.length; j++) if (bytes[i + j] !== id[j]) continue outer;
    return i;
  }
  return -1;
}

/** Reads an EBML size (vint): returns [value, byte length], or null if malformed. */
function readSize(bytes: Uint8Array, at: number): [number, number] | null {
  const first = bytes[at];
  if (!first) return null;
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
  if (len > 8) return null;
  let value = first & (0xff >> len);
  for (let k = 1; k < len; k++) value = value * 256 + bytes[at + k];
  return [value, len];
}

/**
 * Overwrites the Duration in a webm header with `durationMs`. Returns the
 * patched header bytes, or null when the header has no Duration to overwrite.
 */
export function patchWebmDuration(head: Uint8Array, durationMs: number): Uint8Array | null {
  const cluster = findId(head, ID_CLUSTER, 0, head.length);
  const end = cluster === -1 ? head.length : cluster;

  let scale = 1_000_000; // ns per timecode tick; the default when absent
  const ts = findId(head, ID_TIMECODE_SCALE, 0, end);
  if (ts !== -1) {
    const size = readSize(head, ts + 3);
    if (size) {
      let v = 0;
      for (let k = 0; k < size[0]; k++) v = v * 256 + head[ts + 3 + size[1] + k];
      if (v > 0) scale = v;
    }
  }

  const at = findId(head, ID_DURATION, 0, end);
  if (at === -1) return null;
  const size = readSize(head, at + 2);
  if (!size || (size[0] !== 4 && size[0] !== 8)) return null;
  const valueAt = at + 2 + size[1];
  if (valueAt + size[0] > end) return null;

  const out = head.slice();
  const view = new DataView(out.buffer, valueAt, size[0]);
  const ticks = (durationMs * 1_000_000) / scale;
  if (size[0] === 4) view.setFloat32(0, ticks); else view.setFloat64(0, ticks);
  return out;
}

export async function writeWebmDuration(blob: Blob, durationMs: number): Promise<Blob> {
  const headBlob = blob.slice(0, Math.min(blob.size, HEADER_SCAN_BYTES));
  const head = new Uint8Array(await headBlob.arrayBuffer());
  const patched = patchWebmDuration(head, durationMs);
  if (patched) return new Blob([patched as BlobPart, blob.slice(head.length)], { type: blob.type });
  return fixWebmDuration(blob, durationMs, { logger: false });
}
