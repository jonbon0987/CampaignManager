import { describe, it, expect } from 'vitest';
import { buildSelectedContextBlock, buildDefaultCampaignContextBlock, formatCampaignContext, type SelectedEntity } from './campaignContext';
import type { Session, PlayerCharacter, NPC, Location, Faction, Hook, LoreEntry, Module } from './database.types';
import { makeNPC, makeLocation, makeStatblock, makeModule, makeSubmodule, makeScene } from '../test/fixtures';

const overview = { title: 'Wild Magic', plotSummary: 'Chaos reigns' };
const npc = (over: Partial<SelectedEntity> = {}): SelectedEntity => ({
  kind: 'npc', id: 'n1', label: 'Kutter', sub: 'smith', desc: 'A gruff blacksmith.', meta: ['active'], ...over,
});

describe('buildSelectedContextBlock', () => {
  it('returns an empty string when nothing is selected', () => {
    expect(buildSelectedContextBlock([], overview)).toBe('');
  });

  it('includes the setting header and drops an empty plot line', () => {
    const out = buildSelectedContextBlock([npc()], { title: '', plotSummary: '' });
    expect(out).toContain('== SELECTED CONTEXT ==');
    expect(out).toContain('Setting: Unnamed');
    expect(out).not.toContain('Plot:');
  });

  it('renders label, subtitle, meta tags, and description for an entity', () => {
    const out = buildSelectedContextBlock([npc()], overview);
    expect(out).toContain('Setting: Wild Magic');
    expect(out).toContain('Plot: Chaos reigns');
    expect(out).toContain('NPCs:');
    expect(out).toContain('  Kutter (smith) [active]: A gruff blacksmith.');
  });

  it('groups entities under their user-facing kind headings in canonical order', () => {
    const out = buildSelectedContextBlock([
      { kind: 'hook', id: 'h1', label: 'The Seventh Shard', sub: 'main', desc: '', meta: ['open'] },
      npc(),
    ], overview);
    expect(out).toContain('NPCs:');
    expect(out).toContain('Threads:');       // hook → "Threads"
    // NPCs (npc) come before Threads (hook) in the KINDS order
    expect(out.indexOf('NPCs:')).toBeLessThan(out.indexOf('Threads:'));
  });

  it('omits the subtitle, meta, and description clauses when they are blank', () => {
    const out = buildSelectedContextBlock(
      [{ kind: 'location', id: 'l1', label: 'Duskward', sub: '', desc: '', meta: [] }],
      overview,
    );
    expect(out).toContain('  Duskward\n');
    expect(out).not.toContain('Duskward (');
    expect(out).not.toContain('Duskward [');
  });

  it('truncates a long description to 400 chars with an ellipsis', () => {
    const out = buildSelectedContextBlock([npc({ desc: 'd'.repeat(500) })], overview);
    expect(out).toContain('d'.repeat(400) + '…');
    expect(out).not.toContain('d'.repeat(401));
  });
});

