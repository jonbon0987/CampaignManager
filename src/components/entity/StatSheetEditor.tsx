// The one stat sheet editor, used in the world's bestiary and in its
// campaigns. It saves as you type, like the other entity editors; reading a
// sheet at the table happens in the rail (StatBlockPanel).

import { useState } from 'react';
import { useConfirm } from '../../context/ConfirmContext';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useDiscardBlankDraft } from '../../hooks/useDiscardBlankDraft';
import { getAIProvider } from '../../lib/aiProvider';
import { authHeaders } from '../../lib/apiClient';
import { limitFor, maxFor } from '../../lib/fieldLimits';
import {
  buildCompletionPrompt, formFromStatblock, mergeMissing, parsedToMonsterForm, statblockFieldsFromForm, type StatSheetFields,
} from '../../lib/statblockCompletion';
import { Button } from '../ui/Button';
import { OverflowMenu } from '../ui/OverflowMenu';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import { SlashField } from '../ui/SlashField';
import { ABILITY_KEYS, AbilityInput, CREATURE_TYPES, type MonsterForm } from '../tabs/CreatureStatblocks';
import type { EntityScope } from './types';
import type { MonsterStatblock } from '../../lib/database.types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function StatSheetEditor({ statblock, scope, save, remove, onDeleted, onView }: {
  statblock: MonsterStatblock;
  scope: EntityScope;
  save: (fields: StatSheetFields) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  onDeleted?: () => void;
  /** Read the sheet in the rail. */
  onView?: () => void;
}) {
  const confirm = useConfirm();
  const [form, setForm] = useState<MonsterForm>(() => formFromStatblock(statblock));
  const { status, saveNow } = useAutoSave({ data: form, onSave: async data => { await save(statblockFieldsFromForm(data)); }, delay: 800 });
  useDiscardBlankDraft(statblock.id, !form.name.trim() && !form.content.trim(), remove);

  // "Fill in missing details" rewrites the rich-text fields, which read their
  // value only on mount; the nonce remounts them.
  const [fillNonce, setFillNonce] = useState(0);
  const [filling, setFilling] = useState(false);
  const [fillError, setFillError] = useState('');

  const set = (key: keyof MonsterForm, value: string) => setForm(f => ({ ...f, [key]: value }));
  const field = (key: keyof MonsterForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set(key, e.target.value);

  const fillMissing = async () => {
    setFillError('');
    setFilling(true);
    try {
      const res = await fetch('/api/generate-creature', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ prompt: buildCompletionPrompt(form), provider: getAIProvider() }),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `Server error: ${res.status}`);
      const jsonText = (data.text ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      setForm(prev => mergeMissing(prev, parsedToMonsterForm(JSON.parse(jsonText) as Record<string, unknown>)));
      setFillNonce(n => n + 1);
    } catch (err) {
      setFillError(`Couldn't fill in the sheet: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setFilling(false);
    }
  };

  const handleDelete = async () => {
    if (await confirm({ title: 'Delete this stat sheet?', message: 'Encounters and NPCs that use it will lose it. This cannot be undone.', confirmLabel: 'Delete', danger: true })) {
      await remove(statblock.id);
      onDeleted?.();
    }
  };

  const text = (key: keyof MonsterForm, label: string, hint: string) => (
    <div className="as-fl">
      <label className="as-ll" htmlFor={`sb-${key}-${statblock.id}`}>{label}</label>
      <input id={`sb-${key}-${statblock.id}`} className="as-input" value={form[key]} onChange={field(key)} placeholder={hint}
        maxLength={limitFor('monster_statblocks', key)} />
    </div>
  );

  return (
    <div className="cm-detail">
      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        {onView && <Button variant="secondary" size="sm" onClick={() => void saveNow().then(onView)}>View sheet</Button>}
        <Button variant="secondary" size="sm" onClick={() => void fillMissing()} disabled={filling}
          title="Let the assistant complete the empty fields, keeping what you've entered"
          style={{ color: 'var(--arcane)', background: 'var(--arcane-bg)', borderColor: 'var(--arcane-line)' }}>
          {filling ? 'Filling in…' : '✦ Fill in missing details'}
        </Button>
        <OverflowMenu items={[{ label: 'Delete stat sheet', danger: true, onClick: handleDelete }]} />
      </div>
      {fillError && <p className="as-empty-note" style={{ color: 'var(--red)' }}>{fillError}</p>}

      <div className="cm-eyebrow">{scope === 'world' ? 'World stat sheet' : 'Stat sheet'}</div>

      <input className="as-title" value={form.name} onChange={field('name')} placeholder="Creature name…" maxLength={limitFor('monster_statblocks', 'name')} aria-label="Name" />

      <div className="as-meta">
        <div className="as-mi">
          <label className="as-ml" htmlFor={`sb-type-${statblock.id}`}>Type</label>
          <select id={`sb-type-${statblock.id}`} className="as-select" value={form.creature_type} onChange={field('creature_type')}>
            {CREATURE_TYPES.map(t => <option key={t} value={t}>{cap(t)}</option>)}
          </select>
        </div>
        <div className="as-mi">
          <label className="as-ml" htmlFor={`sb-cr-${statblock.id}`}>CR</label>
          <input id={`sb-cr-${statblock.id}`} className="as-input" value={form.challenge_rating} onChange={field('challenge_rating')}
            placeholder="e.g. 1/4" maxLength={limitFor('monster_statblocks', 'challenge_rating')} style={{ width: 72 }} />
        </div>
      </div>

      {text('tags', 'Tags', 'Comma-separated: boss, undead, ranged…')}

      <div className="as-grid-3">
        <div className="as-fl">
          <label className="as-ll" htmlFor={`sb-ac-${statblock.id}`}>Armor class</label>
          <input id={`sb-ac-${statblock.id}`} className="as-input" type="number" inputMode="numeric" min={1} max={30} value={form.armor_class} onChange={field('armor_class')} placeholder="e.g. 15" />
          <input className="as-input" value={form.ac_descriptor} onChange={field('ac_descriptor')} placeholder="e.g. natural armor" maxLength={limitFor('monster_statblocks', 'ac_descriptor')} aria-label="Armor" />
        </div>
        <div className="as-fl">
          <label className="as-ll" htmlFor={`sb-hp-${statblock.id}`}>Hit points</label>
          <input id={`sb-hp-${statblock.id}`} className="as-input" type="number" inputMode="numeric" min={1} max={maxFor('monster_statblocks', 'hit_points')} value={form.hit_points} onChange={field('hit_points')} placeholder="e.g. 45" />
          <input className="as-input" value={form.hit_dice} onChange={field('hit_dice')} placeholder="e.g. 6d10+12" maxLength={limitFor('monster_statblocks', 'hit_dice')} aria-label="Hit dice" />
        </div>
        {text('speed', 'Speed', 'e.g. 30 ft., fly 60 ft.')}
      </div>

      <div className="as-fl">
        <span className="as-ll">Ability scores</span>
        <div className="sb-abilities">
          {ABILITY_KEYS.map(({ key, label }) => <AbilityInput key={key} label={label} value={form[key]} onChange={field(key)} />)}
        </div>
      </div>

      <div className="as-grid-2">
        {text('saving_throws', 'Saving throws', 'e.g. Dex +4, Con +6')}
        {text('skills', 'Skills', 'e.g. Perception +5, Stealth +4')}
      </div>
      <div className="as-grid-3">
        {text('damage_resistances', 'Resistances', 'e.g. fire, cold')}
        {text('damage_immunities', 'Immunities', 'e.g. poison')}
        {text('condition_immunities', 'Condition immunities', 'e.g. charmed')}
      </div>
      <div className="as-grid-2">
        {text('senses', 'Senses', 'e.g. darkvision 60 ft., passive Perception 15')}
        {text('languages', 'Languages', 'e.g. Common, Draconic')}
      </div>

      <div className="as-fl">
        <label className="as-ll">Actions & traits</label>
        <SlashField key={`content-${fillNonce}`} value={form.content} onChange={v => set('content', v)} minHeight="240px"
          placeholder={'Special traits, actions, bonus actions, reactions and legendary actions.'} maxLength={limitFor('monster_statblocks', 'content')} />
      </div>
      <div className="as-fl">
        <label className="as-ll">DM notes</label>
        <SlashField key={`dmnotes-${fillNonce}`} value={form.dm_notes} onChange={v => set('dm_notes', v)} minHeight="80px"
          placeholder="Tactics, encounter context, flavour…" maxLength={limitFor('monster_statblocks', 'dm_notes')} />
      </div>
    </div>
  );
}
