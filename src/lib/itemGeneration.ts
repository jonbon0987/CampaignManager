// Making up a new item with the assistant: the prompt the Items page sends,
// and reading what comes back into an item the DM can keep. What the model
// writes is cleaned the same way as an item the chat assistant proposes
// (normalizeAssistantPayload): a type or rarity it words loosely is read into
// the app's values, and anything that isn't an item column is dropped. Pure.

import { normalizeAssistantPayload } from './assistantNormalize';
import { blankItem, ITEM_TYPES, RARITIES } from './items';
import { limitFor } from './fieldLimits';
import type { ItemInsert, RulesEdition } from './database.types';

/** "Any" leaves the choice to the model; "none" asks for an item that isn't magic. */
export type RarityChoice = 'any' | 'none' | (typeof RARITIES)[number]['id'];

export interface ItemRequest {
  /** One of ITEM_TYPES' ids, or 'any'. */
  type: string;
  rarity: RarityChoice;
  /** What the DM has in mind, in their words. May be empty. */
  idea: string;
  edition: RulesEdition;
  /** The campaign context block the DM picked (buildSelectedContextBlock), or ''. */
  context: string;
  /** Items already in the campaign, so the new one isn't a copy of them. */
  existingNames: string[];
}

const typeLabel = (id: string) => ITEM_TYPES.find(t => t.id === id)?.label.toLowerCase() ?? id;

export function buildItemPrompt(r: ItemRequest): string {
  const kind = r.type === 'any' ? 'item' : typeLabel(r.type);
  const rarity = r.rarity === 'any'
    ? 'Pick a rarity that suits it, or make it mundane treasure or gear if that fits better.'
    : r.rarity === 'none'
      ? 'It is NOT magic: mundane gear, a quest object or treasure, with "rarity": null and no attunement.'
      : `It is a ${RARITIES.find(x => x.id === r.rarity)?.label.toLowerCase()} magic item: power it to match that rarity.`;
  const idea = r.idea.trim() ? `\n\nWhat the DM has in mind: ${r.idea.trim()}` : '';
  const avoid = r.existingNames.filter(n => n.trim()).slice(0, 60);

  return `Invent one new D&D 5e ${kind} for the DM's campaign, using the ${r.edition} rules for magic items. ${rarity} Make it memorable and specific to this campaign rather than a renamed item from the book, and keep any mechanics balanced and playable at the table.${idea}${r.context}${avoid.length ? `\n\nThe campaign already has these items, so make something different: ${avoid.join(', ')}.` : ''}

Respond with only a JSON object, no markdown fence:
{
  "name": "a short, evocative name",
  "item_type": "${ITEM_TYPES.map(t => t.id).join('|')}",
  "rarity": "${RARITIES.map(x => x.id).join('|')}, or null for an item that isn't magic",
  "attunement": true or false,
  "attunement_note": "who can attune, like \\"by a wizard\\", or null for anyone",
  "value": "what it's worth or would sell for, like \\"500 gp\\", or null",
  "description": "What the players see and learn, in markdown: a sentence or two on how it looks and feels, then its full rules text (bonuses, charges and how they recharge, save DCs, actions to use it). Under 2,000 characters.",
  "dm_notes": "For the DM only: its history, any hidden property or curse, and a hook or two tying it to the campaign context. Under 1,000 characters."
}`;
}

const MAX = (column: string) => limitFor('items', column) ?? Infinity;
const clip = (v: unknown, column: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX(column)) : null);

/**
 * The item the model described, ready to save, or an error naming what was
 * wrong. A fenced or chatty reply is fine as long as one JSON object is in it.
 * A kind or rarity the DM picked holds even if the model wandered from it.
 */
export function parseGeneratedItem(text: string, asked?: Pick<ItemRequest, 'type' | 'rarity'>): Omit<ItemInsert, 'campaign_id'> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('the assistant didn’t send back an item');
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('the assistant’s reply wasn’t readable; try again');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('the assistant didn’t send back an item');
  const o = normalizeAssistantPayload('upsertItem', raw as Record<string, unknown>) as Record<string, unknown>;
  const name = clip(o.name, 'name');
  if (!name) throw new Error('the item came back without a name; try again');
  const mundane = asked?.rarity === 'none';
  const attunement = !mundane && o.attunement === true;
  const rarity = mundane ? null : asked && asked.rarity !== 'any' ? asked.rarity : typeof o.rarity === 'string' ? o.rarity : null;
  return {
    ...blankItem(name),
    item_type: asked && asked.type !== 'any' ? asked.type : typeof o.item_type === 'string' ? o.item_type : null,
    rarity,
    attunement,
    attunement_note: attunement ? clip(o.attunement_note, 'attunement_note') : null,
    value: clip(o.value, 'value'),
    description: clip(o.description, 'description'),
    dm_notes: clip(o.dm_notes, 'dm_notes'),
  };
}
