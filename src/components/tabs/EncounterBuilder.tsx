import { useState, useEffect } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Modal } from '../Modal';
import { InitiativeTracker } from '../InitiativeTracker';
import { useAutoSave } from '../../hooks/useAutoSave';
import { OverflowMenu } from '../ui/OverflowMenu';
import { AutosaveTextarea } from '../ui/MentionButton';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import type { Encounter, EncounterCombatant, MonsterStatblock } from '../../lib/database.types';

// ================================================================
// Constants
// ================================================================

const ENVIRONMENTS = ['dungeon', 'forest', 'urban', 'cave', 'open', 'underground', 'aquatic', 'aerial', 'other'];
const DIFFICULTIES = ['easy', 'medium', 'hard', 'deadly'] as const;
const STATUSES = ['draft', 'ready', 'completed'] as const;

const VALID_CRS = [
  '0', '1/8', '1/4', '1/2',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
];

// ================================================================
// Styles
// ================================================================

const difficultyColors: Record<string, { bg: string; text: string; border: string }> = {
  easy:   { bg: '#1a2a1a', text: '#6ab87a', border: '#2a5a2a' },
  medium: { bg: '#2a2a1a', text: '#d0c060', border: '#6a6020' },
  hard:   { bg: '#3a2010', text: '#e09050', border: '#7a4a20' },
  deadly: { bg: '#3a1010', text: '#e04040', border: '#7a2020' },
};

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  draft:     { bg: '#211c16', text: '#897f68', border: '#2e2820' },
  ready:     { bg: '#1a2a3a', text: '#70a0e0', border: '#2a4a7a' },
  completed: { bg: '#1a2a1a', text: '#6ab87a', border: '#2a5a2a' },
};

const sectionLabel: React.CSSProperties = {
  color: '#c9a84c',
  fontSize: '0.65rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  marginBottom: '0.5rem',
};

// ================================================================
// Types
// ================================================================

type EncounterForm = {
  name: string;
  description: string;
  environment: string;
  difficulty: string;
  party_size: string;
  party_level: string;
  dm_notes: string;
  status: 'draft' | 'ready' | 'completed';
};

function formFromEncounter(enc: Encounter): EncounterForm {
  return {
    name: enc.name,
    description: enc.description ?? '',
    environment: enc.environment ?? '',
    difficulty: enc.difficulty ?? '',
    party_size: enc.party_size != null ? String(enc.party_size) : '',
    party_level: enc.party_level != null ? String(enc.party_level) : '',
    dm_notes: enc.dm_notes ?? '',
    status: enc.status,
  };
}

// ================================================================
// Helper: parse combatants JSON from DB
// ================================================================
function parseCombatants(raw: string | null): EncounterCombatant[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as EncounterCombatant[]; }
  catch { return []; }
}

