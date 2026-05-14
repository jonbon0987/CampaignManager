import { useState, useRef } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import { MarkdownEditor } from '../ui/MarkdownEditor';
import { MarkdownContent } from '../ui/MarkdownContent';
import { EntityLinkToolbar } from '../ui/EntityLinkToolbar';
import { insertAtCursor } from '../../lib/textUtils';
import { getAIProvider } from '../../lib/aiProvider';
import { authHeaders } from '../../lib/apiClient';
import { InitiativeTracker } from '../InitiativeTracker';
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
// Combatant row sub-component (edit modal)
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
// Campaign context helper
// ================================================================

type CampaignContextData = {
  overview: { title: string; plotSummary: string };
  sessions: Array<{ session_number: number | null; session_date: string | null; summary: string | null }>;
  lore: Array<{ title: string; category: string | null; content: string | null }>;
  locations: Array<{ name: string; region: string | null; location_type: string | null; description: string | null }>;
};

function buildCampaignContextBlock(data: CampaignContextData): string {
  const parts: string[] = ['\n\n== CAMPAIGN CONTEXT ==', `Campaign: ${data.overview.title || 'Unnamed'}`];
  if (data.overview.plotSummary) parts.push(`Plot: ${data.overview.plotSummary}`);
  if (data.sessions.length > 0) {
    parts.push('\nRecent Sessions:');
    data.sessions.slice(-5).forEach(s => {
      if (s.summary) parts.push(`  Session #${s.session_number ?? '?'}: ${s.summary}`);
    });
  }
  if (data.lore.length > 0) {
    parts.push('\nLore:');
    data.lore.slice(0, 10).forEach(l => {
      const snippet = l.content ? l.content.substring(0, 120) + (l.content.length > 120 ? '…' : '') : '';
      parts.push(`  [${l.category ?? 'lore'}] ${l.title}${snippet ? ': ' + snippet : ''}`);
    });
  }
  if (data.locations.length > 0) {
    parts.push('\nLocations:');
    data.locations.slice(0, 10).forEach(l => {
      parts.push(`  ${l.name} (${l.location_type ?? '?'})${l.region ? ` in ${l.region}` : ''}${l.description ? ': ' + l.description.substring(0, 80) + '…' : ''}`);
    });
  }
  parts.push('\nUse this campaign context to make the generated content feel native to this world — reference appropriate locations, lore, and ongoing story threads where fitting.\n');
  return parts.join('\n');
}

// ================================================================
// Main component
// ================================================================

