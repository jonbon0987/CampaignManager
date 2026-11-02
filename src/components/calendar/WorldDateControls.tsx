// Shows an in-world date and moves it on: a day, a week, a month, or to any
// date the DM sets. Used on Home and in Play.

import { useState, type FormEvent } from 'react';
import { addDays, formatWorldDate, fromMonthDay, nextMonth, toMonthDay, type Month, type WorldDate } from '../../lib/calendar';
import { Button } from '../ui/Button';

function DateForm({ initial, months, onSave, onCancel }: {
  initial: WorldDate;
  months: Month[];
  onSave: (date: WorldDate) => void;
  onCancel?: () => void;
}) {
  const start = toMonthDay(initial, months);
  const [day, setDay] = useState(start.dayOfMonth);
  const [month, setMonth] = useState(start.month);
  const [year, setYear] = useState(initial.year);
  const festival = months[month]?.days === 1;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave(fromMonthDay(year, month, day, months));
  };

  return (
    <form className="wd-form" onSubmit={submit}>
      {!festival && (
        <input className="as-input wd-day" type="number" min={1} max={months[month]?.days} value={day} aria-label="Day"
          onChange={e => setDay(Math.max(1, Math.round(Number(e.target.value)) || 1))} />
      )}
      <select className="as-select wd-month" value={month} aria-label="Month" onChange={e => setMonth(Number(e.target.value))}>
        {months.map((m, i) => <option key={i} value={i}>{m.name}</option>)}
      </select>
      <input className="as-input wd-year" type="number" value={year} aria-label="Year"
        onChange={e => setYear(Math.round(Number(e.target.value)) || 0)} />
      <Button type="submit" size="xs" variant="primary">Set</Button>
      {onCancel && <Button type="button" size="xs" variant="ghost" onClick={onCancel}>Cancel</Button>}
    </form>
  );
}

export function WorldDateControls({ date, months, suffix, defaultYear, onChange }: {
  date: WorldDate | null;
  months: Month[];
  suffix: string;
  /** The year a first date starts in. */
  defaultYear: number;
  onChange: (date: WorldDate) => void;
}) {
  const [setting, setSetting] = useState(false);

  if (!date || setting) {
    return (
      <DateForm initial={date ?? { year: defaultYear, day: 1 }} months={months}
        onSave={d => { onChange(d); setSetting(false); }} onCancel={date ? () => setSetting(false) : undefined} />
    );
  }

  return (
    <div className="wd">
      <div className="wd-date">{formatWorldDate(date, months, suffix)}</div>
      <div className="wd-actions">
        <Button size="xs" variant="secondary" onClick={() => onChange(addDays(date, 1, months))}>+1 day</Button>
        <Button size="xs" variant="secondary" onClick={() => onChange(addDays(date, 7, months))}>+7 days</Button>
        <Button size="xs" variant="secondary" onClick={() => onChange(nextMonth(date, months))}>+1 month</Button>
        <Button size="xs" variant="ghost" onClick={() => setSetting(true)}>Set date…</Button>
      </div>
    </div>
  );
}
