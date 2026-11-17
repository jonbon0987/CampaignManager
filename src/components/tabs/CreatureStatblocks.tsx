import { useEffect, useState } from 'react';
import { useStatBlockPanel } from '../../context/StatBlockPanelContext';
import { useCampaign } from '../../context/CampaignContext';
import { useReportRecord } from '../../context/NavigationContext';
import { Modal } from '../Modal';
import { FormField } from '../FormField';
import { inputStyle, textareaStyle } from '../formStyles';
import { StatBlockText } from '../ui/StatBlockText';
import { RollableText } from '../ui/RollableText';
import { getAIProvider } from '../../lib/aiProvider';
import { authHeaders } from '../../lib/apiClient';
import { buildSelectedContextBlock } from '../../lib/campaignContext';
import { EntityContextPicker } from '../ui/EntityContextPicker';
import { useSelectedContextEntities, type ContextRef } from '../../hooks/useSelectedContextEntities';
import { parsedToMonsterForm, statblockFieldsFromForm } from '../../lib/statblockCompletion';
import { markDraft } from '../../hooks/useDiscardBlankDraft';
import { ListDetail, ListRow, EmptyDetail, Pill } from '../ui/ListDetail';
import { StatSheetEditor } from '../entity/StatSheetEditor';
import { SrdLibrary } from '../srd/SrdLibrary';
import { srdToStatblock, type SrdEdition, type SrdMonster } from '../../lib/srd';
import type { MonsterStatblock } from '../../lib/database.types';
import { SegmentedControl } from '../ui/SegmentedControl';
import { abilityModLabel } from '../../lib/statblocks';
import { emptyMonsterForm } from '../../lib/statblocks';
import { CHALLENGE_RATINGS } from '../../lib/statblocks';


// --------------- Helpers ---------------


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


// --------------- Styles ---------------

const sectionLabel = {
  color: 'var(--gold)',
  fontSize: 'var(--fs-label)',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  marginBottom: '0.4rem',
};


const VALID_CRS = new Set(CHALLENGE_RATINGS);


// Ability score input cell. Module-scoped so its identity is stable across
// renders — defining it inside the editor remounted the <input> on every
// keystroke, which dropped focus after each character.
export function AbilityInput({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}) {
  const score = parseInt(value, 10);
  const mod = !isNaN(score) ? abilityModLabel(score) : null;
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
      <input
        type="number"
        min={1}
        max={30}
        value={value}
        onChange={onChange}
        placeholder="—"
        style={{ ...inputStyle, textAlign: 'center', padding: '4px 2px', width: '100%' }}
      />
      <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink-2)', marginTop: '3px', minHeight: '1em' }}>
        {mod ?? ''}
      </div>
    </div>
  );
}

// ================================================================
// Structured stat block viewer (shared by view modal and StatBlockPanel)
// ================================================================