export default function EncounterBuilder() {
  const { encounters, upsertEncounter, deleteEncounter, monsterStatblocks, upsertMonsterStatblock, pcs, sessions, lore, locations, overview } = useCampaign();
  const confirm = useConfirm();

  // Selected encounter in master-detail
  const [selected, setSelected] = useState<Encounter | null>(null);

  // Search
  const [search, setSearch] = useState('');

  // Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Encounter | null>(null);
  const [form, setForm] = useState<EncounterForm>(emptyForm());
  const [combatants, setCombatants] = useState<EncounterCombatant[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const descRef = useRef<HTMLTextAreaElement>(null);
  const dmNotesRef = useRef<HTMLTextAreaElement>(null);

  // AI generate modal
  const [genModalOpen, setGenModalOpen] = useState(false);
  const [genMode, setGenMode] = useState<'manual' | 'ai'>('ai');
  const [genPartySize, setGenPartySize] = useState('');
  const [genPartyLevel, setGenPartyLevel] = useState('');
  const [genTheme, setGenTheme] = useState('');
  const [genDifficulty, setGenDifficulty] = useState('hard');
  const [genEnvironment, setGenEnvironment] = useState('');
  const [genUseCampaignContext, setGenUseCampaignContext] = useState(false);
  const [genAdditionalContext, setGenAdditionalContext] = useState('');
  const [genError, setGenError] = useState('');
  const [genLoading, setGenLoading] = useState(false);

  // Initiative tracker
  const [runningEncounter, setRunningEncounter] = useState<Encounter | null>(null);

  // Creature sheet viewer
  const [viewingStatblock, setViewingStatblock] = useState<MonsterStatblock | null>(null);

  // Add-creature panel (within edit modal)
  const [addCreatureMode, setAddCreatureMode] = useState<'saved' | 'custom' | null>(null);
  const [customCreatureName, setCustomCreatureName] = useState('');
  const [customCreatureType, setCustomCreatureType] = useState('');
  const [customCreatureCR, setCustomCreatureCR] = useState('');

  // Active PC names for initiative tracker
  const activePCNames = pcs.filter(p => p.is_active).map(p => p.character_name);

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

    setSaving(true);
    try {
      const idMap = new Map<string, string>();
      for (let i = 0; i < combatants.length; i++) {
        const c = combatants[i];
        if (c.source !== 'custom' || c.statblock_id) continue;

        let content: string | null = null;
        let dm_notes: string | null = null;
        let tags: string | null = null;

        try {
          setSaveStatus(`Generating stat block for ${c.name}…`);
          const prompt = `Generate a complete D&D 5e stat block for a creature named "${c.name}"${c.creature_type ? ` (${c.creature_type})` : ''}${c.challenge_rating ? `, CR ${c.challenge_rating}` : ''}. Follow official D&D 5e stat block format exactly.

Respond with a JSON object (no markdown, raw JSON only):
{
  "tags": "comma-separated flavor tags",
  "content": "full stat block as plain text in official D&D 5e format",
  "dm_notes": "2-3 sentences of DM tactics and encounter tips"
}`;
          const res = await fetch('/api/generate-creature', {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({ prompt, provider: getAIProvider() }),
          });
          const data = await res.json() as { text?: string; error?: string };
          if (res.ok && data.text) {
            const jsonText = data.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
            const parsed = JSON.parse(jsonText) as { tags: string; content: string; dm_notes: string };
            content = parsed.content ?? null;
            dm_notes = parsed.dm_notes ?? null;
            tags = parsed.tags ?? null;
          }
        } catch {
          // If AI fails, save with empty content
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

      const editingId = editing?.id;
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
      // Select the saved encounter — find by id if editing, otherwise by name
      if (editingId) {
        setSelected(prev => prev?.id === editingId ? prev : (encounters.find(e => e.id === editingId) ?? prev));
      }
    } finally {
      setSaving(false);
      setSaveStatus('');
    }
  };

  const handleDelete = async (enc: Encounter) => {
    if (await confirm(`Delete encounter "${enc.name}"?`)) {
      await deleteEncounter(enc.id);
      if (selected?.id === enc.id) setSelected(null);
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
    const activePCs = pcs.filter(p => p.is_active);
    if (activePCs.length > 0) setGenPartySize(String(activePCs.length));
    setGenMode('ai');
    setGenUseCampaignContext(false);
    setGenAdditionalContext('');
    setGenError('');
    setGenLoading(false);
    setGenModalOpen(true);
  };

  const handleGenerate = async () => {
    if (genMode === 'manual') {
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

    const savedCreaturesList = monsterStatblocks.length > 0
      ? `\n\nThe DM already has these creatures in their library (use them when appropriate by referencing their exact names):\n${monsterStatblocks.map(m => `- ${m.name} (${m.creature_type ?? 'unknown'}, CR ${m.challenge_rating ?? '?'})`).join('\n')}`
      : '';

    const themeClause = genTheme ? ` The encounter theme/concept: "${genTheme}".` : '';
    const envClause = genEnvironment ? ` Environment: ${genEnvironment}.` : '';
    const campaignContextBlock = genUseCampaignContext
      ? buildCampaignContextBlock({ overview, sessions, lore, locations })
      : '';
    const additionalContextClause = genAdditionalContext.trim()
      ? `\n\nAdditional DM instructions: ${genAdditionalContext.trim()}`
      : '';

    const prompt = `Design a D&D 5e encounter for a party of ${size} players at average level ${level}. Difficulty: ${genDifficulty}.${themeClause}${envClause}${savedCreaturesList}${campaignContextBlock}${additionalContextClause}

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

For each combatant: if it matches a creature in the saved library (same name), set source to "saved", otherwise "custom". Use appropriate CRs for the party level and difficulty. Include 2-4 distinct combatant types for variety.`;

    setGenError('');
    setGenLoading(true);
    try {
      const res = await fetch('/api/generate-encounter', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ prompt, provider: getAIProvider() }),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `Server error: ${res.status}`);

      const jsonText = (data.text ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
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
    if (!search) return true;
    const s = search.toLowerCase();
    return enc.name.toLowerCase().includes(s)
      || (enc.environment ?? '').toLowerCase().includes(s)
      || (enc.difficulty ?? '').toLowerCase().includes(s);
  });

  // Keep selected in sync if data changes
  const selectedEnc = selected ? (encounters.find(e => e.id === selected.id) ?? null) : null;

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
              onClick={openGenModal}
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
                onClick={() => setSelected(enc)}
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
                {/* Delete button */}
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(enc); }}
                  style={{
                    color: '#4a4438',
                    fontSize: '0.7rem',
                    lineHeight: 1,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px',
                    flexShrink: 0,
                    marginTop: '1px',
                  }}
                  title="Delete"
                >
                  ✕
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: isActive ? '#e8dcc4' : '#c9b88a', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'var(--display)', marginBottom: '4px', lineHeight: 1.3 }}>
                    {enc.name}
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
            Select an encounter to view details.
          </div>
        ) : (
          <DetailPanel
            enc={selectedEnc}
            monsterStatblocks={monsterStatblocks}
            onEdit={() => openEdit(selectedEnc)}
            onRun={() => setRunningEncounter(selectedEnc)}
            onViewStatblock={setViewingStatblock}
          />
        )}
      </div>

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
          <div className="flex rounded overflow-hidden" style={{ border: '1px solid #2e2820' }}>
            {(['ai', 'manual'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => { setGenMode(mode); setGenError(''); }}
                disabled={genLoading}
                className="flex-1 text-sm py-1.5 font-medium transition-colors"
                style={{
                  backgroundColor: genMode === mode ? '#2a2218' : '#1c1814',
                  color: genMode === mode ? '#c9a84c' : '#b9ac90',
                }}
              >
                {mode === 'ai' ? '✦ AI Build' : '✎ Manual'}
              </button>
            ))}
          </div>

          {genMode === 'ai' ? (
            <>
              <p className="text-sm" style={{ color: '#b9ac90', lineHeight: '1.6' }}>
                Describe your encounter and the AI will populate combatants, difficulty, and DM notes.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Number of Players">
                  <input type="number" min={1} max={10} value={genPartySize}
                    onChange={e => { setGenPartySize(e.target.value); setGenError(''); }}
                    placeholder="e.g. 4" style={inputStyle} disabled={genLoading} autoFocus />
                </FormField>
                <FormField label="Average Party Level">
                  <input type="number" min={1} max={20} value={genPartyLevel}
                    onChange={e => { setGenPartyLevel(e.target.value); setGenError(''); }}
                    placeholder="e.g. 5" style={inputStyle} disabled={genLoading} />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Difficulty">
                  <select value={genDifficulty} onChange={e => setGenDifficulty(e.target.value)} style={inputStyle} disabled={genLoading}>
                    {DIFFICULTIES.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                  </select>
                </FormField>
                <FormField label="Environment (optional)">
                  <select value={genEnvironment} onChange={e => setGenEnvironment(e.target.value)} style={inputStyle} disabled={genLoading}>
                    <option value="">Any</option>
                    {ENVIRONMENTS.map(env => <option key={env} value={env}>{env.charAt(0).toUpperCase() + env.slice(1)}</option>)}
                  </select>
                </FormField>
              </div>
              <FormField label="Encounter Concept (optional)" hint="What is this encounter — its setting, enemies, or story beat?">
                <input type="text" value={genTheme} onChange={e => setGenTheme(e.target.value)}
                  placeholder="e.g. ambush by cultists, dragon's lair, undead siege…" style={inputStyle} disabled={genLoading} />
              </FormField>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setGenUseCampaignContext(v => !v)}
                  disabled={genLoading}
                  className="text-xs px-3 py-1.5 rounded font-medium transition-colors"
                  style={{
                    backgroundColor: genUseCampaignContext ? '#2a2218' : '#1c1814',
                    color: genUseCampaignContext ? '#c9a84c' : '#b9ac90',
                    border: `1px solid ${genUseCampaignContext ? '#5a4828' : '#2e2820'}`,
                  }}
                >
                  {genUseCampaignContext ? '✦ Campaign Context On' : '○ Include Campaign Context'}
                </button>
              </div>
              {genUseCampaignContext && (
                <p className="text-xs" style={{ color: '#897f68' }}>
                  Will include the last 5 session summaries, lore entries, and locations from your campaign.
                </p>
              )}
              <FormField label="DM Instructions (optional)" hint="Specific rules or narrative constraints the AI must follow.">
                <textarea rows={3} value={genAdditionalContext} onChange={e => setGenAdditionalContext(e.target.value)}
                  placeholder="e.g. The villain escapes at the end. No more than 2 stat sheet types. Include a puzzle element."
                  style={textareaStyle} disabled={genLoading} />
              </FormField>
              {monsterStatblocks.length > 0 && (
                <p className="text-xs" style={{ color: '#897f68' }}>
                  The AI will consider your {monsterStatblocks.length} saved stat sheet{monsterStatblocks.length !== 1 ? 's' : ''} when building the encounter.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm" style={{ color: '#b9ac90', lineHeight: '1.6' }}>
              Open a blank encounter form and add stat sheets manually from your library or by name.
            </p>
          )}

          {genError && <p className="text-sm" style={{ color: '#e05c5c' }}>{genError}</p>}
          {genLoading && <p className="text-sm" style={{ color: '#b9ac90', fontStyle: 'italic' }}>Building encounter…</p>}
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
          <FormField label="Encounter Name">
            <input type="text" value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Ambush at Darkwood Crossing" style={inputStyle} autoFocus />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Difficulty">
              <select value={form.difficulty} onChange={e => setForm(prev => ({ ...prev, difficulty: e.target.value }))} style={inputStyle}>
                <option value="">— none —</option>
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
              </select>
            </FormField>
            <FormField label="Environment">
              <select value={form.environment} onChange={e => setForm(prev => ({ ...prev, environment: e.target.value }))} style={inputStyle}>
                <option value="">— none —</option>
                {ENVIRONMENTS.map(env => <option key={env} value={env}>{env.charAt(0).toUpperCase() + env.slice(1)}</option>)}
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Party Size">
              <input type="number" min={1} max={10} value={form.party_size}
                onChange={e => setForm(prev => ({ ...prev, party_size: e.target.value }))}
                placeholder="e.g. 4" style={inputStyle} />
            </FormField>
            <FormField label="Avg Party Level">
              <input type="number" min={1} max={20} value={form.party_level}
                onChange={e => setForm(prev => ({ ...prev, party_level: e.target.value }))}
                placeholder="e.g. 5" style={inputStyle} />
            </FormField>
            <FormField label="Status">
              <select value={form.status} onChange={e => setForm(prev => ({ ...prev, status: e.target.value as typeof form.status }))} style={inputStyle}>
                {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </FormField>
          </div>

          <FormField label="Description">
            <MarkdownEditor value={form.description} onChange={v => setForm(prev => ({ ...prev, description: v }))} placeholder="Scene-setting description for the encounter…" minHeight="72px" textareaRef={descRef} />
            <EntityLinkToolbar textareaRef={descRef} onInsert={markup => setForm(prev => ({ ...prev, description: insertAtCursor(descRef, prev.description, markup) }))} />
          </FormField>

          {/* Combatants */}
          <div>
            <div style={sectionLabel}>Combatants</div>
            <div className="space-y-2 mb-3">
              {combatants.length === 0 && (
                <p className="text-xs" style={{ color: '#897f68' }}>No combatants added yet.</p>
              )}
              {combatants.map(c => {
                const sb = c.statblock_id ? monsterStatblocks.find(m => m.id === c.statblock_id) : null;
                return (
                  <CombatantRow
                    key={c.id} c={c} statblockName={sb?.name ?? null}
                    onCountChange={delta => updateCombatantCount(c.id, delta)}
                    onNotesChange={notes => updateCombatantNotes(c.id, notes)}
                    onRemove={() => removeCombatant(c.id)}
                    onViewSheet={sb ? () => setViewingStatblock(sb) : undefined}
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
                      style={{ ...inputStyle, fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                      autoFocus onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomCombatant(); }}} />
                  </div>
                  <input type="text" value={customCreatureType} onChange={e => setCustomCreatureType(e.target.value)}
                    placeholder="Type (optional)" style={{ ...inputStyle, fontSize: '0.75rem', padding: '0.3rem 0.5rem' }} />
                  <input type="text" value={customCreatureCR} onChange={e => setCustomCreatureCR(e.target.value)}
                    placeholder="CR (optional)" style={{ ...inputStyle, fontSize: '0.75rem', padding: '0.3rem 0.5rem' }} />
                </div>
                <div className="flex gap-2">
                  <button onClick={addCustomCombatant} className="text-xs px-3 py-1 rounded"
                    style={{ backgroundColor: '#a07830', color: '#e8dcc4' }}>Add</button>
                  <button onClick={() => setAddCreatureMode(null)} className="text-xs px-2 py-1 rounded"
                    style={{ color: '#897f68', border: '1px solid #2e2820' }}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          <FormField label="DM Notes">
            <MarkdownEditor value={form.dm_notes} onChange={v => setForm(prev => ({ ...prev, dm_notes: v }))} placeholder="Tactics, pacing tips, dramatic moments…" minHeight="72px" textareaRef={dmNotesRef} />
            <EntityLinkToolbar textareaRef={dmNotesRef} onInsert={markup => setForm(prev => ({ ...prev, dm_notes: insertAtCursor(dmNotesRef, prev.dm_notes, markup) }))} />
          </FormField>

          {saving && saveStatus && (
            <p className="text-sm" style={{ color: '#b9ac90', fontStyle: 'italic' }}>{saveStatus}</p>
          )}
        </div>
      </Modal>

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
// Detail panel (read-only view)
// ================================================================

function DetailPanel({
  enc,
  monsterStatblocks,
  onEdit,
  onRun,
  onViewStatblock,
}: {
  enc: Encounter;
  monsterStatblocks: MonsterStatblock[];
  onEdit: () => void;
  onRun: () => void;
  onViewStatblock: (sb: MonsterStatblock) => void;
}) {
  const combatantList = parseCombatants(enc.combatants);
  const dc = enc.difficulty ? difficultyColors[enc.difficulty] : null;
  const sc = statusColors[enc.status] ?? statusColors.draft;
  const canRun = enc.status !== 'completed' && combatantList.length > 0;

  // Total creature count
  const totalCreatures = combatantList.reduce((sum, c) => sum + c.count, 0);

  return (
    <div style={{ maxWidth: '700px' }}>

      {/* ── Eyebrow ── */}
      <div style={{
        color: '#897f68',
        fontSize: '0.6rem',
        fontWeight: 700,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        marginBottom: '8px',
      }}>
        Encounter{enc.difficulty ? ` · ${enc.difficulty}` : ''}
      </div>

      {/* ── Title + action row ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <h1 style={{
          color: '#e8dcc4',
          fontSize: '2rem',
          fontWeight: 700,
          fontFamily: 'var(--display)',
          lineHeight: 1.15,
          margin: 0,
          flex: 1,
          minWidth: 0,
        }}>
          {enc.name}
        </h1>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button onClick={onEdit} style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: '#b9ac90',
            backgroundColor: 'transparent',
            border: '1px solid #2e2820',
            borderRadius: '3px',
            padding: '6px 14px',
            cursor: 'pointer',
            fontFamily: 'var(--serif)',
          }}>
            Edit
          </button>
          {canRun && (
            <button onClick={onRun} style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#15120e',
              backgroundColor: '#c9a84c',
              border: '1px solid #c9a84c',
              borderRadius: '3px',
              padding: '6px 16px',
              cursor: 'pointer',
              fontFamily: 'var(--serif)',
            }}>
              ▶ Run Encounter
            </button>
          )}
        </div>
      </div>

      {/* ── Stat strip ── */}
      <div style={{
        display: 'flex',
        gap: '1px',
        backgroundColor: '#2e2820',
        border: '1px solid #2e2820',
        borderRadius: '4px',
        overflow: 'hidden',
        marginBottom: '28px',
      }}>
        {[
          { label: 'Status', value: enc.status, color: sc.text },
          { label: 'Difficulty', value: enc.difficulty ?? '—', color: dc?.text ?? '#897f68' },
          { label: 'Environment', value: enc.environment ?? '—', color: '#b9ac90' },
          { label: 'Party', value: enc.party_size && enc.party_level ? `${enc.party_size}× Lv${enc.party_level}` : '—', color: '#b9ac90' },
          { label: 'Creatures', value: totalCreatures > 0 ? String(totalCreatures) : '—', color: '#c9a84c' },
        ].map(stat => (
          <div key={stat.label} style={{
            flex: 1,
            backgroundColor: '#1c1814',
            padding: '10px 14px',
            textAlign: 'center',
          }}>
            <div style={{ color: '#897f68', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '3px', fontFamily: 'var(--mono)' }}>
              {stat.label}
            </div>
            <div style={{ color: stat.color, fontSize: '0.82rem', fontWeight: 600, fontFamily: 'var(--serif)', textTransform: 'capitalize' }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Description ── */}
      {enc.description && (
        <div style={{ marginBottom: '28px' }}>
          <MarkdownContent text={enc.description} className="text-sm" style={{ color: '#b9ac90', lineHeight: '1.75', fontStyle: 'italic' }} />
        </div>
      )}

      {/* ── Creatures ── */}
      {combatantList.length > 0 && (
        <div style={{ marginBottom: '28px' }}>
          <div style={{ ...sectionLabel, marginBottom: '0' }}>Creatures</div>
          <div style={{ marginTop: '8px' }}>
            {combatantList.map(c => {
              const sb = c.statblock_id ? monsterStatblocks.find(m => m.id === c.statblock_id) : null;
              return (
                <div
                  key={c.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '28px 1fr auto',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '11px 0',
                    borderBottom: '1px solid #1e1a14',
                  }}
                >
                  {/* Count badge */}
                  <div style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '3px',
                    backgroundColor: '#1e1a14',
                    border: '1px solid #2e2820',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#c9a84c',
                    fontFamily: 'var(--mono)',
                    flexShrink: 0,
                  }}>
                    {c.count}
                  </div>

                  {/* Name + meta */}
                  <div style={{ minWidth: 0 }}>
                    {sb ? (
                      <button
                        onClick={() => onViewStatblock(sb)}
                        style={{
                          color: '#e8dcc4',
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          fontFamily: 'var(--display)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          textAlign: 'left',
                          textDecoration: 'underline dotted',
                          textUnderlineOffset: '3px',
                          textDecorationColor: '#3e3428',
                        }}
                      >
                        {c.name}
                      </button>
                    ) : (
                      <span style={{ color: '#e8dcc4', fontSize: '0.9rem', fontWeight: 600, fontFamily: 'var(--display)' }}>{c.name}</span>
                    )}
                    <div style={{ color: '#897f68', fontSize: '0.72rem', marginTop: '2px', fontFamily: 'var(--mono)' }}>
                      {[
                        c.challenge_rating ? `CR ${c.challenge_rating}` : null,
                        c.creature_type,
                        sb?.hit_points ? `${sb.hit_points} HP` : null,
                        sb?.armor_class ? `AC ${sb.armor_class}` : null,
                      ].filter(Boolean).join('  ·  ')}
                    </div>
                  </div>

                  {/* Roll init link */}
                  <button
                    onClick={onRun}
                    title="Launch initiative tracker"
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: '#5a4828',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px 0',
                      fontFamily: 'var(--mono)',
                      flexShrink: 0,
                    }}
                  >
                    Roll Init
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── DM Notes ── */}
      {enc.dm_notes && (
        <div style={{
          marginBottom: '28px',
          padding: '14px 16px',
          backgroundColor: '#1c1814',
          border: '1px solid #2e2820',
          borderLeft: '3px solid #3e3428',
          borderRadius: '3px',
        }}>
          <div style={{ ...sectionLabel, marginBottom: '8px' }}>DM Notes</div>
          <MarkdownContent text={enc.dm_notes} className="text-sm" style={{ color: '#b9ac90', lineHeight: '1.75' }} />
        </div>
      )}

      {/* ── Bottom run CTA (if can run) ── */}
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
