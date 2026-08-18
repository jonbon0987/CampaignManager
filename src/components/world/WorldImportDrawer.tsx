import { useState, useMemo } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useWorld } from '../../context/WorldContext';
import { kindMeta } from '../../lib/randomEncounter';

interface WorldImportDrawerProps {
  open: boolean;
  onClose: () => void;
  entityType: string;
}

type Mode = 'link' | 'copy';

interface PoolItem {
  id: string;
  kind: string;
  displayName: string;
  sub: string;
  desc?: string;
}

// Per-entity-type behavior for bringing a world/canon entity into the campaign.
interface KindConfig {
  pool: PoolItem[];
  linkedIds: Set<string>;
  canLink: boolean;                                   // linkable-globals only (npc/location/lore)
  importItem: (id: string, mode: Mode) => Promise<void>;
}

const KIND_GLYPH: Record<string, string> = {
  npc: '◇', faction: '❖', location: '✦', lore: '❦', statblock: '✜', encounter: '⚔', randomtable: '🎲',
};

const TYPE_LABEL: Record<string, string> = {
  npc: 'NPCs', faction: 'Factions', location: 'Locations',
  lore: 'Lore', bestiary: 'Bestiary', encounter: 'Encounters',
  randomEncounter: 'Random Tables', all: 'Entities',
};

// Drop DB-managed / scope fields so a spread of a full canon row can be re-inserted
// as a fresh campaign-scoped record (the store re-assigns campaign_id via scope).
function stripSystemFields<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...row };
  for (const k of ['id', 'campaign_id', 'world_id', 'user_id', 'created_at', 'updated_at']) delete rest[k];
  return rest;
}

