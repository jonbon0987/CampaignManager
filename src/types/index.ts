export interface CampaignOverview {
  title: string;
  plotSummary: string;
  majorCharacters: string;
  worldInfo: string;
}

export interface Session {
  id: string;
  number: number;
  date: string;
  title: string;
  notes: string;
}

export interface PC {
  id: string;
  playerName: string;
  characterName: string;
  race: string;
  characterClass: string;
  level: number;
  backstory: string;
  hooks: string;
  connections: string;
}

export interface NPC {
  id: string;
  name: string;
  role: string;
  description: string;
  backstory: string;
  connections: string;
  notes: string;
  status: 'alive' | 'dead' | 'unknown' | 'missing';
}

export interface Location {
  id: string;
  name: string;
  type: 'region' | 'city' | 'town' | 'dungeon' | 'building' | 'landmark' | 'wilderness' | 'other';
  description: string;
  lore: string;
  currentInfo: string;
}

export interface CampaignModule {
  id: string;
  number: number;
  title: string;
  description: string;
  keyEvents: string;
  status: 'upcoming' | 'active' | 'completed';
}

export interface Hook {
  id: string;
  title: string;
  content: string;
  priority: 'low' | 'medium' | 'high';
  used: boolean;
}

export interface CampaignData {
  overview: CampaignOverview;
  sessions: Session[];
  pcs: PC[];
  npcs: NPC[];
  locations: Location[];
  modules: CampaignModule[];
  hooks: Hook[];
}

export const defaultCampaignData: CampaignData = {
  overview: {
    title: '',
    plotSummary: '',
    majorCharacters: '',
    worldInfo: '',
  },
  sessions: [],
  pcs: [],
  npcs: [],
  locations: [],
  modules: [],
  hooks: [],
};
