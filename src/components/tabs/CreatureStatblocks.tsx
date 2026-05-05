import { useState, useRef } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Modal } from '../Modal';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import { getTypeStyle } from '../../lib/theme';
import { MarkdownEditor } from '../ui/MarkdownEditor';
import { EntityLinkToolbar } from '../ui/EntityLinkToolbar';
import { insertAtCursor } from '../../lib/textUtils';
import { StatBlockText } from '../ui/StatBlockText';
import { getAIProvider } from '../../lib/aiProvider';
import type { MonsterStatblock } from '../../lib/database.types';

// --------------- Form type ---------------

type MonsterForm = {
  name: string;
  creature_type: string;
  challenge_rating: string;
  armor_class: string;
  ac_descriptor: string;
  hit_points: string;
  hit_dice: string;
  speed: string;
  str: string;
  dex: string;
  con: string;
  int: string;
  wis: string;
  cha: string;
  saving_throws: string;
  skills: string;
  damage_immunities: string;
  damage_resistances: string;
  condition_immunities: string;
  senses: string;
  languages: string;
  content: string;
  dm_notes: string;
  tags: string;
};

const emptyMonsterForm = (): MonsterForm => ({
  name: '',
  creature_type: 'monstrosity',
  challenge_rating: '',
  armor_class: '',
  ac_descriptor: '',
  hit_points: '',
  hit_dice: '',
  speed: '',
  str: '',
  dex: '',
  con: '',
  int: '',
  wis: '',
  cha: '',
  saving_throws: '',
  skills: '',
  damage_immunities: '',
  damage_resistances: '',
  condition_immunities: '',
  senses: '',
  languages: '',
  content: '',
  dm_notes: '',
  tags: '',
});

// --------------- Helpers ---------------

function abilityMod(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

// Standard 5e CR → proficiency bonus table
function profBonus(cr: string | null): string | null {
  if (!cr) return null;
  const crNum = cr === '1/8' ? 0.125 : cr === '1/4' ? 0.25 : cr === '1/2' ? 0.5 : Number(cr);
  if (Number.isNaN(crNum)) return null;
  if (crNum <= 4) return '+2';
  if (crNum <= 8) return '+3';
  if (crNum <= 12) return '+4';
  if (crNum <= 16) return '+5';
  if (crNum <= 20) return '+6';
  if (crNum <= 24) return '+7';
  if (crNum <= 28) return '+8';
  return '+9';
}

// Shared empty-state predicate used by the StatBlockPanel and view modal.
export function isStatBlockEmpty(m: MonsterStatblock): boolean {
  return !m.content && !m.dm_notes
    && m.armor_class == null && m.hit_points == null && !m.speed
    && m.str == null && m.dex == null && m.con == null
    && m.int == null && m.wis == null && m.cha == null
    && !m.saving_throws && !m.skills
    && !m.damage_resistances && !m.damage_immunities && !m.condition_immunities
    && !m.senses && !m.languages;
}

// --------------- Styles ---------------

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

const ABILITY_KEYS: Array<{ key: keyof MonsterForm; label: string }> = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
];

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
// Structured stat block viewer (shared by view modal and StatBlockPanel)
// ================================================================

