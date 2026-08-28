/* moduleWeb/shared.ts — geometry, labels and small helpers shared by the
   stage, the inspector rail and the add bubble. */
import type { BodyKind } from './sim';

/** Chapters sit on a horizontal time axis, one column per chapter number. */
export const COL_X = (chapter: string | null) =>
  240 + (Math.max(1, parseFloat(chapter ?? '1') || 1) - 1) * 420;
export const CENTER_Y = 380;

/** Radius / mass / separation pad per body kind. */
export const SPEC: Record<BodyKind, { r: number; mass: number; pad: number }> = {
  module: { r: 28, mass: 6,   pad: 66 },
  sub:    { r: 15, mass: 2.2, pad: 42 },
  scene:  { r: 6,  mass: 1,   pad: 24 },
};

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
export const toRoman = (n: number) => ROMAN[n] || String(n || '');

/** Truncate a label to n characters, ellipsis included. */
export const clip = (s: string | null | undefined, n: number) =>
  (s ?? '').length > n ? (s as string).slice(0, n - 1) + '…' : (s ?? '');

export const kindLabel: Record<BodyKind, string> = { module: 'Chapter', sub: 'Part', scene: 'Scene' };

export interface Selection { id: string; kind: BodyKind }
