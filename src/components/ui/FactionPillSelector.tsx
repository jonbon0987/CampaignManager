import { useState, useRef, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { getFactionTypeStyle } from '../../lib/theme';
import type { Faction } from '../../lib/database.types';

interface FactionPillSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  factions: Faction[];
}

export function FactionPillSelector({ selectedIds, onChange, factions }: FactionPillSelectorProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const selected = selectedIds
    .map(id => factions.find(f => f.id === id))
    .filter((f): f is Faction => !!f);
  const unselected = factions.filter(f => !selectedIds.includes(f.id));

  const addFaction = (id: string) => {
    onChange([...selectedIds, id]);
    setDropdownOpen(false);
  };

  const removeFaction = (id: string) => {
    onChange(selectedIds.filter(x => x !== id));
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {selected.map(f => {
          const style = getFactionTypeStyle(f.faction_type);
          return (
            <span
              key={f.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                backgroundColor: style.bg,
                color: style.text,
                border: `1px solid ${style.border}`,
                borderRadius: 'var(--radius)',
                padding: '2px 6px',
                fontSize: 12,
                lineHeight: 1.2,
              }}
            >
              {f.name}
              <button
                type="button"
                onClick={() => removeFaction(f.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: style.text,
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Remove"
              >
                <X size={12} />
              </button>
            </span>
          );
        })}
        {unselected.length > 0 && (
          <button
            type="button"
            onClick={() => setDropdownOpen(v => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              backgroundColor: 'var(--paper-2)',
              color: 'var(--ink-2)',
              border: '1px dashed var(--rule)',
              borderRadius: 'var(--radius)',
              padding: '2px 6px',
              fontSize: 12,
              lineHeight: 1.2,
              cursor: 'pointer',
            }}
          >
            <Plus size={12} /> Add Faction
          </button>
        )}
        {selected.length === 0 && unselected.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--ink-3)', fontStyle: 'italic' }}>
            No factions available
          </span>
        )}
      </div>
      {dropdownOpen && unselected.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            backgroundColor: 'var(--paper)',
            border: '1px solid var(--rule)',
            borderRadius: 'var(--radius)',
            padding: 4,
            zIndex: 50,
            maxHeight: 240,
            overflowY: 'auto',
            minWidth: 180,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          {unselected.map(f => {
            const style = getFactionTypeStyle(f.faction_type);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => addFaction(f.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  color: 'var(--ink)',
                  textAlign: 'left',
                  padding: '6px 8px',
                  fontSize: 13,
                  cursor: 'pointer',
                  borderRadius: 'var(--radius)',
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--paper-2)'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: style.text,
                  }}
                />
                {f.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
