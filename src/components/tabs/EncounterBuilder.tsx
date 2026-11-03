import { useState, useCallback, useEffect, useMemo } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useStatBlockPanel } from '../../context/StatBlockPanelContext';
import { useConfirm } from '../../context/ConfirmContext';
import { usePlay } from '../../context/PlayContext';
import { InitiativeTracker } from '../InitiativeTracker';
import type { PartyMember } from '../../lib/combat';
import { GenerateEncounterModal } from '../ui/GenerateEncounterModal';
import { ListDetail, ListRow, EmptyDetail } from '../ui/ListDetail';
import type { Encounter } from '../../lib/database.types';
import {
  EncounterDetail,
  difficultyColors,
  statusColors,
  parseCombatants,
  type EncounterSaveData,
} from '../ui/EncounterDetail';
import { isUnratable, partyLevels, rateEncounter, RATING_LABEL, type PartyLevel, type Rating } from '../../lib/encounterScaling';

// ================================================================
// Main component
// ================================================================

export default function EncounterBuilder({ openId, onOpenConsumed }: { openId?: string | null; onOpenConsumed?: () => void } = {}) {
  const { encounters, upsertEncounter, deleteEncounter, monsterStatblocks, pcs, selectedCampaign } = useCampaign();
  // The campaign's rules rate its encounters (unset reads as 2014).
  const edition = selectedCampaign?.rules_edition ?? '2014';
  // While a session is live, Run hands the fight to Play's Initiative instead.
  const play = usePlay();
  const confirm = useConfirm();

  // Selected encounter in master-detail
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Search
  const [search, setSearch] = useState('');

  // Select an encounter requested from outside the tab (search).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (openId) { setSelectedId(openId); setSearch(''); onOpenConsumed?.(); }
  }, [openId, onOpenConsumed]);

  // AI encounter generator
  const [genOpen, setGenOpen] = useState(false);

  // Initiative tracker
  const [runningEncounter, setRunningEncounter] = useState<Encounter | null>(null);

  // Creature sheet viewer
  const { openStatBlock } = useStatBlockPanel();

  // Active PC names for initiative tracker
  // The active party, with the HP and AC set on each PC in Cast.
  const party = useMemo<PartyMember[]>(
    () => pcs.filter(p => p.is_active).map(p => ({ name: p.character_name, maxHp: p.max_hp, ac: p.armor_class })),
    [pcs],
  );
  // ...and their levels, which rate each encounter.
  const partyByLevel = useMemo<PartyLevel[]>(
    () => pcs.filter(p => p.is_active).map(p => ({ name: p.character_name, level: p.level })),
    [pcs],
  );
  // The worked-out tier; a stored one only while the creatures can't say, and
  // never when none of them has a CR (that's a leftover default, not a rating).
  const tierOf = (enc: Encounter) => {
    const foes = parseCombatants(enc.combatants).map(c => ({ cr: c.challenge_rating, count: c.count }));
    const rated = rateEncounter(foes, partyLevels(partyByLevel, String(enc.party_size ?? ''), String(enc.party_level ?? '')), edition);
    return rated?.tier ?? (isUnratable(foes) ? null : enc.difficulty);
  };

  // Adapter so the shared EncounterDetail can call the campaign upsert
  const campaignUpsert = useCallback(
    (data: EncounterSaveData): Promise<Encounter> =>
      upsertEncounter({ ...data, world_id: null }),
    [upsertEncounter],
  );

  // ---- helpers ----

  const handleAdd = async () => {
    const e = await upsertEncounter({
      name: '',
      difficulty: null,
      status: 'draft',
      sort_order: encounters.length,
      description: null,
      environment: null,
      party_size: null,
      party_level: null,
      combatants: null,
      dm_notes: null,
      world_id: null,
    });
    setSelectedId(e.id);
  };

  const handleDelete = async (enc: Encounter) => {
    const label = enc.name.trim() || 'this encounter';
    if (await confirm(`Delete "${label}"?`)) {
      await deleteEncounter(enc.id);
      if (selectedId === enc.id) setSelectedId(null);
    }
  };

  // ---- filtering ----

  const filtered = encounters.filter(enc => {
    if (!search) return true;
    const s = search.toLowerCase();
    return enc.name.toLowerCase().includes(s)
      || (enc.environment ?? '').toLowerCase().includes(s)
      || (tierOf(enc) ?? '').toLowerCase().includes(s);
  });

  // Keep selected in sync if data changes
  const selectedEnc = selectedId ? (encounters.find(e => e.id === selectedId) ?? null) : null;

  // Auto-select first encounter if none selected and list is non-empty
  useEffect(() => {
    if (!selectedId && filtered.length > 0) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  // ================================================================
  // Render
  // ================================================================

  const badge = (c: { bg: string; text: string; border: string }, label: string) => (
    <span className="enc-badge" style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}>{label}</span>
  );

  return (
    <>
      <ListDetail
        title="Encounters"
        count={encounters.length}
        search={search}
        onSearchChange={setSearch}
        onAdd={() => void handleAdd()}
        addLabel="+ Add encounter"
        onGenerate={() => setGenOpen(true)}
        list={filtered.length === 0
          ? <div className="cm-empty is-inline">{encounters.length === 0 ? 'No encounters yet. Add one, or generate one.' : 'No matches.'}</div>
          : filtered.map(enc => {
            const tier = tierOf(enc);
            const dc = tier ? difficultyColors[tier] : null;
            const unrated = !tier && isUnratable(parseCombatants(enc.combatants).map(c => ({ cr: c.challenge_rating, count: c.count })));
            return (
              <ListRow key={enc.id} active={selectedEnc?.id === enc.id} onClick={() => setSelectedId(enc.id)} glyph="⚔"
                title={enc.name || 'Unnamed encounter'} subtitle={enc.environment ?? undefined}
                badges={<>{dc && badge(dc, RATING_LABEL[tier as Rating] ?? tier!)}{unrated && badge(statusColors.draft, 'unrated')}{badge(statusColors[enc.status] ?? statusColors.draft, enc.status)}</>} />
            );
          })}
        detail={selectedEnc ? (
          <div className="cm-detail">
            <EncounterDetail
              key={selectedEnc.id}
              enc={selectedEnc}
              monsterStatblocks={monsterStatblocks}
              onDelete={() => handleDelete(selectedEnc)}
              onRun={() => (play.live ? play.joinEncounter(selectedEnc) : setRunningEncounter(selectedEnc))}
              onViewStatblock={sb => openStatBlock(sb.id)}
              upsertEncounter={campaignUpsert}
              party={partyByLevel}
              edition={edition}
            />
          </div>
        ) : (
          <EmptyDetail>Select an encounter, or add one.</EmptyDetail>
        )}
      />

      {/* ================================================================
          AI ENCOUNTER GENERATOR
      ================================================================ */}
      <GenerateEncounterModal
        isOpen={genOpen}
        onClose={() => setGenOpen(false)}
        onCreated={enc => { setGenOpen(false); setSelectedId(enc.id); }}
      />

      {/* ================================================================
          INITIATIVE TRACKER
      ================================================================ */}
      {runningEncounter && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
          <InitiativeTracker
            encounter={runningEncounter}
            statblocks={monsterStatblocks}
            party={party}
            onClose={() => setRunningEncounter(null)}
          />
        </div>
      )}
    </>
  );
}
