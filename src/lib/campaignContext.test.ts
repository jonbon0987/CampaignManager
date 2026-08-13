import { describe, it, expect } from 'vitest';
import { buildCampaignContextBlock, formatCampaignContext, type GenContextData } from './campaignContext';
import type { Session, PlayerCharacter, NPC, Location, Faction, Hook, LoreEntry, Module } from './database.types';

const emptyGen: GenContextData = {
  overview: { title: '', plotSummary: '' },
  sessions: [],
  lore: [],
  locations: [],
};

describe('buildCampaignContextBlock', () => {
  it('falls back to "Unnamed" and omits an empty plot line', () => {
    const out = buildCampaignContextBlock(emptyGen);
    expect(out).toContain('Campaign: Unnamed');
    expect(out).not.toContain('Plot:');
  });

  it('includes the title and plot when present', () => {
    const out = buildCampaignContextBlock({ ...emptyGen, overview: { title: 'Wild Magic', plotSummary: 'Chaos reigns' } });
    expect(out).toContain('Campaign: Wild Magic');
    expect(out).toContain('Plot: Chaos reigns');
  });

  it('lists only the last 5 sessions and skips summary-less ones', () => {
    const sessions = Array.from({ length: 7 }, (_, i) => ({
      session_number: i + 1,
      session_date: null,
      summary: i === 0 ? null : `Summary ${i + 1}`,
    }));
    const out = buildCampaignContextBlock({ ...emptyGen, sessions });
    expect(out).toContain('Recent Sessions:');
    // sessions 1 (null summary) and 2 fall outside the last-5 window / are skipped
    expect(out).not.toContain('Session #1');
    expect(out).not.toContain('Session #2');
    expect(out).toContain('Session #7: Summary 7');
  });

  it('truncates long lore snippets to 120 chars with an ellipsis', () => {
    const long = 'x'.repeat(200);
    const out = buildCampaignContextBlock({
      ...emptyGen,
      lore: [{ title: 'Tome', category: 'history', content: long }],
    });
    expect(out).toContain('[history] Tome: ' + 'x'.repeat(120) + '…');
    expect(out).not.toContain('x'.repeat(121));
  });

  it('omits sections whose arrays are empty', () => {
    const out = buildCampaignContextBlock(emptyGen);
    expect(out).not.toContain('Recent Sessions:');
    expect(out).not.toContain('Lore:');
    expect(out).not.toContain('Locations:');
  });
});

// --- fixtures for formatCampaignContext (only read fields matter) ---
const baseData = {
  sessions: [] as Session[],
  pcs: [] as PlayerCharacter[],
  npcs: [] as NPC[],
  locations: [] as Location[],
  factions: [] as Faction[],
  hooks: [] as Hook[],
  lore: [] as LoreEntry[],
  modules: [] as Module[],
  overviewTitle: 'Test Campaign',
  overviewPlot: 'A plot',
};

describe('formatCampaignContext', () => {
  it('shows "(none)" for every empty section and reflects zero counts', () => {
    const out = formatCampaignContext(baseData);
    expect(out).toContain('SESSIONS (0):');
    expect(out).toContain('PLAYER CHARACTERS (0):');
    expect(out).toContain('(none)');
    expect(out).toContain('STAT SHEETS (0):'); // monsterStatblocks omitted → 0
  });

  it('emits an [id:...] tag for each entity (relied on by entity matching)', () => {
    const out = formatCampaignContext({
      ...baseData,
      npcs: [{ id: 'npc-1', name: 'Kutter', role: 'smith', affiliation: 'Guild', status: 'active', met_by_pcs: true } as unknown as NPC],
      locations: [{ id: 'loc-1', name: 'Duskward', location_type: 'city', region: 'North' } as unknown as Location],
    });
    expect(out).toContain('NPCS (1):');
    expect(out).toContain('Kutter');
    expect(out).toContain('[id:npc-1]');
    expect(out).toContain('[id:loc-1]');
    expect(out).toContain(', met'); // met_by_pcs true
  });

  it('truncates entity text fields longer than 500 chars', () => {
    const out = formatCampaignContext({
      ...baseData,
      npcs: [{ id: 'n', name: 'X', role: null, affiliation: null, status: 'active', met_by_pcs: false, description: 'd'.repeat(600) } as unknown as NPC],
    });
    expect(out).toContain('d'.repeat(500) + '…');
    expect(out).not.toContain('d'.repeat(501));
  });

  it('counts stat sheets when provided', () => {
    const out = formatCampaignContext({
      ...baseData,
      monsterStatblocks: [{ id: 's1', name: 'Troll', creature_type: 'giant', challenge_rating: '5' } as any],
    });
    expect(out).toContain('STAT SHEETS (1):');
    expect(out).toContain('Troll');
    expect(out).toContain('[id:s1]');
  });
});
