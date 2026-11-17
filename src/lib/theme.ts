// Scriptorium direction — warm dark fantasy, calmer atmosphere for long writing sessions.
// Thin accessor over the CSS custom properties in src/index.css :root (the single source of
// truth). Values are `var(--…)` references so inline styles resolve to the same tokens as the
// rest of the app — never hardcode hex here.
import type { TimelineTypeConfig, EraConfig } from '../types/world';
import type { RelationshipType } from './database.types';

/** A badge's three colours: fill, text and border. */
export type Swatch = { bg: string; text: string; border: string };

export const colors = {
  bg:          'var(--bg)',
  bg2:         'var(--bg-2)',
  surface:     'var(--paper)',
  surfaceHigh: 'var(--paper-2)',
  paper:       'var(--paper)',
  paper2:      'var(--paper-2)',
  border:      'var(--rule)',
  borderHover: 'var(--rule-hover)',
  borderSubtle:'var(--rule-soft)',
  gold:        'var(--gold)',
  gold2:       'var(--gold-2)',
  goldDim:     'var(--gold-dim)',
  accent:      'var(--accent)',
  accent2:     'var(--accent-2)',
  moss:        'var(--moss)',
  text:        'var(--ink)',
  textWarm:    'var(--ink-2)',
  textMuted:   'var(--ink-2)',
  textDim:     'var(--ink-3)',
  highlight:   'var(--highlight)',
  green:       'var(--success)',
  greenBg:     'var(--success-bg)',
  greenBorder: 'var(--success-line)',
  red:         'var(--red)',
  redBg:       'var(--red-bg)',
  redBorder:   'var(--red-line)',
  blue:        'var(--info)',
  blueBg:      'var(--info-bg)',
  blueBorder:  'var(--info-line)',
  // pill colors
  pillBg:      'var(--pill-bg)',
  pillBorder:  'var(--pill-bd)',
  pillText:    'var(--pill-ink)',
} as const;

export const creatureTypeColors: Record<string, { bg: string; text: string; border: string }> = {
  beast:        { bg: '#1a2a1a', text: '#6ab87a', border: '#2a5a2a' },
  undead:       { bg: '#2a1a3a', text: '#9060c0', border: '#5a2a7a' },
  humanoid:     { bg: '#1a2a3a', text: '#70a0e0', border: '#2a4a7a' },
  dragon:       { bg: '#3a1a1a', text: '#e07040', border: '#7a3a2a' },
  fiend:        { bg: '#3a1010', text: '#e04040', border: '#7a2020' },
  celestial:    { bg: '#2a2a1a', text: '#d0c060', border: '#6a6020' },
  construct:    { bg: '#2a2a2a', text: '#a0a0a0', border: '#505050' },
  elemental:    { bg: '#1a3a3a', text: '#60c0c0', border: '#2a6a6a' },
  fey:          { bg: '#2a1a3a', text: '#c060d0', border: '#6a2a7a' },
  giant:        { bg: '#3a2a1a', text: '#c09060', border: '#7a5a2a' },
  monstrosity:  { bg: '#3a1a1a', text: '#e07070', border: '#7a2a2a' },
  ooze:         { bg: '#1a2a1a', text: '#60c070', border: '#2a5a2a' },
  plant:        { bg: '#1a2a1a', text: '#50b050', border: '#2a5a2a' },
  aberration:   { bg: '#1a1a3a', text: '#7070e0', border: '#2a2a7a' },
  other:        { bg: '#1a1a1a', text: '#808080', border: '#404040' },
};

export const getTypeStyle = (t: string | null) =>
  creatureTypeColors[t ?? 'other'] ?? creatureTypeColors['other'];

export const factionTypeColors: Record<string, { bg: string; text: string; border: string }> = {
  guild:      { bg: '#2a2418', text: '#c9a84c', border: '#5a4a20' },
  government: { bg: '#1a2a3a', text: '#70a0e0', border: '#2a4a7a' },
  religious:  { bg: '#2a2a1a', text: '#d0c060', border: '#6a6020' },
  criminal:   { bg: '#3a1a1a', text: '#e05c5c', border: '#6a2a2a' },
  military:   { bg: '#1a2a2a', text: '#60b0a0', border: '#2a5a5a' },
  arcane:     { bg: '#2a1a3a', text: '#b080e0', border: '#5a3070' },
  merchant:   { bg: '#3a2010', text: '#e09050', border: '#7a4a20' },
  other:      { bg: 'var(--paper-2)', text: 'var(--ink-2)', border: 'var(--rule)' },
};

export const getFactionTypeStyle = (t: string | null) =>
  factionTypeColors[t ?? 'other'] ?? factionTypeColors['other'];

