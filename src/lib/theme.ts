// Scriptorium direction — warm dark fantasy, calmer atmosphere for long writing sessions.
// Thin accessor over the CSS custom properties in src/index.css :root (the single source of
// truth). Values are `var(--…)` references so inline styles resolve to the same tokens as the
// rest of the app — never hardcode hex here.
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
  npc:       { icon: '❦', label: 'NPC',        color: 'var(--info)',   bg: 'var(--info-bg)',   border: 'var(--info-line)' },
  location:  { icon: '✦', label: 'Location',   color: '#60c080',       bg: '#1a3a2a',          border: '#2a6a4a' },
  session:   { icon: '❧', label: 'Session',    color: 'var(--gold)',   bg: 'var(--warn-bg)',   border: '#5a5a2a' },
  faction:   { icon: '◈', label: 'Faction',    color: '#b070b0',       bg: '#2a1a2a',          border: 'var(--arcane-line)' },
  hook:      { icon: '✧', label: 'Hook',       color: '#e0a060',       bg: '#3a2a1a',          border: '#7a5a2a' },
};

// Encounter difficulty ramp — from tabs/moduleDetail/SubmoduleEditor.tsx (`diffColor`) and combat surfaces
export const difficultyColors: Record<string, string> = {
  easy:   'var(--diff-easy)',
  medium: 'var(--gold-2)',
  hard:   'var(--diff-hard)',
  deadly: 'var(--diff-deadly)',
};
