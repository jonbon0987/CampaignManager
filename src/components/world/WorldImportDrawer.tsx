import { useState, useMemo } from 'react';
import { useWorld } from '../../context/WorldContext';

interface WorldImportDrawerProps {
  open: boolean;
  onClose: () => void;
  entityType: string;
  onImport: (items: any[]) => void;
}

interface PoolItem {
  id: string;
  kind: string;
  displayName: string;
  sub: string;
  desc?: string;
}

const KIND_GLYPH: Record<string, string> = {
  npc: '◇', faction: '❖', location: '✦', lore: '❦', statblock: '✜', encounter: '⚔',
};

const TYPE_LABEL: Record<string, string> = {
  npc: 'NPCs', faction: 'Factions', location: 'Locations',
  lore: 'Lore', bestiary: 'Bestiary', encounter: 'Encounters', all: 'Entities',
};

export default function WorldImportDrawer({ open, onClose, entityType, onImport }: WorldImportDrawerProps) {
  const { npcs, factions, locations, lore, bestiary, encounters } = useWorld();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const pool = useMemo<PoolItem[]>(() => {
    switch (entityType) {
      case 'npc': return npcs.map(x => ({ id: x.id, kind: 'npc', displayName: x.name, sub: x.role, desc: x.desc }));
      case 'faction': return factions.map(x => ({ id: x.id, kind: 'faction', displayName: x.name, sub: x.type, desc: x.desc }));
      case 'location': return locations.map(x => ({ id: x.id, kind: 'location', displayName: x.name, sub: x.type, desc: x.desc }));
      case 'lore': return lore.map(x => ({ id: x.id, kind: 'lore', displayName: x.title, sub: 'lore', desc: x.desc }));
      case 'bestiary': return bestiary.map(x => ({ id: x.id, kind: 'statblock', displayName: x.name, sub: `CR ${x.cr} · ${x.type}`, desc: x.desc }));
      case 'encounter': return encounters.map(x => ({ id: x.id, kind: 'encounter', displayName: x.name, sub: `${x.difficulty} · ${x.creatures.length} creatures`, desc: x.notes }));
      default: return [
        ...npcs.map(x => ({ id: x.id, kind: 'npc', displayName: x.name, sub: x.role, desc: x.desc })),
        ...factions.map(x => ({ id: x.id, kind: 'faction', displayName: x.name, sub: x.type, desc: x.desc })),
        ...locations.map(x => ({ id: x.id, kind: 'location', displayName: x.name, sub: x.type, desc: x.desc })),
        ...lore.map(x => ({ id: x.id, kind: 'lore', displayName: x.title, sub: 'lore', desc: x.desc })),
        ...bestiary.map(x => ({ id: x.id, kind: 'statblock', displayName: x.name, sub: `CR ${x.cr}`, desc: x.desc })),
      ];
    }
  }, [entityType, npcs, factions, locations, lore, bestiary, encounters]);

  const filtered = useMemo(() => {
    if (!search) return pool;
    const q = search.toLowerCase();
    return pool.filter(x => `${x.displayName} ${x.sub} ${x.desc || ''}`.toLowerCase().includes(q));
  }, [pool, search]);

  const toggleItem = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = () => {
    const items = pool.filter(x => selected.has(x.id));
    onImport(items);
    setSelected(new Set());
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div className="wi-overlay" onClick={onClose} />
      <div className="wi-drawer">
        <div className="wi-head">
          <div>
            <div className="wi-head-scope">⊕ Import from World</div>
            <div className="wi-head-title">{TYPE_LABEL[entityType] || 'Entities'}</div>
          </div>
          <button className="wi-close" onClick={onClose}>✕</button>
        </div>

        <div className="wi-search">
          <span style={{ color: 'var(--ink-3)' }}>⌕</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search world ${(TYPE_LABEL[entityType] || 'entities').toLowerCase()}…`}
            autoFocus
          />
        </div>

        <div className="wi-body">
          {filtered.length === 0 ? (
            <div className="wi-empty">No matching world entities found.</div>
          ) : (
            filtered.map(item => {
              const isSelected = selected.has(item.id);
              return (
                <button
                  key={item.kind + item.id}
                  className={`wi-item ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => toggleItem(item.id)}
                >
                  <span className="wi-check">{isSelected ? '✓' : ''}</span>
                  <span className="wi-item-glyph" style={{ color: 'var(--gold)' }}>{KIND_GLYPH[item.kind] || '·'}</span>
                  <div className="wi-item-body">
                    <div className="wi-item-name">{item.displayName}</div>
                    <div className="wi-item-sub">{item.sub}</div>
                    {item.desc && (
                      <div className="wi-item-desc">
                        {item.desc.length > 100 ? item.desc.slice(0, 100) + '…' : item.desc}
                      </div>
                    )}
                  </div>
                  <span className="wi-item-kind">{item.kind}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="wi-foot">
          <div className="wi-foot-count">{selected.size} selected</div>
          <div className="wi-foot-actions">
            <button className="wi-foot-mode">
              <span className="wi-foot-mode-dot wi-mode-link" />
              Link
            </button>
            <button className="wi-foot-mode">
              <span className="wi-foot-mode-dot wi-mode-copy" />
              Copy
            </button>
          </div>
          <button
            className="wi-import-btn"
            disabled={selected.size === 0}
            onClick={handleImport}
          >
            Import {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </div>
      </div>
    </>
  );
}
