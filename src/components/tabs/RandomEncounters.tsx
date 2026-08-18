import { useState, useCallback, useEffect, useRef } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Modal } from '../Modal';
import { InitiativeTracker } from '../InitiativeTracker';
import {
  RandomEncounterDetail,
  type RandomEncounterSaveData,
} from '../ui/RandomEncounterDetail';
import { GenerateRandomTableModal } from '../ui/GenerateRandomTableModal';
import { sectionLabel, type EncounterSaveData } from '../ui/EncounterDetail';
import {
  RANDOM_TABLE_KINDS,
  kindMeta,
  parseEntries,
  defaultRandomEntry,
} from '../../lib/randomEncounter';
import type { RandomEncounterTable, MonsterStatblock, Encounter } from '../../lib/database.types';

// Campaign-level random tables — master/detail. Tables come in five kinds
// (Encounter / Treasure / Magic Item / Wild Magic / Custom); each is a weighted
// die (d4–d100). Tables can be authored here or imported from the world.
export default function RandomEncounters({ onImportFromWorld }: { onImportFromWorld?: () => void }) {
  const {
    randomEncounterTables, upsertRandomEncounterTable, deleteRandomEncounterTable,
    monsterStatblocks, pcs, upsertEncounter,
  } = useCampaign();
  const confirm = useConfirm();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [viewingStatblock, setViewingStatblock] = useState<MonsterStatblock | null>(null);
  const [runningEncounter, setRunningEncounter] = useState<Encounter | null>(null);
  const [genTableOpen, setGenTableOpen] = useState(false);

  const activePCs = pcs.filter(p => p.is_active);
  const activePCNames = activePCs.map(p => p.character_name);
  // Party size + average level auto-fill from active PCs (the DM can still
  // override both in the roll bar). PCs without a level set are ignored.
  const leveledPCs = activePCs.filter(p => typeof p.level === 'number' && p.level > 0);
  const party = {
    size: activePCs.length || 4,
    level: leveledPCs.length
      ? Math.max(1, Math.round(leveledPCs.reduce((s, p) => s + (p.level as number), 0) / leveledPCs.length))
      : 5,
  };

  const campaignUpsert = useCallback(
    (data: RandomEncounterSaveData): Promise<RandomEncounterTable> =>
      upsertRandomEncounterTable({ ...data, world_id: null }),
    [upsertRandomEncounterTable],
  );

  const saveEncounter = useCallback(
    (data: EncounterSaveData): Promise<Encounter> => upsertEncounter({ ...data, world_id: null }),
    [upsertEncounter],
  );
  const runEncounter = useCallback(async (data: EncounterSaveData) => {
    const enc = await saveEncounter(data);
    setRunningEncounter(enc);
  }, [saveEncounter]);

  const handleAdd = async (kind: string) => {
    const t = await upsertRandomEncounterTable({
      kind,
      name: '',
      subtitle: null,
      environment: null,
      die_size: 100,
      description: null,
      entries: JSON.stringify([defaultRandomEntry()]),
      dm_notes: null,
      sort_order: randomEncounterTables.length,
      world_id: null,
    });
    setSelectedId(t.id);
  };

  const handleDelete = async (t: RandomEncounterTable) => {
    const label = t.name.trim() || 'this table';
    if (await confirm(`Delete "${label}"?`)) {
      await deleteRandomEncounterTable(t.id);
      if (selectedId === t.id) setSelectedId(null);
    }
  };

  const filtered = randomEncounterTables.filter(t => {
    if (kindFilter !== 'all' && (t.kind || 'encounter') !== kindFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return t.name.toLowerCase().includes(s)
      || (t.subtitle ?? '').toLowerCase().includes(s)
      || (t.environment ?? '').toLowerCase().includes(s);
  });

  const selected = selectedId ? (randomEncounterTables.find(t => t.id === selectedId) ?? null) : null;

  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* LEFT — list */}
      <div
        className="flex flex-col shrink-0"
        style={{ width: '300px', borderRight: '1px solid var(--rule)', height: '100%', minHeight: 0, overflow: 'hidden' }}
      >
        <div style={{ padding: '20px 16px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
            <div>
              <div style={{ color: 'var(--ink-3)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '2px' }}>
                {randomEncounterTables.length} {randomEncounterTables.length === 1 ? 'table' : 'tables'}
              </div>
              <div style={{ color: 'var(--ink)', fontSize: '1.05rem', fontWeight: 700, fontFamily: 'var(--serif)' }}>
                Tables
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <button
                onClick={() => setGenTableOpen(true)}
                title="Generate a full table with AI"
                aria-label="Generate a full table with AI"
                style={{
                  color: 'var(--arcane)', fontSize: '0.72rem', fontWeight: 600,
                  backgroundColor: 'var(--arcane-bg)', border: '1px solid var(--arcane-line)',
                  borderRadius: 'var(--radius)', padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                ✦
              </button>
              <NewTableMenu onAdd={handleAdd} />
            </div>
          </div>
          {onImportFromWorld && (
            <button
              onClick={onImportFromWorld}
              title="Import a table from the world"
              style={{
                marginTop: '8px', width: '100%', color: 'var(--ink-2)', fontSize: '0.75rem', fontWeight: 600,
                backgroundColor: 'transparent', border: '1px solid var(--rule-hover)',
                borderRadius: 'var(--radius)', padding: '4px 8px', cursor: 'pointer',
              }}
            >
              ⊕ Import from World
            </button>
          )}
        </div>

        <div style={{ padding: '0 12px 8px' }}>
          <input
            type="text"
            placeholder="Search tables…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', backgroundColor: 'var(--bg-2)', border: '1px solid var(--rule)',
              borderRadius: 'var(--radius)', padding: '5px 10px', fontSize: '0.78rem', color: 'var(--ink)', outline: 'none',
            }}
          />
        </div>

        {/* Kind filter pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '0 12px 10px' }}>
          {[{ key: 'all', label: 'All' }, ...RANDOM_TABLE_KINDS].map(k => {
            const active = kindFilter === k.key;
            return (
              <button
                key={k.key}
                onClick={() => setKindFilter(k.key)}
                style={{
                  fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', cursor: 'pointer',
                  backgroundColor: active ? 'var(--gold)' : 'transparent',
                  color: active ? 'var(--bg)' : 'var(--ink-3)',
                  border: `1px solid ${active ? 'var(--gold)' : 'var(--rule)'}`,
                  whiteSpace: 'nowrap',
                }}
              >
                {k.label}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '24px 16px', color: 'var(--ink-3)', fontSize: '0.78rem', textAlign: 'center' }}>
              {randomEncounterTables.length === 0 ? 'No tables yet.' : 'No tables match.'}
            </div>
          )}
          {filtered.map(t => {
            const isActive = selected?.id === t.id;
            const m = kindMeta(t.kind);
            const rows = parseEntries(t.entries).length;
            return (
              <div
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                style={{
                  padding: '10px 12px', cursor: 'pointer', display: 'flex', gap: '8px', alignItems: 'flex-start',
                  backgroundColor: isActive ? 'var(--bg-2)' : 'transparent',
                  borderLeft: isActive ? '2px solid var(--gold)' : '2px solid transparent',
                }}
              >
                <span style={{ color: 'var(--gold)', fontSize: '0.9rem', lineHeight: 1.4 }}>{m.glyph}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: isActive ? 'var(--ink)' : 'var(--ink-2)', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'var(--display)', marginBottom: '3px', lineHeight: 1.3 }}>
                    {t.name || <em style={{ color: 'var(--ink-4)' }}>Untitled table</em>}
                  </div>
                  <div style={{ color: 'var(--ink-3)', fontSize: '0.66rem', marginBottom: '4px' }}>
                    {m.label} · {rows} {rows === 1 ? 'entry' : 'entries'}
                  </div>
                  <span style={{
                    fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                    backgroundColor: 'var(--gold-dim)', color: 'var(--gold)', border: '1px solid var(--gold-line)',
                    borderRadius: 'var(--radius)', padding: '1px 5px',
                  }}>Campaign</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT — detail */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '32px 36px' }}>
        {!selected ? (
          <div style={{ color: 'var(--ink-3)', fontSize: '0.85rem', marginTop: '60px', textAlign: 'center' }}>
            Select a table, or create one with <strong>+ New Table</strong>.
          </div>
        ) : (
          <RandomEncounterDetail
            key={selected.id}
            table={selected}
            scope="campaign"
            onDelete={() => handleDelete(selected)}
            upsertTable={campaignUpsert}
            statblocks={monsterStatblocks}
            party={party}
            onViewStatblock={setViewingStatblock}
            onSaveEncounter={saveEncounter}
            onRunEncounter={runEncounter}
          />
        )}
      </div>

      {/* Whole-table generator */}
      <GenerateRandomTableModal
        isOpen={genTableOpen}
        onClose={() => setGenTableOpen(false)}
        defaultKind={kindFilter !== 'all' ? kindFilter : 'encounter'}
        onCreated={t => { setGenTableOpen(false); setKindFilter('all'); setSelectedId(t.id); }}
      />

      {/* Stat-sheet viewer */}
      {viewingStatblock && (
        <Modal isOpen onClose={() => setViewingStatblock(null)} title={viewingStatblock.name} wide>
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {viewingStatblock.creature_type && (
                <span className="text-xs px-2 py-0.5 rounded border capitalize"
                  style={{ backgroundColor: 'var(--red-bg)', color: 'var(--red)', borderColor: 'var(--red-line)' }}>
                  {viewingStatblock.creature_type}
                </span>
              )}
              {viewingStatblock.challenge_rating && (
                <span className="text-xs px-2 py-0.5 rounded"
                  style={{ backgroundColor: 'var(--chip-bg)', color: 'var(--cr)', border: '1px solid var(--chip-line)' }}>
                  CR {viewingStatblock.challenge_rating}
                </span>
              )}
              {viewingStatblock.tags && <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{viewingStatblock.tags}</span>}
            </div>
            {viewingStatblock.content && (
              <pre className="text-sm whitespace-pre-wrap rounded p-3"
                style={{ color: 'var(--ink)', lineHeight: '1.7', fontFamily: 'monospace', fontSize: '0.8rem', backgroundColor: 'var(--bg)', border: '1px solid var(--rule)' }}>
                {viewingStatblock.content}
              </pre>
            )}
            {viewingStatblock.dm_notes && (
              <div>
                <div style={sectionLabel}>DM Notes</div>
                <p className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6', fontStyle: 'italic' }}>{viewingStatblock.dm_notes}</p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Initiative tracker */}
      {runningEncounter && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
          <InitiativeTracker
            encounter={runningEncounter}
            statblocks={monsterStatblocks}
            pcNames={activePCNames}
            onClose={() => setRunningEncounter(null)}
          />
        </div>
      )}
    </div>
  );
}

// "+ New Table ▾" — a dropdown offering the five table kinds.
function NewTableMenu({ onAdd }: { onAdd: (kind: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          color: 'var(--gold)', fontSize: '0.72rem', fontWeight: 600,
          backgroundColor: 'transparent', border: '1px solid var(--rule-hover)',
          borderRadius: 'var(--radius)', padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        + New Table ▾
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '112%', zIndex: 20, minWidth: '160px', overflow: 'hidden',
          background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)',
          boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
        }}>
          {RANDOM_TABLE_KINDS.map(k => (
            <button
              key={k.key}
              onClick={() => { setOpen(false); onAdd(k.key); }}
              style={{
                display: 'flex', gap: '10px', alignItems: 'center', width: '100%', padding: '8px 12px',
                background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink)',
                fontSize: '0.8rem', textAlign: 'left',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: 'var(--gold)' }}>{k.glyph}</span>{k.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
