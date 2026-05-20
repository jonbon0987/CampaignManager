import { useState, useMemo } from 'react';
import { useWorld } from '../../context/WorldContext';
import { ListDetail, ListRow, DetailPanel, DetailSection, Pill, EmptyDetail } from '../ui/ListDetail';
import { Badge } from '../ui/Badge';
import type { ReactNode } from 'react';

function Tag({ children, kind }: { children: ReactNode; kind?: string }) {
  const colorMap: Record<string, 'green' | 'red' | 'orange' | 'muted' | 'gold'> = {
    active: 'green', deceased: 'red', deadly: 'red', hard: 'orange',
    medium: 'gold', mythic: 'muted', unknown: 'muted',
  };
  return <Badge color={colorMap[kind || ''] || 'muted'}>{children}</Badge>;
}

function SubtleTag({ children }: { children: ReactNode }) {
  return <Badge color="muted">{children}</Badge>;
}

function WorldBadge() {
  return <span className="w-inherited">⊕ World-scoped</span>;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="cm-stat">
      <div className="cm-stat-label">{label}</div>
      <div className="cm-stat-value">{value}</div>
    </div>
  );
}

// ═══════════════════════════════════════════
// WORLD NPCs VIEW
// ═══════════════════════════════════════════

export function WorldNPCsView() {
  const { npcs, factions, facById, locById, selected, setSelected } = useWorld();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'npc' | 'faction'>('all');

  type ListItem = { id: string; name: string; kind: 'npc' | 'faction'; role?: string; type?: string; status?: string; era?: string; desc?: string; factions?: string[]; location?: string | null; tags?: string[]; tone?: string; };

  const items = useMemo(() => {
    const all: ListItem[] = [
      ...npcs.map(x => ({ ...x, kind: 'npc' as const })),
      ...factions.map(x => ({ ...x, kind: 'faction' as const })),
    ];
    return all.filter(x => {
      if (filter !== 'all' && x.kind !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = [x.name, x.role, x.desc, x.type].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [npcs, factions, filter, search]);

  const sel = items.find(x => x.id === selected.npcs) || items[0];

  return (
    <ListDetail
      title="World NPCs"
      count={items.length}
      search={search}
      onSearchChange={setSearch}
      onAdd={() => {}}
      filters={
        <>
          <Pill active={filter === 'all'} onClick={() => setFilter('all')}>All</Pill>
          <Pill active={filter === 'npc'} onClick={() => setFilter('npc')}>Characters</Pill>
          <Pill active={filter === 'faction'} onClick={() => setFilter('faction')}>Factions</Pill>
        </>
      }
      list={
        <div>
          {items.map(x => (
            <ListRow
              key={x.kind + x.id}
              active={sel?.id === x.id}
              onClick={() => setSelected('npcs', x.id)}
              glyph={x.kind === 'faction' ? '❖' : '◇'}
              title={x.name}
              subtitle={x.kind === 'npc' ? x.role : x.type}
              badges={
                <>
                  {x.kind === 'npc' && x.status && <Tag kind={x.status}>{x.status}</Tag>}
                  {x.kind === 'npc' && x.era && <SubtleTag>{x.era}</SubtleTag>}
                  {x.kind === 'faction' && <SubtleTag>{x.type}</SubtleTag>}
                </>
              }
            />
          ))}
        </div>
      }
      detail={sel ? <WorldNPCDetail entity={sel} /> : <EmptyDetail>Select an entry.</EmptyDetail>}
    />
  );
}

function WorldNPCDetail({ entity }: { entity: any }) {
  const { npcs, facById, locById } = useWorld();

  if (entity.kind === 'faction') {
    const members = npcs.filter(n => n.factions?.includes(entity.id));
    return (
      <DetailPanel eyebrow={`World Faction · ${entity.type}`} title={entity.name} subtitle={entity.desc}>
        <WorldBadge />
        <div className="cm-stat-strip">
          <Stat label="Type" value={entity.type} />
          <Stat label="Members" value={members.length} />
        </div>
        <DetailSection title="Known Members">
          {members.length === 0 ? (
            <p className="cm-prose" style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>No known members.</p>
          ) : (
            <div className="cm-chip-list">
              {members.map(n => (
                <span key={n.id} className="cm-chip">
                  <span className="cm-chip-glyph">◇</span>{n.name}
                </span>
              ))}
            </div>
          )}
        </DetailSection>
      </DetailPanel>
    );
  }

  const entityFactions = (entity.factions || []).map((id: string) => facById[id]).filter(Boolean);
  const loc = entity.location ? locById[entity.location] : null;

  return (
    <DetailPanel eyebrow="World Character" title={entity.name} subtitle={entity.role}>
      <WorldBadge />
      <div className="cm-stat-strip">
        <Stat label="Status" value={<Tag kind={entity.status}>{entity.status}</Tag>} />
        <Stat label="Era" value={entity.era || '—'} />
        <Stat label="Location" value={loc ? loc.name : '—'} />
      </div>
      {entityFactions.length > 0 && (
        <div className="cm-pill-row">
          {entityFactions.map((f: any) => (
            <span key={f.id} className="cm-faction-pill" style={{ '--faction-tone': f.tone } as React.CSSProperties}>
              <span className="cm-pill-glyph">❖</span>{f.name}
            </span>
          ))}
        </div>
      )}
      <DetailSection title="Description">
        <p className="cm-prose">{entity.desc}</p>
      </DetailSection>
      {entity.tags?.length > 0 && (
        <DetailSection title="Tags">
          <div className="cm-chip-list">
            {entity.tags.map((t: string) => <span key={t} className="cm-tag is-subtle">{t}</span>)}
          </div>
        </DetailSection>
      )}
    </DetailPanel>
  );
}

// ═══════════════════════════════════════════
// WORLD LOCATIONS VIEW
// ═══════════════════════════════════════════

export function WorldLocationsView() {
  const { locations, npcs, locById, selected, setSelected } = useWorld();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const types = useMemo(() => [...new Set(locations.map(l => l.type))], [locations]);

  const items = useMemo(() => {
    return locations.filter(x => {
      if (filter !== 'all' && x.type !== filter) return false;
      if (search && !`${x.name} ${x.desc}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [locations, filter, search]);

  const sel = items.find(x => x.id === selected.locations) || items[0];

  return (
    <ListDetail
      title="World Locations"
      count={items.length}
      search={search}
      onSearchChange={setSearch}
      onAdd={() => {}}
      filters={
        <>
          <Pill active={filter === 'all'} onClick={() => setFilter('all')}>All</Pill>
          {types.map(t => (
            <Pill key={t} active={filter === t} onClick={() => setFilter(filter === t ? 'all' : t)}>{t}</Pill>
          ))}
        </>
      }
      list={
        <div>
          {items.map(x => {
            const parent = x.parent ? locById[x.parent] : null;
            return (
              <ListRow
                key={x.id}
                active={sel?.id === x.id}
                onClick={() => setSelected('locations', x.id)}
                glyph="✦"
                title={x.name}
                subtitle={parent ? `${x.type} · in ${parent.name}` : x.type}
                badges={x.tags.slice(0, 2).map(t => <SubtleTag key={t}>{t}</SubtleTag>)}
              />
            );
          })}
        </div>
      }
      detail={sel ? <WorldLocationDetail loc={sel} /> : <EmptyDetail>Select a location.</EmptyDetail>}
    />
  );
}

function WorldLocationDetail({ loc }: { loc: any }) {
  const { locations, npcs, locById } = useWorld();
  const children = locations.filter(l => l.parent === loc.id);
  const npcsHere = npcs.filter(n => n.location === loc.id);
  const parent = loc.parent ? locById[loc.parent] : null;

  return (
    <DetailPanel eyebrow={`World Location · ${loc.type}`} title={loc.name} subtitle={loc.tags.map((t: string) => `#${t}`).join('  ')}>
      <WorldBadge />
      <div className="cm-stat-strip">
        <Stat label="Type" value={loc.type} />
        <Stat label="Parent" value={parent ? parent.name : '—'} />
        <Stat label="Sub-locations" value={children.length} />
        <Stat label="NPCs Here" value={npcsHere.length} />
      </div>
      <DetailSection title="Description">
        <p className="cm-prose">{loc.desc}</p>
      </DetailSection>
      {children.length > 0 && (
        <DetailSection title="Sub-locations">
          <div className="cm-chip-list">
            {children.map(c => (
              <span key={c.id} className="cm-chip">
                <span className="cm-chip-glyph" style={{ color: 'var(--gold)' }}>✦</span>{c.name}
              </span>
            ))}
          </div>
        </DetailSection>
      )}
      {npcsHere.length > 0 && (
        <DetailSection title="Who's Here">
          <div className="cm-chip-list">
            {npcsHere.map(n => (
              <span key={n.id} className="cm-chip">
                <span className="cm-chip-glyph">◇</span>{n.name}
              </span>
            ))}
          </div>
        </DetailSection>
      )}
    </DetailPanel>
  );
}

// ═══════════════════════════════════════════
// WORLD LORE VIEW
// ═══════════════════════════════════════════

export function WorldLoreView() {
  const { lore, selected, setSelected } = useWorld();
  const [search, setSearch] = useState('');

  const items = useMemo(() => {
    return lore.filter(x => {
      if (search && !`${x.title} ${x.desc}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [lore, search]);

  const sel = items.find(x => x.id === selected.lore) || items[0];

  return (
    <ListDetail
      title="World Lore"
      count={items.length}
      search={search}
      onSearchChange={setSearch}
      onAdd={() => {}}
      list={
        <div>
          {items.map(x => (
            <ListRow
              key={x.id}
              active={sel?.id === x.id}
              onClick={() => setSelected('lore', x.id)}
              glyph="❦"
              title={x.title}
              subtitle="lore"
              badges={x.tags.slice(0, 2).map(t => <SubtleTag key={t}>{t}</SubtleTag>)}
            />
          ))}
        </div>
      }
      detail={sel ? (
        <DetailPanel eyebrow="World Lore" title={sel.title} subtitle={sel.tags.map(t => `#${t}`).join('  ')}>
          <WorldBadge />
          <DetailSection title="Content">
            <p className="cm-prose">{sel.desc}</p>
          </DetailSection>
        </DetailPanel>
      ) : <EmptyDetail>Select a lore entry.</EmptyDetail>}
    />
  );
}

// ═══════════════════════════════════════════
// WORLD COMBAT VIEW (Bestiary + Encounters)
// ═══════════════════════════════════════════

export function WorldCombatView() {
  const { bestiary, encounters, sbById, selected, setSelected } = useWorld();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'bestiary' | 'encounter'>('all');

  type CombatItem = { id: string; name: string; kind: 'statblock' | 'encounter'; cr?: string; type?: string; hp?: number; ac?: number; desc?: string; tags?: string[]; difficulty?: string; status?: string; creatures?: string[]; notes?: string; };

  const items = useMemo(() => {
    const all: CombatItem[] = [
      ...bestiary.map(x => ({ ...x, kind: 'statblock' as const })),
      ...encounters.map(x => ({ ...x, kind: 'encounter' as const })),
    ];
    return all.filter(x => {
      if (filter === 'bestiary' && x.kind !== 'statblock') return false;
      if (filter === 'encounter' && x.kind !== 'encounter') return false;
      if (search) {
        const q = search.toLowerCase();
        if (!`${x.name} ${x.desc || x.notes || ''}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [bestiary, encounters, filter, search]);

  const sel = items.find(x => x.id === selected.combat) || items[0];

  return (
    <ListDetail
      title="World Combat"
      count={items.length}
      search={search}
      onSearchChange={setSearch}
      onAdd={() => {}}
      filters={
        <>
          <Pill active={filter === 'all'} onClick={() => setFilter('all')}>All</Pill>
          <Pill active={filter === 'bestiary'} onClick={() => setFilter('bestiary')}>Bestiary</Pill>
          <Pill active={filter === 'encounter'} onClick={() => setFilter('encounter')}>Encounters</Pill>
        </>
      }
      list={
        <div>
          {items.map(x => (
            <ListRow
              key={x.kind + x.id}
              active={sel?.id === x.id}
              onClick={() => setSelected('combat', x.id)}
              glyph={x.kind === 'statblock' ? '✜' : '⚔'}
              title={x.name}
              subtitle={x.kind === 'statblock' ? `CR ${x.cr} · ${x.type}` : `${x.difficulty} · ${(x.creatures || []).length} creatures`}
              badges={
                x.kind === 'statblock'
                  ? (x.tags || []).slice(0, 2).map(t => <SubtleTag key={t}>{t}</SubtleTag>)
                  : <><Tag kind={x.difficulty}>{x.difficulty}</Tag><SubtleTag>{x.status}</SubtleTag></>
              }
            />
          ))}
        </div>
      }
      detail={sel ? <WorldCombatDetail entity={sel} /> : <EmptyDetail>Select an entry.</EmptyDetail>}
    />
  );
}

function WorldCombatDetail({ entity }: { entity: any }) {
  const { sbById } = useWorld();

  if (entity.kind === 'statblock') {
    return (
      <DetailPanel eyebrow={`World Bestiary · ${entity.type}`} title={entity.name} subtitle={`Challenge Rating ${entity.cr}`}>
        <WorldBadge />
        <div className="cm-stat-strip">
          <Stat label="CR" value={entity.cr} />
          <Stat label="Type" value={entity.type} />
          <Stat label="HP" value={entity.hp} />
          <Stat label="AC" value={entity.ac} />
        </div>
        <DetailSection title="Description">
          <p className="cm-prose">{entity.desc}</p>
        </DetailSection>
        {entity.tags?.length > 0 && (
          <DetailSection title="Tags">
            <div className="cm-chip-list">
              {entity.tags.map((t: string) => <span key={t} className="cm-tag is-subtle">{t}</span>)}
            </div>
          </DetailSection>
        )}
      </DetailPanel>
    );
  }

  const creatures = (entity.creatures || []).map((id: string) => sbById[id]).filter(Boolean);
  return (
    <DetailPanel eyebrow={`World Encounter · ${entity.difficulty}`} title={entity.name} subtitle={`Status · ${entity.status}`}>
      <WorldBadge />
      <DetailSection title="Creatures">
        <div className="w-creature-list">
          {creatures.map((c: any, i: number) => (
            <div key={i} className="w-creature">
              <span className="w-creature-glyph">✜</span>
              <div className="w-creature-body">
                <div className="w-creature-name">{c.name}</div>
                <div className="w-creature-meta">CR {c.cr} · {c.type} · HP {c.hp} · AC {c.ac}</div>
              </div>
            </div>
          ))}
        </div>
      </DetailSection>
      <DetailSection title="Notes">
        <p className="cm-prose">{entity.notes}</p>
      </DetailSection>
    </DetailPanel>
  );
}
