import { useState, useEffect, useCallback } from 'react';
import { SlashField } from './ui/SlashField';
import { Trash2 } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { useConfirm } from '../context/ConfirmContext';
import { useAutoSave } from '../hooks/useAutoSave';
import { Modal } from './Modal';
import { FormField, inputStyle } from './FormField';
import { Button } from './ui/Button';
import { FactionPillSelector } from './ui/FactionPillSelector';
import { SearchableSelect } from './ui/SearchableSelect';
import { ActiveToggle } from './ui/ActiveToggle';
import { SaveStatusIndicator } from './ui/SaveStatusIndicator';
import type { PlayerCharacter } from '../lib/database.types';

type PCFormFull = {
  character_name: string;
  player_name: string | null;
  race: string | null;
  class: string | null;
  background: string | null;
  story_hooks: string | null;
  key_npcs: string | null;
  dm_notes: string | null;
  is_active: boolean;
  faction_ids: string[];
  statblock_id: string | null;
};

const emptyForm = (): PCFormFull => ({
  character_name: '',
  player_name: '',
  race: '',
  class: '',
  background: '',
  story_hooks: '',
  key_npcs: '',
  dm_notes: '',
  is_active: true,
  faction_ids: [],
  statblock_id: null,
});

function pcToForm(pc: PlayerCharacter): PCFormFull {
  return {
    character_name: pc.character_name,
    player_name: pc.player_name,
    race: pc.race,
    class: pc.class,
    background: pc.background,
    story_hooks: pc.story_hooks,
    key_npcs: pc.key_npcs,
    dm_notes: pc.dm_notes,
    is_active: pc.is_active,
    faction_ids: pc.faction_ids ?? [],
    statblock_id: pc.statblock_id ?? null,
  };
}

interface PCEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  pcId: string | null; // null = create mode
}

export function PCEditModal({ isOpen, onClose, pcId }: PCEditModalProps) {
  const { pcs, upsertPC, deletePC, factions, monsterStatblocks } = useCampaign();
  const confirm = useConfirm();
  const isEdit = pcId !== null;
  const pc = isEdit ? pcs.find(p => p.id === pcId) : null;

  const [form, setForm] = useState<PCFormFull>(emptyForm());
  const [creating, setCreating] = useState(false);

  // Textarea refs for entity link toolbars

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen) {
      setForm(pc ? pcToForm(pc) : emptyForm());
    }
  }, [isOpen, pc]);

  // Auto-save (edit mode only)
  const handleAutoSave = useCallback(async (data: PCFormFull) => {
    if (!pcId) return;
    await upsertPC({ id: pcId, ...data });
  }, [pcId, upsertPC]);

  const { status, saveNow, error } = useAutoSave({
    data: form,
    onSave: handleAutoSave,
    enabled: isEdit && isOpen,
    delay: 2000,
  });

  const handleBeforeClose = useCallback(async () => {
    if (isEdit && status === 'unsaved') {
      await saveNow();
    }
  }, [isEdit, status, saveNow]);

  const handleCreate = async () => {
    setCreating(true);
    await upsertPC({ ...form });
    setCreating(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!pcId) return;
    if (await confirm('Delete this character? This cannot be undone.')) {
      await deletePC(pcId);
      onClose();
    }
  };

  const update = <K extends keyof PCFormFull>(key: K, value: PCFormFull[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const statblockOptions = monsterStatblocks.map(m => ({
    id: m.id,
    label: m.name,
  }));

  const title = isEdit
    ? (form.character_name || 'Edit Character')
    : 'New Player Character';

  const footer = isEdit ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Button variant="danger" size="sm" onClick={handleDelete}>
        <Trash2 size={14} /> Delete
      </Button>
      <div style={{ flex: 1 }}>
        <SaveStatusIndicator status={status} onRetry={saveNow} />
        {error && <span style={{ color: 'var(--red)', fontSize: 11, marginLeft: 8 }}>{error}</span>}
      </div>
      <Button variant="secondary" onClick={saveNow} disabled={status === 'saved' || status === 'idle' || status === 'saving'}>
        Save Now
      </Button>
      <Button variant="primary" onClick={onClose}>Close</Button>
    </div>
  ) : (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button variant="primary" onClick={handleCreate} disabled={creating || !form.character_name.trim()}>
        {creating ? 'Creating...' : 'Create Character'}
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="xl"
      footer={footer}
      onBeforeClose={handleBeforeClose}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left column — Identity */}
        <div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Character Name">
              <input
                type="text"
                value={form.character_name}
                onChange={e => update('character_name', e.target.value)}
                placeholder="e.g., Thorin Ironforge"
                autoFocus
                style={inputStyle}
              />
            </FormField>
            <FormField label="Player Name">
              <input
                type="text"
                value={form.player_name ?? ''}
                onChange={e => update('player_name', e.target.value)}
                placeholder="e.g., John"
                style={inputStyle}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Race">
              <input
                type="text"
                value={form.race ?? ''}
                onChange={e => update('race', e.target.value)}
                placeholder="e.g., Dwarf"
                style={inputStyle}
              />
            </FormField>
            <FormField label="Class">
              <input
                type="text"
                value={form.class ?? ''}
                onChange={e => update('class', e.target.value)}
                placeholder="e.g., Fighter"
                style={inputStyle}
              />
            </FormField>
          </div>

          <FormField label="Status">
            <ActiveToggle
              isActive={form.is_active}
              onChange={v => update('is_active', v)}
            />
          </FormField>

          <FormField label="Factions">
            <FactionPillSelector
              selectedIds={form.faction_ids}
              onChange={ids => update('faction_ids', ids)}
              factions={factions}
            />
          </FormField>

          <FormField label="Linked Stat Sheet">
            <SearchableSelect
              value={form.statblock_id}
              onChange={id => update('statblock_id', id)}
              options={statblockOptions}
              placeholder="Select stat sheet..."
              searchPlaceholder="Search stat sheets..."
            />
          </FormField>
        </div>

        {/* Right column — Details */}
        <div>
          <FormField label="Background">
            <SlashField
              value={form.background ?? ''}
              onChange={v => update('background', v)}
              placeholder="Character background and history..."
              minHeight="100px"
            />
          </FormField>

          <FormField label="Story Hooks">
            <SlashField
              value={form.story_hooks ?? ''}
              onChange={v => update('story_hooks', v)}
              placeholder="Personal quests, unresolved story threads, motivations..."
              minHeight="80px"
            />
          </FormField>

          <FormField label="Key NPCs">
            <SlashField
              value={form.key_npcs ?? ''}
              onChange={v => update('key_npcs', v)}
              placeholder="Relationships with NPCs, other PCs, factions..."
              minHeight="80px"
            />
          </FormField>

          <FormField label={
            <>
              DM Notes{' '}
              <span style={{
                fontSize: 9,
                padding: '1px 5px',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--red-bg)',
                color: 'var(--red)',
                border: '1px solid var(--red-line)',
                verticalAlign: 'middle',
                marginLeft: 4,
                fontWeight: 600,
                letterSpacing: '0.05em',
              }}>
                DM ONLY
              </span>
            </>
          }>
            <SlashField
              value={form.dm_notes ?? ''}
              onChange={v => update('dm_notes', v)}
              placeholder="Private notes, secrets, plans..."
              minHeight="80px"
            />
          </FormField>
        </div>
      </div>
    </Modal>
  );
}