export default function WorldImportDrawer({ open, onClose, entityType }: WorldImportDrawerProps) {
  const campaign = useCampaign();
  const { factions: worldFactions, bestiary, worldRandomEncounterTables } = useWorld();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('link');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const config = useMemo<KindConfig>(() => {
    switch (entityType) {
      case 'npc': return {
        pool: campaign.globalNPCs.map(n => ({ id: n.id, kind: 'npc', displayName: n.name, sub: n.role ?? '', desc: n.description ?? '' })),
        linkedIds: new Set(campaign.linkedNPCIds),
        canLink: true,
        importItem: async (id, m) => {
          if (m === 'link') return campaign.linkNPCToCampaign(id);
          const n = campaign.globalNPCs.find(x => x.id === id);
          if (n) await campaign.upsertNPC({ ...stripSystemFields(n), faction_ids: [], statblock_id: null } as Parameters<typeof campaign.upsertNPC>[0], 'campaign');
        },
      };
      case 'location': return {
        pool: campaign.globalLocations.map(l => ({ id: l.id, kind: 'location', displayName: l.name, sub: l.location_type ?? '', desc: l.description ?? '' })),
        linkedIds: new Set(campaign.linkedLocationIds),
        canLink: true,
        importItem: async (id, m) => {
          if (m === 'link') return campaign.linkLocationToCampaign(id);
          const l = campaign.globalLocations.find(x => x.id === id);
          if (l) await campaign.upsertLocation({ ...stripSystemFields(l), parent_id: null } as Parameters<typeof campaign.upsertLocation>[0], 'campaign');
        },
      };
      case 'lore': return {
        pool: campaign.globalLore.map(e => ({ id: e.id, kind: 'lore', displayName: e.title, sub: e.category ?? 'lore', desc: e.content ?? '' })),
        linkedIds: new Set(campaign.linkedLoreIds),
        canLink: true,
        importItem: async (id, m) => {
          if (m === 'link') return campaign.linkLoreToCampaign(id);
          const e = campaign.globalLore.find(x => x.id === id);
          if (e) await campaign.upsertLore({ ...stripSystemFields(e) } as Parameters<typeof campaign.upsertLore>[0], 'campaign');
        },
      };
      case 'faction': return {
        // Factions are campaign-scoped (no canon pool / join table) — copy only.
        pool: worldFactions.map(f => ({ id: f.id, kind: 'faction', displayName: f.name, sub: f.type ?? '', desc: f.desc ?? '' })),
        linkedIds: new Set(),
        canLink: false,
        importItem: async (id) => {
          const f = worldFactions.find(x => x.id === id);
          if (f) await campaign.upsertFaction({ name: f.name, faction_type: f.type || null, overview: f.desc || null, key_figures: null, agenda: null, dm_notes: f.dmNotes || null });
        },
      };
      case 'bestiary': return {
        // Stat blocks are campaign-scoped — copy only, from the world bestiary view.
        pool: bestiary.map(b => ({ id: b.id, kind: 'statblock', displayName: b.name, sub: `CR ${b.cr} · ${b.type}`, desc: b.desc })),
        linkedIds: new Set(),
        canLink: false,
        importItem: async (id) => {
          const b = bestiary.find(x => x.id === id);
          if (b) await campaign.upsertMonsterStatblock({ name: b.name, creature_type: b.type || null, challenge_rating: b.cr || null, hit_points: b.hp ?? null, armor_class: b.ac ?? null, dm_notes: b.desc || null, tags: b.tags.join(', ') || null } as Parameters<typeof campaign.upsertMonsterStatblock>[0]);
        },
      };
      case 'randomEncounter': return {
        // Random encounter tables are campaign-scoped — copy only, from the world.
        pool: worldRandomEncounterTables.map(t => ({
          id: t.id, kind: 'randomtable',
          displayName: t.name || 'Untitled table',
          sub: `${kindMeta(t.kind).label}${t.environment ? ` · ${t.environment}` : ''}`,
          desc: t.subtitle ?? t.description ?? '',
        })),
        linkedIds: new Set(),
        canLink: false,
        importItem: async (id) => {
          const t = worldRandomEncounterTables.find(x => x.id === id);
          if (t) await campaign.upsertRandomEncounterTable({
            kind: t.kind,
            name: t.name,
            subtitle: t.subtitle,
            environment: t.environment,
            die_size: t.die_size,
            description: t.description,
            entries: t.entries,
            dm_notes: t.dm_notes,
            sort_order: t.sort_order,
            world_id: null,
          });
        },
      };
      default: return { pool: [], linkedIds: new Set(), canLink: false, importItem: async () => {} };
    }
  }, [entityType, campaign, worldFactions, bestiary, worldRandomEncounterTables]);

  // Copy-only kinds have no "link" — force copy and hide the toggle.
  const effectiveMode: Mode = config.canLink ? mode : 'copy';

  const filtered = useMemo(() => {
    if (!search) return config.pool;
    const q = search.toLowerCase();
    return config.pool.filter(x => `${x.displayName} ${x.sub} ${x.desc || ''}`.toLowerCase().includes(q));
  }, [config.pool, search]);

  const toggleItem = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reset = () => { setSelected(new Set()); setSearch(''); setErr(''); };

  // Closing clears the staged selection (and search/mode) so reopening the
  // drawer always starts fresh rather than showing the previous checks.
  const handleClose = () => { reset(); setMode('link'); onClose(); };

  const handleImport = async () => {
    if (selected.size === 0 || busy) return;
    setBusy(true); setErr('');
    try {
      for (const id of selected) {
        await config.importItem(id, effectiveMode);
      }
      handleClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Import failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const verb = effectiveMode === 'link' ? 'Link' : 'Copy';

  return (
    <>
      <div className="wi-overlay" onClick={handleClose} />
      <div className="wi-drawer">
        <div className="wi-head">
          <div>
            <div className="wi-head-scope">⊕ Import from World</div>
            <div className="wi-head-title">{TYPE_LABEL[entityType] || 'Entities'}</div>
          </div>
          <button className="wi-close" onClick={handleClose}>✕</button>
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
              const isLinked = config.linkedIds.has(item.id);
              return (
                <button
                  key={item.kind + item.id}
                  className={`wi-item ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => toggleItem(item.id)}
                >
                  <span className="wi-check">{isSelected ? '✓' : ''}</span>
                  <span className="wi-item-glyph" style={{ color: 'var(--gold)' }}>{KIND_GLYPH[item.kind] || '·'}</span>
                  <div className="wi-item-body">
                    <div className="wi-item-name">{item.displayName}{isLinked && <span className="wi-item-linked"> · linked</span>}</div>
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

        {err && <div className="wi-error">{err}</div>}

        <div className="wi-foot">
          <div className="wi-foot-count">{selected.size} selected</div>
          {config.canLink && (
            <div className="wi-foot-actions" role="radiogroup" aria-label="Import mode">
              <button
                className={`wi-foot-mode ${mode === 'link' ? 'is-active' : ''}`}
                role="radio"
                aria-checked={mode === 'link'}
                onClick={() => setMode('link')}
                title="Reference the canon entity — edits to it show here too"
              >
                <span className="wi-foot-mode-dot wi-mode-link" />
                Link
              </button>
              <button
                className={`wi-foot-mode ${mode === 'copy' ? 'is-active' : ''}`}
                role="radio"
                aria-checked={mode === 'copy'}
                onClick={() => setMode('copy')}
                title="Duplicate into this campaign — an independent, editable copy"
              >
                <span className="wi-foot-mode-dot wi-mode-copy" />
                Copy
              </button>
            </div>
          )}
          <button
            className="wi-import-btn"
            disabled={selected.size === 0 || busy}
            onClick={handleImport}
          >
            {busy ? `${verb}ing…` : `${verb} ${selected.size > 0 ? `(${selected.size})` : ''}`}
          </button>
        </div>
      </div>
    </>
  );
}
