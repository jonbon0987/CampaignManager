// What the campaign assistant can change beyond the long-standing records: items
// and who holds them, the party's coin, house rules, the campaign's own settings
// (rules edition, levelling, how often the table meets, the in-world date), a
// session's prep plan and a place's parent. Like threadActions, the model writes
// these freely, so what it proposes is cleaned before it's shown on a card or
// saved: ids it made up are dropped, loose wording is read into the values the
// app uses, and numbers are kept inside what the database allows. Pure.

import type { Campaign, Item, ItemHolding, Levelling, RulesEdition, SessionPlan, SessionRepeat } from './database.types';
import { holderName, itemLine } from './items';
import { COINS, formatLine, type Coins } from './treasury';
import { RULE_TEXT_MAX, RULE_TITLE_MAX, RULE_TOPICS, type HouseRule, type RuleTopic } from './houseRules';
import { dateOf, formatWorldDate, fromMonthDay, type Month, type WorldDate } from './calendar';
import type { ThreadCardRow } from './threadActions';

type Payload = Record<string, unknown>;

const toInt = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() ? Number(v.replace(/,/g, '')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : null;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** A real id from `known`, null for "nobody" (null, "", "party"), or undefined for an id that isn't real. */
function realOrNone(v: unknown, known: Iterable<string>): string | null | undefined {
  if (v == null) return null;
  if (typeof v !== 'string') return undefined;
  const id = v.trim();
  if (!id || id.toLowerCase() === 'party' || id.toLowerCase() === 'null') return null;
  return new Set(known).has(id) ? id : undefined;
}

function realIds(v: unknown, known: Iterable<string>): string[] {
  const set = new Set(known);
  return Array.isArray(v) ? [...new Set(v.filter((id): id is string => typeof id === 'string' && set.has(id)))] : [];
}

// --------------- Items and who holds them ---------------

/** Who should hold an item: a PC, or the party's stash (pc_id null). */
export interface AssistantHolder {
  pc_id: string | null;
  quantity: number;
  attuned: boolean;
  /** Left out: keep the note already there. */
  note?: string;
  /** The session it was found in, for a new holding. */
  session_id?: string | null;
}

/**
 * The holders an item should have, as the assistant listed them. A PC that isn't
 * in the campaign is left out; the party is pc_id null; one entry per holder.
 */
export function holdersOf(raw: unknown, known: { pcs: Iterable<string>; sessions: Iterable<string> }): AssistantHolder[] {
  const pcs = [...known.pcs];
  const sessions = [...known.sessions];
  const out = new Map<string, AssistantHolder>();
  for (const entry of Array.isArray(raw) ? raw : []) {
    const o: Payload | null = typeof entry === 'string' || entry === null ? { pc_id: entry }
      : typeof entry === 'object' ? entry as Payload : null;
    if (!o) continue;
    const pc = realOrNone(o.pc_id, pcs);
    if (pc === undefined) continue;
    const key = pc ?? '';
    const quantity = clamp(toInt(o.quantity) ?? 1, 1, 9_999);
    const attuned = o.attuned === true;
    const note = text(o.note) ?? undefined;
    const session = realOrNone(o.session_id, sessions) ?? null;
    const prev = out.get(key);
    out.set(key, prev
      ? { ...prev, quantity: Math.min(9_999, prev.quantity + quantity), attuned: prev.attuned || attuned, note: prev.note ?? note }
      : { pc_id: pc, quantity, attuned, ...(note ? { note } : {}), session_id: session });
  }
  return [...out.values()];
}

export interface HolderChanges {
  give: AssistantHolder[];
  update: { holding: ItemHolding; patch: Partial<Pick<ItemHolding, 'quantity' | 'attuned' | 'note'>> }[];
  remove: ItemHolding[];
}

/** What to give, change and take away so an item's holdings become `wanted`. */
export function holderChanges(current: ItemHolding[], wanted: AssistantHolder[]): HolderChanges {
  const left = [...current];
  const out: HolderChanges = { give: [], update: [], remove: [] };
  for (const w of wanted) {
    const i = left.findIndex(h => h.pc_id === w.pc_id);
    if (i < 0) { out.give.push(w); continue; }
    const [h] = left.splice(i, 1);
    const patch: HolderChanges['update'][number]['patch'] = {};
    if (h.quantity !== w.quantity) patch.quantity = w.quantity;
    if (h.attuned !== w.attuned) patch.attuned = w.attuned;
    if (w.note !== undefined && w.note !== h.note) patch.note = w.note;
    if (Object.keys(patch).length > 0) out.update.push({ holding: h, patch });
  }
  out.remove = left;
  return out;
}

type PcNames = { id: string; character_name: string }[];

/** "Kael (attuned), the party ×2", or "" when nobody has it. */
export function holdersText(holders: Pick<ItemHolding, 'pc_id' | 'quantity' | 'attuned'>[], pcs: PcNames): string {
  return holders.map((h, i) => {
    const name = holderName(h, pcs);
    return `${i > 0 && name === 'The party' ? 'the party' : name}${h.quantity > 1 ? ` ×${h.quantity}` : ''}${h.attuned ? ' (attuned)' : ''}`;
  }).join(', ');
}

const ITEM_KIND_KEYS = ['item_type', 'rarity', 'attunement', 'attunement_note'] as const;

/** The rows an item's card adds: what kind of item it is, and who holds it. */
export function itemCardRows(
  existing: Partial<Item> | null,
  payload: Payload,
  holdings: ItemHolding[],
  known: { pcs: PcNames; sessions: Iterable<string> },
): ThreadCardRow[] {
  const rows: ThreadCardRow[] = [];
  if (ITEM_KIND_KEYS.some(k => k in payload)) {
    const kindOf = (r: Partial<Item>) => itemLine({
      item_type: r.item_type ?? null, rarity: r.rarity ?? null, attunement: !!r.attunement, attunement_note: r.attunement_note ?? null,
    });
    const old = existing ? kindOf(existing) || undefined : undefined;
    const value = kindOf({ ...existing, ...payload } as Partial<Item>) || undefined;
    if (old !== value) rows.push({ label: 'Kind', old, value: value ?? '—' });
  }
  if ('holders' in payload) {
    const old = holdersText(holdings, known.pcs) || undefined;
    const value = holdersText(holdersOf(payload.holders, { pcs: known.pcs.map(p => p.id), sessions: known.sessions }), known.pcs) || 'Nobody';
    if (old !== value) rows.push({ label: 'Held by', old, value });
  }
  return rows;
}

// --------------- The party's coin ---------------

export type TreasuryLine = Coins & { note: string | null; pc_id: string | null; session_id: string | null };

/** A ledger line as the assistant proposed it: whole coins, a note, and a real PC and session or none. */
export function cleanTreasuryPayload(payload: Payload, known: { pcs: Iterable<string>; sessions: Iterable<string> }): TreasuryLine {
  const coins = Object.fromEntries(COINS.map(c => [c, clamp(toInt(payload[c]) ?? 0, -9_999_999, 9_999_999)])) as Coins;
  return {
    ...coins,
    note: text(payload.note),
    pc_id: realOrNone(payload.pc_id, known.pcs) ?? null,
    session_id: realOrNone(payload.session_id, known.sessions) ?? null,
  };
}

/** "+250 gp · Loot from the vault", for a card's title and a delete's label. */
export function treasuryName(line: Partial<TreasuryLine>): string {
  const coin = formatLine(line);
  const note = line.note?.trim();
  return coin && note ? `${coin} · ${note}` : coin || note || 'No coin';
}

export function treasuryCardRows(
  line: TreasuryLine,
  names: { pc: (id: string) => string | undefined; session: (id: string) => string | undefined },
): ThreadCardRow[] {
  const rows: ThreadCardRow[] = [{ label: 'Coin', value: formatLine(line) || '—' }];
  const pc = line.pc_id ? names.pc(line.pc_id) : undefined;
  if (pc) rows.push({ label: 'To or from', value: pc });
  const session = line.session_id ? names.session(line.session_id) : undefined;
  if (session) rows.push({ label: 'Session', value: session });
  return rows;
}

// --------------- House rules ---------------

/** A topic, read loosely: "rest" is Rest and healing. Anything else is Table. */
export function ruleTopic(v: unknown): RuleTopic {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!s) return 'Table';
  return RULE_TOPICS.find(t => t.toLowerCase() === s)
    ?? RULE_TOPICS.find(t => t.toLowerCase().startsWith(s.split(/\W/)[0]) || s.startsWith(t.toLowerCase().split(/\W/)[0]))
    ?? 'Table';
}