// ================================================================
// Combatant row sub-component
// ================================================================
function CombatantRow({
  c,
  statblockName,
  onCountChange,
  onNotesChange,
  onRemove,
  onViewSheet,
}: {
  c: EncounterCombatant;
  statblockName: string | null;
  onCountChange: (delta: number) => void;
  onNotesChange: (notes: string) => void;
  onRemove: () => void;
  onViewSheet?: () => void;
}) {
  return (
    <div
      className="rounded p-3 flex flex-col gap-2"
      style={{ backgroundColor: '#15120e', border: '1px solid #2e2820' }}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm" style={{ color: '#e8dcc4', fontFamily: 'var(--display)' }}>
            {c.name}
          </span>
          {c.challenge_rating && (
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#2a1a1a', color: '#c08060' }}>
              CR {c.challenge_rating}
            </span>
          )}
          {c.creature_type && (
            <span className="ml-1 text-xs capitalize" style={{ color: '#897f68' }}>{c.creature_type}</span>
          )}
          {c.source === 'saved' && statblockName && onViewSheet && (
            <button
              onClick={onViewSheet}
              className="ml-1 text-xs px-1.5 py-0.5 rounded"
              style={{ backgroundColor: '#1a1a3a', color: '#6090e0', border: '1px solid #3a3a7a' }}
            >
              Sheet
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onCountChange(-1)}
            className="w-6 h-6 rounded text-sm font-bold flex items-center justify-center"
            style={{ backgroundColor: '#1e1a14', color: '#b9ac90', border: '1px solid #2e2820' }}
          >−</button>
          <span className="text-sm font-semibold w-5 text-center" style={{ color: '#e8dcc4' }}>{c.count}</span>
          <button
            onClick={() => onCountChange(1)}
            className="w-6 h-6 rounded text-sm font-bold flex items-center justify-center"
            style={{ backgroundColor: '#1e1a14', color: '#b9ac90', border: '1px solid #2e2820' }}
          >+</button>
        </div>
        <button
          onClick={onRemove}
          className="text-xs px-2 py-1 rounded shrink-0"
          style={{ backgroundColor: '#1e1a14', color: '#e05c5c', border: '1px solid #2e2820' }}
        >✕</button>
      </div>
      <input
        type="text"
        value={c.notes ?? ''}
        onChange={e => onNotesChange(e.target.value)}
        placeholder="Notes for this combatant…"
        className="text-xs w-full px-2 py-1 rounded outline-none"
        style={{ backgroundColor: '#1c1814', color: '#b9ac90', border: '1px solid #26211a' }}
      />
    </div>
  );
}

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
          borderRight: '1px solid #2e2820',
          height: '100%',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 16px 10px' }}>
          <div style={{ color: '#897f68', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '2px' }}>
            {encounters.length} {encounters.length === 1 ? 'entry' : 'entries'}
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: '#e8dcc4', fontSize: '1.05rem', fontWeight: 700, fontFamily: 'var(--serif)' }}>
              Encounters
            </span>
            <button
              onClick={handleAdd}
              style={{
                color: '#c9a84c',
                fontSize: '0.75rem',
                fontWeight: 600,
                backgroundColor: 'transparent',
                border: '1px solid #3e3428',
                borderRadius: '4px',
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
              backgroundColor: '#1e1a14',
              border: '1px solid #2e2820',
              borderRadius: '4px',
              padding: '5px 10px',
              fontSize: '0.78rem',
              color: '#e8dcc4',
              outline: 'none',
            }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '24px 16px', color: '#897f68', fontSize: '0.78rem', textAlign: 'center' }}>
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
                  backgroundColor: isActive ? '#1e1a14' : 'transparent',
                  borderLeft: isActive ? '2px solid #c9a84c' : '2px solid transparent',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '6px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: isActive ? '#e8dcc4' : '#c9b88a', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'var(--display)', marginBottom: '4px', lineHeight: 1.3 }}>
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
                        borderRadius: '3px',
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
                      borderRadius: '3px',
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
          <div style={{ color: '#897f68', fontSize: '0.85rem', marginTop: '60px', textAlign: 'center' }}>
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
            upsertEncounter={upsertEncounter}
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
                  style={{ backgroundColor: '#3a1a1a', color: '#e07070', borderColor: '#7a2a2a' }}>
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
                <span className="text-xs" style={{ color: '#897f68' }}>{viewingStatblock.tags}</span>
              )}
            </div>
            {viewingStatblock.content && (
              <pre className="text-sm whitespace-pre-wrap rounded p-3"
                style={{ color: '#e8dcc4', lineHeight: '1.7', fontFamily: 'monospace', fontSize: '0.8rem', backgroundColor: '#15120e', border: '1px solid #2e2820' }}>
                {viewingStatblock.content}
              </pre>
            )}
            {viewingStatblock.dm_notes && (
              <div>
                <div style={sectionLabel}>DM Notes</div>
                <p className="text-sm" style={{ color: '#b9ac90', lineHeight: '1.6', fontStyle: 'italic' }}>
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
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: '#15120e' }}>
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

// ================================================================
// EncounterDetail — inline autosave editing panel
// ================================================================

