import { useState, useEffect, useRef, useMemo } from 'react';
import {
  ScrollText, Users, User, Map, Shield, Lightbulb,
  BookOpen, Skull, Swords, Library, Search, X,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import type { Tab } from '../App';

interface SearchResult {
  id: string;
  label: string;
  detail?: string;
  tab: Tab;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  group: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate: (tab: Tab) => void;
}

export default function SearchOverlay({ open, onClose, onNavigate }: Props) {
  const campaign = useCampaign();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const matches: SearchResult[] = [];
    const match = (text: string | null | undefined) =>
      text?.toLowerCase().includes(q) ?? false;

    // Sessions
    for (const s of campaign.sessions) {
      if (match(s.summary) || match(String(s.session_number)) || match(s.session_date) ||
          match(s.combats) || match(s.loot_rewards) || match(s.hooks_notes) || match(s.dm_notes)) {
        matches.push({
          id: s.id, label: `Session #${s.session_number}`,
          detail: s.session_date ?? undefined,
          tab: 'sessions', icon: ScrollText, group: 'Sessions',
        });
      }
    }

    // Session Prep
    for (const p of campaign.sessionPreps) {
      if (match(p.notes) || match(String(p.session_number)) || match(p.prep_date)) {
        matches.push({
          id: p.id, label: `Session #${p.session_number} Prep`,
          detail: p.prep_date ?? undefined,
          tab: 'sessions', icon: ScrollText, group: 'Session Prep',
        });
      }
    }

    // Player Characters
    for (const pc of campaign.pcs) {
      if (match(pc.character_name) || match(pc.player_name) || match(pc.race) ||
          match(pc.class) || match(pc.background) || match(pc.story_hooks)) {
        matches.push({
          id: pc.id, label: pc.character_name,
          detail: `${pc.race ?? ''} ${pc.class ?? ''}`.trim() || undefined,
          tab: 'characters', icon: User, group: 'Characters',
        });
      }
    }

    // NPCs
    for (const npc of campaign.npcs) {
      if (match(npc.name) || match(npc.role) || match(npc.affiliation) ||
          match(npc.description) || match(npc.hooks_motivations)) {
        matches.push({
          id: npc.id, label: npc.name,
          detail: [npc.role, npc.affiliation].filter(Boolean).join(' · ') || undefined,
          tab: 'characters', icon: Users, group: 'NPCs',
        });
      }
    }

    // Locations
    for (const loc of campaign.locations) {
      if (match(loc.name) || match(loc.region) || match(loc.location_type) ||
          match(loc.description) || match(loc.history)) {
        matches.push({
          id: loc.id, label: loc.name,
          detail: [loc.location_type, loc.region].filter(Boolean).join(' · ') || undefined,
          tab: 'lore', icon: Map, group: 'Locations',
        });
      }
    }

    // Factions
    for (const f of campaign.factions) {
      if (match(f.name) || match(f.faction_type) || match(f.overview) ||
          match(f.key_figures) || match(f.agenda)) {
        matches.push({
          id: f.id, label: f.name,
          detail: f.faction_type ?? undefined,
          tab: 'factions', icon: Shield, group: 'Factions',
        });
      }
    }

    // Hooks
    for (const h of campaign.hooks) {
      if (match(h.title) || match(h.description) || match(h.category)) {
        matches.push({
          id: h.id, label: h.title,
          detail: `${h.category ?? ''} · ${h.is_active ? 'active' : 'resolved'}`,
          tab: 'hooks', icon: Lightbulb, group: 'Hooks & Ideas',
        });
      }
    }

    // Lore
    for (const l of campaign.lore) {
      if (match(l.title) || match(l.content) || match(l.category)) {
        matches.push({
          id: l.id, label: l.title,
          detail: l.category ?? undefined,
          tab: 'lore', icon: Library, group: 'Lore',
        });
      }
    }

    // Modules
    for (const m of campaign.modules) {
      if (match(m.title) || match(m.synopsis) || match(m.dm_notes)) {
        matches.push({
          id: m.id, label: m.title,
          detail: `Ch.${m.chapter ?? '?'} · ${m.status}`,
          tab: 'modules', icon: BookOpen, group: 'Modules',
        });
      }
    }

    // Creatures
    for (const c of campaign.monsterStatblocks) {
      if (match(c.name) || match(c.creature_type) || match(c.challenge_rating) || match(c.tags)) {
        matches.push({
          id: c.id, label: c.name,
          detail: [c.creature_type, c.challenge_rating ? `CR ${c.challenge_rating}` : null].filter(Boolean).join(' · ') || undefined,
          tab: 'creatures', icon: Skull, group: 'Stat Sheets',
        });
      }
    }

    // Encounters
    for (const e of campaign.encounters) {
      if (match(e.name) || match(e.description) || match(e.status)) {
        matches.push({
          id: e.id, label: e.name,
          detail: e.status ?? undefined,
          tab: 'encounters', icon: Swords, group: 'Encounters',
        });
      }
    }

    return matches.slice(0, 50);
  }, [query, campaign]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [results]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  const handleSelect = (result: SearchResult) => {
    onNavigate(result.tab);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      e.preventDefault();
      handleSelect(results[selectedIdx]);
    }
  };

  if (!open) return null;

  // Group results for display
  const grouped: { group: string; items: (SearchResult & { flatIdx: number })[] }[] = [];
  let flatIdx = 0;
  for (const r of results) {
    let g = grouped.find(g => g.group === r.group);
    if (!g) {
      g = { group: r.group, items: [] };
      grouped.push(g);
    }
    g.items.push({ ...r, flatIdx: flatIdx++ });
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 9000,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(560px, calc(100vw - 32px))',
          maxHeight: '60vh',
          zIndex: 9001,
          backgroundColor: '#1a1830',
          border: '1px solid #3a3660',
          borderRadius: '12px',
          boxShadow: '0 16px 64px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px',
          borderBottom: '1px solid #3a3660',
        }}>
          <Search size={18} strokeWidth={1.5} style={{ color: '#6a6490', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search sessions, NPCs, locations, stat sheets..."
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: '#e8d5b0',
              fontSize: '15px',
              fontFamily: 'Georgia, Cambria, serif',
            }}
          />
          <div style={{ color: '#4a4470', fontSize: '11px', flexShrink: 0 }}>
            <kbd style={{
              padding: '2px 6px',
              borderRadius: '4px',
              border: '1px solid #3a3660',
              backgroundColor: '#0f0e17',
              fontSize: '10px',
            }}>ESC</kbd>
          </div>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
          {query && results.length === 0 && (
            <div style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: '#4a4470',
              fontSize: '13px',
            }}>
              No results for "{query}"
            </div>
          )}

          {!query && (
            <div style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: '#4a4470',
              fontSize: '13px',
              lineHeight: '1.8',
            }}>
              Type to search across your entire campaign
            </div>
          )}

          {grouped.map(g => (
            <div key={g.group}>
              <div style={{
                padding: '8px 16px 4px',
                fontSize: '0.65rem',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#6a6490',
              }}>
                {g.group}
              </div>
              {g.items.map(item => {
                const Icon = item.icon;
                const isSelected = item.flatIdx === selectedIdx;
                return (
                  <button
                    key={item.id}
                    data-idx={item.flatIdx}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIdx(item.flatIdx)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '8px 16px',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      backgroundColor: isSelected ? '#22203a' : 'transparent',
                      color: '#e8d5b0',
                      fontFamily: 'Georgia, Cambria, serif',
                      fontSize: '14px',
                    }}
                  >
                    <Icon size={16} strokeWidth={1.5} style={{ color: '#9990b0', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.label}
                      </div>
                      {item.detail && (
                        <div style={{ fontSize: '11px', color: '#6a6490', marginTop: '1px' }}>
                          {item.detail}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <span style={{ color: '#4a4470', fontSize: '11px', flexShrink: 0 }}>
                        <kbd style={{
                          padding: '1px 5px',
                          borderRadius: '3px',
                          border: '1px solid #3a3660',
                          backgroundColor: '#0f0e17',
                          fontSize: '10px',
                        }}>↵</kbd>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
