import { useState, useMemo } from 'react';
import { useWorld } from '../../context/WorldContext';
import { Pill } from '../ui/ListDetail';
import { Button } from '../ui/Button';
import type { WorldTimelineEvent, TimelineEventType } from '../../types/world';
import { limitFor, minFor, maxFor } from '../../lib/fieldLimits';
import { CharCounter } from '../ui/CharCounter';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import { useAutoSave } from '../../hooks/useAutoSave';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function WorldTimeline() {
  const {
    activeWorld, timeline, timelineTypeConfig, eraConfig,
    createTimelineEvent, upsertTimelineEvent, deleteTimelineEvent,
  } = useWorld();
  const [typeFilter, setTypeFilter] = useState('all');
  const [eraFilter, setEraFilter] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const types = Object.keys(timelineTypeConfig);
  const eras = useMemo(() => [...new Set(timeline.map(e => e.era))], [timeline]);

  const filtered = useMemo(() => {
    let list = [...timeline];
    if (typeFilter !== 'all') list = list.filter(e => e.type === typeFilter);
    if (eraFilter !== 'all') list = list.filter(e => e.era === eraFilter);
    return list.sort((a, b) => a.year - b.year);
  }, [timeline, typeFilter, eraFilter]);

  const grouped = useMemo(() => {
    const groups: Array<{ type: 'era'; era: string } | { type: 'event'; event: WorldTimelineEvent }> = [];
    let currentEra: string | null = null;
    filtered.forEach(ev => {
      if (ev.era !== currentEra) {
        currentEra = ev.era;
        groups.push({ type: 'era', era: currentEra });
      }
      groups.push({ type: 'event', event: ev });
    });
    return groups;
  }, [filtered]);

  const handleAddEvent = async (newEvent: Omit<WorldTimelineEvent, 'id' | 'worldId'>) => {
    await createTimelineEvent(newEvent);
    setAddOpen(false);
  };


  const handleDelete = async (id: string) => {
    await deleteTimelineEvent(id);
    setExpanded(null);
    setEditingId(null);
  };

  return (
    <div className="tl-wrap">
      <div className="tl-head">
        <div>
          <div className="tl-eyebrow">{filtered.length} events · {activeWorld?.calendar ?? ''}</div>
          <h2 className="tl-title">World Timeline</h2>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>+ Add event</Button>
      </div>

      <div className="tl-filters">
        <Pill active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>All Types</Pill>
        {types.map(t => {
          const cfg = timelineTypeConfig[t];
          return (
            <Pill key={t} active={typeFilter === t} onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}>
              <span style={{ marginRight: 4 }}>{cfg.glyph}</span>{cap(t)}
            </Pill>
          );
        })}
        <span className="cm-filter-sep" />
        <Pill active={eraFilter === 'all'} onClick={() => setEraFilter('all')} subtle>All Eras</Pill>
        {eras.map(e => (
          <Pill key={e} active={eraFilter === e} onClick={() => setEraFilter(eraFilter === e ? 'all' : e)} subtle>{e}</Pill>
        ))}
      </div>

      <div className="tl-body">
        {filtered.length === 0 ? (
          <div className="cm-empty">No events match the current filters.</div>
        ) : (
          <div className="tl-line">
            {grouped.map((item, i) => {
              if (item.type === 'era') {
                const eraConf = eraConfig[item.era];
                return (
                  <div key={`era-${item.era}-${i}`} className="tl-era">
                    <span style={eraConf ? { color: eraConf.color } : undefined}>{item.era}</span>
                  </div>
                );
              }
              const ev = item.event;
              const cfg = timelineTypeConfig[ev.type] ?? timelineTypeConfig.custom;
              const isExpanded = expanded === ev.id;
              const isEditing = editingId === ev.id;
              return (
                <TimelineEventCard
                  key={ev.id}
                  event={ev}
                  config={cfg}
                  expanded={isExpanded}
                  editing={isEditing}
                  onToggle={() => setExpanded(isExpanded ? null : ev.id)}
                  onEdit={() => { setExpanded(ev.id); setEditingId(ev.id); }}
                  onSaveEdit={upsertTimelineEvent}
                  onCancelEdit={() => setEditingId(null)}
                  onDelete={() => handleDelete(ev.id)}
                  calendar={activeWorld?.calendar ?? ''}
                  eras={eras}
                />
              );
            })}
          </div>
        )}
        <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)} style={{ marginTop: 12 }}>
          <span style={{ color: 'var(--gold)' }}>+</span>
          Add event to timeline
        </Button>
      </div>

      {addOpen && (
        <NewEventModal
          calendar={activeWorld?.calendar ?? ''}
          eras={eras}
          onSave={handleAddEvent}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * An event's fields, open for editing. They save as you type (a blank title
 * isn't saved); Done closes the editor once the last edit is in.
 */
function TimelineEventEditor({ event, types, calendar, eras, save, onDone, onDelete }: {
  event: WorldTimelineEvent;
  types: TimelineEventType[];
  calendar: string;
  eras: string[];
  save: (data: Partial<WorldTimelineEvent> & { id: string }) => Promise<unknown>;
  onDone: () => void;
  onDelete: () => void;
}) {
  const { timelineTypeConfig } = useWorld();
  const [form, setForm] = useState({ title: event.title, year: String(event.year), date: event.date, desc: event.desc, type: event.type, era: event.era });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(f => ({ ...f, [key]: value }));
  const { status, saveNow } = useAutoSave({
    data: form,
    delay: 800,
    onSave: async f => {
      if (!f.title.trim()) return;
      await save({ id: event.id, title: f.title.trim(), year: parseInt(f.year) || 0, date: f.date.trim(), desc: f.desc.trim(), type: f.type, era: f.era });
    },
  });

  return (
    <div className="tl-edit-form">
      <div className="ne-field">
        <label>Title</label>
        <input value={form.title} onChange={e => set('title', e.target.value)} autoFocus maxLength={limitFor('timeline_events', 'title')} />
      </div>
      <div className="ne-row">
        <div className="ne-field">
          <label>Year ({calendar})</label>
          <input type="number" value={form.year} onChange={e => set('year', e.target.value)} min={minFor('timeline_events', 'year')} max={maxFor('timeline_events', 'year')} />
        </div>
        <div className="ne-field">
          <label>Display Date</label>
          <input value={form.date} onChange={e => set('date', e.target.value)} maxLength={limitFor('timeline_events', 'display_date')} />
        </div>
      </div>
      <div className="ne-row">
        <div className="ne-field">
          <label>Type</label>
          <select value={form.type} onChange={e => set('type', e.target.value as TimelineEventType)}>
            {types.map(t => {
              const cfg = timelineTypeConfig[t];
              return <option key={t} value={t}>{cfg.glyph} {cap(t)}</option>;
            })}
          </select>
        </div>
        <div className="ne-field">
          <label>Era</label>
          <select value={form.era} onChange={e => set('era', e.target.value)}>
            {eras.map(e => <option key={e} value={e}>{e}</option>)}
            <option value={form.era}>{form.era}</option>
          </select>
        </div>
      </div>
      <div className="ne-field">
        <label>Description</label>
        <textarea value={form.desc} onChange={e => set('desc', e.target.value)} rows={3} />
        <CharCounter value={form.desc} limit={limitFor('timeline_events', 'description')} />
      </div>
      <div className="tl-edit-actions">
        <Button variant="danger" onClick={onDelete}>Delete</Button>
        <div style={{ flex: 1 }} />
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <Button variant="primary" onClick={() => void saveNow().then(onDone)}>Done</Button>
      </div>
    </div>
  );
}

function TimelineEventCard({
  event, config, expanded, editing, onToggle, onEdit, onSaveEdit, onCancelEdit, onDelete, calendar, eras,
}: {
  event: WorldTimelineEvent;
  config: { glyph: string; color: string };
  expanded: boolean;
  editing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onSaveEdit: (data: Partial<WorldTimelineEvent> & { id: string }) => Promise<unknown>;
  onCancelEdit: () => void;
  onDelete: () => void;
  calendar: string;
  eras: string[];
}) {
  const { timelineTypeConfig } = useWorld();
  const isCampaign = event.type === 'campaign';

  const types = Object.keys(timelineTypeConfig) as TimelineEventType[];

  if (editing) {
    return (
      <div className="tl-event tl-event-editing" style={{ cursor: 'default' }}>
        <div className="tl-event-dot" style={{ borderColor: config.color, color: config.color }}>
          {config.glyph}
        </div>
        <TimelineEventEditor event={event} types={types} calendar={calendar} eras={eras}
          save={onSaveEdit} onDone={onCancelEdit} onDelete={onDelete} />
      </div>
    );
  }

  return (
    <div className="tl-event" style={{ cursor: 'pointer' }} onClick={onToggle}>
      <div
        className="tl-event-dot"
        style={{
          borderColor: config.color,
          color: config.color,
          background: expanded ? `color-mix(in oklab, ${config.color} 12%, var(--bg))` : undefined,
        }}
      >
        {config.glyph}
      </div>
      <div className="tl-event-date">{event.date}</div>
      <div className="tl-event-title">{event.title}</div>
      <div className="tl-event-desc">{event.desc}</div>
      <div className="tl-event-tags">
        <span
          className={`tl-event-type ${isCampaign ? 'tl-event-campaign' : ''}`}
          style={{ color: config.color, borderColor: `color-mix(in oklab, ${config.color} 40%, transparent)` }}
        >
          <span>{config.glyph}</span> {cap(event.type)}
        </span>
        {isCampaign && (
          <span className="tl-event-type tl-event-campaign">
            ❧ Campaign event
          </span>
        )}
      </div>
      {expanded && (
        <div className="tl-event-expanded">
          <div className="tl-event-expanded-grid">
            <div>
              <div className="tl-event-expanded-label">Year</div>
              <div className="tl-event-expanded-value tl-event-expanded-value-lg">
                {event.year < 0 ? `${Math.abs(event.year)} BR` : `${calendar.split('(')[0].trim()} ${event.year}`}
              </div>
            </div>
            <div>
              <div className="tl-event-expanded-label">Era</div>
              <div className="tl-event-expanded-value">{event.era}</div>
            </div>
            <div>
              <div className="tl-event-expanded-label">Type</div>
              <div className="tl-event-expanded-value" style={{ color: config.color }}>{config.glyph} {cap(event.type)}</div>
            </div>
          </div>
          <div className="tl-event-expanded-desc">{event.desc}</div>
          <div className="tl-edit-actions" style={{ marginTop: 8 }}>
            <Button variant="primary" onClick={(e) => { e.stopPropagation(); onEdit(); }}>Edit</Button>
            <Button variant="danger" onClick={(e) => { e.stopPropagation(); onDelete(); }}>Delete</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewEventModal({
  calendar, eras, onSave, onClose,
}: {
  calendar: string;
  eras: string[];
  onSave: (event: Omit<WorldTimelineEvent, 'id' | 'worldId'>) => void;
  onClose: () => void;
}) {
  const { timelineTypeConfig } = useWorld();
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [date, setDate] = useState('');
  const [desc, setDesc] = useState('');
  const [type, setType] = useState<TimelineEventType>('custom');
  const [era, setEra] = useState(eras[eras.length - 1] || '');

  const types = Object.keys(timelineTypeConfig) as TimelineEventType[];

  const handleSave = () => {
    if (!title.trim()) return;
    const y = parseInt(year) || 0;
    const calAbbr = calendar.split('(')[1]?.replace(')', '') || 'CR';
    onSave({
      title: title.trim(),
      year: y,
      date: date.trim() || `${calAbbr} ${y}`,
      desc: desc.trim(),
      type,
      era: era || 'Unknown',
    });
  };

  return (
    <div className="ne-overlay" onClick={onClose}>
      <div className="ne-modal" onClick={e => e.stopPropagation()}>
        <div className="ne-head">
          <div className="ne-title">New timeline event</div>
          <button className="ne-close" onClick={onClose}>✕</button>
        </div>
        <div className="ne-body">
          <div className="ne-field">
            <label>Event Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. The Battle of Ashfield" autoFocus maxLength={limitFor('timeline_events', 'title')} />
          </div>
          <div className="ne-row">
            <div className="ne-field">
              <label>Year ({calendar})</label>
              <input type="number" value={year} onChange={e => setYear(e.target.value)} placeholder="e.g. 701" min={minFor('timeline_events', 'year')} max={maxFor('timeline_events', 'year')} />
            </div>
            <div className="ne-field">
              <label>Display Date</label>
              <input value={date} onChange={e => setDate(e.target.value)} placeholder="e.g. CR 701, Midsummer" maxLength={limitFor('timeline_events', 'display_date')} />
            </div>
          </div>
          <div className="ne-row">
            <div className="ne-field">
              <label>Type</label>
              <select value={type} onChange={e => setType(e.target.value as TimelineEventType)}>
                {types.map(t => {
                  const cfg = timelineTypeConfig[t];
                  return <option key={t} value={t}>{cfg.glyph} {cap(t)}</option>;
                })}
              </select>
            </div>
            <div className="ne-field">
              <label>Era</label>
              <input value={era} onChange={e => setEra(e.target.value)} placeholder="e.g. Fourth Silence" maxLength={limitFor('timeline_events', 'era')} />
            </div>
          </div>
          <div className="ne-field">
            <label>Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="What happened and why it matters…" rows={3} />
            <CharCounter value={desc} limit={limitFor('timeline_events', 'description')} />
          </div>
        </div>
        <div className="ne-foot">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={!title.trim()}>Add event</Button>
        </div>
      </div>
    </div>
  );
}