/**
 * The rules after the assistant adds or changes one. With the id of a rule
 * already there it changes that rule's fields; otherwise it adds a new one.
 */
export function applyRule(rules: HouseRule[], payload: Payload, newId: () => string): HouseRule[] {
  const id = typeof payload.id === 'string' ? payload.id : '';
  const current = rules.find(r => r.id === id);
  const next: HouseRule = {
    id: current?.id ?? newId(),
    topic: 'topic' in payload ? ruleTopic(payload.topic) : current?.topic ?? 'Table',
    title: 'title' in payload ? (text(payload.title) ?? '').slice(0, RULE_TITLE_MAX) : current?.title ?? '',
    text: 'text' in payload ? (text(payload.text) ?? '').slice(0, RULE_TEXT_MAX) : current?.text ?? '',
  };
  if (!next.title && !next.text) throw new Error('the rule has no title or text');
  return current ? rules.map(r => (r.id === current.id ? next : r)) : [...rules, next];
}

// --------------- Campaign settings ---------------

export interface CampaignSettingsPatch {
  rules_edition?: RulesEdition;
  levelling?: Levelling | null;
  session_repeat?: SessionRepeat | null;
  world_date?: WorldDate;
}

/** A date in the world's calendar: "14 Mirtul 1492 DR", "Mirtul 14, 1492", "Midwinter 1492", or { year, day }. */
export function parseWorldDate(v: unknown, months: Month[]): WorldDate | null {
  if (v && typeof v === 'object') return dateOf(v);
  if (typeof v !== 'string' || !v.trim()) return null;
  const s = ` ${v.trim().toLowerCase().replace(/,/g, ' ')} `;
  const named = months
    .map((m, i) => ({ i, name: m.name.toLowerCase() }))
    .sort((a, b) => b.name.length - a.name.length)
    .find(m => new RegExp(`[^\\w]${m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\w]`).test(s));
  if (!named) return null;
  const nums = s.replace(named.name, ' ').match(/-?\d+/g)?.map(Number) ?? [];
  const festival = months[named.i].days === 1;
  if (festival) return nums.length >= 1 ? fromMonthDay(nums[nums.length - 1], named.i, 1, months) : null;
  if (nums.length < 2) return null;
  return fromMonthDay(nums[1], named.i, nums[0], months);
}

