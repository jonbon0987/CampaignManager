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
