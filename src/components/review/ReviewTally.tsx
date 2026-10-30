import type { ChangeState, ChangeTone } from './ChangeCard';

/**
 * Where a review stands, in one line, the same for the assistant and the
 * chronicle: what will be written (and how), what's still to decide, what was
 * skipped, applied or failed.
 */
export function ReviewTally({ items }: { items: { state: ChangeState; tone: ChangeTone }[] }) {
  const n = (s: ChangeState) => items.filter(i => i.state === s).length;
  const accepted = items.filter(i => i.state === 'accepted');
  const tone = (t: ChangeTone) => accepted.filter(i => i.tone === t).length;
  const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

  const parts: { text: string; className?: string }[] = [];
  if (accepted.length) {
    const how = [
      tone('new') && `${tone('new')} new`,
      tone('update') && plural(tone('update'), 'update'),
      tone('note') && plural(tone('note'), 'note'),
      tone('delete') && plural(tone('delete'), 'delete'),
    ].filter(Boolean).join(', ');
    parts.push({ text: `${accepted.length} to apply${how ? ` (${how})` : ''}`, className: tone('delete') ? 'is-delete' : 'is-accepted' });
  }
  if (n('pending')) parts.push({ text: `${n('pending')} to review`, className: 'is-pending' });
  if (n('skipped')) parts.push({ text: `${n('skipped')} skipped` });
  if (n('applied')) parts.push({ text: `${n('applied')} applied`, className: 'is-applied' });
  if (n('failed')) parts.push({ text: `${n('failed')} failed`, className: 'is-failed' });

  return (
    <span className="rv-tally">
      {parts.map((p, i) => (
        <span key={i}>{i > 0 && ' · '}<span className={p.className}>{p.text}</span></span>
      ))}
    </span>
  );
}