function EncounterDetail({
  enc,
  monsterStatblocks,
  onDelete,
  onRun,
  onViewStatblock,
  upsertEncounter,
}: {
  enc: Encounter;
  monsterStatblocks: MonsterStatblock[];
  onDelete: () => void;
  onRun: () => void;
  onViewStatblock: (sb: MonsterStatblock) => void;
  upsertEncounter: (e: Omit<Encounter, 'campaign_id'> & { id?: string }) => Promise<Encounter>;
}) {
  const [form, setForm] = useState<EncounterForm>(() => formFromEncounter(enc));
  const [combatants, setCombatants] = useState<EncounterCombatant[]>(() => parseCombatants(enc.combatants));

  // Add-creature panel state
  const [addCreatureMode, setAddCreatureMode] = useState<'saved' | 'custom' | null>(null);
  const [customCreatureName, setCustomCreatureName] = useState('');
  const [customCreatureType, setCustomCreatureType] = useState('');
  const [customCreatureCR, setCustomCreatureCR] = useState('');

  // Reset form when encounter changes (new selection)
  useEffect(() => {
    setForm(formFromEncounter(enc));
    setCombatants(parseCombatants(enc.combatants));
    setAddCreatureMode(null);
  }, [enc.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave
  const { status: saveStatus, saveNow } = useAutoSave({
    data: { form, combatants },
    delay: 800,
    enabled: true,
    onSave: async ({ form: f, combatants: c }) => {
      await upsertEncounter({
        id: enc.id,
        name: f.name.trim() || 'Untitled',
        description: f.description || null,
        environment: f.environment || null,
        difficulty: f.difficulty || null,
        party_size: f.party_size ? parseInt(f.party_size, 10) : null,
        party_level: f.party_level ? parseInt(f.party_level, 10) : null,
        dm_notes: f.dm_notes || null,
        status: f.status,
        combatants: c.length > 0 ? JSON.stringify(c) : null,
        sort_order: enc.sort_order,
      });
    },
  });

  // ---- combatant management ----

  const addSavedCombatant = (statblockId: string) => {
    const sb = monsterStatblocks.find(m => m.id === statblockId);
    if (!sb) return;
    const existing = combatants.findIndex(c => c.statblock_id === statblockId);
    if (existing >= 0) {
      setCombatants(prev => prev.map((c, i) => i === existing ? { ...c, count: c.count + 1 } : c));
    } else {
      setCombatants(prev => [...prev, {
        id: crypto.randomUUID(),
        source: 'saved',
        statblock_id: statblockId,
        name: sb.name,
        creature_type: sb.creature_type,
        challenge_rating: sb.challenge_rating,
        count: 1,
        notes: null,
      }]);
    }
    setAddCreatureMode(null);
  };

  const addCustomCombatant = () => {
    if (!customCreatureName.trim()) return;
    setCombatants(prev => [...prev, {
      id: crypto.randomUUID(),
      source: 'custom',
      statblock_id: null,
      name: customCreatureName.trim(),
      creature_type: customCreatureType || null,
      challenge_rating: VALID_CRS.includes(customCreatureCR) ? customCreatureCR : null,
      count: 1,
      notes: null,
    }]);
    setCustomCreatureName('');
    setCustomCreatureType('');
    setCustomCreatureCR('');
    setAddCreatureMode(null);
  };

  const updateCombatantCount = (id: string, delta: number) => {
    setCombatants(prev =>
      prev.map(c => c.id === id ? { ...c, count: Math.max(1, c.count + delta) } : c)
    );
  };

  const updateCombatantNotes = (id: string, notes: string) => {
    setCombatants(prev => prev.map(c => c.id === id ? { ...c, notes: notes || null } : c));
  };

  const removeCombatant = (id: string) => {
    setCombatants(prev => prev.filter(c => c.id !== id));
  };

  const combatantList = combatants;
  const totalCreatures = combatantList.reduce((sum, c) => sum + c.count, 0);
  const canRun = enc.status !== 'completed' && combatantList.length > 0;

  const diffVal = form.difficulty || enc.difficulty;

  return (
    <div style={{ maxWidth: '700px' }}>

      {/* ── Action bar ── */}
      <div className="as-bar" style={{ marginBottom: '20px' }}>
        <SaveStatusIndicator status={saveStatus} onRetry={saveNow} />
        <div className="as-spacer" />
        {canRun && (
          <button
            onClick={onRun}
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#15120e',
              backgroundColor: '#c9a84c',
              border: '1px solid #c9a84c',
              borderRadius: '3px',
              padding: '6px 16px',
              cursor: 'pointer',
              fontFamily: 'var(--serif)',
            }}
          >
            ▶ Run Encounter
          </button>
        )}
        <OverflowMenu items={[
          { label: 'Delete encounter', danger: true, onClick: onDelete },
        ]} />
      </div>

      {/* ── Eyebrow ── */}
      <div style={{
        color: '#897f68',
        fontSize: '0.6rem',
        fontWeight: 700,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        marginBottom: '6px',
      }}>
        Encounter{diffVal ? ` · ${diffVal}` : ''}
      </div>

      {/* ── Title ── */}
      <input
        className="as-title"
        value={form.name}
        onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
        placeholder="Encounter name…"
        style={{ marginBottom: '20px', display: 'block', width: '100%' }}
      />

      {/* ── Meta strip ── */}
      <div className="as-meta" style={{ marginBottom: '24px' }}>
        {/* Status */}
        <div className="as-mi">
          <div className="as-ml">Status</div>
          <select
            className="as-select"
            value={form.status}
            onChange={e => setForm(prev => ({ ...prev, status: e.target.value as EncounterForm['status'] }))}
          >
            {STATUSES.map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* Environment */}
        <div className="as-mi">
          <div className="as-ml">Environment</div>
          <input
            className="as-input"
            list="env-list"
            value={form.environment}
            onChange={e => setForm(prev => ({ ...prev, environment: e.target.value }))}
            placeholder="—"
          />
          <datalist id="env-list">
            {ENVIRONMENTS.map(env => <option key={env} value={env} />)}
          </datalist>
        </div>

        {/* Party size */}
        <div className="as-mi">
          <div className="as-ml">Party Size</div>
          <input
            className="as-input"
            type="number"
            min={1}
            max={10}
            value={form.party_size}
            onChange={e => setForm(prev => ({ ...prev, party_size: e.target.value }))}
            placeholder="—"
            style={{ width: '56px' }}
          />
        </div>

        {/* Party level */}
        <div className="as-mi">
          <div className="as-ml">Avg Level</div>
          <input
            className="as-input"
            type="number"
            min={1}
            max={20}
            value={form.party_level}
            onChange={e => setForm(prev => ({ ...prev, party_level: e.target.value }))}
            placeholder="—"
            style={{ width: '56px' }}
          />
        </div>
      </div>

      {/* ── Difficulty pills ── */}
      <div className="as-fl" style={{ marginBottom: '24px' }}>
        <div className="as-ll">Difficulty</div>
        <div className="as-pills">
          {DIFFICULTIES.map(d => (
            <button
              key={d}
              className={`as-pill-opt${form.difficulty === d ? ' is-active' : ''}`}
              onClick={() => setForm(prev => ({ ...prev, difficulty: prev.difficulty === d ? '' : d }))}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Description ── */}
      <div className="as-fl" style={{ marginBottom: '24px' }}>
        <div className="as-ll">Description</div>
        <AutosaveTextarea
          value={form.description}
          onChange={v => setForm(prev => ({ ...prev, description: v }))}
          placeholder="Scene-setting description for the encounter…"
          rows={3}
        />
      </div>

      {/* ── Combatants ── */}
      <div style={{ marginBottom: '24px' }}>
        <div style={sectionLabel}>Combatants</div>
        <div className="space-y-2 mb-3">
          {combatantList.length === 0 && (
            <p className="text-xs" style={{ color: '#897f68' }}>No combatants added yet.</p>
          )}
          {combatantList.map(c => {
            const sb = c.statblock_id ? monsterStatblocks.find(m => m.id === c.statblock_id) : null;
            return (
              <CombatantRow
                key={c.id}
                c={c}
                statblockName={sb?.name ?? null}
                onCountChange={delta => updateCombatantCount(c.id, delta)}
                onNotesChange={notes => updateCombatantNotes(c.id, notes)}
                onRemove={() => removeCombatant(c.id)}
                onViewSheet={sb ? () => onViewStatblock(sb) : undefined}
              />
            );
          })}
        </div>

        {addCreatureMode === null && (
          <div className="flex gap-2">
            {monsterStatblocks.length > 0 && (
              <button onClick={() => setAddCreatureMode('saved')} className="text-xs px-3 py-1.5 rounded"
                style={{ backgroundColor: '#1a2a3a', color: '#70a0e0', border: '1px solid #2a4a7a' }}>
                + From Library
              </button>
            )}
            <button onClick={() => setAddCreatureMode('custom')} className="text-xs px-3 py-1.5 rounded"
              style={{ backgroundColor: '#1e1a14', color: '#b9ac90', border: '1px solid #2e2820' }}>
              + Custom Creature
            </button>
          </div>
        )}

        {addCreatureMode === 'saved' && (
          <div className="rounded p-3 space-y-2" style={{ backgroundColor: '#15120e', border: '1px solid #2e2820' }}>
            <p className="text-xs font-semibold" style={{ color: '#c9a84c' }}>Select from Library</p>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {monsterStatblocks.map(m => (
                <button key={m.id} onClick={() => addSavedCombatant(m.id)}
                  className="w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-2"
                  style={{ backgroundColor: '#1c1814', color: '#e8dcc4', border: '1px solid #26211a' }}>
                  <span className="flex-1">{m.name}</span>
                  {m.challenge_rating && <span style={{ color: '#c08060' }}>CR {m.challenge_rating}</span>}
                  {m.creature_type && <span className="capitalize" style={{ color: '#897f68' }}>{m.creature_type}</span>}
                </button>
              ))}
            </div>
            <button onClick={() => setAddCreatureMode(null)} className="text-xs px-2 py-1 rounded"
              style={{ color: '#897f68', border: '1px solid #2e2820' }}>
              Cancel
            </button>
          </div>
        )}

        {addCreatureMode === 'custom' && (
          <div className="rounded p-3 space-y-2" style={{ backgroundColor: '#15120e', border: '1px solid #2e2820' }}>
            <p className="text-xs font-semibold" style={{ color: '#c9a84c' }}>Add Custom Creature</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-3">
                <input type="text" value={customCreatureName} onChange={e => setCustomCreatureName(e.target.value)}
                  placeholder="Creature name *"
                  className="as-input w-full"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomCombatant(); }}} />
              </div>
              <input type="text" value={customCreatureType} onChange={e => setCustomCreatureType(e.target.value)}
                placeholder="Type (optional)" className="as-input" />
              <input type="text" value={customCreatureCR} onChange={e => setCustomCreatureCR(e.target.value)}
                placeholder="CR (optional)" className="as-input" />
            </div>
            <div className="flex gap-2">
              <button onClick={addCustomCombatant} className="text-xs px-3 py-1 rounded"
                style={{ backgroundColor: '#a07830', color: '#e8dcc4' }}>Add</button>
              <button onClick={() => setAddCreatureMode(null)} className="text-xs px-2 py-1 rounded"
                style={{ color: '#897f68', border: '1px solid #2e2820' }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Creature count summary */}
        {totalCreatures > 0 && (
          <div style={{ marginTop: '8px', color: '#897f68', fontSize: '0.72rem', fontFamily: 'var(--mono)' }}>
            {totalCreatures} {totalCreatures === 1 ? 'creature' : 'creatures'} total
          </div>
        )}
      </div>

      {/* ── DM Notes ── */}
      <div className="as-fl" style={{ marginBottom: '24px' }}>
        <div className="as-ll">DM Notes</div>
        <AutosaveTextarea
          value={form.dm_notes}
          onChange={v => setForm(prev => ({ ...prev, dm_notes: v }))}
          placeholder="Tactics, pacing tips, dramatic moments…"
          rows={4}
        />
      </div>

      {/* ── Run CTA (if ready) ── */}
      {canRun && (
        <button
          onClick={onRun}
          style={{
            width: '100%',
            backgroundColor: '#c9a84c',
            color: '#15120e',
            border: 'none',
            borderRadius: '4px',
            padding: '12px',
            fontSize: '0.85rem',
            fontWeight: 700,
            fontFamily: 'var(--serif)',
            cursor: 'pointer',
            letterSpacing: '0.02em',
          }}
        >
          ▶ Run Encounter · {totalCreatures} {totalCreatures === 1 ? 'creature' : 'creatures'}
        </button>
      )}
    </div>
  );
}

