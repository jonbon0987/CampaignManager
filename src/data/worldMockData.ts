import type {
  World, WorldCampaign, WorldNPC, WorldFaction, WorldLocation,
  WorldLoreEntry, WorldBestiaryEntry, WorldEncounter, WorldTimelineEvent,
  TimelineTypeConfig, EraConfig,
} from '../types/world';

export const WORLDS: World[] = [
  {
    id: 'w1',
    name: 'Vellandar',
    tagline: 'A shattered kingdom where gods die and oaths break like glass',
    era: 'The Fourth Silence',
    calendar: 'Crown Reckoning (CR)',
    year: 1247,
    campaignIds: ['c1', 'c2'],
  },
  {
    id: 'w2',
    name: 'The Sunken Reach',
    tagline: 'Archipelago of drowned empires and salt-mad prophets',
    era: 'The Tidal Age',
    calendar: 'Drift Years (DY)',
    year: 88,
    campaignIds: ['c3'],
  },
];

export const WORLD_CAMPAIGNS: WorldCampaign[] = [
  { id: 'c1', worldId: 'w1', name: 'The Hollow Crown of Vellandar', sessions: 14, party: 'The Ember Pact', lastPlayed: 'CR 1247, 9th of Ashfall', status: 'active' },
  { id: 'c2', worldId: 'w1', name: 'The Briarsong War', sessions: 3, party: 'The Silver Tongue', lastPlayed: 'CR 1245, 1st of Midwinter', status: 'paused' },
  { id: 'c3', worldId: 'w2', name: 'Tides of the Forgotten', sessions: 8, party: 'The Barnacle Crew', lastPlayed: 'DY 88, Storm-season', status: 'active' },
];

export const WORLD_FACTIONS: WorldFaction[] = [
  { id: 'wf1', name: 'The Crown of Vellandar', type: 'monarchy', tone: '#8a4a2e', desc: 'The ruling line, now broken. The hollow crown persists as symbol and burden.' },
  { id: 'wf2', name: 'Order of the Pale Flame', type: 'religious', tone: '#b3953a', desc: 'Keepers of the dying god\'s light. Founded in the First Silence.' },
  { id: 'wf3', name: 'The Briarsong Coven', type: 'fey-pact', tone: '#5e6b3a', desc: 'As old as the fens themselves. They remember what the kingdom forgot.' },
  { id: 'wf4', name: 'The Iron Vow', type: 'military', tone: '#4a4848', desc: 'Honor for hire. Three centuries of contracts, kept to the letter.' },
  { id: 'wf5', name: 'The Quiet Library', type: 'scholarly', tone: '#3a4a6b', desc: 'They collect. They catalogue. They do not share.' },
  { id: 'wf6', name: 'The Ashen Senate', type: 'government', tone: '#6b5a3a', desc: 'Vellandar\'s ruling council since the monarchy fell. Fracturing.' },
];

export const WORLD_NPCS: WorldNPC[] = [
  { id: 'wn1', name: 'Queen Aelindra the Silenced', role: 'Last true monarch of Vellandar', status: 'deceased', desc: 'Died in the Year of Broken Bells. Her tomb has never been found. Some say she walks the under-city, waiting.', factions: ['wf1'], location: 'wl-velden', era: 'Third Silence', tags: ['royalty', 'legend'] },
  { id: 'wn2', name: 'The Pale Archon', role: 'Founder of the Pale Flame', status: 'mythic', desc: 'A figure of disputed historicity who allegedly lit the first flame atop the mountain. Every order claims a different origin.', factions: ['wf2'], location: 'wl-pale', era: 'First Silence', tags: ['religion', 'founder'] },
  { id: 'wn3', name: 'Grandmother Thorn', role: 'First of the Briar-Mothers', status: 'mythic', desc: 'The fens remember her. Whether she was one woman or many is a question the coven refuses to answer.', factions: ['wf3'], location: 'wl-thornmarch', era: 'Before Reckoning', tags: ['fey', 'coven'] },
  { id: 'wn4', name: 'Lord-Marshal Carran Vess', role: 'Founder of the Iron Vow', status: 'deceased', desc: 'Formed the mercenary company from the survivors of the Battle of Ashfield. Died keeping a contract no one remembers.', factions: ['wf4'], location: null, era: 'Third Silence', tags: ['military', 'honor'] },
  { id: 'wn5', name: 'The Unnamed Scribe', role: 'Architect of the Quiet Library', status: 'unknown', desc: 'Built the Library in a single night, if the records are to be believed. The records were written by the Library.', factions: ['wf5'], location: 'wl-library', era: 'Second Silence', tags: ['arcane', 'mystery'] },
  { id: 'wn6', name: 'Emperor Valdric III', role: 'Last emperor of the Vellandari Empire', status: 'deceased', desc: 'His death shattered the empire into the kingdoms we know. His crown was split into seven pieces, each hidden.', factions: ['wf1'], location: 'wl-velden', era: 'Second Silence', tags: ['royalty', 'empire'] },
  { id: 'wn7', name: 'Sable, the Fen-Walker', role: 'Wandering hedge-witch', status: 'active', desc: 'Claims to be 300 years old. No one can prove otherwise. Trades in curses and cures with equal enthusiasm.', factions: [], location: 'wl-thornmarch', era: 'Fourth Silence', tags: ['witch', 'wanderer'] },
];

