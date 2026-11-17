// Stat-sheet data and helpers shared by the stat-sheet screens, the stat-block
// panel and the AI completion. Kept out of the components so those files
// export only components (React Fast Refresh needs that).
import type { MonsterStatblock } from './database.types';

/** The stat-sheet editor's form: every field as the text the person typed. */
export type MonsterForm = {
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

export const emptyMonsterForm = (): MonsterForm => ({
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

/** An ability modifier as shown on a sheet: "+2", "-1". (lib/combat.ts has the numeric one.) */
export function abilityModLabel(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
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

export const CREATURE_TYPES = [
  'aberration', 'beast', 'celestial', 'construct', 'dragon',
  'elemental', 'fey', 'fiend', 'giant', 'humanoid',
  'monstrosity', 'ooze', 'plant', 'undead', 'other',
];

/** Every 5e challenge rating, in order. */
export const CHALLENGE_RATINGS = [
  '0', '1/8', '1/4', '1/2',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
];

export const ABILITY_KEYS: Array<{ key: keyof MonsterForm; label: string }> = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
];
