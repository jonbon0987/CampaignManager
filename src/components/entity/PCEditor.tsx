// The player character editor: a campaign's own, on the same pattern as the
// NPC, faction, place and lore editors.

import { useState } from 'react';
import { TitleInput } from '../ui/TitleInput';
import { useConfirm } from '../../context/ConfirmContext';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useDiscardBlankDraft } from '../../hooks/useDiscardBlankDraft';
import { limitFor, maxFor, minFor } from '../../lib/fieldLimits';
import { OverflowMenu } from '../ui/OverflowMenu';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import { SlashField } from '../ui/SlashField';
import { FactionPillSelector } from '../ui/FactionPillSelector';
import { SearchableSelect } from '../ui/SearchableSelect';
import { SessionHistory } from '../session/SessionHistory';
import { SessionUpdateBand } from '../session/SessionUpdateBand';
import { ImageSlot } from '../ui/ImageSlot';
import { useOptionalSections } from './useOptionalSections';
import { AddSections } from './AddSections';
import { LinkList, WasText } from './LinkPicker';
import { PCInventory } from '../items/ItemPlaces';
import { xpProgress } from '../../lib/levelling';
import type { Faction, Levelling, NPC, PlayerCharacter } from '../../lib/database.types';

export type PCFields = Pick<PlayerCharacter,
  'character_name' | 'player_name' | 'race' | 'class' | 'background' | 'story_hooks' | 'key_npcs' | 'key_npc_ids'
  | 'dm_notes' | 'is_active' | 'faction_ids' | 'statblock_id' | 'level' | 'max_hp' | 'armor_class' | 'portrait_path'
  | 'sheet_url' | 'passive_perception' | 'passive_insight' | 'passive_investigation' | 'spell_save_dc' | 'xp'>;

const toFields = (pc: PlayerCharacter): PCFields => ({
  character_name: pc.character_name, player_name: pc.player_name, race: pc.race, class: pc.class,
  background: pc.background, story_hooks: pc.story_hooks, key_npcs: pc.key_npcs, key_npc_ids: pc.key_npc_ids ?? [],
  dm_notes: pc.dm_notes, is_active: pc.is_active, faction_ids: pc.faction_ids ?? [], statblock_id: pc.statblock_id,
  level: pc.level, max_hp: pc.max_hp, armor_class: pc.armor_class, portrait_path: pc.portrait_path ?? null,
  sheet_url: pc.sheet_url ?? null, passive_perception: pc.passive_perception ?? null, passive_insight: pc.passive_insight ?? null,
  passive_investigation: pc.passive_investigation ?? null, spell_save_dc: pc.spell_save_dc ?? null, xp: pc.xp ?? null,
});

const isEmpty = (v: string | null | undefined) => !v?.trim();

type Optional = 'hooks' | 'notes' | 'statblock';
const OPTIONAL_LABEL: Record<Optional, string> = { hooks: 'Story hooks', notes: 'DM notes', statblock: 'Stat sheet' };