export const WORLD_LOCATIONS: WorldLocation[] = [
  { id: 'wl-velden', name: 'Velden, the Walled City', type: 'city', desc: 'Capital of Vellandar. Built atop the bones of three older cities. Seven gates, six standing.', tags: ['capital', 'ancient'], parent: null },
  { id: 'wl-thornmarch', name: 'The Thornmarch Fens', type: 'region', desc: 'Mile-deep peat and witchlight. Time runs sideways here. The coven\'s domain since before reckoning.', tags: ['wilderness', 'cursed', 'fey'], parent: null },
  { id: 'wl-pale', name: 'The Pale Sanctum', type: 'landmark', desc: 'Mountain monastery. The bell has not rung in a hundred years. Sister Almene tends the flame alone.', tags: ['holy', 'isolated'], parent: null },
  { id: 'wl-library', name: 'The Quiet Library', type: 'landmark', desc: 'A windowless basilica of scrolls. You sign in with blood and leave with less of yourself.', tags: ['arcane', 'faction-seat'], parent: 'wl-velden' },
  { id: 'wl-ashfield', name: 'The Ashfield', type: 'battlefield', desc: 'Where the empire died. The soil is still black. Nothing grows except a single white tree at the center.', tags: ['ruin', 'historic'], parent: null },
  { id: 'wl-underking', name: 'The Under-King\'s Road', type: 'dungeon', desc: 'A tunnel network beneath Velden connecting the old cities. Partially mapped. Mostly avoided.', tags: ['underground', 'dangerous'], parent: 'wl-velden' },
  { id: 'wl-nine-stones', name: 'The Nine Standing Stones', type: 'landmark', desc: 'Pre-Vellandari menhirs in the fens. One stone is always missing, and a different one each visit.', tags: ['arcane', 'ancient'], parent: 'wl-thornmarch' },
  { id: 'wl-iron-road', name: 'The Iron Road', type: 'route', desc: 'Trade route connecting Velden to the eastern provinces. Patrolled by the Iron Vow.', tags: ['trade', 'military'], parent: null },
];

export const WORLD_LORE: WorldLoreEntry[] = [
  { id: 'wlr-1', title: 'The Four Silences', desc: 'History is divided into four ages, each beginning with a great silence — a period when all divine magic ceased. The current era, the Fourth Silence, began 47 years ago.', tags: ['cosmology', 'history'] },
  { id: 'wlr-2', title: 'The Shattered Crown', desc: 'Emperor Valdric III\'s crown was split into seven pieces at his death. Each piece was hidden by a different faction. Three have been found. Four remain lost.', tags: ['artifact', 'quest'] },
  { id: 'wlr-3', title: 'Wild Magic and the Silences', desc: 'During each Silence, arcane magic becomes unpredictable. The Wild Magic Year forty years ago was merely the latest episode in a pattern older than the kingdom.', tags: ['magic', 'cosmology'] },
  { id: 'wlr-4', title: 'The Compact of Thorns', desc: 'An ancient treaty between Velden and the Thornmarch. The city does not burn the fens; the fens do not swallow the roads. Both sides have cheated.', tags: ['politics', 'fey'] },
  { id: 'wlr-5', title: 'The Dying God', desc: 'The deity the Pale Flame serves has been dying for centuries. Each Silence weakens it further. Mother Ainsley believes the Fourth Silence will be the last.', tags: ['religion', 'prophecy'] },
  { id: 'wlr-6', title: 'The Blood-Ink Accords', desc: 'The founding charter of the Quiet Library, written in the blood of its builders. It grants the Library sovereignty within its walls — no king\'s law applies inside.', tags: ['law', 'arcane'] },
];