/* ══════════════════════════════════════════════════════════════════
   Centralized taxonomy maps — audit F9.
   These were previously re-declared inline in the components noted.
   Import them from here; do not redeclare. Where a value is a warm
   token it is already `var(--…)`; the remaining literals live here as
   the single canonical definition (the same pattern as the two maps
   above), so there is one source per taxonomy.
   ══════════════════════════════════════════════════════════════════ */

// Hook categories — from tabs/HooksIdeas.tsx (`categoryStyles`)
export const hookCategoryStyles: Record<string, { border: string; badge: string; badgeBg: string }> = {
  main_plot:     { border: 'var(--red-line)', badge: 'var(--red)',     badgeBg: 'var(--red-bg)' },
  side_quest:    { border: '#4a3a1a',         badge: 'var(--gold)',    badgeBg: '#2a2a10' },
  character_arc: { border: '#1a3a3a',         badge: 'var(--success)', badgeBg: '#0a2a1a' },
  faction:       { border: '#3a2a1a',         badge: 'var(--accent)',  badgeBg: '#2a1a10' },
};

export const getHookCategoryStyle = (c: string | null) =>
  hookCategoryStyles[c ?? 'side_quest'] ?? hookCategoryStyles['side_quest'];

// Thread lifecycle states — seed → active → cold → resolved (from the Blended-IA prototype).
export const threadStateMeta: Record<string, { label: string; color: string; bg: string; line: string }> = {
  seed:     { label: 'Seed',     color: 'var(--sky)',   bg: 'rgba(127,168,208,0.12)', line: '#2a4a7a' },
  active:   { label: 'Active',   color: 'var(--moss)',  bg: 'var(--moss-dim)',        line: '#2a5a2a' },
  cold:     { label: 'Cold',     color: 'var(--ink-3)', bg: 'var(--paper-3)',         line: 'var(--rule)' },
  resolved: { label: 'Resolved', color: 'var(--gold)',  bg: 'var(--gold-dim)',        line: 'var(--gold-line)' },
};

export const THREAD_STATES = ['seed', 'active', 'cold', 'resolved'] as const;

export const getThreadState = (s: string | null) => threadStateMeta[s ?? 'active'] ?? threadStateMeta['active'];

/** What a thread is about: its kind. */
export const THREAD_KINDS = ['main_plot', 'side_quest', 'character_arc', 'faction'] as const;
export const formatThreadKind = (k: string | null) => (!k ? 'Misc' : k.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()));

// Module / scene element types (glyph + label + color) — from tabs/moduleDetail/pickers.tsx (`TYPE_META`)
export interface TypeInfo { label: string; glyph: string; color: string; }
export const moduleTypeMeta: Record<string, TypeInfo> = {
  location:    { label: 'Location',    glyph: '✦', color: '#7fb0e0' },
  encounter:   { label: 'Encounter',   glyph: '⚔', color: '#e08585' },
  heist:       { label: 'Heist',       glyph: '◈', color: '#c79ae6' },
  event:       { label: 'Event',       glyph: '❂', color: '#7fb0e0' },
  social:      { label: 'Social',      glyph: '❧', color: '#e0a866' },
  puzzle:      { label: 'Puzzle',      glyph: '✧', color: '#7fd0a0' },
  travel:      { label: 'Travel',      glyph: '➟', color: '#a8a090' },
  trap:        { label: 'Trap',        glyph: '△', color: '#e0884a' },
  exploration: { label: 'Exploration', glyph: '◇', color: '#7fd0a0' },
  other:       { label: 'Other',       glyph: '•', color: '#9a8f78' },
};

export const getModuleTypeInfo = (t: string | null | undefined): TypeInfo =>
  moduleTypeMeta[t ?? 'other'] ?? moduleTypeMeta['other'];

// Entity-link kinds (icon + label + color/bg/border) — from ui/EntityLinkToolbar.tsx (`entityConfig`)
export const entityLinkConfig: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  statblock: { icon: '⚔', label: 'Stat Sheet', color: 'var(--arcane)', bg: 'var(--arcane-bg)', border: 'var(--arcane-line)' },
  npc:       { icon: '❦', label: 'NPC',        color: 'var(--link-npc)',      bg: 'var(--link-npc-bg)',      border: 'var(--link-npc-line)' },
  location:  { icon: '✦', label: 'Location',   color: 'var(--link-location)', bg: 'var(--link-location-bg)', border: 'var(--link-location-line)' },
  session:   { icon: '❧', label: 'Session',    color: 'var(--link-session)',  bg: 'var(--link-session-bg)',  border: 'var(--link-session-line)' },
  faction:   { icon: '◈', label: 'Faction',    color: 'var(--link-faction)',  bg: 'var(--link-faction-bg)',  border: 'var(--link-faction-line)' },
  hook:      { icon: '✧', label: 'Hook',       color: 'var(--link-hook)',     bg: 'var(--link-hook-bg)',     border: 'var(--link-hook-line)' },
};

