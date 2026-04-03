import { useState } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import type { MonsterStatblock } from '../../lib/database.types';

// --------------- Form type ---------------

type MonsterForm = {
  name: string;
  creature_type: string;
  challenge_rating: string;
  content: string;
  dm_notes: string;
  tags: string;
};

const emptyMonsterForm = (): MonsterForm => ({
  name: '',
  creature_type: 'monstrosity',
  challenge_rating: '',
  content: '',
  dm_notes: '',
  tags: '',
});

// --------------- Styles ---------------

const creatureTypeColors: Record<string, { bg: string; text: string; border: string }> = {
  beast:        { bg: '#1a2a1a', text: '#6ab87a', border: '#2a5a2a' },
  undead:       { bg: '#2a1a3a', text: '#9060c0', border: '#5a2a7a' },
  humanoid:     { bg: '#1a2a3a', text: '#70a0e0', border: '#2a4a7a' },
  dragon:       { bg: '#3a1a1a', text: '#e07040', border: '#7a3a2a' },
  fiend:        { bg: '#3a1010', text: '#e04040', border: '#7a2020' },
  celestial:    { bg: '#2a2a1a', text: '#d0c060', border: '#6a6020' },
  construct:    { bg: '#2a2a2a', text: '#a0a0a0', border: '#505050' },
  elemental:    { bg: '#1a3a3a', text: '#60c0c0', border: '#2a6a6a' },
  fey:          { bg: '#2a1a3a', text: '#c060d0', border: '#6a2a7a' },
  giant:        { bg: '#3a2a1a', text: '#c09060', border: '#7a5a2a' },
  monstrosity:  { bg: '#3a1a1a', text: '#e07070', border: '#7a2a2a' },
  ooze:         { bg: '#1a2a1a', text: '#60c070', border: '#2a5a2a' },
  plant:        { bg: '#1a2a1a', text: '#50b050', border: '#2a5a2a' },
  aberration:   { bg: '#1a1a3a', text: '#7070e0', border: '#2a2a7a' },
  other:        { bg: '#1a1a1a', text: '#808080', border: '#404040' },
};

const getTypeStyle = (t: string | null) =>
  creatureTypeColors[t ?? 'other'] ?? creatureTypeColors['other'];

const sectionLabel = {
  color: '#c9a84c',
  fontSize: '0.7rem',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  marginBottom: '0.4rem',
};

const CREATURE_TYPES = [
  'aberration', 'beast', 'celestial', 'construct', 'dragon',
  'elemental', 'fey', 'fiend', 'giant', 'humanoid',
  'monstrosity', 'ooze', 'plant', 'undead', 'other',
];

// All valid D&D 5e challenge ratings
const VALID_CRS = new Set([
  '0', '1/8', '1/4', '1/2',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
]);

// ================================================================
// MAIN COMPONENT
// ================================================================