describe('buildDefaultCampaignContextBlock', () => {
  const emptyDefault = { overview, sessions: [], hooks: [], locations: [] };

  it('always emits a campaign header even with no other data', () => {
    const out = buildDefaultCampaignContextBlock(emptyDefault);
    expect(out).toContain('== CAMPAIGN CONTEXT ==');
    expect(out).toContain('Campaign: Wild Magic');
    expect(out).toContain('Plot: Chaos reigns');
    // It signals to the model that this is the fallback, not a curated pick.
    expect(out).toContain('No specific entities were selected');
  });

  it('lists only the last 5 sessions that have a summary', () => {
    const sessions = Array.from({ length: 7 }, (_, i) => ({
      session_number: i + 1,
      summary: i === 6 ? null : `Recap ${i + 1}`,
    }));
    const out = buildDefaultCampaignContextBlock({ ...emptyDefault, sessions });
    expect(out).toContain('Recent Sessions:');
    expect(out).not.toContain('Session #1');   // outside the last-5 window
    expect(out).toContain('Session #6: Recap 6');
    expect(out).not.toContain('Session #7');    // null summary skipped
  });

  it('includes only active threads and omits resolved ones', () => {
    const out = buildDefaultCampaignContextBlock({
      ...emptyDefault,
      hooks: [
        { title: 'The Heist', category: 'main_plot', description: 'One last job.', is_active: true },
        { title: 'Old Debt', category: 'side_quest', description: 'Settled.', is_active: false },
      ],
    });
    expect(out).toContain('Active Threads:');
    expect(out).toContain('The Heist (main_plot): One last job.');
    expect(out).not.toContain('Old Debt');
  });

  it('omits the sessions/threads/locations sections when empty', () => {
    const out = buildDefaultCampaignContextBlock(emptyDefault);
    expect(out).not.toContain('Recent Sessions:');
    expect(out).not.toContain('Active Threads:');
    expect(out).not.toContain('Notable Locations:');
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
      npcs: [makeNPC({ id: 'npc-1', name: 'Kutter', role: 'smith', affiliation: 'Guild', status: 'active', met_by_pcs: true })],
      locations: [makeLocation({ id: 'loc-1', name: 'Duskward', location_type: 'city', region: 'North' })],
    });
    expect(out).toContain('NPCS (1):');
    expect(out).toContain('Kutter');
    expect(out).toContain('[id:npc-1]');
    expect(out).toContain('[id:loc-1]');
    expect(out).toContain(', met'); // met_by_pcs true
  });

  it('shows entity text fields in full up to the truncation limit, so the assistant can revise them in place', () => {
    // Fields under the limit come through whole — this is what lets the assistant
    // integrate an update into the existing text instead of overwriting a partial view.
    const out = formatCampaignContext({
      ...baseData,
      npcs: [makeNPC({ id: 'n', name: 'X', description: 'd'.repeat(1500) })],
    });
    expect(out).toContain('d'.repeat(1500));
    expect(out).not.toContain('…'); // nothing was truncated
  });

  it('truncates entity text fields longer than the limit, marking the cut with an ellipsis', () => {
    const out = formatCampaignContext({
      ...baseData,
      npcs: [makeNPC({ id: 'n', name: 'X', description: 'd'.repeat(1600) })],
    });
    expect(out).toContain('d'.repeat(1500) + '…');
    expect(out).not.toContain('d'.repeat(1501));
  });

  it('counts stat sheets when provided', () => {
    const out = formatCampaignContext({
      ...baseData,
      monsterStatblocks: [makeStatblock({ id: 's1', name: 'Troll', creature_type: 'giant', challenge_rating: '5' })],
    });
    expect(out).toContain('STAT SHEETS (1):');
    expect(out).toContain('Troll');
    expect(out).toContain('[id:s1]');
  });

  // The assistant proposes submodules/scenes against these ids, so the tree
  // beneath each module is load-bearing, not decoration.
  describe('module tree', () => {
    const treeData = {
      ...baseData,
      modules: [makeModule('mod-1', 'active', { title: 'The Sunken Crown' })],
      submodules: [
        makeSubmodule('sub-2', { module_id: 'mod-1', title: 'The Dive', submodule_type: 'exploration', sort_order: 1 }),
        makeSubmodule('sub-1', { module_id: 'mod-1', title: 'The Harbor Bribe', submodule_type: 'social', sort_order: 0, summary: 'Buy passage.' }),
      ],
      scenes: [
        makeScene('sc-2', { submodule_id: 'sub-1', title: 'Cutting Him Out', sort_order: 1 }),
        makeScene('sc-1', { submodule_id: 'sub-1', title: 'The Toll Office', scene_type: 'social', sort_order: 0, summary: 'Vell names his price.' }),
      ],
    };

    it('nests submodules and scenes under their module with matchable ids', () => {
      const out = formatCampaignContext(treeData);
      expect(out).toContain('▸ The Harbor Bribe (social) [id:sub-1]: Buy passage.');
      expect(out).toContain('· The Toll Office (social) [id:sc-1]: Vell names his price.');
      expect(out).toContain('▸ The Dive (exploration) [id:sub-2]');
    });

    it('orders both levels by sort_order, not array order', () => {
      const out = formatCampaignContext(treeData);
      expect(out.indexOf('The Harbor Bribe')).toBeLessThan(out.indexOf('The Dive'));
      expect(out.indexOf('The Toll Office')).toBeLessThan(out.indexOf('Cutting Him Out'));
    });

    it('falls back to "other" for an untyped submodule or scene', () => {
      const out = formatCampaignContext({
        ...baseData,
        modules: [makeModule('mod-1')],
        submodules: [makeSubmodule('s', { module_id: 'mod-1', title: 'Untyped', submodule_type: null })],
        scenes: [makeScene('c', { submodule_id: 's', title: 'Beat', scene_type: null })],
      });
      expect(out).toContain('▸ Untyped (other) [id:s]');
      expect(out).toContain('· Beat (other) [id:c]');
    });

    it('shows a module with no loaded submodules as a bare line', () => {
      const out = formatCampaignContext({ ...baseData, modules: [makeModule('mod-1', 'active', { title: 'Empty' })] });
      expect(out).toContain('[id:mod-1]');
      // No tree row is emitted (the ▸ in the section header is just the legend).
      expect(out).not.toContain('    ▸');
    });

    it('does not attach one module\'s submodules to another', () => {
      const out = formatCampaignContext({
        ...treeData,
        modules: [makeModule('mod-1', 'active', { title: 'A' }), makeModule('mod-2', 'active', { title: 'B' })],
      });
      const bIndex = out.indexOf('[id:mod-2]');
      expect(out.slice(bIndex, out.indexOf('\n', bIndex + 1) + 1)).not.toContain('▸');
    });
  });
});