export const WORLD_BESTIARY: WorldBestiaryEntry[] = [
  { id: 'wsb-1', name: 'Fen Fiend', cr: '5', type: 'fiend', hp: 84, ac: 16, desc: 'Born from the Thornmarch\'s malice. Feeds on regret.', tags: ['fens', 'common'] },
  { id: 'wsb-2', name: 'Stag Spirit', cr: '8', type: 'fey', hp: 119, ac: 15, desc: 'Guardian of the Nine Stones. Speaks in riddles. Fights in silence.', tags: ['fey', 'guardian'] },
  { id: 'wsb-3', name: 'Ash Wraith', cr: '6', type: 'undead', hp: 67, ac: 14, desc: 'Soldiers who fell at Ashfield and never stopped fighting. They smell of smoke.', tags: ['ashfield', 'undead'] },
  { id: 'wsb-4', name: 'Silence Moth', cr: '1/2', type: 'aberration', hp: 13, ac: 12, desc: 'Drawn to divine magic. Eats prayers. Swarms during a Silence.', tags: ['silence', 'swarm'] },
  { id: 'wsb-5', name: 'Lacquered Sentinel', cr: '10', type: 'construct', hp: 142, ac: 18, desc: 'Red-enameled armor animated by an unknown will. Hunts by name.', tags: ['mystery', 'construct'] },
  { id: 'wsb-6', name: 'Root Horror', cr: '3', type: 'plant', hp: 52, ac: 13, desc: 'The fens\' immune system. Attacks anything that cuts living wood.', tags: ['fens', 'territorial'] },
  { id: 'wsb-7', name: 'Quiet Archivist', cr: '3', type: 'humanoid', hp: 45, ac: 12, desc: 'Library guardians who have read too much. Their eyes are blank pages.', tags: ['library', 'guardian'] },
];

export const WORLD_ENCOUNTERS: WorldEncounter[] = [
  { id: 'we-1', name: 'Ashfield Patrol', difficulty: 'hard', status: 'ready', creatures: ['wsb-3', 'wsb-3', 'wsb-3'], notes: 'Three wraiths guarding the white tree. They attack anyone who touches the bark.' },
  { id: 'we-2', name: 'Fen Crossing Ambush', difficulty: 'medium', status: 'ready', creatures: ['wsb-1', 'wsb-6', 'wsb-6'], notes: 'Classic fen encounter. The root horrors herd prey toward the fiend.' },
  { id: 'we-3', name: 'Library Breach', difficulty: 'deadly', status: 'drafted', creatures: ['wsb-7', 'wsb-7', 'wsb-7', 'wsb-7'], notes: 'Four archivists seal the doors and demand the intruders return what was taken.' },
];

