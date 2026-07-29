import { useState, useCallback, useEffect } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Modal } from '../Modal';
import { InitiativeTracker } from '../InitiativeTracker';
import type { Encounter, MonsterStatblock } from '../../lib/database.types';
import {
  EncounterDetail,
  difficultyColors,
  statusColors,
  sectionLabel,
  type EncounterSaveData,
} from '../ui/EncounterDetail';

// ================================================================
// Main component
// ================================================================

export default function EncounterBuilder() {
  const { encounters, upsertEncounter, deleteEncounter, monsterStatblocks, pcs } = useCampaign();
  const confirm = useConfirm();

  // Selected encounter in master-detail
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Search
  const [search, setSearch] = useState('');

  // Initiative tracker
  const [runningEncounter, setRunningEncounter] = useState<Encounter | null>(null);

  // Creature sheet viewer
  const [viewingStatblock, setViewingStatblock] = useState<MonsterStatblock | null>(null);

  // Active PC names for initiative tracker
  const activePCNames = pcs.filter(p => p.is_active).map(p => p.character_name);

  // Adapter so the shared EncounterDetail can call the campaign upsert
  const campaignUpsert = useCallback(
    (data: EncounterSaveData): Promise<Encounter> =>
      upsertEncounter({ ...data, world_id: null }),
    [upsertEncounter],
  );

  // ---- helpers ----

  const handleAdd = async () => {
    const e = await upsertEncounter({
      name: '',
      difficulty: 'medium',
      status: 'draft',
      sort_order: encounters.length,
      description: null,
      environment: null,
      party_size: null,
      party_level: null,
      combatants: null,
      dm_notes: null,
      world_id: null,
    });
    setSelectedId(e.id);
  };

  const handleDelete = async (enc: Encounter) => {
    const label = enc.name.trim() || 'this encounter';
    if (await confirm(`Delete "${label}"?`)) {
      await deleteEncounter(enc.id);
      if (selectedId === enc.id) setSelectedId(null);
    }
  };

  // ---- filtering ----

  const filtered = encounters.filter(enc => {
    if (!search) return true;
    const s = search.toLowerCase();
    return enc.name.toLowerCase().includes(s)
      || (enc.environment ?? '').toLowerCase().includes(s)
      || (enc.difficulty ?? '').toLowerCase().includes(s);
  });

  // Keep selected in sync if data changes
  const selectedEnc = selectedId ? (encounters.find(e => e.id === selectedId) ?? null) : null;

  // Auto-select first encounter if none selected and list is non-empty
  useEffect(() => {
    if (!selectedId && filtered.length > 0) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  // ================================================================
  // Render
  // ================================================================

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>

      {/* ============================================================
          LEFT SIDEBAR — list
      ============================================================ */}
      <div
        className="flex flex-col shrink-0"
        style={{
          width: '220px',
          borderRight: '1px solid var(--rule)',
          height: '100%',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 16px 10px' }}>
          <div style={{ color: 'var(--ink-3)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '2px' }}>
            {encounters.length} {encounters.length === 1 ? 'entry' : 'entries'}
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--ink)', fontSize: '1.05rem', fontWeight: 700, fontFamily: 'var(--serif)' }}>
              Encounters
            </span>
            <button
              onClick={handleAdd}
              style={{
                color: 'var(--gold)',
                fontSize: '0.75rem',
                fontWeight: 600,
                backgroundColor: 'transparent',
                border: '1px solid var(--rule-hover)',
                borderRadius: 'var(--radius)',
                padding: '2px 8px',
                cursor: 'pointer',
              }}
            >
              + New
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '0 12px 10px' }}>
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: 'var(--bg-2)',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius)',
              padding: '5px 10px',
              fontSize: '0.78rem',
              color: 'var(--ink)',
              outline: 'none',
            }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '24px 16px', color: 'var(--ink-3)', fontSize: '0.78rem', textAlign: 'center' }}>
              {encounters.length === 0 ? 'No encounters yet.' : 'No matches.'}
            </div>
          )}
          {filtered.map(enc => {
            const isActive = selectedEnc?.id === enc.id;
            const dc = enc.difficulty ? difficultyColors[enc.difficulty] : null;
            const sc = statusColors[enc.status] ?? statusColors.draft;
            return (
              <div
                key={enc.id}
                onClick={() => setSelectedId(enc.id)}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  backgroundColor: isActive ? 'var(--bg-2)' : 'transparent',
                  borderLeft: isActive ? '2px solid var(--gold)' : '2px solid transparent',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '6px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: isActive ? 'var(--ink)' : 'var(--ink-2)', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'var(--display)', marginBottom: '4px', lineHeight: 1.3 }}>
                    {enc.name || <em style={{ color: '#5a5040' }}>Unnamed</em>}
                  </div>
                  {/* Difficulty badge + status pill */}
                  <div className="flex flex-wrap items-center gap-1">
                    {dc && (
                      <span style={{
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        backgroundColor: dc.bg,
                        color: dc.text,
                        border: `1px solid ${dc.border}`,
                        borderRadius: 'var(--radius)',
                        padding: '1px 5px',
                      }}>
                        {enc.difficulty}
                      </span>
                    )}
                    <span style={{
                      fontSize: '0.6rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      backgroundColor: sc.bg,
                      color: sc.text,
                      border: `1px solid ${sc.border}`,
                      borderRadius: 'var(--radius)',
                      padding: '1px 5px',
                    }}>
                      {enc.status}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ============================================================
          RIGHT DETAIL PANEL
      ============================================================ */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 36px' }}>
        {!selectedEnc ? (
          <div style={{ color: 'var(--ink-3)', fontSize: '0.85rem', marginTop: '60px', textAlign: 'center' }}>
            Select an encounter to view details, or create a new one.
          </div>
        ) : (
          <EncounterDetail
            key={selectedEnc.id}
            enc={selectedEnc}
            monsterStatblocks={monsterStatblocks}
            onDelete={() => handleDelete(selectedEnc)}
            onRun={() => setRunningEncounter(selectedEnc)}
            onViewStatblock={setViewingStatblock}
            upsertEncounter={campaignUpsert}
          />
        )}
      </div>

      {/* ================================================================
          CREATURE SHEET VIEWER
      ================================================================ */}
      {viewingStatblock && (
        <Modal isOpen={!!viewingStatblock} onClose={() => setViewingStatblock(null)} title={viewingStatblock.name} wide>
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {viewingStatblock.creature_type && (
                <span className="text-xs px-2 py-0.5 rounded border capitalize"
                  style={{ backgroundColor: 'var(--red-bg)', color: '#e07070', borderColor: '#7a2a2a' }}>
                  {viewingStatblock.creature_type}
                </span>
              )}
              {viewingStatblock.challenge_rating && (
                <span className="text-xs px-2 py-0.5 rounded"
                  style={{ backgroundColor: '#2a1a1a', color: '#c08060', border: '1px solid #5a3a2a' }}>
                  CR {viewingStatblock.challenge_rating}
                </span>
              )}
              {viewingStatblock.tags && (
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{viewingStatblock.tags}</span>
              )}
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
                <p className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6', fontStyle: 'italic' }}>
                  {viewingStatblock.dm_notes}
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ================================================================
          INITIATIVE TRACKER
      ================================================================ */}
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
