/**
 * The record a list opens on when none is picked: the first one with a name,
 * so a blank leftover draft isn't what greets you. Falls back to the first.
 */
export function firstNamed<T>(list: readonly T[], name: (x: T) => string | null | undefined): T | undefined {
  return list.find(x => (name(x) ?? '').trim() !== '') ?? list[0];
}
