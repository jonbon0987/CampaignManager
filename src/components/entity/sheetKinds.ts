// What a character sheet becomes, for SheetImportDialog: a player character,
// or an NPC and its stat sheet.

import { sheetChanges, type SheetValues } from '../../lib/characterSheet';
import { NPC_GROUP, npcSheetChanges, type NpcSheet } from '../../lib/npcSheet';
import { readCharacterSheet, readNpcSheet } from '../../lib/readCharacterSheet';
import type { MonsterStatblock, NPC, PlayerCharacter } from '../../lib/database.types';
import type { SheetKind } from './SheetImportDialog';

/** Sheets as player characters, compared with `pcById`. */
export function pcSheetKind(pcById: (id: string) => Partial<PlayerCharacter> | undefined): SheetKind<SheetValues> {
  return {
    noun: 'player character',
    read: async file => { const r = await readCharacterSheet(file); return { source: r.source, result: r.values }; },
    nameOf: v => v.character_name ?? undefined,
    diff: (v, id) => sheetChanges(v, id ? pcById(id) : null),
  };
}

/** Sheets (or creature stat blocks) as NPCs with stat sheets, compared with each NPC and the stat sheet it links to. */
export function npcSheetKind(
  npcById: (id: string) => Partial<NPC> | undefined,
  statblockById: (id: string) => Partial<MonsterStatblock> | undefined,
): SheetKind<NpcSheet> {
  const linked = (npcId: string | null) => {
    const sb = npcId ? npcById(npcId)?.statblock_id : null;
    return sb ? statblockById(sb) : undefined;
  };
  return {
    noun: 'NPC',
    hint: 'A creature’s stat block works too, through the assistant.',
    read: async file => { const r = await readNpcSheet(file); return { source: r.source, result: r.sheet }; },
    nameOf: s => s.npc.name ?? s.statblock.name ?? undefined,
    diff: (s, id) => npcSheetChanges(s, id ? npcById(id) : null, linked(id)),
    groupLabel: (group, id) => {
      if (group === NPC_GROUP) return 'NPC';
      const sb = linked(id);
      return sb ? `Stat sheet: ${sb.name || 'unnamed'}` : 'New stat sheet, linked to the NPC';
    },
  };
}
