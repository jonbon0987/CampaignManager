import type { Faction, Location, LoreEntry, NPC } from '../lib/database.types';
import type { Month } from '../lib/calendar';

export interface World {
  id: string;
  name: string;
  tagline: string;
  era: string;
  /** The year's suffix, "DR". */
  calendar: string;
  year: number;
  /** The world's months, in order (the default calendar when none are set). */
  calendarMonths: Month[];
  campaignIds: string[];
}

export interface WorldFaction {
  id: string;
  worldId: string;
  name: string;
  type: string;
  tone: string;
  desc: string;
  dmNotes?: string;
  /** The database row, which the shared editor works on. */
  row?: Faction;
}

export interface WorldNPC {
  id: string;
  worldId: string;
  name: string;
  role: string;
  status: 'active' | 'deceased' | 'mythic' | 'unknown';
  desc: string;
  dmNotes?: string;
  factions: string[];
  location: string | null;
  era: string;
  tags: string[];
  /** The database row, which the shared editor works on. */
  row?: NPC;
}

export interface WorldLocation {
  id: string;
  worldId: string;
  name: string;
  type: string;
  desc: string;
  region?: string;
  population?: string;
  status?: string;
  history?: string;
  dmNotes?: string;
  tags: string[];
  parent: string | null;
  /** The database row, which the shared editor works on. */
  row?: Location;
}

export interface WorldLoreEntry {
  id: string;
  worldId: string;
  title: string;
  desc: string;
  dmOnly?: boolean;
  tags: string[];
  /** The database row, which the shared editor works on. */
  row?: LoreEntry;
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
  /** Order within its year: a campaign event's day of the year. */
  order?: number;
  /** Day of the year in the world's calendar, for an event set to a date. */
  day?: number | null;
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
  /** Archived campaigns leave the world's lists until restored. */
  archived: boolean;
}

export type WorldTab = 'overview' | 'lore' | 'locations' | 'npcs' | 'combat' | 'timeline';
