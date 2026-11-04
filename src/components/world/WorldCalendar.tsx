// The world's calendar, on its Overview: what its years are called ("DR") and
// its months, each some number of days. A one-day month is a festival between
// months. Presets fill it in; any month can be renamed, resized or removed.
// Once set it folds to one line, with Edit calendar to open it again.

import { useState } from 'react';
import { X } from 'lucide-react';
import { useWorld } from '../../context/WorldContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { PRESETS, daysInYear, yearSuffix, type Month } from '../../lib/calendar';
import { limitFor } from '../../lib/fieldLimits';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

const MAX_MONTHS = 40;

/** One month, edited in place and saved when the DM leaves the field. */
function MonthRow({ index, month, onCommit, onRemove, canRemove }: {
  index: number;
  month: Month;
  onCommit: (m: Month) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [name, setName] = useState(month.name);
  const [days, setDays] = useState(String(month.days));
  const commit = () => {
    const next = { name: name.trim() || month.name, days: Math.min(400, Math.max(1, Math.round(Number(days)) || month.days)) };
    setName(next.name);
    setDays(String(next.days));
    if (next.name !== month.name || next.days !== month.days) onCommit(next);
  };
  return (
    <li className="wc-month">
      <span className="wc-n">{index + 1}</span>
      <input className="as-input wc-name" value={name} onChange={e => setName(e.target.value)} onBlur={commit} aria-label={`Month ${index + 1} name`} maxLength={60}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      <input className="as-input wc-days" type="number" min={1} max={400} value={days} onChange={e => setDays(e.target.value)} onBlur={commit}
        aria-label={`Days in ${month.name}`} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      <span className="wc-unit">{month.days === 1 ? 'festival' : 'days'}</span>
      {canRemove && (
        <IconButton onClick={onRemove} aria-label={`Remove ${month.name}`} title="Remove" style={{ width: 22, height: 22 }}>
          <X size={12} />
        </IconButton>
      )}
    </li>
  );
}

export function WorldCalendar() {
  const { activeWorld, updateWorld } = useWorld();
  const confirm = useConfirm();
  const toast = useToast();
  const [suffix, setSuffix] = useState(() => yearSuffix(activeWorld?.calendar));
  const [editing, setEditing] = useState(false);
  if (!activeWorld) return null;
  const months = activeWorld.calendarMonths;

  const failed = (e: unknown) => toast(e instanceof Error ? e.message : String(e), 'error');
  const save = (next: Month[]) => void updateWorld(activeWorld.id, { calendarMonths: next }).catch(failed);
  const saveSuffix = () => {
    const v = suffix.trim();
    if (v !== yearSuffix(activeWorld.calendar)) void updateWorld(activeWorld.id, { calendar: v }).catch(failed);
  };

  const applyPreset = async (id: string) => {
    const preset = PRESETS.find(p => p.id === id);
    if (!preset) return;
    const ok = await confirm({
      title: `Use ${preset.label}?`,
      message: 'It replaces these months. Campaign dates keep their day of the year, so they may read as a different month.',
      confirmLabel: 'Use it',
    });
    if (ok) save(preset.months.map(m => ({ ...m })));
  };

  const summary = [`${months.length} months`, `${daysInYear(months)} days a year`, suffix.trim() && `years counted as ${suffix.trim()}`].filter(Boolean).join(' · ');
  if (!editing) {
    return (
      <section className="wc is-folded" aria-label="Calendar">
        <span className="cm-card-title">Calendar</span>
        <span className="wc-total">{summary}</span>
        <Button size="xs" variant="secondary" onClick={() => setEditing(true)}>Edit calendar</Button>
      </section>
    );
  }

  return (
    <section className="wc" aria-label="Calendar">
      <div className="wc-head">
        <span className="cm-card-title">Calendar</span>
        <span className="wc-total">{summary}</span>
        <Button size="xs" variant="secondary" onClick={() => { saveSuffix(); setEditing(false); }}>Done</Button>
      </div>
      <div className="wc-row">
        <label className="as-ll" htmlFor={`wc-suffix-${activeWorld.id}`}>Years are counted as</label>
        <input id={`wc-suffix-${activeWorld.id}`} className="as-input wc-suffix" value={suffix} placeholder="DR, AC, …"
          maxLength={limitFor('worlds', 'calendar')} onChange={e => setSuffix(e.target.value)} onBlur={saveSuffix}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        <select className="as-select wc-preset" value="" aria-label="Start from a preset" onChange={e => void applyPreset(e.target.value)}>
          <option value="">Start from a preset…</option>
          {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      <ol className="wc-months">
        {months.map((m, i) => (
          <MonthRow key={`${i}:${m.name}:${m.days}`} index={i} month={m} canRemove={months.length > 1}
            onCommit={next => save(months.map((x, j) => (j === i ? next : x)))}
            onRemove={() => save(months.filter((_, j) => j !== i))} />
        ))}
      </ol>
      {months.length < MAX_MONTHS && (
        <Button size="xs" variant="ghost" onClick={() => save([...months, { name: `Month ${months.length + 1}`, days: 30 }])}>+ Add month</Button>
      )}
    </section>
  );
}
