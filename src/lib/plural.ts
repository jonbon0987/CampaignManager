/** A count with its noun: "1 event", "3 events", "2 entries". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