export function StatBlockBody({ m }: { m: MonsterStatblock }) {
  const hasAbilityScores = m.str != null || m.dex != null || m.con != null || m.int != null || m.wis != null || m.cha != null;
  const hasDefenses = m.armor_class != null || m.hit_points != null || m.speed;
  const initiative = m.dex != null ? abilityMod(m.dex) : null;
  const proficiency = profBonus(m.challenge_rating);
  const hasTraits =
    initiative || proficiency ||
    m.saving_throws || m.skills || m.damage_resistances || m.damage_immunities || m.condition_immunities || m.senses || m.languages;

  const traitRow = (label: string, value: string | null) =>
    value ? (
      <div key={label} style={{ fontSize: '0.8rem', color: '#e8d5b0', lineHeight: '1.5' }}>
        <span style={{ color: '#c9a84c', fontWeight: 600 }}>{label}: </span>
        {value}
      </div>
    ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* AC / HP / Speed */}
      {hasDefenses && (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {m.armor_class != null && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e8d5b0' }}>{m.armor_class}</div>
              <div style={{ fontSize: '0.65rem', color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                AC{m.ac_descriptor ? ` (${m.ac_descriptor})` : ''}
              </div>
            </div>
          )}
          {m.hit_points != null && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e8d5b0' }}>
                {m.hit_points}{m.hit_dice ? ` (${m.hit_dice})` : ''}
              </div>
              <div style={{ fontSize: '0.65rem', color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>HP</div>
            </div>
          )}
          {m.speed && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e8d5b0' }}>{m.speed}</div>
              <div style={{ fontSize: '0.65rem', color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Speed</div>
            </div>
          )}
        </div>
      )}

      {/* Ability scores */}
      {hasAbilityScores && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px', borderTop: '1px solid #3a3660', borderBottom: '1px solid #3a3660', padding: '8px 0' }}>
          {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map(key => {
            const score = m[key];
            return (
              <div key={key} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                  {key.toUpperCase()}
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e8d5b0' }}>
                  {score ?? '—'}
                </div>
                {score != null && (
                  <div style={{ fontSize: '0.7rem', color: '#9990b0' }}>{abilityMod(score)}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Trait rows */}
      {hasTraits && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {traitRow('Initiative', initiative)}
          {traitRow('Proficiency Bonus', proficiency)}
          {traitRow('Saving Throws', m.saving_throws)}
          {traitRow('Skills', m.skills)}
          {traitRow('Damage Resistances', m.damage_resistances)}
          {traitRow('Damage Immunities', m.damage_immunities)}
          {traitRow('Condition Immunities', m.condition_immunities)}
          {traitRow('Senses', m.senses)}
          {traitRow('Languages', m.languages)}
        </div>
      )}

      {/* Free-form actions / traits */}
      {m.content && (
        <div>
          <div style={sectionLabel}>Actions &amp; Traits</div>
          <StatBlockText
            as="pre"
            text={m.content}
            style={{
              color: '#e8d5b0',
              lineHeight: '1.7',
              fontFamily: 'Georgia, serif',
              fontSize: '0.85rem',
              backgroundColor: '#0f0e17',
              border: '1px solid #3a3660',
              borderRadius: '6px',
              padding: '12px',
              whiteSpace: 'pre-wrap',
              margin: 0,
            }}
          />
        </div>
      )}

      {/* DM Notes */}
      {m.dm_notes && (
        <div>
          <div style={sectionLabel}>DM Notes</div>
          <StatBlockText
            as="p"
            text={m.dm_notes}
            style={{
              color: '#9990b0',
              fontSize: '0.875rem',
              lineHeight: '1.6',
              fontStyle: 'italic',
              margin: 0,
              whiteSpace: 'pre-wrap',
            }}
          />
        </div>
      )}
    </div>
  );
}

// ================================================================
// MAIN COMPONENT
// ================================================================

export default function CreatureStatblocks() {
  const { monsterStatblocks, upsertMonsterStatblock, deleteMonsterStatblock, sessions, lore, locations, overview } = useCampaign();
  const confirm = useConfirm();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MonsterStatblock | null>(null);
  const [form, setForm] = useState<MonsterForm>(emptyMonsterForm());
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const dmNotesRef = useRef<HTMLTextAreaElement>(null);
  const [viewing, setViewing] = useState<MonsterStatblock | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Generate modal state
  const [genModalOpen, setGenModalOpen] = useState(false);
  const [genMode, setGenMode] = useState<'cr' | 'party'>('cr');
  const [genCR, setGenCR] = useState('');
  const [genPartySize, setGenPartySize] = useState('');
  const [genPartyLevel, setGenPartyLevel] = useState('');
  const [genUseCampaignContext, setGenUseCampaignContext] = useState(false);
  const [genAdditionalContext, setGenAdditionalContext] = useState('');
  const [genError, setGenError] = useState('');
  const [genLoading, setGenLoading] = useState(false);

  const field = (key: keyof MonsterForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

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
      armor_class: m.armor_class != null ? String(m.armor_class) : '',
      ac_descriptor: m.ac_descriptor ?? '',
      hit_points: m.hit_points != null ? String(m.hit_points) : '',
      hit_dice: m.hit_dice ?? '',
      speed: m.speed ?? '',
      str: m.str != null ? String(m.str) : '',
      dex: m.dex != null ? String(m.dex) : '',
      con: m.con != null ? String(m.con) : '',
      int: m.int != null ? String(m.int) : '',
      wis: m.wis != null ? String(m.wis) : '',
      cha: m.cha != null ? String(m.cha) : '',
      saving_throws: m.saving_throws ?? '',
      skills: m.skills ?? '',
      damage_immunities: m.damage_immunities ?? '',
      damage_resistances: m.damage_resistances ?? '',
      condition_immunities: m.condition_immunities ?? '',
      senses: m.senses ?? '',
      languages: m.languages ?? '',
      content: m.content ?? '',
      dm_notes: m.dm_notes ?? '',
      tags: m.tags ?? '',
    });
    setModalOpen(true);
  };

  const toIntOrNull = (s: string): number | null => {
    const n = parseInt(s.trim(), 10);
    return isNaN(n) ? null : n;
  };

  const handleSave = async () => {
    await upsertMonsterStatblock({
      ...(editing ? { id: editing.id } : {}),
      name: form.name,
      creature_type: form.creature_type || null,
      challenge_rating: form.challenge_rating || null,
      armor_class: toIntOrNull(form.armor_class),
      ac_descriptor: form.ac_descriptor || null,
      hit_points: toIntOrNull(form.hit_points),
      hit_dice: form.hit_dice || null,
      speed: form.speed || null,
      str: toIntOrNull(form.str),
      dex: toIntOrNull(form.dex),
      con: toIntOrNull(form.con),
      int: toIntOrNull(form.int),
      wis: toIntOrNull(form.wis),
      cha: toIntOrNull(form.cha),
      saving_throws: form.saving_throws || null,
      skills: form.skills || null,
      damage_immunities: form.damage_immunities || null,
      damage_resistances: form.damage_resistances || null,
      condition_immunities: form.condition_immunities || null,
      senses: form.senses || null,
      languages: form.languages || null,
      content: form.content || null,
      dm_notes: form.dm_notes || null,
      tags: form.tags || null,
      sort_order: editing?.sort_order ?? monsterStatblocks.length,
    });
    setModalOpen(false);
  };

  const handleDelete = async (m: MonsterStatblock) => {
    if (await confirm(`Delete "${m.name}"?`)) {
      await deleteMonsterStatblock(m.id);
      if (viewing?.id === m.id) setViewing(null);
    }
  };

  const openGenModal = () => {
    setGenMode('cr');
    setGenCR('');
    setGenPartySize('');
    setGenPartyLevel('');
    setGenUseCampaignContext(false);
    setGenAdditionalContext('');
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

    const campaignContextBlock = genUseCampaignContext
      ? buildCampaignContextBlock({ overview, sessions, lore, locations })
      : '';
    const additionalContextClause = genAdditionalContext.trim()
      ? `\n\nAdditional DM instructions: ${genAdditionalContext.trim()}`
      : '';

    const prompt = `Generate a complete D&D 5e creature stat block for ${difficultyPrompt}. Be creative with the name and flavor. Follow official D&D 5e stat block format exactly.${campaignContextBlock}${additionalContextClause}

Respond with a JSON object using this exact structure (no markdown, just raw JSON):
{
  "name": "...",
  "creature_type": "one of: aberration|beast|celestial|construct|dragon|elemental|fey|fiend|giant|humanoid|monstrosity|ooze|plant|undead|other",
  "challenge_rating": "(the chosen CR as a string, e.g. \\"1/4\\" or \\"5\\")",
  "armor_class": (integer, e.g. 15),
  "ac_descriptor": "(optional string, e.g. \\"natural armor\\" or \\"chain mail\\" — omit if none)",
  "hit_points": (integer, e.g. 45),
  "hit_dice": "(hit dice string, e.g. \\"6d10+12\\")",
  "speed": "(speed string, e.g. \\"30 ft., fly 60 ft.\\")",
  "str": (integer 1-30),
  "dex": (integer 1-30),
  "con": (integer 1-30),
  "int": (integer 1-30),
  "wis": (integer 1-30),
  "cha": (integer 1-30),
  "saving_throws": "(e.g. \\"Dex +4, Con +6, Wis +3\\" — omit if none)",
  "skills": "(e.g. \\"Perception +5, Stealth +4\\" — omit if none)",
  "damage_resistances": "(e.g. \\"bludgeoning, piercing, and slashing from nonmagical attacks\\" — omit if none)",
  "damage_immunities": "(e.g. \\"fire, poison\\" — omit if none)",
  "condition_immunities": "(e.g. \\"charmed, frightened\\" — omit if none)",
  "senses": "(e.g. \\"darkvision 60 ft., passive Perception 15\\")",
  "languages": "(e.g. \\"Common, Draconic\\" — omit if none)",
  "content": "Full actions, bonus actions, reactions, legendary actions, and special traits as plain text. Do NOT repeat AC/HP/speed/ability scores here.",
  "tags": "comma-separated flavor tags (e.g. undead, boss, ranged)",
  "dm_notes": "2-3 sentences of DM tactics and encounter tips"
}`;

    setGenError('');
    setGenLoading(true);
    try {
      const res = await fetch('/api/generate-creature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, provider: getAIProvider() }),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `Server error: ${res.status}`);

      const jsonText = (data.text ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;

      setGenModalOpen(false);
      setEditing(null);
      setForm({
        name: String(parsed.name ?? ''),
        creature_type: String(parsed.creature_type ?? 'monstrosity'),
        challenge_rating: String(parsed.challenge_rating ?? ''),
        armor_class: parsed.armor_class != null ? String(parsed.armor_class) : '',
        ac_descriptor: String(parsed.ac_descriptor ?? ''),
        hit_points: parsed.hit_points != null ? String(parsed.hit_points) : '',
        hit_dice: String(parsed.hit_dice ?? ''),
        speed: String(parsed.speed ?? ''),
        str: parsed.str != null ? String(parsed.str) : '',
        dex: parsed.dex != null ? String(parsed.dex) : '',
        con: parsed.con != null ? String(parsed.con) : '',
        int: parsed.int != null ? String(parsed.int) : '',
        wis: parsed.wis != null ? String(parsed.wis) : '',
        cha: parsed.cha != null ? String(parsed.cha) : '',
        saving_throws: String(parsed.saving_throws ?? ''),
        skills: String(parsed.skills ?? ''),
        damage_immunities: String(parsed.damage_immunities ?? ''),
        damage_resistances: String(parsed.damage_resistances ?? ''),
        condition_immunities: String(parsed.condition_immunities ?? ''),
        senses: String(parsed.senses ?? ''),
        languages: String(parsed.languages ?? ''),
        content: String(parsed.content ?? ''),
        dm_notes: String(parsed.dm_notes ?? ''),
        tags: String(parsed.tags ?? ''),
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

  // Ability score input cell
  const AbilityInput = ({ k, label }: { k: keyof MonsterForm; label: string }) => {
    const val = form[k] as string;
    const score = parseInt(val, 10);
    const mod = !isNaN(score) ? abilityMod(score) : null;
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.65rem', color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
        <input
          type="number"
          min={1}
          max={30}
          value={val}
          onChange={field(k)}
          placeholder="—"
          style={{ ...inputStyle, textAlign: 'center', padding: '4px 2px', width: '100%' }}
        />
        <div style={{ fontSize: '0.65rem', color: '#9990b0', marginTop: '3px', minHeight: '1em' }}>
          {mod ?? ''}
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="min-w-0">
          <h2 className="text-xl font-bold leading-tight" style={{ color: '#c9a84c', fontFamily: 'Georgia, Cambria, serif' }}>
            Stat Sheets
          </h2>
          <p className="text-xs mt-0.5" style={{ color: '#6a6490' }}>{monsterStatblocks.length} stat sheet{monsterStatblocks.length !== 1 ? 's' : ''}</p>
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
          + Add Stat Sheet
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
          No stat sheets yet. Add your first one!
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10" style={{ color: '#6a6490' }}>
          No stat sheets match your filter.
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
                    {m.armor_class != null && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#1a2a1a', color: '#70a0a0' }}>
                        AC {m.armor_class}
                      </span>
                    )}
                    {m.hit_points != null && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#2a1a1a', color: '#e07070' }}>
                        {m.hit_points} HP
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
        title="Generate Stat Sheet"
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
                Enter your party details and the DM Assistant will build a boss stat sheet scaled to challenge them.
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

          {/* Campaign context toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setGenUseCampaignContext(v => !v)}
              disabled={genLoading}
              className="text-xs px-3 py-1.5 rounded font-medium transition-colors"
              style={{
                backgroundColor: genUseCampaignContext ? '#2a2050' : '#1a1828',
                color: genUseCampaignContext ? '#c9a84c' : '#9990b0',
                border: `1px solid ${genUseCampaignContext ? '#5a4090' : '#3a3660'}`,
              }}
            >
              {genUseCampaignContext ? '✦ Campaign Context On' : '○ Include Campaign Context'}
            </button>
          </div>
          {genUseCampaignContext && (
            <p className="text-xs" style={{ color: '#4a4470' }}>
              Will include the last 5 session summaries, lore entries, and locations from your campaign.
            </p>
          )}

          {/* Additional context */}
          <FormField label="Additional Context (optional)">
            <textarea
              rows={3}
              value={genAdditionalContext}
              onChange={e => setGenAdditionalContext(e.target.value)}
              placeholder="e.g. This stat sheet has multiple stages and legendary actions, transforms mid-fight, etc"
              style={textareaStyle}
              disabled={genLoading}
            />
          </FormField>

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
        title={editing ? `Edit: ${editing.name}` : 'New Stat Sheet'}
        onSave={handleSave}
        wide
      >
        {/* Row 1: type / CR / name / tags */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Creature Type">
            <select value={form.creature_type} onChange={field('creature_type')} style={inputStyle}>
              {CREATURE_TYPES.map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Challenge Rating">
            <input type="text" value={form.challenge_rating} onChange={field('challenge_rating')} placeholder="e.g., 1/4, 5, 17" style={inputStyle} />
          </FormField>
        </div>
        <FormField label="Name">
          <input type="text" value={form.name} onChange={field('name')} placeholder="e.g., Cave Troll, Shadow Drake" style={inputStyle} />
        </FormField>
        <FormField label="Tags">
          <input type="text" value={form.tags} onChange={field('tags')} placeholder="Comma-separated: boss, undead, ranged..." style={inputStyle} />
        </FormField>

        {/* Divider */}
        <div style={{ borderTop: '1px solid #3a3660', margin: '4px 0' }} />

        {/* Row: AC / HP / Speed */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <FormField label="Armor Class">
              <input type="number" min={1} max={30} value={form.armor_class} onChange={field('armor_class')} placeholder="e.g. 15" style={inputStyle} />
            </FormField>
            <input
              type="text"
              value={form.ac_descriptor}
              onChange={field('ac_descriptor')}
              placeholder="e.g. natural armor"
              style={{ ...inputStyle, marginTop: '4px', fontSize: '0.75rem' }}
            />
          </div>
          <div>
            <FormField label="Hit Points">
              <input type="number" min={1} value={form.hit_points} onChange={field('hit_points')} placeholder="e.g. 45" style={inputStyle} />
            </FormField>
            <input
              type="text"
              value={form.hit_dice}
              onChange={field('hit_dice')}
              placeholder="e.g. 6d10+12"
              style={{ ...inputStyle, marginTop: '4px', fontSize: '0.75rem' }}
            />
          </div>
          <FormField label="Speed">
            <input type="text" value={form.speed} onChange={field('speed')} placeholder="e.g. 30 ft., fly 60 ft." style={inputStyle} />
          </FormField>
        </div>

        {/* Ability scores */}
        <div>
          <div style={{ ...sectionLabel, marginTop: '4px' }}>Ability Scores</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
            {ABILITY_KEYS.map(({ key, label }) => (
              <AbilityInput key={key} k={key} label={label} />
            ))}
          </div>
        </div>

        {/* Saving throws + skills */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Saving Throws">
            <input type="text" value={form.saving_throws} onChange={field('saving_throws')} placeholder="e.g. Dex +4, Con +6" style={inputStyle} />
          </FormField>
          <FormField label="Skills">
            <input type="text" value={form.skills} onChange={field('skills')} placeholder="e.g. Perception +5, Stealth +4" style={inputStyle} />
          </FormField>
        </div>

        {/* Immunities / resistances */}
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Damage Resistances">
            <input type="text" value={form.damage_resistances} onChange={field('damage_resistances')} placeholder="e.g. fire, cold" style={inputStyle} />
          </FormField>
          <FormField label="Damage Immunities">
            <input type="text" value={form.damage_immunities} onChange={field('damage_immunities')} placeholder="e.g. poison, psychic" style={inputStyle} />
          </FormField>
          <FormField label="Condition Immunities">
            <input type="text" value={form.condition_immunities} onChange={field('condition_immunities')} placeholder="e.g. charmed, frightened" style={inputStyle} />
          </FormField>
        </div>

        {/* Senses + languages */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Senses">
            <input type="text" value={form.senses} onChange={field('senses')} placeholder="e.g. darkvision 60 ft., passive Perception 15" style={inputStyle} />
          </FormField>
          <FormField label="Languages">
            <input type="text" value={form.languages} onChange={field('languages')} placeholder="e.g. Common, Draconic" style={inputStyle} />
          </FormField>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid #3a3660', margin: '4px 0' }} />

        {/* Actions & Traits free-form */}
        <FormField label="Actions & Traits">
          <MarkdownEditor value={form.content} onChange={v => setForm(prev => ({ ...prev, content: v }))} placeholder={`Paste or write actions, bonus actions, reactions, and legendary actions here.\n\nSpecial Traits\nActions\nReactions\nLegendary Actions...`} minHeight="280px" textareaRef={contentRef} />
          <EntityLinkToolbar textareaRef={contentRef} onInsert={markup => setForm(prev => ({ ...prev, content: insertAtCursor(contentRef, prev.content, markup) }))} />
        </FormField>
        <FormField label="DM Notes">
          <MarkdownEditor value={form.dm_notes} onChange={v => setForm(prev => ({ ...prev, dm_notes: v }))} placeholder="Tactics, encounter context, flavor notes..." minHeight="60px" textareaRef={dmNotesRef} />
          <EntityLinkToolbar textareaRef={dmNotesRef} onInsert={markup => setForm(prev => ({ ...prev, dm_notes: insertAtCursor(dmNotesRef, prev.dm_notes, markup) }))} />
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
            <StatBlockBody m={viewing} />
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
