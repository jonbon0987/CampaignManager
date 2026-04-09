export const colors = {
  bg:          '#0f0e17',
  surface:     '#1a1828',
  surfaceHigh: '#22203a',
  border:      '#3a3660',
  borderHover: '#4a4870',
  borderSubtle:'#2e2c4a',
  gold:        '#c9a84c',
  goldDim:     '#a07830',
  text:        '#e8d5b0',
  textWarm:    '#c9b88a',
  textMuted:   '#9990b0',
  textDim:     '#6a6490',
  green:       '#4caf7d',
  greenBg:     '#1a2a1a',
  greenBorder: '#2a5a2a',
  red:         '#e05c5c',
  redBg:       '#3a1a1a',
  redBorder:   '#6a2a2a',
  blue:        '#4ab8d4',
  blueBg:      '#1a2a3a',
  blueBorder:  '#2a4a7a',
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
