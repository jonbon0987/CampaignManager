// An item's page: what it is, what the players know of it, what only the DM
// knows, and who has it.

import { useState } from 'react';
import { TitleInput } from '../ui/TitleInput';
import { useConfirm } from '../../context/ConfirmContext';
import { useItems } from '../../context/items';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useDiscardBlankDraft } from '../../hooks/useDiscardBlankDraft';
import { limitFor } from '../../lib/fieldLimits';
import { ITEM_TYPES, RARITIES } from '../../lib/items';
import { OverflowMenu } from '../ui/OverflowMenu';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import { SlashField } from '../ui/SlashField';
import { ImageSlot } from '../ui/ImageSlot';
import { GiveItem } from '../items/GiveItem';
import { HoldingList } from '../items/HoldingList';
import { useOptionalSections } from './useOptionalSections';
import { AddSections } from './AddSections';
import type { Item } from '../../lib/database.types';

export type ItemFields = Pick<Item, 'name' | 'item_type' | 'rarity' | 'attunement' | 'attunement_note' | 'value' | 'description' | 'dm_notes' | 'image_path'>;

const toFields = (i: Item): ItemFields => ({
  name: i.name, item_type: i.item_type, rarity: i.rarity, attunement: i.attunement, attunement_note: i.attunement_note,
  value: i.value, description: i.description, dm_notes: i.dm_notes, image_path: i.image_path,
});

const isEmpty = (v: string | null | undefined) => !v?.trim();

type Optional = 'notes';
const OPTIONAL_LABEL: Record<Optional, string> = { notes: 'DM notes' };

export function ItemEditor({ item, save, remove, onDeleted }: {
  item: Item;
  save: (fields: ItemFields) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  onDeleted?: () => void;
}) {
  const confirm = useConfirm();
  const ctx = useItems();
  const [form, setForm] = useState<ItemFields>(() => toFields(item));
  const { status, saveNow } = useAutoSave({ data: form, onSave: async data => { await save(data); }, delay: 800 });
  useDiscardBlankDraft(item.id, isEmpty(form.name) && isEmpty(form.description) && isEmpty(form.dm_notes) && !form.image_path, remove);
  const sections = useOptionalSections<Optional>({ notes: !isEmpty(form.dm_notes) });

  const set = <K extends keyof ItemFields>(key: K, val: ItemFields[K]) => setForm(f => ({ ...f, [key]: val }));
  const holdings = ctx?.holdings.filter(h => h.item_id === item.id) ?? [];

  const handleDelete = async () => {
    const message = holdings.length > 0
      ? 'Whoever has it loses it too. You can undo this from its toast or Recently deleted.'
      : 'You can undo this from its toast or Recently deleted.';
    if (await confirm({ title: 'Delete this item?', message, confirmLabel: 'Delete', danger: true })) {
      await remove(item.id);
      onDeleted?.();
    }
  };

  return (
    <div className="cm-detail">
      <div className="as-bar">
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        <div className="as-spacer" />
        <OverflowMenu items={[{ label: 'Delete item', danger: true, onClick: handleDelete }]} />
      </div>

      <div className="ent-head">
        <div className="ent-head-text">
          <div className="cm-eyebrow">Item</div>
          <TitleInput value={form.name} onChange={e => set('name', e.target.value)} placeholder="Item name…"
            maxLength={limitFor('items', 'name')} aria-label="Name" />
          <input className="as-sub" value={form.value ?? ''} onChange={e => set('value', e.target.value || null)} placeholder="Worth… (e.g. 50 gp)"
            maxLength={limitFor('items', 'value')} aria-label="Value" />
        </div>
        <ImageSlot path={form.image_path} onChange={p => set('image_path', p)} label="Picture" />
      </div>

      <div className="as-meta">
        <div className="as-mi">
          <label className="as-ml" htmlFor={`item-type-${item.id}`}>Type</label>
          <select id={`item-type-${item.id}`} className="as-select" value={form.item_type ?? ''} onChange={e => set('item_type', e.target.value || null)}>
            <option value="">—</option>
            {ITEM_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div className="as-mi">
          <label className="as-ml" htmlFor={`item-rarity-${item.id}`}>Rarity</label>
          <select id={`item-rarity-${item.id}`} className="as-select" value={form.rarity ?? ''} onChange={e => set('rarity', e.target.value || null)}>
            <option value="">Not magic</option>
            {RARITIES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <div className="as-mi">
          <span className="as-ml">Attunement</span>
          <div className="as-pills">
            {/* eslint-disable-next-line no-restricted-syntax -- an on/off option, styled with its pill group */}
            <button type="button" className={`as-pill-opt${form.attunement ? ' is-active' : ''}`} onClick={() => set('attunement', !form.attunement)}>
              {form.attunement ? 'Required' : 'Not needed'}
            </button>
          </div>
          {form.attunement && (
            <input className="as-input item-attune-note" value={form.attunement_note ?? ''} onChange={e => set('attunement_note', e.target.value || null)}
              placeholder="by a wizard…" maxLength={limitFor('items', 'attunement_note')} aria-label="Attunement by" />
          )}
        </div>
      </div>

      <div className="as-fl">
        <label className="as-ll">Description</label>
        <SlashField value={form.description ?? ''} onChange={v => set('description', v || null)}
          placeholder="What it looks like and what it does, as the players learn it…" minHeight="140px" maxLength={limitFor('items', 'description')} />
      </div>

      {sections.shown('notes') && (
        <div className="as-fl">
          <label className="as-ll">DM notes</label>
          <SlashField value={form.dm_notes ?? ''} onChange={v => set('dm_notes', v || null)}
            placeholder="Curses, hidden properties, where it came from…" minHeight="96px" maxLength={limitFor('items', 'dm_notes')} />
        </div>
      )}

      <AddSections hidden={sections.hidden} labels={OPTIONAL_LABEL} onAdd={sections.add} />

      {ctx && (
        <div className="as-fl">
          <span className="as-ll">Who has it</span>
          <HoldingList holdings={holdings} showHolder empty="No one has it yet." />
          <GiveItem itemId={item.id} label="Give" />
        </div>
      )}
    </div>
  );
}
