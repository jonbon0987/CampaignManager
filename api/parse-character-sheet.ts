import './_env.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveProvider, structuredExtract, friendlyError } from './_ai.js';
import { requireAuth } from './_auth.js';

// Reads a player character off a character sheet's text, for sheets without
// fillable form fields (a flattened, printed or custom-layout PDF). The page
// extracts the text in the browser (src/lib/readCharacterSheet.ts) and cleans
// what comes back (cleanSheetValues), so only these fields are kept.

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

const SYSTEM = `You read Dungeons & Dragons 5e character sheets that have been turned into plain text.
Fill in only what the sheet actually states; use null for anything it doesn't. Don't work values out
(no computing passives from ability scores, no guessing a level from proficiency bonus). The text comes
from a PDF, so labels and their values may be out of order or run together: match a number to its label
by meaning (for example "Armor Class 16", "16 ARMOR CLASS"). Current HP and temporary HP are not the maximum.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { text, filename, provider: bodyProvider } = (req.body ?? {}) as { text?: string; filename?: string; provider?: string };
  if (!text?.trim()) return res.status(400).json({ error: 'The sheet had no text to read.' });

  try {
    const provider = resolveProvider(bodyProvider);
    const values = await structuredExtract({
      provider,
      system: SYSTEM,
      userContent: `Character sheet${filename ? ` (${filename})` : ''}:\n\n${text.slice(0, MAX_TEXT)}`,
      schema: SCHEMA,
      schemaDescription: 'The player character read from the sheet',
      maxOutputTokens: 2048,
    });
    return res.status(200).json({ values });
  } catch (err) {
    return res.status(500).json({ error: friendlyError(err) });
  }
}