const NONE = /^(none|no|null|never|nothing|off|no set pattern|irregular)$/;

/** The settings the assistant asked to change, in the values the app stores. Anything it can't read is left out. */
export function cleanCampaignPayload(payload: Payload, months: Month[]): CampaignSettingsPatch {
  const out: CampaignSettingsPatch = {};
  const word = (v: unknown) => (v == null ? '' : String(v).trim().toLowerCase());

  if ('rules_edition' in payload) {
    const s = word(payload.rules_edition);
    if (/2024|5\.5|one d&d|revised/.test(s)) out.rules_edition = '2024';
    else if (/2014|^5e?$|^5th/.test(s)) out.rules_edition = '2014';
  }
  if ('levelling' in payload) {
    const s = word(payload.levelling);
    if (payload.levelling === null || NONE.test(s)) out.levelling = null;
    else if (/xp|experience/.test(s)) out.levelling = 'xp';
    else if (/milestone/.test(s)) out.levelling = 'milestone';
  }
  if ('session_repeat' in payload) {
    const s = word(payload.session_repeat);
    if (payload.session_repeat === null || NONE.test(s)) out.session_repeat = null;
    else if (/fortnight|bi-?weekly|every other|two weeks|2 weeks/.test(s)) out.session_repeat = 'fortnightly';
    else if (/week/.test(s)) out.session_repeat = 'weekly';
  }
  if ('world_date' in payload) {
    const date = parseWorldDate(payload.world_date, months);
    if (date) out.world_date = date;
  }
  return out;
}

const REPEAT_LABEL: Record<SessionRepeat, string> = { weekly: 'Weekly', fortnightly: 'Every two weeks' };
const LEVELLING_LABEL: Record<Levelling, string> = { xp: 'By XP', milestone: 'At milestones' };

/** The rows a campaign-settings card shows, in words, and only where they change. */
export function campaignCardRows(
  existing: Partial<Campaign> | null,
  patch: CampaignSettingsPatch,
  calendar: { months: Month[]; suffix: string },
): ThreadCardRow[] {
  const rows: ThreadCardRow[] = [];
  const row = (label: string, old: string | undefined, value: string | undefined) => {
    if (old !== value) rows.push({ label, old, value: value ?? 'Not set' });
  };
  if ('rules_edition' in patch) row('Rules', existing ? `${existing.rules_edition ?? '2014'} rules` : undefined, `${patch.rules_edition} rules`);
  if ('levelling' in patch) {
    row('Levelling', existing?.levelling ? LEVELLING_LABEL[existing.levelling] : undefined, patch.levelling ? LEVELLING_LABEL[patch.levelling] : undefined);
  }
  if ('session_repeat' in patch) {
    row('Table meets', existing?.session_repeat ? REPEAT_LABEL[existing.session_repeat] : undefined, patch.session_repeat ? REPEAT_LABEL[patch.session_repeat] : undefined);
  }
  if (patch.world_date) {
    const was = dateOf(existing?.world_date);
    row('In-world date', was ? formatWorldDate(was, calendar.months, calendar.suffix) : undefined, formatWorldDate(patch.world_date, calendar.months, calendar.suffix));
  }
  return rows;
}