export function PCEditor({ pc, factions, npcs, statblocks, save, remove, onDeleted, onOpenNPC, levelling }: {
  pc: PlayerCharacter;
  /** How the campaign levels; XP shows when it's by experience (or already has a value). */
  levelling?: Levelling | null;
  factions: Faction[];
  /** NPCs in the campaign, who can matter to this character. */
  npcs: Pick<NPC, 'id' | 'name' | 'role'>[];
  statblocks: { id: string; name: string }[];
  save: (fields: PCFields) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  onDeleted?: () => void;
  onOpenNPC?: (id: string) => void;
}) {
  const confirm = useConfirm();
  const [form, setForm] = useState<PCFields>(() => toFields(pc));
  const { status, saveNow } = useAutoSave({ data: form, onSave: async data => { await save(data); }, delay: 800 });

  useDiscardBlankDraft(pc.id, isEmpty(form.character_name) && isEmpty(form.player_name) && isEmpty(form.race) && isEmpty(form.class)
    && isEmpty(form.background) && isEmpty(form.story_hooks) && isEmpty(form.key_npcs) && form.key_npc_ids.length === 0
    && isEmpty(form.dm_notes), remove);

  const sections = useOptionalSections<Optional>({
    hooks: !isEmpty(form.story_hooks),
    notes: !isEmpty(form.dm_notes),
    statblock: !!form.statblock_id,
  });

  const set = <K extends keyof PCFields>(key: K, val: PCFields[K]) => setForm(f => ({ ...f, [key]: val }));
  const sheetHref = form.sheet_url && /^https?:\/\//i.test(form.sheet_url) ? form.sheet_url : null;
  const xpNote = xpProgress(form.xp, form.level);

  const handleDelete = async () => {
    if (await confirm({ title: 'Delete this character?', message: 'You can undo this from its toast or Recently deleted.', confirmLabel: 'Delete', danger: true })) {
      await remove(pc.id);
      onDeleted?.();
    }
  };

  return (
    <div className="cm-detail">
      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        <OverflowMenu items={[{ label: 'Delete character', danger: true, onClick: handleDelete }]} />
      </div>

      <SessionUpdateBand entityType="pc" entityId={pc.id} />

      <div className="ent-head">
        <div className="ent-head-text">
          <div className="cm-eyebrow">Player character</div>
          <TitleInput value={form.character_name} onChange={e => set('character_name', e.target.value)} placeholder="Character name…" maxLength={limitFor('player_characters', 'character_name')} aria-label="Name" />
          <input className="as-sub" value={form.player_name ?? ''} onChange={e => set('player_name', e.target.value || null)} placeholder="Player name…" maxLength={limitFor('player_characters', 'player_name')} aria-label="Player" />
        </div>
        <ImageSlot path={form.portrait_path} onChange={p => set('portrait_path', p)} label="Portrait" />
      </div>

      <div className="as-meta">
        <div className="as-mi">
          <span className="as-ml">In the party</span>
          {/* eslint-disable-next-line no-restricted-syntax -- an on/off toggle, styled .as-tog */}
          <button type="button" className={`as-tog${form.is_active ? ' is-on' : ''}`} onClick={() => set('is_active', !form.is_active)}>
            {form.is_active ? 'Active' : 'Inactive'}
          </button>
        </div>
      </div>

      <div className="as-grid-2">
        <div className="as-fl">
          <label className="as-ll" htmlFor={`pc-race-${pc.id}`}>Race</label>
          <input id={`pc-race-${pc.id}`} className="as-input" value={form.race ?? ''} onChange={e => set('race', e.target.value || null)} placeholder="e.g. Dwarf" maxLength={limitFor('player_characters', 'race')} />
        </div>
        <div className="as-fl">
          <label className="as-ll" htmlFor={`pc-class-${pc.id}`}>Class</label>
          <input id={`pc-class-${pc.id}`} className="as-input" value={form.class ?? ''} onChange={e => set('class', e.target.value || null)} placeholder="e.g. Fighter" maxLength={limitFor('player_characters', 'class')} />
        </div>
      </div>

      {/* Combat numbers: they fill in the initiative tracker and rate encounters */}
      <div className="as-grid-3">
        {([
          ['level', 'Level', 'e.g. 5'],
          ['max_hp', 'Max HP', 'e.g. 38'],
          ['armor_class', 'AC', 'e.g. 16'],
        ] as const).map(([key, label, hint]) => (
          <div key={key} className="as-fl">
            <label className="as-ll" htmlFor={`pc-${key}-${pc.id}`}>{label}</label>
            <input id={`pc-${key}-${pc.id}`} className="as-input" type="number" inputMode="numeric"
              min={minFor('player_characters', key)} max={maxFor('player_characters', key)}
              value={form[key] ?? ''} onChange={e => set(key, e.target.value ? parseInt(e.target.value, 10) : null)} placeholder={hint} />
          </div>
        ))}
      </div>

      {/* Read off the player's own sheet: the party strip in Play shows these */}
      <div className="as-fl">
        <label className="as-ll" htmlFor={`pc-sheet-${pc.id}`}>Character sheet</label>
        <div className="pc-sheet-row">
          <input id={`pc-sheet-${pc.id}`} className="as-input" type="url" inputMode="url" value={form.sheet_url ?? ''}
            onChange={e => set('sheet_url', e.target.value.trim() || null)}
            placeholder="https://www.dndbeyond.com/characters/…" maxLength={limitFor('player_characters', 'sheet_url')} />
          {sheetHref && <a className="pc-sheet-open" href={sheetHref} target="_blank" rel="noreferrer noopener">Open ↗</a>}
        </div>
        {form.sheet_url && !sheetHref && <span className="as-hint">Starts with https://, as copied from the browser.</span>}
      </div>

      <div className="as-grid-4">
        {([
          ['passive_perception', 'Passive Perception'],
          ['passive_insight', 'Passive Insight'],
          ['passive_investigation', 'Passive Investigation'],
          ['spell_save_dc', 'Spell save DC'],
        ] as const).map(([key, label]) => (
          <div key={key} className="as-fl">
            <label className="as-ll" htmlFor={`pc-${key}-${pc.id}`}>{label}</label>
            <input id={`pc-${key}-${pc.id}`} className="as-input" type="number" inputMode="numeric"
              min={minFor('player_characters', key)} max={maxFor('player_characters', key)}
              value={form[key] ?? ''} onChange={e => set(key, e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="—" />
          </div>
        ))}
      </div>

      {(levelling === 'xp' || form.xp != null) && (
        <div className="as-fl pc-xp">
          <label className="as-ll" htmlFor={`pc-xp-${pc.id}`}>Experience</label>
          <div className="pc-sheet-row">
            <input id={`pc-xp-${pc.id}`} className="as-input" type="number" inputMode="numeric" style={{ maxWidth: 140 }}
              min={minFor('player_characters', 'xp')} max={maxFor('player_characters', 'xp')}
              value={form.xp ?? ''} onChange={e => set('xp', e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="0" />
            {xpNote && <span className="as-hint">{xpNote}</span>}
          </div>
        </div>
      )}

      <div className="as-fl">
        <label className="as-ll">Background</label>
        <SlashField value={form.background ?? ''} onChange={v => set('background', v || null)} placeholder="Character background and history…" minHeight="120px" maxLength={limitFor('player_characters', 'background')} />
      </div>

      <div className="as-fl">
        <span className="as-ll">Key NPCs</span>
        <LinkList ids={form.key_npc_ids} glyph="❦" addLabel="+ Add an NPC" empty="No NPCs linked."
          options={npcs.filter(n => n.name).map(n => ({ id: n.id, label: n.name, detail: n.role ?? undefined }))}
          onChange={ids => set('key_npc_ids', ids)} onOpen={onOpenNPC} />
        <WasText text={form.key_npcs} onClear={() => set('key_npcs', null)} />
      </div>

      <div className="as-fl">
        <label className="as-ll">Factions</label>
        <FactionPillSelector selectedIds={form.faction_ids} onChange={ids => set('faction_ids', ids)} factions={factions} />
      </div>

      <PCInventory pcId={pc.id} />

      {sections.shown('hooks') && (
        <div className="as-fl">
          <label className="as-ll">Story hooks</label>
          <SlashField value={form.story_hooks ?? ''} onChange={v => set('story_hooks', v || null)} placeholder="Personal quests, motivations…" minHeight="96px" maxLength={limitFor('player_characters', 'story_hooks')} />
        </div>
      )}

      {sections.shown('notes') && (
        <div className="as-fl">
          <label className="as-ll">DM notes</label>
          <SlashField value={form.dm_notes ?? ''} onChange={v => set('dm_notes', v || null)} placeholder="Private notes, secrets, plans…" minHeight="96px" maxLength={limitFor('player_characters', 'dm_notes')} />
        </div>
      )}

      {sections.shown('statblock') && (
        <div className="as-fl">
          <label className="as-ll">Stat sheet</label>
          <SearchableSelect value={form.statblock_id} onChange={id => set('statblock_id', id)}
            options={statblocks.map(m => ({ id: m.id, label: m.name }))} placeholder="Select stat sheet…" searchPlaceholder="Search stat sheets…" />
        </div>
      )}

      <AddSections hidden={sections.hidden} labels={OPTIONAL_LABEL} onAdd={sections.add} />

      <div className="as-fl">
        <label className="as-ll">Session history</label>
        <SessionHistory entityType="pc" entityId={pc.id} />
      </div>
    </div>
  );
}