export function StatBlockBody({ m }: { m: MonsterStatblock }) {
  const hasAbilityScores = m.str != null || m.dex != null || m.con != null || m.int != null || m.wis != null || m.cha != null;
  const hasDefenses = m.armor_class != null || m.hit_points != null || m.speed;
  const initiative = m.dex != null ? abilityModLabel(m.dex) : null;
  const proficiency = profBonus(m.challenge_rating);
  const hasTraits =
    initiative || proficiency ||
    m.saving_throws || m.skills || m.damage_resistances || m.damage_immunities || m.condition_immunities || m.senses || m.languages;

  const traitRow = (label: string, value: string | null, rollable?: 'checks') =>
    value ? (
      <div key={label} style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink)', lineHeight: '1.5' }}>
        <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{label}: </span>
        {rollable ? <RollableText text={value} checks source={m.name} /> : value}
      </div>
    ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* AC / HP / Speed */}
      {hasDefenses && (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {m.armor_class != null && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--ink)' }}>{m.armor_class}</div>
              <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                AC{m.ac_descriptor ? ` (${m.ac_descriptor})` : ''}
              </div>
            </div>
          )}
          {m.hit_points != null && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--ink)' }}>
                {m.hit_points}{m.hit_dice ? ` (${m.hit_dice})` : ''}
              </div>
              <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>HP</div>
            </div>
          )}
          {m.speed && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--ink)' }}>{m.speed}</div>
              <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Speed</div>
            </div>
          )}
        </div>
      )}

      {/* Ability scores */}
      {hasAbilityScores && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', padding: '8px 0' }}>
          {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map(key => {
            const score = m[key];
            return (
              <div key={key} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                  {key.toUpperCase()}
                </div>
                <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: 'var(--ink)' }}>
                  {score ?? '—'}
                </div>
                {score != null && (
                  <div style={{ fontSize: 'var(--fs-label)', color: 'var(--ink-2)' }}>
                    <RollableText text={`${key[0].toUpperCase()}${key.slice(1)} ${abilityModLabel(score)}`} checks source={m.name} />
                  </div>
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
          {traitRow('Saving Throws', m.saving_throws, 'checks')}
          {traitRow('Skills', m.skills, 'checks')}
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
            rollableFor={m.name}
            style={{
              color: 'var(--ink)',
              lineHeight: '1.7',
              fontFamily: 'var(--display)',
              fontSize: 'var(--fs-md)',
              backgroundColor: 'var(--bg)',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius)',
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
              color: 'var(--ink-2)',
              fontSize: 'var(--fs-md)',
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

export default function CreatureStatblocks({ onImportFromWorld, openId, onOpenConsumed }: { onImportFromWorld?: () => void; openId?: string | null; onOpenConsumed?: () => void }) {
  const { monsterStatblocks, upsertMonsterStatblock, deleteMonsterStatblock, overview, selectedCampaign } = useCampaign();
  const [srdOpen, setSrdOpen] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useReportRecord('combat', selectedId);
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState('');
  const { openStatBlock, activeStatBlockId, closeStatBlock } = useStatBlockPanel();

  // Open the stat sheet requested from outside the tab (search).
  useEffect(() => {
    if (!openId) return;
    if (monsterStatblocks.some(x => x.id === openId)) { setSelectedId(openId); setSearch(''); setFilterType('all'); }
    onOpenConsumed?.();
  }, [openId, monsterStatblocks, onOpenConsumed]);

  // Generate modal state
  const [genModalOpen, setGenModalOpen] = useState(false);
  const [genMode, setGenMode] = useState<'cr' | 'party'>('cr');
  const [genCR, setGenCR] = useState('');
  const [genPartySize, setGenPartySize] = useState('');
  const [genPartyLevel, setGenPartyLevel] = useState('');
  const [genContext, setGenContext] = useState<ContextRef[]>([]);
  const [genAdditionalContext, setGenAdditionalContext] = useState('');
  const genContextEntities = useSelectedContextEntities(genContext);
  const [genError, setGenError] = useState('');
  const [genLoading, setGenLoading] = useState(false);

  // A new sheet is a draft until it has a name; its page opens straight away.
  const handleAdd = async () => {
    const m = await upsertMonsterStatblock({ ...statblockFieldsFromForm(emptyMonsterForm()), sort_order: monsterStatblocks.length, world_id: null });
    markDraft(m.id);
    setFilterType('all');
    setSearch('');
    setSelectedId(m.id);
  };

  // A copy of an SRD creature, which is the DM's to change from then on.
  const addFromSrd = async (m: SrdMonster, edition: SrdEdition) => {
    const sb = await upsertMonsterStatblock({ ...srdToStatblock(m, edition), sort_order: monsterStatblocks.length });
    setFilterType('all');
    setSearch('');
    setSelectedId(sb.id);
  };
  const haveSheet = (name: string) => monsterStatblocks.some(s => s.name.trim().toLowerCase() === name.toLowerCase())
    ? `You already have a stat sheet called ${name}; this adds another.` : null;

  const removeSheet = async (id: string) => {
    await deleteMonsterStatblock(id);
    if (activeStatBlockId === id) closeStatBlock();
  };

  const openGenModal = () => {
    setGenMode('cr');
    setGenCR('');
    setGenPartySize('');
    setGenPartyLevel('');
    setGenContext([]);
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

    const campaignContextBlock = buildSelectedContextBlock(genContextEntities, {
      title: overview.title,
      plotSummary: overview.plotSummary,
    });
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
        headers: await authHeaders(),
        body: JSON.stringify({ prompt, provider: getAIProvider() }),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `Server error: ${res.status}`);

      const jsonText = (data.text ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;

      const m = await upsertMonsterStatblock({ ...statblockFieldsFromForm(parsedToMonsterForm(parsed)), sort_order: monsterStatblocks.length, world_id: null });
      setGenModalOpen(false);
      setFilterType('all');
      setSearch('');
      setSelectedId(m.id);
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

  const selected = monsterStatblocks.find(m => m.id === selectedId) ?? filtered[0] ?? null;

  return (
    <>
      <ListDetail
        title="Stat sheets"
        count={monsterStatblocks.length}
        search={search}
        onSearchChange={setSearch}
        addLabel="+ Add"
        addOptions={[
          { label: 'Blank stat sheet', onClick: () => void handleAdd() },
          { label: 'From the SRD library…', onClick: () => setSrdOpen(true) },
        ]}
        empty={monsterStatblocks.length === 0 ? {
          glyph: '◆', text: 'No stat sheets yet. Copy a creature from the SRD library, write your own, or generate one.',
          actionLabel: 'Browse the SRD library', onAction: () => setSrdOpen(true),
        } : null}
        onGenerate={openGenModal}
        onImport={onImportFromWorld}
        filters={monsterStatblocks.length > 0 && (
          <>
            <Pill active={filterType === 'all'} onClick={() => setFilterType('all')}>All</Pill>
            {usedTypes.map(t => <Pill key={t} active={filterType === t} onClick={() => setFilterType(filterType === t ? 'all' : t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</Pill>)}
          </>
        )}
        list={filtered.length === 0
          ? <div className="cm-empty is-inline">No stat sheets match.</div>
          : filtered.map(m => (
            <ListRow key={m.id} active={selected?.id === m.id} onClick={() => setSelectedId(m.id)} glyph="◆"
              title={m.name || 'Unnamed creature'}
              subtitle={[m.creature_type ?? 'other', m.challenge_rating && `CR ${m.challenge_rating}`, m.hit_points != null && `${m.hit_points} HP`].filter(Boolean).join(' · ')} />
          ))}
        detail={selected ? (
          <StatSheetEditor
            key={selected.id}
            statblock={selected}
            scope="campaign"
            save={fields => upsertMonsterStatblock({ id: selected.id, ...fields, sort_order: selected.sort_order, world_id: selected.world_id })}
            remove={removeSheet}
            onDeleted={() => setSelectedId(null)}
            onView={() => openStatBlock(selected.id)}
          />
        ) : (
          <EmptyDetail noun="stat sheet" />
        )}
      />

      <SrdLibrary kind="monsters" open={srdOpen} onClose={() => setSrdOpen(false)}
        edition={selectedCampaign?.rules_edition ?? '2014'} addLabel="Add to stat sheets" note={haveSheet} onAdd={addFromSrd} />

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
          <SegmentedControl look="tray" size="md" fill aria-label="Generate from" value={genMode} disabled={genLoading}
            options={[{ value: 'cr', label: 'By Challenge Rating' }, { value: 'party', label: 'By Party' }]}
            onChange={mode => { setGenMode(mode); setGenError(''); }} />

          {genMode === 'cr' ? (
            <>
              <p className="text-md" style={{ color: 'var(--ink-2)', lineHeight: '1.6' }}>
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
              <div className="text-xs" style={{ color: 'var(--ink-3)' }}>
                Valid CRs: 0, 1/8, 1/4, 1/2, 1–30
              </div>
            </>
          ) : (
            <>
              <p className="text-md" style={{ color: 'var(--ink-2)', lineHeight: '1.6' }}>
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

          {/* Campaign context — pick the specific entities the AI should weave in */}
          <div>
            <EntityContextPicker
              selected={genContext}
              onChange={setGenContext}
              disabled={genLoading}
            />
            <p className="text-xs mt-1.5" style={{ color: 'var(--ink-3)' }}>
              Add specific NPCs, threads, locations, factions, or lore so the stat sheet feels native to your campaign.
            </p>
          </div>

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
            <p className="text-md" style={{ color: 'var(--red)' }}>{genError}</p>
          )}
          {genLoading && (
            <p className="text-md" style={{ color: 'var(--ink-2)', fontStyle: 'italic' }}>
              Generating stat block…
            </p>
          )}
        </div>
      </Modal>

    </>
  );
}