/** The color an entity of this kind is named in (chronicle, review, history). */
export const entityKindColor: Record<'session' | 'pc' | 'npc' | 'location' | 'faction' | 'lore' | 'hook', string> = {
  session: 'var(--link-session)', pc: 'var(--ink)', npc: 'var(--link-npc)', location: 'var(--link-location)',
  faction: 'var(--link-faction)', lore: 'var(--gold)', hook: 'var(--link-hook)',
};

// Encounter difficulty: one scale for badges and for tinted words alike.
// (Was three maps; the words used a softer ramp than the badges.)
export const difficultyMeta: Record<string, Swatch> = {
  trivial:  { bg: 'var(--paper-2)',    text: 'var(--ink-3)',   border: 'var(--rule)' },
  easy:     { bg: 'var(--success-bg)', text: 'var(--success)', border: 'var(--success-line)' },
  medium:   { bg: 'var(--warn-bg)',    text: 'var(--warn)',    border: 'var(--warn-line)' },
  hard:     { bg: 'var(--orange-bg)',  text: 'var(--orange)',  border: 'var(--orange-line)' },
  deadly:   { bg: 'var(--red-bg)',     text: 'var(--red)',     border: 'var(--red-line)' },
  // The 2024 tiers, on the same scale of colour.
  low:      { bg: 'var(--success-bg)', text: 'var(--success)', border: 'var(--success-line)' },
  moderate: { bg: 'var(--warn-bg)',    text: 'var(--warn)',    border: 'var(--warn-line)' },
  high:     { bg: 'var(--orange-bg)',  text: 'var(--orange)',  border: 'var(--orange-line)' },
  beyond:   { bg: 'var(--red-bg)',     text: 'var(--red)',     border: 'var(--red-line)' },
};

/** Text colour only, for places that tint a word or a glyph rather than draw a badge. */
export const difficultyColor = (tier: string | null | undefined, fallback = 'var(--ink-3)'): string =>
  difficultyMeta[tier ?? '']?.text ?? fallback;

// Encounter status badges (draft / ready / completed).
export const encounterStatusMeta: Record<string, Swatch> = {
  draft:     { bg: 'var(--paper-2)',    text: 'var(--ink-3)',   border: 'var(--rule)' },
  ready:     { bg: 'var(--info-bg)',    text: 'var(--info)',    border: 'var(--info-line)' },
  completed: { bg: 'var(--success-bg)', text: 'var(--success)', border: 'var(--success-line)' },
};

// Random-table entries: combat, social or either.
export const randomEntryTypeColors: Record<string, string> = {
  combat: 'var(--red)',
  social: 'var(--sky)',
  either: 'var(--ink-3)',
};

// Relationship web: the line and legend colour of each relationship.
export const relationshipColors: Record<RelationshipType, string> = {
  ally:    'var(--moss)',
  rival:   'var(--gold-2)',
  foe:     'var(--accent)',
  neutral: 'var(--ink-3)',
};

// Conditions: the pill colour of each. The rules stay in lib/combat.ts.
export const conditionColors: Record<string, string> = {
  blinded: 'var(--ink-3)', charmed: 'var(--arcane)', deafened: 'var(--ink-3)',
  frightened: 'var(--gold)', grappled: 'var(--cr)', incapacitated: 'var(--ink-3)',
  invisible: 'var(--info)', paralyzed: 'var(--red)', petrified: 'var(--ink-3)',
  poisoned: 'var(--success)', prone: 'var(--accent)', restrained: 'var(--cr)',
  stunned: 'var(--diff-hard)', unconscious: 'var(--red)', concentrating: 'var(--info)',
  dying: 'var(--red)', stable: 'var(--moss)', dead: 'var(--ink-3)',
};

// World timeline: the glyph and colour of each event type, and the colour of
// each era. Taxonomy values like the creature types above, so the hexes live here.
export const timelineTypeConfig: Record<string, TimelineTypeConfig> = {
  cataclysm: { glyph: '☄', color: '#c44' },
  founding:  { glyph: '⚑', color: '#6b9a4a' },
  treaty:    { glyph: '⚖', color: '#7a8ab3' },
  war:       { glyph: '⚔', color: '#b35a3a' },
  political: { glyph: '❖', color: '#b3953a' },
  magical:   { glyph: '✦', color: '#9a6bc4' },
  campaign:  { glyph: '❧', color: '#c9a84c' },
  custom:    { glyph: '✧', color: '#897f68' },
};

export const eraConfig: Record<string, EraConfig> = {
  'Before Reckoning': { color: '#5e6b3a' },
  'First Silence':    { color: '#7a8ab3' },
  'Second Silence':   { color: '#b3953a' },
  'Third Silence':    { color: '#8a4a2e' },
  'Fourth Silence':   { color: '#c97a55' },
};

