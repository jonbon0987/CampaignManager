import { useState } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import type { Encounter, EncounterCombatant, MonsterStatblock } from '../../lib/database.types';

// ================================================================
// Constants
// ================================================================

const ENVIRONMENTS = ['dungeon', 'forest', 'urban', 'cave', 'open', 'underground', 'aquatic', 'aerial', 'other'];
const DIFFICULTIES = ['easy', 'medium', 'hard', 'deadly'];
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
  draft:     { bg: '#1a1828', text: '#6a6490', border: '#3a3660' },
  ready:     { bg: '#1a2a3a', text: '#70a0e0', border: '#2a4a7a' },
  completed: { bg: '#1a2a1a', text: '#6ab87a', border: '#2a5a2a' },
};

const sectionLabel = {
  color: '#c9a84c',
  fontSize: '0.7rem',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  marginBottom: '0.4rem',
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

const emptyForm = (): EncounterForm => ({
  name: '',
  description: '',
  environment: '',
  difficulty: '',
  party_size: '',
  party_level: '',
  dm_notes: '',
  status: 'draft',
});

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
      style={{ backgroundColor: '#0f0e17', border: '1px solid #3a3660' }}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm" style={{ color: '#e8d5b0', fontFamily: 'Georgia, serif' }}>
            {c.name}
          </span>
          {c.challenge_rating && (
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#2a1a1a', color: '#c08060' }}>
              CR {c.challenge_rating}
            </span>
          )}
          {c.creature_type && (
            <span className="ml-1 text-xs capitalize" style={{ color: '#6a6490' }}>{c.creature_type}</span>
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
        {/* Count controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onCountChange(-1)}
            className="w-6 h-6 rounded text-sm font-bold flex items-center justify-center"
            style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
          >−</button>
          <span className="text-sm font-semibold w-5 text-center" style={{ color: '#e8d5b0' }}>{c.count}</span>
          <button
            onClick={() => onCountChange(1)}
            className="w-6 h-6 rounded text-sm font-bold flex items-center justify-center"
            style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
          >+</button>
        </div>
        <button
          onClick={onRemove}
          className="text-xs px-2 py-1 rounded shrink-0"
          style={{ backgroundColor: '#22203a', color: '#e05c5c', border: '1px solid #3a3660' }}
        >✕</button>
      </div>
      <input
        type="text"
        value={c.notes ?? ''}
        onChange={e => onNotesChange(e.target.value)}
        placeholder="Notes for this combatant…"
        className="text-xs w-full px-2 py-1 rounded outline-none"
        style={{ backgroundColor: '#1a1830', color: '#9990b0', border: '1px solid #2a2850' }}
      />
    </div>
  );
}

// ================================================================
// Main component
// ================================================================

export default function EncounterBuilder() {
  const { encounters, upsertEncounter, deleteEncounter, monsterStatblocks, upsertMonsterStatblock, pcs } = useCampaign();

  // List state
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');

  // View / edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Encounter | null>(null);
  const [form, setForm] = useState<EncounterForm>(emptyForm());
  const [combatants, setCombatants] = useState<EncounterCombatant[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // View detail panel
  const [viewing, setViewing] = useState<Encounter | null>(null);

  // AI generate modal
  const [genModalOpen, setGenModalOpen] = useState(false);
  const [genMode, setGenMode] = useState<'manual' | 'ai'>('ai');
  const [genPartySize, setGenPartySize] = useState('');
  const [genPartyLevel, setGenPartyLevel] = useState('');
  const [genTheme, setGenTheme] = useState('');
  const [genDifficulty, setGenDifficulty] = useState('hard');
  const [genEnvironment, setGenEnvironment] = useState('');
  const [genError, setGenError] = useState('');
  const [genLoading, setGenLoading] = useState(false);

  // Creature sheet viewer
  const [viewingStatblock, setViewingStatblock] = useState<MonsterStatblock | null>(null);

  // Add-creature panel (within edit modal)
  const [addCreatureMode, setAddCreatureMode] = useState<'saved' | 'custom' | null>(null);
  const [customCreatureName, setCustomCreatureName] = useState('');
  const [customCreatureType, setCustomCreatureType] = useState('');
  const [customCreatureCR, setCustomCreatureCR] = useState('');

  // ---- helpers ----

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setCombatants([]);
    setAddCreatureMode(null);
    setModalOpen(true);
  };

  const openEdit = (enc: Encounter) => {
    setEditing(enc);
    setForm({
      name: enc.name,
      description: enc.description ?? '',
      environment: enc.environment ?? '',
      difficulty: enc.difficulty ?? '',
      party_size: enc.party_size != null ? String(enc.party_size) : '',
      party_level: enc.party_level != null ? String(enc.party_level) : '',
      dm_notes: enc.dm_notes ?? '',
      status: enc.status,
    });
    setCombatants(parseCombatants(enc.combatants));
    setAddCreatureMode(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;

    const newCustomCombatants = combatants.filter(c => c.source === 'custom' && !c.statblock_id);
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;

    setSaving(true);
    try {

    // For any custom combatant without a statblock, generate a full stat block via AI then save it.
    const idMap = new Map<string, string>();
    for (let i = 0; i < combatants.length; i++) {
      const c = combatants[i];
      if (c.source !== 'custom' || c.statblock_id) continue;

      let content: string | null = null;
      let dm_notes: string | null = null;
      let tags: string | null = null;

      if (apiKey) {
        try {
          setSaveStatus(`Generating stat block for ${c.name}…`);
          const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
          const response = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 2048,
            messages: [{
              role: 'user',
              content: `Generate a complete D&D 5e stat block for a creature named "${c.name}"${c.creature_type ? ` (${c.creature_type})` : ''}${c.challenge_rating ? `, CR ${c.challenge_rating}` : ''}. Follow official D&D 5e stat block format exactly.

Respond with a JSON object (no markdown, raw JSON only):
{
  "tags": "comma-separated flavor tags",
  "content": "full stat block as plain text in official D&D 5e format",
  "dm_notes": "2-3 sentences of DM tactics and encounter tips"
}`,
            }],
          });
          const raw = response.content
            .filter(b => b.type === 'text')
            .map(b => (b as Anthropic.TextBlock).text)
            .join('');
          const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
          const parsed = JSON.parse(jsonText) as { tags: string; content: string; dm_notes: string };
          content = parsed.content ?? null;
          dm_notes = parsed.dm_notes ?? null;
          tags = parsed.tags ?? null;
        } catch {
          // If AI fails, save with empty content — user can fill it in later
        }
      }

      const sb = await upsertMonsterStatblock({
        name: c.name,
        creature_type: c.creature_type,
        challenge_rating: c.challenge_rating,
        content,
        dm_notes,
        tags,
        sort_order: monsterStatblocks.length + idMap.size,
      });
      idMap.set(c.id, sb.id);
    }

    if (newCustomCombatants.length > 0) setSaveStatus('Saving encounter…');

    const finalCombatants = combatants.map(c => {
      const sbId = idMap.get(c.id);
      if (!sbId) return c;
      return { ...c, source: 'saved' as const, statblock_id: sbId };
    });

    await upsertEncounter({
      ...(editing ? { id: editing.id } : {}),
      name: form.name.trim(),
      description: form.description || null,
      environment: form.environment || null,
      difficulty: form.difficulty || null,
      party_size: form.party_size ? parseInt(form.party_size, 10) : null,
      party_level: form.party_level ? parseInt(form.party_level, 10) : null,
      dm_notes: form.dm_notes || null,
      status: form.status,
      combatants: finalCombatants.length > 0 ? JSON.stringify(finalCombatants) : null,
      sort_order: editing?.sort_order ?? encounters.length,
    });
    setModalOpen(false);
    } finally {
      setSaving(false);
      setSaveStatus('');
    }
  };

  const handleDelete = async (enc: Encounter) => {
    if (confirm(`Delete encounter "${enc.name}"?`)) {
      await deleteEncounter(enc.id);
      if (viewing?.id === enc.id) setViewing(null);
    }
  };

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
      challenge_rating: customCreatureCR || null,
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

  // ---- AI generation ----

  const openGenModal = () => {
    // Pre-fill party info from active PCs
    const activePCs = pcs.filter(p => p.is_active);
    if (activePCs.length > 0) {
      setGenPartySize(String(activePCs.length));
    }
    setGenMode('ai');
    setGenError('');
    setGenLoading(false);
    setGenModalOpen(true);
  };

  const handleGenerate = async () => {
    if (genMode === 'manual') {
      // Just open the edit modal blank
      openAdd();
      setGenModalOpen(false);
      return;
    }

    const size = parseInt(genPartySize.trim(), 10);
    const level = parseInt(genPartyLevel.trim(), 10);
    if (!genPartySize.trim() || !genPartyLevel.trim()) {
      setGenError('Please enter both party size and average level.');
      return;
    }
    if (isNaN(size) || size < 1 || size > 10) {
      setGenError('Party size must be between 1 and 10.');
      return;
    }
    if (isNaN(level) || level < 1 || level > 20) {
      setGenError('Average level must be between 1 and 20.');
      return;
    }

    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
    if (!apiKey) {
      setGenError('VITE_ANTHROPIC_API_KEY is not set in your .env file.');
      return;
    }

    const savedCreaturesList = monsterStatblocks.length > 0
      ? `\n\nThe DM already has these creatures in their library (use them when appropriate by referencing their exact names):\n${monsterStatblocks.map(m => `- ${m.name} (${m.creature_type ?? 'unknown'}, CR ${m.challenge_rating ?? '?'})`).join('\n')}`
      : '';

    const themeClause = genTheme ? ` The encounter theme/concept: "${genTheme}".` : '';
    const envClause = genEnvironment ? ` Environment: ${genEnvironment}.` : '';

    setGenError('');
    setGenLoading(true);
    try {
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Design a D&D 5e encounter for a party of ${size} players at average level ${level}. Difficulty: ${genDifficulty}.${themeClause}${envClause}${savedCreaturesList}

Return a JSON object with this exact structure (no markdown, raw JSON only):
{
  "name": "short evocative encounter name",
  "description": "1-2 sentence scene-setting description",
  "environment": "one of: dungeon|forest|urban|cave|open|underground|aquatic|aerial|other",
  "difficulty": "${genDifficulty}",
  "dm_notes": "2-3 sentences of tactics, pacing tips, and dramatic suggestions",
  "combatants": [
    {
      "name": "creature name",
      "creature_type": "one of: aberration|beast|celestial|construct|dragon|elemental|fey|fiend|giant|humanoid|monstrosity|ooze|plant|undead|other",
      "challenge_rating": "CR as string e.g. \\"1/4\\" or \\"5\\"",
      "count": 2,
      "source": "saved or custom",
      "notes": "optional tactical note for this creature"
    }
  ]
}

For each combatant: if it matches a creature in the saved library (same name), set source to "saved", otherwise "custom". Use appropriate CRs for the party level and difficulty. Include 2-4 distinct combatant types for variety.`,
        }],
      });

      const raw = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as Anthropic.TextBlock).text)
        .join('');

      const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(jsonText) as {
        name: string;
        description: string;
        environment: string;
        difficulty: string;
        dm_notes: string;
        combatants: Array<{
          name: string;
          creature_type: string;
          challenge_rating: string;
          count: number;
          source: string;
          notes: string | null;
        }>;
      };

      // Map combatants — resolve saved ones to actual statblock IDs
      const resolvedCombatants: EncounterCombatant[] = (parsed.combatants ?? []).map(c => {
        const savedMatch = monsterStatblocks.find(
          m => m.name.toLowerCase() === c.name.toLowerCase()
        );
        return {
          id: crypto.randomUUID(),
          source: savedMatch ? 'saved' : 'custom',
          statblock_id: savedMatch?.id ?? null,
          name: c.name,
          creature_type: c.creature_type ?? null,
          challenge_rating: VALID_CRS.includes(c.challenge_rating) ? c.challenge_rating : null,
          count: Math.max(1, c.count ?? 1),
          notes: c.notes ?? null,
        };
      });

      setGenModalOpen(false);
      setEditing(null);
      setForm({
        name: parsed.name ?? '',
        description: parsed.description ?? '',
        environment: ENVIRONMENTS.includes(parsed.environment) ? parsed.environment : '',
        difficulty: DIFFICULTIES.includes(parsed.difficulty) ? parsed.difficulty : genDifficulty,
        party_size: genPartySize,
        party_level: genPartyLevel,
        dm_notes: parsed.dm_notes ?? '',
        status: 'draft',
      });
      setCombatants(resolvedCombatants);
      setAddCreatureMode(null);
      setModalOpen(true);
    } catch (err) {
      setGenError(`Generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setGenLoading(false);
    }
  };

  // ---- filtering ----

  const filtered = encounters.filter(enc => {
    const statusMatch = filterStatus === 'all' || enc.status === filterStatus;
    const s = search.toLowerCase();
    const searchMatch = !search
      || enc.name.toLowerCase().includes(s)
      || (enc.environment ?? '').toLowerCase().includes(s)
      || (enc.difficulty ?? '').toLowerCase().includes(s);
    return statusMatch && searchMatch;
  });

  // ================================================================
  // Render
  // ================================================================

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold" style={{ color: '#c9a84c', fontFamily: 'Georgia, serif' }}>
          Encounter Builder
        </h2>
        <div className="flex gap-2">
          <button
            onClick={openGenModal}
            className="px-4 py-2 rounded text-sm font-semibold transition-colors"
            style={{ backgroundColor: '#2a1a3a', color: '#c060d0', border: '1px solid #5a2a7a' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#3a2050')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#2a1a3a')}
          >
            ✦ Build Encounter
          </button>
          <button
            onClick={openAdd}
            className="px-4 py-2 rounded text-sm font-semibold transition-colors"
            style={{ backgroundColor: '#a07830', color: '#e8d5b0' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#c9a84c')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#a07830')}
          >
            + Manual
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {encounters.length > 0 && (
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <input
            type="text"
            placeholder="Search by name, environment, or difficulty…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-0 px-3 py-1.5 rounded text-sm outline-none"
            style={{ backgroundColor: '#1a1830', color: '#e8d5b0', border: '1px solid #3a3660', minWidth: '180px' }}
          />
          <div className="flex items-center gap-1.5">
            {(['all', ...STATUSES] as const).map(s => {
              const active = filterStatus === s;
              const cs = s !== 'all' ? statusColors[s] : null;
              return (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className="text-xs px-2.5 py-1 rounded border capitalize"
                  style={{
                    backgroundColor: active ? (cs?.bg ?? '#2a2050') : '#1a1828',
                    color: active ? (cs?.text ?? '#c9a84c') : '#9990b0',
                    borderColor: active ? (cs?.border ?? '#5a4a90') : '#3a3660',
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* List */}
      {encounters.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#6a6490' }}>
          No encounters yet. Use <strong style={{ color: '#c060d0' }}>✦ Build Encounter</strong> for DM assistance, or <strong style={{ color: '#c9a84c' }}>+ Manual</strong> to create one yourself.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10" style={{ color: '#6a6490' }}>No encounters match your filter.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(enc => {
            const cs = statusColors[enc.status] ?? statusColors.draft;
            const dc = enc.difficulty ? (difficultyColors[enc.difficulty] ?? null) : null;
            const combatantList = parseCombatants(enc.combatants);
            const totalCreatures = combatantList.reduce((sum, c) => sum + c.count, 0);
            return (
              <div
                key={enc.id}
                className="rounded-lg border p-4 flex items-center gap-4"
                style={{ backgroundColor: '#1a1828', borderColor: '#3a3660' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className="text-xs px-2 py-0.5 rounded border capitalize shrink-0"
                      style={{ backgroundColor: cs.bg, color: cs.text, borderColor: cs.border }}
                    >
                      {enc.status}
                    </span>
                    <span className="font-semibold text-sm" style={{ color: '#e8d5b0', fontFamily: 'Georgia, serif' }}>
                      {enc.name}
                    </span>
                    {dc && (
                      <span className="text-xs px-1.5 py-0.5 rounded capitalize" style={{ backgroundColor: dc.bg, color: dc.text, border: `1px solid ${dc.border}` }}>
                        {enc.difficulty}
                      </span>
                    )}
                    {enc.environment && (
                      <span className="text-xs capitalize" style={{ color: '#6a6490' }}>{enc.environment}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs" style={{ color: '#6a6490' }}>
                    {enc.party_size && enc.party_level && (
                      <span>{enc.party_size}p / lvl {enc.party_level}</span>
                    )}
                    {totalCreatures > 0 && (
                      <span>{totalCreatures} creature{totalCreatures !== 1 ? 's' : ''} ({combatantList.length} type{combatantList.length !== 1 ? 's' : ''})</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setViewing(enc)}
                    className="text-xs px-2.5 py-1 rounded"
                    style={{ backgroundColor: '#1a1a3a', color: '#6090e0', border: '1px solid #3a3a7a' }}
                  >
                    View
                  </button>
                  <button
                    onClick={() => openEdit(enc)}
                    className="text-xs px-2.5 py-1 rounded"
                    style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(enc)}
                    className="text-xs px-2.5 py-1 rounded"
                    style={{ backgroundColor: '#22203a', color: '#e05c5c', border: '1px solid #3a3660' }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================================================================
          BUILD / GENERATE MODAL
      ================================================================ */}
      <Modal
        isOpen={genModalOpen}
        onClose={() => { if (!genLoading) setGenModalOpen(false); }}
        title="Build Encounter"
        onSave={genLoading ? undefined : handleGenerate}
        saveLabel={genMode === 'ai' ? '✦ Generate' : 'Build Manually'}
      >
        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded overflow-hidden" style={{ border: '1px solid #3a3660' }}>
            {(['ai', 'manual'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => { setGenMode(mode); setGenError(''); }}
                disabled={genLoading}
                className="flex-1 text-sm py-1.5 font-medium transition-colors"
                style={{
                  backgroundColor: genMode === mode ? '#2a2050' : '#1a1828',
                  color: genMode === mode ? '#c9a84c' : '#9990b0',
                }}
              >
                {mode === 'ai' ? '✦ AI Build' : '✎ Manual'}
              </button>
            ))}
          </div>

          {genMode === 'ai' ? (
            <>
              <p className="text-sm" style={{ color: '#9990b0', lineHeight: '1.6' }}>
                Describe your encounter and the AI will populate creatures, difficulty, and DM notes.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Number of Players">
                  <input
                    type="number" min={1} max={10}
                    value={genPartySize}
                    onChange={e => { setGenPartySize(e.target.value); setGenError(''); }}
                    placeholder="e.g. 4"
                    style={inputStyle}
                    disabled={genLoading}
                    autoFocus
                  />
                </FormField>
                <FormField label="Average Party Level">
                  <input
                    type="number" min={1} max={20}
                    value={genPartyLevel}
                    onChange={e => { setGenPartyLevel(e.target.value); setGenError(''); }}
                    placeholder="e.g. 5"
                    style={inputStyle}
                    disabled={genLoading}
                  />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Difficulty">
                  <select
                    value={genDifficulty}
                    onChange={e => setGenDifficulty(e.target.value)}
                    style={inputStyle}
                    disabled={genLoading}
                  >
                    {DIFFICULTIES.map(d => (
                      <option key={d} value={d} className="capitalize">{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Environment (optional)">
                  <select
                    value={genEnvironment}
                    onChange={e => setGenEnvironment(e.target.value)}
                    style={inputStyle}
                    disabled={genLoading}
                  >
                    <option value="">Any</option>
                    {ENVIRONMENTS.map(env => (
                      <option key={env} value={env} className="capitalize">{env.charAt(0).toUpperCase() + env.slice(1)}</option>
                    ))}
                  </select>
                </FormField>
              </div>
              <FormField label="Theme / Concept (optional)">
                <input
                  type="text"
                  value={genTheme}
                  onChange={e => setGenTheme(e.target.value)}
                  placeholder="e.g. ambush by cultists, dragon's lair, undead siege…"
                  style={inputStyle}
                  disabled={genLoading}
                />
              </FormField>
              {monsterStatblocks.length > 0 && (
                <p className="text-xs" style={{ color: '#4a4470' }}>
                  The AI will consider your {monsterStatblocks.length} saved creature{monsterStatblocks.length !== 1 ? 's' : ''} when building the encounter.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm" style={{ color: '#9990b0', lineHeight: '1.6' }}>
              Open a blank encounter form and add creatures manually from your library or by name.
            </p>
          )}

          {genError && <p className="text-sm" style={{ color: '#e05c5c' }}>{genError}</p>}
          {genLoading && (
            <p className="text-sm" style={{ color: '#9990b0', fontStyle: 'italic' }}>
              Building encounter…
            </p>
          )}
        </div>
      </Modal>

      {/* ================================================================
          ADD / EDIT MODAL
      ================================================================ */}
      <Modal
        isOpen={modalOpen}
        onClose={() => { if (!saving) setModalOpen(false); }}
        title={editing ? `Edit: ${editing.name}` : 'New Encounter'}
        onSave={saving ? undefined : handleSave}
        saveLabel={saving ? saveStatus || 'Saving…' : 'Save'}
        wide
      >
        <div className="space-y-4">
          {/* Basic info */}
          <FormField label="Encounter Name">
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Ambush at Darkwood Crossing"
              style={inputStyle}
              autoFocus
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Difficulty">
              <select
                value={form.difficulty}
                onChange={e => setForm(prev => ({ ...prev, difficulty: e.target.value }))}
                style={inputStyle}
              >
                <option value="">— none —</option>
                {DIFFICULTIES.map(d => (
                  <option key={d} value={d} className="capitalize">{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Environment">
              <select
                value={form.environment}
                onChange={e => setForm(prev => ({ ...prev, environment: e.target.value }))}
                style={inputStyle}
              >
                <option value="">— none —</option>
                {ENVIRONMENTS.map(env => (
                  <option key={env} value={env} className="capitalize">{env.charAt(0).toUpperCase() + env.slice(1)}</option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Party Size">
              <input
                type="number" min={1} max={10}
                value={form.party_size}
                onChange={e => setForm(prev => ({ ...prev, party_size: e.target.value }))}
                placeholder="e.g. 4"
                style={inputStyle}
              />
            </FormField>
            <FormField label="Avg Party Level">
              <input
                type="number" min={1} max={20}
                value={form.party_level}
                onChange={e => setForm(prev => ({ ...prev, party_level: e.target.value }))}
                placeholder="e.g. 5"
                style={inputStyle}
              />
            </FormField>
            <FormField label="Status">
              <select
                value={form.status}
                onChange={e => setForm(prev => ({ ...prev, status: e.target.value as typeof form.status }))}
                style={inputStyle}
              >
                {STATUSES.map(s => (
                  <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Description">
            <textarea
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Scene-setting description for the encounter…"
              style={{ ...textareaStyle, minHeight: '72px' }}
            />
          </FormField>

          {/* Combatants */}
          <div>
            <div style={sectionLabel}>Combatants</div>
            <div className="space-y-2 mb-3">
              {combatants.length === 0 && (
                <p className="text-xs" style={{ color: '#4a4470' }}>No creatures added yet.</p>
              )}
              {combatants.map(c => {
                const sb = c.statblock_id ? monsterStatblocks.find(m => m.id === c.statblock_id) : null;
                return (
                  <CombatantRow
                    key={c.id}
                    c={c}
                    statblockName={sb?.name ?? null}
                    onCountChange={delta => updateCombatantCount(c.id, delta)}
                    onNotesChange={notes => updateCombatantNotes(c.id, notes)}
                    onRemove={() => removeCombatant(c.id)}
                    onViewSheet={sb ? () => setViewingStatblock(sb) : undefined}
                  />
                );
              })}
            </div>

            {/* Add creature controls */}
            {addCreatureMode === null && (
              <div className="flex gap-2">
                {monsterStatblocks.length > 0 && (
                  <button
                    onClick={() => setAddCreatureMode('saved')}
                    className="text-xs px-3 py-1.5 rounded"
                    style={{ backgroundColor: '#1a2a3a', color: '#70a0e0', border: '1px solid #2a4a7a' }}
                  >
                    + From Library
                  </button>
                )}
                <button
                  onClick={() => setAddCreatureMode('custom')}
                  className="text-xs px-3 py-1.5 rounded"
                  style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
                >
                  + Custom Creature
                </button>
              </div>
            )}

            {addCreatureMode === 'saved' && (
              <div className="rounded p-3 space-y-2" style={{ backgroundColor: '#0f0e17', border: '1px solid #3a3660' }}>
                <p className="text-xs font-semibold" style={{ color: '#c9a84c' }}>Select from Library</p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {monsterStatblocks.map(m => (
                    <button
                      key={m.id}
                      onClick={() => addSavedCombatant(m.id)}
                      className="w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-2"
                      style={{ backgroundColor: '#1a1828', color: '#e8d5b0', border: '1px solid #2a2850' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#22203a')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#1a1828')}
                    >
                      <span className="flex-1">{m.name}</span>
                      {m.challenge_rating && <span style={{ color: '#c08060' }}>CR {m.challenge_rating}</span>}
                      {m.creature_type && <span className="capitalize" style={{ color: '#6a6490' }}>{m.creature_type}</span>}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setAddCreatureMode(null)}
                  className="text-xs px-2 py-1 rounded"
                  style={{ color: '#6a6490', border: '1px solid #3a3660' }}
                >
                  Cancel
                </button>
              </div>
            )}

            {addCreatureMode === 'custom' && (
              <div className="rounded p-3 space-y-2" style={{ backgroundColor: '#0f0e17', border: '1px solid #3a3660' }}>
                <p className="text-xs font-semibold" style={{ color: '#c9a84c' }}>Add Custom Creature</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-3">
                    <input
                      type="text"
                      value={customCreatureName}
                      onChange={e => setCustomCreatureName(e.target.value)}
                      placeholder="Creature name *"
                      style={{ ...inputStyle, fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomCombatant(); }}}
                    />
                  </div>
                  <input
                    type="text"
                    value={customCreatureType}
                    onChange={e => setCustomCreatureType(e.target.value)}
                    placeholder="Type (optional)"
                    style={{ ...inputStyle, fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                  />
                  <input
                    type="text"
                    value={customCreatureCR}
                    onChange={e => setCustomCreatureCR(e.target.value)}
                    placeholder="CR (optional)"
                    style={{ ...inputStyle, fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addCustomCombatant}
                    className="text-xs px-3 py-1 rounded"
                    style={{ backgroundColor: '#a07830', color: '#e8d5b0' }}
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setAddCreatureMode(null)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: '#6a6490', border: '1px solid #3a3660' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <FormField label="DM Notes">
            <textarea
              value={form.dm_notes}
              onChange={e => setForm(prev => ({ ...prev, dm_notes: e.target.value }))}
              placeholder="Tactics, pacing tips, dramatic moments…"
              style={{ ...textareaStyle, minHeight: '72px' }}
            />
          </FormField>

          {saving && saveStatus && (
            <p className="text-sm" style={{ color: '#9990b0', fontStyle: 'italic' }}>{saveStatus}</p>
          )}
        </div>
      </Modal>

      {/* ================================================================
          VIEW MODAL
      ================================================================ */}
      {viewing && (
        <Modal
          isOpen={!!viewing}
          onClose={() => setViewing(null)}
          title={viewing.name}
          wide
        >
          <div className="space-y-4">
            {/* Meta badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {(() => {
                const cs = statusColors[viewing.status] ?? statusColors.draft;
                return (
                  <span className="text-xs px-2 py-0.5 rounded border capitalize"
                    style={{ backgroundColor: cs.bg, color: cs.text, borderColor: cs.border }}>
                    {viewing.status}
                  </span>
                );
              })()}
              {viewing.difficulty && (() => {
                const dc = difficultyColors[viewing.difficulty];
                return dc ? (
                  <span className="text-xs px-2 py-0.5 rounded capitalize"
                    style={{ backgroundColor: dc.bg, color: dc.text, border: `1px solid ${dc.border}` }}>
                    {viewing.difficulty}
                  </span>
                ) : null;
              })()}
              {viewing.environment && (
                <span className="text-xs capitalize" style={{ color: '#6a6490' }}>{viewing.environment}</span>
              )}
              {viewing.party_size && viewing.party_level && (
                <span className="text-xs" style={{ color: '#6a6490' }}>
                  {viewing.party_size} players · avg level {viewing.party_level}
                </span>
              )}
            </div>

            {/* Description */}
            {viewing.description && (
              <div>
                <div style={sectionLabel}>Description</div>
                <p className="text-sm" style={{ color: '#e8d5b0', lineHeight: '1.7' }}>{viewing.description}</p>
              </div>
            )}

            {/* Combatants */}
            {(() => {
              const list = parseCombatants(viewing.combatants);
              if (list.length === 0) return null;
              const total = list.reduce((s, c) => s + c.count, 0);
              return (
                <div>
                  <div style={sectionLabel}>Combatants — {total} total</div>
                  <div className="space-y-1">
                    {list.map(c => {
                      const sb = c.statblock_id ? monsterStatblocks.find(m => m.id === c.statblock_id) : null;
                      return (
                        <div key={c.id} className="flex items-baseline gap-2 text-sm" style={{ color: '#e8d5b0' }}>
                          <span className="font-semibold" style={{ minWidth: '1.5rem', textAlign: 'right', color: '#c9a84c' }}>{c.count}×</span>
                          {sb ? (
                            <button
                              onClick={() => setViewingStatblock(sb)}
                              className="text-sm font-medium underline decoration-dotted"
                              style={{ color: '#e8d5b0', textUnderlineOffset: '3px' }}
                            >
                              {c.name}
                            </button>
                          ) : (
                            <span>{c.name}</span>
                          )}
                          {c.challenge_rating && <span className="text-xs" style={{ color: '#c08060' }}>CR {c.challenge_rating}</span>}
                          {c.creature_type && <span className="text-xs capitalize" style={{ color: '#6a6490' }}>{c.creature_type}</span>}
                          {c.notes && <span className="text-xs italic" style={{ color: '#6a6490' }}>— {c.notes}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* DM Notes */}
            {viewing.dm_notes && (
              <div>
                <div style={sectionLabel}>DM Notes</div>
                <p className="text-sm" style={{ color: '#9990b0', lineHeight: '1.6', fontStyle: 'italic' }}>
                  {viewing.dm_notes}
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setViewing(null); openEdit(viewing); }}
                className="text-xs px-3 py-1 rounded"
                style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
              >
                Edit
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ================================================================
          CREATURE SHEET VIEWER
      ================================================================ */}
      {viewingStatblock && (
        <Modal
          isOpen={!!viewingStatblock}
          onClose={() => setViewingStatblock(null)}
          title={viewingStatblock.name}
          wide
        >
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
                <span className="text-xs" style={{ color: '#6a6490' }}>{viewingStatblock.tags}</span>
              )}
            </div>
            {viewingStatblock.content && (
              <pre
                className="text-sm whitespace-pre-wrap rounded p-3"
                style={{
                  color: '#e8d5b0',
                  lineHeight: '1.7',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  backgroundColor: '#0f0e17',
                  border: '1px solid #3a3660',
                }}
              >
                {viewingStatblock.content}
              </pre>
            )}
            {viewingStatblock.dm_notes && (
              <div>
                <div style={sectionLabel}>DM Notes</div>
                <p className="text-sm" style={{ color: '#9990b0', lineHeight: '1.6', fontStyle: 'italic' }}>
                  {viewingStatblock.dm_notes}
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