// --------------- Sessions ---------------

/** "19:00" from "19:00", "7pm" or "7:30 PM"; null for "no time"; undefined for anything else. */
export function sessionTime(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase();
  if (!s || NONE.test(s)) return null;
  const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/.exec(s);
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const half = m[3]?.[0];
  if (half && (h < 1 || h > 12)) return undefined;
  if (half === 'p' && h < 12) h += 12;
  if (half === 'a' && h === 12) h = 0;
  if (h > 23 || min > 59) return undefined;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const PLAN_LISTS = ['hook_ids', 'npc_ids', 'scene_ids'] as const;
type PlanList = typeof PLAN_LISTS[number];

export interface SessionPlanIds { threads: Iterable<string>; npcs: Iterable<string>; scenes: Iterable<string> }

/**
 * A session's payload, made safe to write: its start time as "HH:MM", and its
 * prep plan merged onto what's planned already, keeping only real ids. Lists the
 * assistant didn't send, and the checklist, stay as they were.
 */
export function cleanSessionPayload<T extends Payload>(payload: T, existing: Payload | null, known: SessionPlanIds): T {
  const out: Payload = { ...payload };
  if ('session_time' in out) {
    const time = sessionTime(out.session_time);
    if (time === undefined) delete out.session_time;
    else out.session_time = time;
  }
  if ('plan' in out) {
    const asked = out.plan && typeof out.plan === 'object' && !Array.isArray(out.plan) ? out.plan as Payload : null;
    if (!asked) {
      delete out.plan;
    } else {
      const was = (existing?.plan && typeof existing.plan === 'object' ? existing.plan : {}) as SessionPlan;
      const from: Record<PlanList, Iterable<string>> = { hook_ids: known.threads, npc_ids: known.npcs, scene_ids: known.scenes };
      const plan: SessionPlan = { ...was };
      for (const key of PLAN_LISTS) if (key in asked) plan[key] = realIds(asked[key], from[key]);
      out.plan = plan;
    }
  }
  return out as T;
}

export interface SessionCardNames { thread: (id: string) => string | undefined; npc: (id: string) => string | undefined; scene: (id: string) => string | undefined }

/** The rows a session's card adds for its start time and its prep plan, by name. */
export function sessionCardRows(existing: Payload | null, clean: Payload, names: SessionCardNames): ThreadCardRow[] {
  const rows: ThreadCardRow[] = [];
  const row = (label: string, old: string | undefined, value: string | undefined) => {
    if (old !== value) rows.push({ label, old, value: value ?? '—' });
  };
  if ('session_time' in clean) row('Starts', text(existing?.session_time) ?? undefined, text(clean.session_time) ?? undefined);
  if (clean.plan && typeof clean.plan === 'object') {
    const was = (existing?.plan ?? {}) as SessionPlan;
    const now = clean.plan as SessionPlan;
    const list = (ids: string[] | undefined, name: (id: string) => string | undefined) =>
      (ids ?? []).map(name).filter(Boolean).join(', ') || undefined;
    const labels: [PlanList, string, (id: string) => string | undefined][] = [
      ['hook_ids', 'Threads to bring in', names.thread], ['npc_ids', 'NPCs who appear', names.npc], ['scene_ids', 'Scenes to run', names.scene],
    ];
    for (const [key, label, name] of labels) row(label, list(was[key], name), list(now[key], name));
  }
  return rows;
}

// --------------- Places ---------------

/**
 * A place's parent, checked: a real place, not the place itself, and not one of
 * its own children (which would loop the tree). One that fails is left as it was.
 */
export function cleanParent<T extends Payload>(payload: T, places: { id: string; parent_id: string | null }[]): T {
  if (!('parent_id' in payload)) return payload;
  const out: Payload = { ...payload };
  const self = typeof out.id === 'string' ? out.id : null;
  const parent = realOrNone(out.parent_id, places.map(p => p.id));
  if (parent === null) { out.parent_id = null; return out as T; }
  const byId = new Map(places.map(p => [p.id, p.parent_id]));
  let at: string | null | undefined = parent;
  const seen = new Set<string>();
  while (at && !seen.has(at)) {
    if (at === self) { delete out.parent_id; return out as T; }
    seen.add(at);
    at = byId.get(at);
  }
  if (parent === undefined) delete out.parent_id;
  else out.parent_id = parent;
  return out as T;
}