export default function CreatureStatblocks() {
  const { monsterStatblocks, upsertMonsterStatblock, deleteMonsterStatblock } = useCampaign();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MonsterStatblock | null>(null);
  const [form, setForm] = useState<MonsterForm>(emptyMonsterForm());
  const [viewing, setViewing] = useState<MonsterStatblock | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Generate modal state
  const [genModalOpen, setGenModalOpen] = useState(false);
  const [genMode, setGenMode] = useState<'cr' | 'party'>('cr');
  const [genCR, setGenCR] = useState('');
  const [genPartySize, setGenPartySize] = useState('');
  const [genPartyLevel, setGenPartyLevel] = useState('');
  const [genError, setGenError] = useState('');
  const [genLoading, setGenLoading] = useState(false);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyMonsterForm());
    setModalOpen(true);
  };

  const openEdit = (m: MonsterStatblock) => {
    setEditing(m);
    setForm({
      name: m.name,
      creature_type: m.creature_type ?? 'monstrosity',
      challenge_rating: m.challenge_rating ?? '',
      content: m.content ?? '',
      dm_notes: m.dm_notes ?? '',
      tags: m.tags ?? '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    await upsertMonsterStatblock({
      ...(editing ? { id: editing.id } : {}),
      name: form.name,
      creature_type: form.creature_type || null,
      challenge_rating: form.challenge_rating || null,
      content: form.content || null,
      dm_notes: form.dm_notes || null,
      tags: form.tags || null,
      sort_order: editing?.sort_order ?? monsterStatblocks.length,
    });
    setModalOpen(false);
  };

  const handleDelete = async (m: MonsterStatblock) => {
    if (confirm(`Delete "${m.name}"?`)) {
      await deleteMonsterStatblock(m.id);
      if (viewing?.id === m.id) setViewing(null);
    }
  };

  const openGenModal = () => {
    setGenMode('cr');
    setGenCR('');
    setGenPartySize('');
    setGenPartyLevel('');
    setGenError('');
    setGenModalOpen(true);
  };

  const handleGenerate = async () => {
    let difficultyPrompt: string;

    if (genMode === 'cr') {
      const cr = genCR.trim();
      if (cr && !VALID_CRS.has(cr)) {
        setGenError(`"${cr}" is not a valid D&D 5e Challenge Rating. Valid values: 0, 1/8, 1/4, 1/2, 1–30.`);
        return;
      }
      difficultyPrompt = cr
        ? `CR ${cr}`
        : `a random challenge rating of your choosing (pick something interesting and varied)`;
    } else {
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
      difficultyPrompt = `a difficulty appropriate for a party of ${size} players at average level ${level}. Use the D&D 5e encounter building guidelines to determine an appropriate CR for a hard or deadly solo boss fight against this party, then build the creature at that CR. The creature should feel like a memorable BBEG — give it legendary actions, legendary resistances if appropriate, and interesting abilities`;
    }

    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
    if (!apiKey) {
      setGenError('VITE_ANTHROPIC_API_KEY is not set in your .env file.');
      return;
    }

    setGenError('');
    setGenLoading(true);
    try {
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `Generate a complete D&D 5e creature stat block for ${difficultyPrompt}. Be creative with the name and flavor. Follow official D&D 5e stat block format exactly.

Respond with a JSON object using this exact structure (no markdown, just raw JSON):
{
  "name": "...",
  "creature_type": "one of: aberration|beast|celestial|construct|dragon|elemental|fey|fiend|giant|humanoid|monstrosity|ooze|plant|undead|other",
  "challenge_rating": "(the chosen CR as a string, e.g. \\"1/4\\" or \\"5\\")",
  "tags": "comma-separated flavor tags (e.g. undead, boss, ranged)",
  "content": "full stat block as plain text, formatted like an official D&D 5e stat block with all sections",
  "dm_notes": "2-3 sentences of DM tactics and encounter tips"
}`,
        }],
      });

      const raw = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as Anthropic.TextBlock).text)
        .join('');

      // Strip markdown code fences if present
      const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(jsonText) as {
        name: string;
        creature_type: string;
        challenge_rating: string;
        tags: string;
        content: string;
        dm_notes: string;
      };

      setGenModalOpen(false);
      setEditing(null);
      setForm({
        name: parsed.name ?? '',
        creature_type: parsed.creature_type ?? 'monstrosity',
        challenge_rating: parsed.challenge_rating ?? '',
        content: parsed.content ?? '',
        dm_notes: parsed.dm_notes ?? '',
        tags: parsed.tags ?? '',
      });
      setModalOpen(true);
    } catch (err) {
      setGenError(`Generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setGenLoading(false);
    }
  };

  // Filtering
  const filtered = monsterStatblocks.filter(m => {
    const typeMatch = filterType === 'all' || m.creature_type === filterType;
    const searchLower = search.toLowerCase();
    const searchMatch = !search
      || m.name.toLowerCase().includes(searchLower)
      || (m.tags ?? '').toLowerCase().includes(searchLower)
      || (m.challenge_rating ?? '').toLowerCase().includes(searchLower);
    return typeMatch && searchMatch;
  });

  const usedTypes = Array.from(new Set(monsterStatblocks.map(m => m.creature_type ?? 'other'))).sort();

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="min-w-0">
          <h2 className="text-xl font-bold leading-tight" style={{ color: '#c9a84c', fontFamily: 'Georgia, Cambria, serif' }}>
            Creature Stat Sheets
          </h2>
          <p className="text-xs mt-0.5" style={{ color: '#6a6490' }}>{monsterStatblocks.length} creature{monsterStatblocks.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex-1" />
        <button
          onClick={openGenModal}
          className="px-3 py-1.5 rounded text-sm font-medium transition-colors"
          style={{ backgroundColor: '#2a1a3a', color: '#c060d0', border: '1px solid #5a2a7a' }}
        >
          ✦ Generate
        </button>
        <button
          onClick={openAdd}
          className="inline-flex items-center justify-center gap-1.5 rounded border font-medium transition-colors duration-150 px-3 py-1.5 text-sm"
          style={{ backgroundColor: '#c9a84c', color: '#0f0e17', borderColor: '#c9a84c', fontFamily: 'Georgia, Cambria, serif' }}
        >
          + Add Creature
        </button>
      </div>

      {/* Filter bar */}
      {monsterStatblocks.length > 0 && (
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <input
            type="text"
            placeholder="Search by name, tag, or CR..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-0 px-3 py-1.5 rounded text-sm outline-none"
            style={{ backgroundColor: '#1a1830', color: '#e8d5b0', border: '1px solid #3a3660', minWidth: '180px' }}
          />
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setFilterType('all')}
              className="text-xs px-2.5 py-1 rounded border"
              style={{
                backgroundColor: filterType === 'all' ? '#2a2050' : '#1a1828',
                color: filterType === 'all' ? '#c9a84c' : '#9990b0',
                borderColor: filterType === 'all' ? '#5a4a90' : '#3a3660',
              }}
            >
              All
            </button>
            {usedTypes.map(t => {
              const ts = getTypeStyle(t);
              const active = filterType === t;
              return (
                <button
                  key={t}
                  onClick={() => setFilterType(active ? 'all' : t)}
                  className="text-xs px-2.5 py-1 rounded border capitalize"
                  style={{
                    backgroundColor: active ? ts.bg : '#1a1828',
                    color: active ? ts.text : '#9990b0',
                    borderColor: active ? ts.border : '#3a3660',
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* List */}
      {monsterStatblocks.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#6a6490' }}>
          No creature stat sheets yet. Add your first creature!
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10" style={{ color: '#6a6490' }}>
          No creatures match your filter.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(m => {
            const ts = getTypeStyle(m.creature_type);
            return (
              <div
                key={m.id}
                className="rounded-lg border p-4 flex items-center gap-4"
                style={{ backgroundColor: '#1a1828', borderColor: '#3a3660' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className="text-xs px-2 py-0.5 rounded border capitalize shrink-0"
                      style={{ backgroundColor: ts.bg, color: ts.text, borderColor: ts.border }}
                    >
                      {m.creature_type ?? 'other'}
                    </span>
                    <span className="font-semibold text-sm" style={{ color: '#e8d5b0', fontFamily: 'Georgia, serif' }}>
                      {m.name}
                    </span>
                    {m.challenge_rating && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#2a1a1a', color: '#c08060' }}>
                        CR {m.challenge_rating}
                      </span>
                    )}
                  </div>
                  {m.tags && (
                    <p className="text-xs" style={{ color: '#6a6490' }}>{m.tags}</p>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setViewing(m)}
                    className="text-xs px-2.5 py-1 rounded"
                    style={{ backgroundColor: '#1a1a3a', color: '#6090e0', border: '1px solid #3a3a7a' }}
                  >
                    View
                  </button>
                  <button
                    onClick={() => openEdit(m)}
                    className="text-xs px-2.5 py-1 rounded"
                    style={{ backgroundColor: '#22203a', color: '#9990b0', border: '1px solid #3a3660' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(m)}
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
          GENERATE MODAL
      ================================================================ */}
      <Modal
        isOpen={genModalOpen}
        onClose={() => { if (!genLoading) setGenModalOpen(false); }}
        title="Generate Creature Stat Sheet"
        onSave={genLoading ? undefined : handleGenerate}
        saveLabel="Generate"
      >
        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded overflow-hidden" style={{ border: '1px solid #3a3660' }}>
            {(['cr', 'party'] as const).map(mode => (
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
                {mode === 'cr' ? 'By Challenge Rating' : 'By Party'}
              </button>
            ))}
          </div>

          {genMode === 'cr' ? (
            <>
              <p className="text-sm" style={{ color: '#9990b0', lineHeight: '1.6' }}>
                Optionally enter a CR, or leave blank for a random difficulty.
              </p>
              <FormField label="Challenge Rating (optional)">
                <input
                  type="text"
                  value={genCR}
                  onChange={e => { setGenCR(e.target.value); setGenError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleGenerate(); } }}
                  placeholder="Leave blank for random, or e.g. 1/4, 5, 17"
                  style={inputStyle}
                  autoFocus
                  disabled={genLoading}
                />
              </FormField>
              <div className="text-xs" style={{ color: '#4a4470' }}>
                Valid CRs: 0, 1/8, 1/4, 1/2, 1–30
              </div>
            </>
          ) : (
            <>
              <p className="text-sm" style={{ color: '#9990b0', lineHeight: '1.6' }}>
                Enter your party details and the DM Assistant will build a boss creature scaled to challenge them.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Number of Players">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={genPartySize}
                    onChange={e => { setGenPartySize(e.target.value); setGenError(''); }}
                    placeholder="e.g. 4"
                    style={inputStyle}
                    autoFocus
                    disabled={genLoading}
                  />
                </FormField>
                <FormField label="Average Party Level">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={genPartyLevel}
                    onChange={e => { setGenPartyLevel(e.target.value); setGenError(''); }}
                    placeholder="e.g. 5"
                    style={inputStyle}
                    disabled={genLoading}
                  />
                </FormField>
              </div>
            </>
          )}

          {genError && (
            <p className="text-sm" style={{ color: '#e05c5c' }}>{genError}</p>
          )}
          {genLoading && (
            <p className="text-sm" style={{ color: '#9990b0', fontStyle: 'italic' }}>
              Generating stat block…
            </p>
          )}
        </div>
      </Modal>

      {/* ================================================================
          ADD / EDIT MODAL
      ================================================================ */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit: ${editing.name}` : 'New Creature Stat Sheet'}
        onSave={handleSave}
        wide
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Creature Type">
            <select
              value={form.creature_type}
              onChange={e => setForm(prev => ({ ...prev, creature_type: e.target.value }))}
              style={inputStyle}
            >
              {CREATURE_TYPES.map(t => (
                <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Challenge Rating">
            <input
              type="text"
              value={form.challenge_rating}
              onChange={e => setForm(prev => ({ ...prev, challenge_rating: e.target.value }))}
              placeholder="e.g., 1/4, 5, 17"
              style={inputStyle}
            />
          </FormField>
        </div>
        <FormField label="Name">
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g., Cave Troll, Shadow Drake"
            style={inputStyle}
          />
        </FormField>
        <FormField label="Tags">
          <input
            type="text"
            value={form.tags}
            onChange={e => setForm(prev => ({ ...prev, tags: e.target.value }))}
            placeholder="Comma-separated: boss, undead, ranged..."
            style={inputStyle}
          />
        </FormField>
        <FormField label="Stat Block">
          <textarea
            value={form.content}
            onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))}
            placeholder={`Paste or write the full stat block here.\n\nAC, HP, Speed\nSTR / DEX / CON / INT / WIS / CHA\nSaving Throws, Skills, Resistances\nActions, Reactions, Legendary Actions...`}
            style={{ ...textareaStyle, minHeight: '360px', fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: '1.6' }}
          />
        </FormField>
        <FormField label="DM Notes">
          <textarea
            value={form.dm_notes}
            onChange={e => setForm(prev => ({ ...prev, dm_notes: e.target.value }))}
            placeholder="Tactics, encounter context, flavor notes..."
            style={{ ...textareaStyle, minHeight: '60px' }}
          />
        </FormField>
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
            <div className="flex items-center gap-2 flex-wrap">
              {(() => {
                const ts = getTypeStyle(viewing.creature_type);
                return (
                  <span
                    className="text-xs px-2 py-0.5 rounded border capitalize"
                    style={{ backgroundColor: ts.bg, color: ts.text, borderColor: ts.border }}
                  >
                    {viewing.creature_type ?? 'other'}
                  </span>
                );
              })()}
              {viewing.challenge_rating && (
                <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: '#2a1a1a', color: '#c08060', border: '1px solid #5a3a2a' }}>
                  CR {viewing.challenge_rating}
                </span>
              )}
              {viewing.tags && (
                <span className="text-xs" style={{ color: '#6a6490' }}>{viewing.tags}</span>
              )}
            </div>
            {viewing.content && (
              <div>
                <div style={sectionLabel}>Stat Block</div>
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
                  {viewing.content}
                </pre>
              </div>
            )}
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
    </div>
  );
}
