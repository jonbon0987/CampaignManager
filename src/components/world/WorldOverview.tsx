import { useState, useEffect, useRef } from 'react';
import { useWorld } from '../../context/WorldContext';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="cm-stat">
      <div className="cm-stat-label">{label}</div>
      <div className="cm-stat-value">{value}</div>
    </div>
  );
}

function Card({ title, onClick, children }: { title: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <div className="cm-card" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="cm-card-head">
        <span className="cm-card-title">{title}</span>
        {onClick && <span className="cm-card-arrow">›</span>}
      </div>
      <div className="cm-card-body">{children}</div>
    </div>
  );
}

function InlineEdit({
  value,
  onSave,
  className,
  inputClassName,
  as: Tag = 'span',
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  inputClassName?: string;
  as?: 'h1' | 'p' | 'span';
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync draft when external value changes (e.g. world switch)
  useEffect(() => { setDraft(value); }, [value]);

  const start = () => { setDraft(value); setEditing(true); };
  const save = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    setEditing(false);
  };
  const cancel = () => setEditing(false);

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        className={`w-hero-inline-input ${inputClassName ?? ''}`}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
      />
    );
  }

  return (
    <Tag
      className={`${className ?? ''} w-hero-editable`}
      onClick={start}
      title="Click to edit"
    >
      {value}
    </Tag>
  );
}

export default function WorldOverview() {
  const { activeWorld, campaigns, timeline, factions, lore, locations, openCampaign, setWorldTab, timelineTypeConfig, updateWorld } = useWorld();

  if (!activeWorld) return null;

  const recentEvents = timeline
    .slice(-4)
    .reverse();

  return (
    <div className="w-overview">
      <div className="w-hero">
        <div className="w-hero-scope">⊕ World</div>
        <InlineEdit
          as="h1"
          className="w-hero-title"
          inputClassName="w-hero-title-input"
          value={activeWorld.name}
          onSave={v => updateWorld(activeWorld.id, { name: v })}
        />
        <InlineEdit
          as="p"
          className="w-hero-tag"
          inputClassName="w-hero-tag-input"
          value={activeWorld.tagline}
          onSave={v => updateWorld(activeWorld.id, { tagline: v })}
        />
        <div className="w-hero-stats">
          <Stat label="Campaigns" value={campaigns.length} />
          <Stat label="Locations" value={locations.length} />
        </div>
      </div>

      <div className="w-grid">
        <Card title="Campaigns">
          <div className="w-ov-campaigns">
            {campaigns.map(c => (
              <div
                key={c.id}
                className="w-ov-camp"
                onClick={() => openCampaign(c.id)}
              >
                <span className="w-ov-camp-glyph">❧</span>
                <div>
                  <div className="w-ov-camp-name">{c.name}</div>
                  <div className="w-ov-camp-sub">{c.party} · {c.sessions} sessions · {c.status}</div>
                </div>
                <span className="cm-card-arrow">›</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Recent Events" onClick={() => setWorldTab('timeline')}>
          {recentEvents.map(ev => {
            const cfg = timelineTypeConfig[ev.type] ?? timelineTypeConfig.custom;
            return (
              <div key={ev.id} className="w-ov-row">
                <span className="w-ov-row-glyph" style={{ color: cfg.color }}>{cfg.glyph}</span>
                <span className="w-ov-row-title">{ev.title}</span>
                <span className="w-ov-row-meta">{ev.date}</span>
              </div>
            );
          })}
        </Card>

        <Card title="Factions" onClick={() => setWorldTab('npcs')}>
          {factions.slice(0, 5).map(f => (
            <div key={f.id} className="w-ov-row">
              <span className="w-ov-row-glyph" style={{ color: f.tone }}>❖</span>
              <span className="w-ov-row-title">{f.name}</span>
              <span className="w-ov-row-meta">{f.type}</span>
            </div>
          ))}
        </Card>

        <Card title="Lore" onClick={() => setWorldTab('lore')}>
          {lore.slice(0, 4).map(l => (
            <div key={l.id} className="w-ov-row">
              <span className="w-ov-row-glyph">❦</span>
              <span className="w-ov-row-title">{l.title}</span>
              <span className="w-ov-row-meta">{l.tags[0] ?? ''}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
