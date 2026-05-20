export interface World {
  id: string;
  name: string;
  tagline: string;
  era: string;
  calendar: string;
  year: number;
  campaignIds: string[];
}

export interface WorldFaction {
  id: string;
  worldId: string;
  name: string;
  type: string;
  tone: string;
  desc: string;
}

export interface WorldNPC {
  id: string;
  worldId: string;
  name: string;
  role: string;
  status: 'active' | 'deceased' | 'mythic' | 'unknown';
  desc: string;
  factions: string[];
  location: string | null;
  era: string;
  tags: string[];
}

export interface WorldLocation {
  id: string;
  worldId: string;
  name: string;
  type: string;
  desc: string;
  tags: string[];
  parent: string | null;
}

export interface WorldLoreEntry {
  id: string;
  worldId: string;
  title: string;
  desc: string;
  tags: string[];
}

export interface WorldBestiaryEntry {
  id: string;
  worldId: string;
  name: string;
  cr: string;
  type: string;
  hp: number;
  ac: number;
  desc: string;
  tags: string[];
}

export interface WorldEncounter {
  id: string;
  worldId: string;
  name: string;
  difficulty: string;
  status: string;
  creatures: string[];
  notes: string;
}

export type TimelineEventType = 'cataclysm' | 'founding' | 'treaty' | 'war' | 'political' | 'magical' | 'campaign' | 'custom';

export interface WorldTimelineEvent {
  id: string;
  worldId: string;
  date: string;
  year: number;
  title: string;
  desc: string;
  type: TimelineEventType;
  era: string;
}

export interface TimelineTypeConfig {
  glyph: string;
  color: string;
}

export interface EraConfig {
  color: string;
}

export interface WorldCampaign {
  id: string;
  worldId: string;
  name: string;
  sessions: number;
  party: string;
  lastPlayed: string;
  status: 'active' | 'paused' | 'completed';
}

export type WorldTab = 'overview' | 'lore' | 'locations' | 'npcs' | 'combat' | 'timeline';
