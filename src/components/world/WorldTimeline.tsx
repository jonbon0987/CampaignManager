import { useState, useMemo } from 'react';
import { useWorld } from '../../context/WorldContext';
import { Pill } from '../ui/ListDetail';
import type { WorldTimelineEvent, TimelineEventType } from '../../types/world';

export default function WorldTimeline() {
  const { activeWorld, timeline, timelineTypeConfig, eraConfig } = useWorld();
  const [typeFilter, setTypeFilter] = useState('all');
  const [eraFilter, setEraFilter] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [events, setEvents] = useState(() => [...timeline]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const types = Object.keys(timelineTypeConfig);
  const eras = useMemo(() => [...new Set(events.map(e => e.era))], [events]);

  const filtered = useMemo(() => {
    let list = [...events];
    if (typeFilter !== 'all') list = list.filter(e => e.type === typeFilter);
    if (eraFilter !== 'all') list = list.filter(e => e.era === eraFilter);
    return list.sort((a, b) => a.year - b.year);
  }, [events, typeFilter, eraFilter]);

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

  const handleAddEvent = (newEvent: Omit<WorldTimelineEvent, 'id'>) => {
    const ev: WorldTimelineEvent = { ...newEvent, id: `wt-${Date.now()}` };
    setEvents(prev => [...prev, ev].sort((a, b) => a.year - b.year));
    setAddOpen(false);
  };

  return (
    <div className="tl-wrap">
      <div className="tl-head">
        <div>
          <div className="tl-eyebrow">{filtered.length} events · {activeWorld.calendar}</div>
          <h2 className="tl-title">World Timeline</h2>
        </div>
        <button className="cm-md-add" onClick={() => setAddOpen(true)}>+ New Event</button>
      </div>

      <div className="tl-filters">
        <Pill active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>All Types</Pill>
        {types.map(t => {
          const cfg = timelineTypeConfig[t];
          return (
            <Pill key={t} active={typeFilter === t} onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}>
              <span style={{ marginRight: 4 }}>{cfg.glyph}</span>{t}
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
              return (
                <TimelineEvent
                  key={ev.id}
                  event={ev}
                  config={cfg}
                  expanded={isExpanded}
                  onToggle={() => setExpanded(isExpanded ? null : ev.id)}
                  calendar={activeWorld.calendar}
                />
              );
            })}
          </div>
        )}
        <button className="tl-add" onClick={() => setAddOpen(true)}>
          <span style={{ color: 'var(--gold)' }}>+</span>
          Add event to timeline
        </button>
      </div>

      {addOpen && (
        <NewEventModal
          calendar={activeWorld.calendar}
          eras={eras}
          onSave={handleAddEvent}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}

function TimelineEvent({
  event, config, expanded, onToggle, calendar,
}: {
  event: WorldTimelineEvent;
  config: { glyph: string; color: string };
  expanded: boolean;
  onToggle: () => void;
  calendar: string;
}) {
  const isCampaign = event.type === 'campaign';

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
          <span>{config.glyph}</span> {event.type}
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
              <div className="tl-event-expanded-value" style={{ color: config.color }}>{config.glyph} {event.type}</div>
            </div>
          </div>
          <div className="tl-event-expanded-desc">{event.desc}</div>
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
  onSave: (event: Omit<WorldTimelineEvent, 'id'>) => void;
  onClose: () => void;
}) {
  const { timelineTypeConfig } = useWorld();
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [date, setDate] = useState('');
  const [desc, setDesc] = useState('');
  const [type, setType] = useState<TimelineEventType>('custom');
  const [era, setEra] = useState(eras[eras.length - 1] || 'Fourth Silence');

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
      era,
    });
  };

  return (
    <div className="ne-overlay" onClick={onClose}>
      <div className="ne-modal" onClick={e => e.stopPropagation()}>
        <div className="ne-head">
          <div className="ne-title">New Timeline Event</div>
          <button className="ne-close" onClick={onClose}>✕</button>
        </div>
        <div className="ne-body">
          <div className="ne-field">
            <label>Event Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. The Battle of Ashfield" autoFocus />
          </div>
          <div className="ne-row">
            <div className="ne-field">
              <label>Year ({calendar})</label>
              <input type="number" value={year} onChange={e => setYear(e.target.value)} placeholder="e.g. 701" />
            </div>
            <div className="ne-field">
              <label>Display Date</label>
              <input value={date} onChange={e => setDate(e.target.value)} placeholder="e.g. CR 701, Midsummer" />
            </div>
          </div>
          <div className="ne-row">
            <div className="ne-field">
              <label>Type</label>
              <select value={type} onChange={e => setType(e.target.value as TimelineEventType)}>
                {types.map(t => {
                  const cfg = timelineTypeConfig[t];
                  return <option key={t} value={t}>{cfg.glyph} {t}</option>;
                })}
              </select>
            </div>
            <div className="ne-field">
              <label>Era</label>
              <select value={era} onChange={e => setEra(e.target.value)}>
                {eras.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>
          <div className="ne-field">
            <label>Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="What happened and why it matters…" rows={3} />
          </div>
        </div>
        <div className="ne-foot">
          <button className="ne-btn" onClick={onClose}>Cancel</button>
          <button className="ne-btn ne-btn-primary" onClick={handleSave} disabled={!title.trim()}>Add Event</button>
        </div>
      </div>
    </div>
  );
}
