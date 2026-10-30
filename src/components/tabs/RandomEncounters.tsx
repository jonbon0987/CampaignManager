import { useState, useCallback, useEffect } from 'react';
import { useStatBlockPanel } from '../../context/StatBlockPanelContext';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { InitiativeTracker } from '../InitiativeTracker';
import { ListDetail, ListRow, EmptyDetail, Pill } from '../ui/ListDetail';
import type { PartyMember } from '../../lib/combat';
import {
  RandomEncounterDetail,
  type RandomEncounterSaveData,
} from '../ui/RandomEncounterDetail';
import { GenerateRandomTableModal } from '../ui/GenerateRandomTableModal';
import { type EncounterSaveData } from '../ui/EncounterDetail';
import {
  RANDOM_TABLE_KINDS,
  kindMeta,
  parseEntries,
  defaultRandomEntry,
} from '../../lib/randomEncounter';
import type { RandomEncounterTable, Encounter } from '../../lib/database.types';

// Campaign-level random tables — master/detail. Tables come in five kinds
// (Encounter / Treasure / Magic Item / Wild Magic / Custom); each is a weighted
// die (d4–d100). Tables can be authored here or imported from the world.
export default function RandomEncounters({ onImportFromWorld }: { onImportFromWorld?: () => void }) {
  const {
    randomEncounterTables, upsertRandomEncounterTable, deleteRandomEncounterTable,
    monsterStatblocks, pcs, upsertEncounter,
  } = useCampaign();
  const confirm = useConfirm();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const { openStatBlock } = useStatBlockPanel();
  const [runningEncounter, setRunningEncounter] = useState<Encounter | null>(null);
  const [genTableOpen, setGenTableOpen] = useState(false);

  const activePCs = pcs.filter(p => p.is_active);
  // The active party, with the HP and AC set on each PC in Cast.
  const partyMembers: PartyMember[] = activePCs.map(p => ({ name: p.character_name, maxHp: p.max_hp, ac: p.armor_class }));
  // Party size + average level auto-fill from active PCs (the DM can still
  // override both in the roll bar). PCs without a level set are ignored.
  const leveledPCs = activePCs.filter(p => typeof p.level === 'number' && p.level > 0);
  const party = {
    size: activePCs.length || 4,
    level: leveledPCs.length
      ? Math.max(1, Math.round(leveledPCs.reduce((s, p) => s + (p.level as number), 0) / leveledPCs.length))
      : 5,
  };

  const campaignUpsert = useCallback(
    (data: RandomEncounterSaveData): Promise<RandomEncounterTable> =>
      upsertRandomEncounterTable({ ...data, world_id: null }),
    [upsertRandomEncounterTable],
  );

  const saveEncounter = useCallback(
    (data: EncounterSaveData): Promise<Encounter> => upsertEncounter({ ...data, world_id: null }),
    [upsertEncounter],
  );
  const runEncounter = useCallback(async (data: EncounterSaveData) => {
    const enc = await saveEncounter(data);
    setRunningEncounter(enc);
  }, [saveEncounter]);

  const handleAdd = async (kind: string) => {
    const t = await upsertRandomEncounterTable({
      kind,
      name: '',
      subtitle: null,
      environment: null,
      die_size: 100,
      description: null,
      entries: JSON.stringify([defaultRandomEntry()]),
      dm_notes: null,
      sort_order: randomEncounterTables.length,
      world_id: null,
    });
    setSelectedId(t.id);
  };

  const handleDelete = async (t: RandomEncounterTable) => {
    const label = t.name.trim() || 'this table';
    if (await confirm(`Delete "${label}"?`)) {
      await deleteRandomEncounterTable(t.id);
      if (selectedId === t.id) setSelectedId(null);
    }
  };

  const filtered = randomEncounterTables.filter(t => {
    if (kindFilter !== 'all' && (t.kind || 'encounter') !== kindFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return t.name.toLowerCase().includes(s)
      || (t.subtitle ?? '').toLowerCase().includes(s)
      || (t.environment ?? '').toLowerCase().includes(s);
  });

  const selected = selectedId ? (randomEncounterTables.find(t => t.id === selectedId) ?? null) : null;

  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  return (
    <>
      <ListDetail
        title="Random tables"
        count={randomEncounterTables.length}
        search={search}
        onSearchChange={setSearch}
        addLabel="+ Add table"
        addOptions={RANDOM_TABLE_KINDS.map(k => ({ label: `${k.glyph} ${k.label}`, onClick: () => void handleAdd(k.key) }))}
        onGenerate={() => setGenTableOpen(true)}
        onImport={onImportFromWorld}
        filters={[{ key: 'all', label: 'All' }, ...RANDOM_TABLE_KINDS].map(k => (
          <Pill key={k.key} active={kindFilter === k.key} onClick={() => setKindFilter(k.key)}>{k.label}</Pill>
        ))}
        list={filtered.length === 0
          ? <div className="cm-empty is-inline">{randomEncounterTables.length === 0 ? 'No tables yet. Add one, or generate one.' : 'No tables match.'}</div>
          : filtered.map(t => {
            const m = kindMeta(t.kind);
            const rows = parseEntries(t.entries).length;
            return (
              <ListRow key={t.id} active={selected?.id === t.id} onClick={() => setSelectedId(t.id)} glyph={m.glyph}
                title={t.name || 'Untitled table'} subtitle={`${m.label} · ${rows} ${rows === 1 ? 'entry' : 'entries'}`} />
            );
          })}
        detail={selected ? (
          <div className="cm-detail">
            <RandomEncounterDetail
              key={selected.id}
              table={selected}
              scope="campaign"
              onDelete={() => handleDelete(selected)}
              upsertTable={campaignUpsert}
              statblocks={monsterStatblocks}
              party={party}
              onViewStatblock={sb => openStatBlock(sb.id)}
              onSaveEncounter={saveEncounter}
              onRunEncounter={runEncounter}
            />
          </div>
        ) : (
          <EmptyDetail>Select a table, or add one.</EmptyDetail>
        )}
      />

      {/* Whole-table generator */}
      <GenerateRandomTableModal
        isOpen={genTableOpen}
        onClose={() => setGenTableOpen(false)}
        defaultKind={kindFilter !== 'all' ? kindFilter : 'encounter'}
        onCreated={t => { setGenTableOpen(false); setKindFilter('all'); setSelectedId(t.id); }}
      />


      {/* Initiative tracker */}
      {runningEncounter && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
          <InitiativeTracker
            encounter={runningEncounter}
            statblocks={monsterStatblocks}
            party={partyMembers}
            onClose={() => setRunningEncounter(null)}
          />
        </div>
      )}
    </>
  );
}