export const WORLD_TIMELINE: WorldTimelineEvent[] = [
  { id: 'wt-1', date: 'Before Reckoning', year: -500, title: 'The Fens Awaken', desc: 'The Thornmarch gains sentience — or reveals it. Grandmother Thorn appears in the first recorded histories.', type: 'cataclysm', era: 'Before Reckoning' },
  { id: 'wt-2', date: 'CR 0', year: 0, title: 'Crown Reckoning Begins', desc: 'The first Emperor of Vellandar is crowned. The calendar starts. The First Silence has already ended.', type: 'founding', era: 'First Silence' },
  { id: 'wt-3', date: 'CR 89', year: 89, title: 'The Pale Flame is Lit', desc: 'The Pale Archon ascends the mountain and lights the eternal flame. The Order is founded.', type: 'founding', era: 'First Silence' },
  { id: 'wt-4', date: 'CR 212', year: 212, title: 'The Compact of Thorns', desc: 'Velden and the Thornmarch sign a treaty. The city will not burn the fens. The fens will not swallow the roads.', type: 'treaty', era: 'First Silence' },
  { id: 'wt-5', date: 'CR 340', year: 340, title: 'The Second Silence', desc: 'Divine magic ceases for seven years. The Pale Flame nearly dies. Three temples collapse.', type: 'cataclysm', era: 'Second Silence' },
  { id: 'wt-6', date: 'CR 355', year: 355, title: 'The Quiet Library is Built', desc: 'Constructed in a single night by the Unnamed Scribe. The Blood-Ink Accords grant it sovereignty.', type: 'founding', era: 'Second Silence' },
  { id: 'wt-7', date: 'CR 701', year: 701, title: 'The Battle of Ashfield', desc: 'The empire\'s largest army is destroyed in a single day. The soil turns black. Emperor Valdric III dies.', type: 'war', era: 'Second Silence' },
  { id: 'wt-8', date: 'CR 701', year: 701, title: 'The Crown is Shattered', desc: 'Valdric\'s crown is broken into seven pieces and hidden. The empire fractures into kingdoms.', type: 'cataclysm', era: 'Second Silence' },
  { id: 'wt-9', date: 'CR 820', year: 820, title: 'The Third Silence', desc: 'Divine magic fails again. Shorter this time — three years. The Pale Flame survives but dims.', type: 'cataclysm', era: 'Third Silence' },
  { id: 'wt-10', date: 'CR 834', year: 834, title: 'The Iron Vow is Founded', desc: 'Lord-Marshal Carran Vess gathers Ashfield survivors into a mercenary company bound by contract-oath.', type: 'founding', era: 'Third Silence' },
  { id: 'wt-11', date: 'CR 940', year: 940, title: 'The Ashen Senate Takes Power', desc: 'With no heir to the hollow crown, the Senate declares itself the governing body of Vellandar.', type: 'political', era: 'Third Silence' },
  { id: 'wt-12', date: 'CR 1200', year: 1200, title: 'The Fourth Silence Begins', desc: 'Divine magic ceases. The Pale Flame gutters. The Silence Moths swarm. It has not ended.', type: 'cataclysm', era: 'Fourth Silence' },
  { id: 'wt-13', date: 'CR 1207', year: 1207, title: 'The Wild Magic Year', desc: 'Every spell cast in Vellandar twists sideways for a year and a day. No one agrees on why.', type: 'magical', era: 'Fourth Silence' },
  { id: 'wt-14', date: 'CR 1239', year: 1239, title: 'The Senate Begins to Fracture', desc: 'Senators start disappearing. Six in eight months. Their chambers locked from inside.', type: 'political', era: 'Fourth Silence' },
  { id: 'wt-15', date: 'CR 1245', year: 1245, title: 'The Briarsong War (Campaign)', desc: 'The Silver Tongue enters the Thornmarch to investigate violations of the Compact.', type: 'campaign', era: 'Fourth Silence' },
  { id: 'wt-16', date: 'CR 1247', year: 1247, title: 'The Hollow Crown (Campaign)', desc: 'The Ember Pact arrives in Velden during the Festival of Cinders. The story begins.', type: 'campaign', era: 'Fourth Silence' },
];

export const TIMELINE_TYPE_CONFIG: Record<string, TimelineTypeConfig> = {
  cataclysm: { glyph: '☄', color: '#c44' },
  founding:  { glyph: '⚑', color: '#6b9a4a' },
  treaty:    { glyph: '⚖', color: '#7a8ab3' },
  war:       { glyph: '⚔', color: '#b35a3a' },
  political: { glyph: '❖', color: '#b3953a' },
  magical:   { glyph: '✦', color: '#9a6bc4' },
  campaign:  { glyph: '❧', color: '#c9a84c' },
  custom:    { glyph: '✧', color: '#897f68' },
};

export const ERA_CONFIG: Record<string, EraConfig> = {
  'Before Reckoning': { color: '#5e6b3a' },
  'First Silence':    { color: '#7a8ab3' },
  'Second Silence':   { color: '#b3953a' },
  'Third Silence':    { color: '#8a4a2e' },
  'Fourth Silence':   { color: '#c97a55' },
};

// Lookup maps
export const WORLD_BY_ID = Object.fromEntries(WORLDS.map(w => [w.id, w]));
export const WORLD_NPC_BY_ID = Object.fromEntries(WORLD_NPCS.map(x => [x.id, x]));
export const WORLD_LOC_BY_ID = Object.fromEntries(WORLD_LOCATIONS.map(x => [x.id, x]));
export const WORLD_LORE_BY_ID = Object.fromEntries(WORLD_LORE.map(x => [x.id, x]));
export const WORLD_FAC_BY_ID = Object.fromEntries(WORLD_FACTIONS.map(x => [x.id, x]));
export const WORLD_SB_BY_ID = Object.fromEntries(WORLD_BESTIARY.map(x => [x.id, x]));
