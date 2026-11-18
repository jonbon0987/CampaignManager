import './_env.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveProvider, structuredExtract, friendlyError } from './_ai.js';
import { requireAuth } from './_auth.js';

// Reads a character off a sheet's text, for sheets without fillable form fields
// (a flattened, printed or custom-layout PDF). The page extracts the text in the
// browser (src/lib/readCharacterSheet.ts) and cleans what comes back
// (cleanSheetValues, cleanNpcSheet), so only these fields are kept.
//   target 'pc'  (default): a player character's fields.
//   target 'npc': an NPC and its stat sheet, from a character sheet or a
//                 monster-style stat block.

const MAX_TEXT = 60_000;

const str = (description: string) => ({ type: ['string', 'null'], description });
const int = (description: string) => ({ type: ['integer', 'null'], description });

const SCHEMA = {
  type: 'object',
  properties: {
    character_name: str('The character’s name.'),
    player_name: str('The player’s name, if the sheet has one.'),
    race: str('Race or species, with subrace (e.g. "Hill Dwarf").'),
    class: str('Class, with subclass if shown. Several classes as "Fighter 3 / Rogue 2".'),
    level: int('Total character level across all classes.'),
    xp: int('Experience points.'),
    background: str('Background (e.g. "Sage").'),
    max_hp: int('Hit point maximum (not current HP).'),
    armor_class: int('Armor class.'),
    passive_perception: int('Passive Wisdom (Perception).'),
    passive_insight: int('Passive Wisdom (Insight).'),
    passive_investigation: int('Passive Intelligence (Investigation).'),
    spell_save_dc: int('Spell save DC, if the character casts spells.'),
    story_hooks: str('Personality traits, ideals, bonds and flaws, each as "**Label.** text" on its own paragraph. Null if the sheet has none.'),
  },
  required: [],
};

const NPC_SCHEMA = {
  type: 'object',
  properties: {
    npc: {
      type: 'object',
      properties: {
        name: str('The character’s or creature’s name.'),
        role: str('Who they are in a few words: race or kind and class, e.g. "Orc Fighter 6" or "Hill giant".'),
        description: str('Appearance and backstory as given, each as "**Label.** text" on its own paragraph. Null if none.'),
        hooks_motivations: str('Personality traits, ideals, bonds and flaws, each as "**Label.** text" on its own paragraph. Null if none.'),
      },
      required: [],
    },
    statblock: {
      type: 'object',
      properties: {
        name: str('Name.'),
        creature_type: str('One of: aberration, beast, celestial, construct, dragon, elemental, fey, fiend, giant, humanoid, monstrosity, ooze, plant, undead, other. A character sheet is humanoid.'),
        challenge_rating: str('Challenge rating as written ("1/4", "5"). Null for a character sheet.'),
        armor_class: int('Armor class.'),
        ac_descriptor: str('What the AC comes from, e.g. "natural armor", "chain mail". Null if not given.'),
        hit_points: int('Hit point maximum.'),
        hit_dice: str('Hit dice as written, e.g. "6d10+12".'),
        speed: str('Speeds, e.g. "30 ft., fly 60 ft.".'),
        str: int('Strength score (not modifier).'), dex: int('Dexterity score.'), con: int('Constitution score.'),
        int: int('Intelligence score.'), wis: int('Wisdom score.'), cha: int('Charisma score.'),
        saving_throws: str('Proficient saves only, e.g. "Str +8, Con +5".'),
        skills: str('Proficient skills only, e.g. "Athletics +8, Perception +3".'),
        damage_resistances: str('As written, or null.'),
        damage_immunities: str('As written, or null.'),
        condition_immunities: str('As written, or null.'),
        senses: str('E.g. "darkvision 60 ft., passive Perception 13".'),
        languages: str('E.g. "Common, Orc".'),
        content: str('Traits, then "Actions" with each attack as "Name. +N to hit, damage." and any bonus actions, reactions or legendary actions, as plain text in the sheet’s own words. Do not repeat AC, HP, speed or ability scores.'),
      },
      required: [],
    },
  },
  required: ['npc', 'statblock'],
};

const SYSTEM = `You read Dungeons & Dragons 5e character sheets that have been turned into plain text.
Fill in only what the sheet actually states; use null for anything it doesn't. Don't work values out
(no computing passives from ability scores, no guessing a level from proficiency bonus). The text comes
from a PDF, so labels and their values may be out of order or run together: match a number to its label
by meaning (for example "Armor Class 16", "16 ARMOR CLASS"). Current HP and temporary HP are not the maximum.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { text, filename, provider: bodyProvider, target = 'pc' } = (req.body ?? {}) as { text?: string; filename?: string; provider?: string; target?: 'pc' | 'npc' };
  if (!text?.trim()) return res.status(400).json({ error: 'The sheet had no text to read.' });

  try {
    const provider = resolveProvider(bodyProvider);
    const npc = target === 'npc';
    const values = await structuredExtract({
      provider,
      system: npc ? `${SYSTEM}\nThe text may instead be a creature's stat block from a book or homebrew; read it the same way.` : SYSTEM,
      userContent: `${npc ? 'Character sheet or stat block' : 'Character sheet'}${filename ? ` (${filename})` : ''}:\n\n${text.slice(0, MAX_TEXT)}`,
      schema: npc ? NPC_SCHEMA : SCHEMA,
      schemaDescription: npc ? 'The NPC and its stat sheet read from the text' : 'The player character read from the sheet',
      maxOutputTokens: npc ? 4096 : 2048,
    });
    return res.status(200).json({ values });
  } catch (err) {
    return res.status(500).json({ error: friendlyError(err) });
  }
}
