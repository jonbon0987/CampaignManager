import { describe, it, expect } from 'vitest';
import { PRESETS } from './calendar';
import { exportJson, markdownFiles, picturePaths, slug, type CampaignExport, type ExportTables } from './campaignMarkdown';

const row = <T>(over: Record<string, unknown>) => ({ user_id: 'u', created_at: '', updated_at: '', ...over }) as T;

const empty: ExportTables = {
  player_characters: [], npcs: [], factions: [], locations: [], lore_entries: [], hooks: [], ideas: [], modules: [],
  module_dependencies: [], module_sheets: [], submodules: [], scenes: [], sessions: [], encounters: [], monster_statblocks: [],
  random_encounter_tables: [], items: [], item_holdings: [], handouts: [], character_relationships: [], entity_session_entries: [],
  session_recordings: [], transcript_segments: [], recording_moments: [],
};

function fixture(): CampaignExport {
  return {
    exportedAt: '2026-11-02T18:00:00.000Z',
    campaign: row({ id: 'c1', name: 'shadows', title: 'Shadows over Phandalin', status: 'active', description: 'A frontier mystery.', plot_summary: null, world_info: null, major_characters: null, world_id: 'w1', world_date: null }),
    world: { id: 'w1', name: 'Faerûn', era: 'DR', calendar: 'DR', year: 1492, calendar_months: PRESETS.find(p => p.id === 'harptos')!.months },
    canon: {
      npcs: [row({ id: 'n9', name: 'Elminster', role: 'Sage', portrait_path: 'u/elm.webp', faction_ids: [] })],
      locations: [row({ id: 'l9', name: 'Waterdeep', location_type: 'City', parent_id: null })],
      lore_entries: [row({ id: 'lo9', title: 'The Weave', category: 'Magic', content: 'All magic flows through it.', dm_only: false })],
    },
    tables: {
      ...empty,
      player_characters: [
        row({ id: 'p1', character_name: 'Kael', race: 'Elf', class: 'Wizard', level: 5, armor_class: 13, max_hp: 27, player_name: 'Sam', is_active: true, portrait_path: 'u/kael.webp', key_npc_ids: ['n1'], faction_ids: [] }),
      ],
      npcs: [
        row({ id: 'n1', name: 'Sable Thorne', role: 'Spymaster', description: 'Works for @[the Grey Hand](faction:f1).', faction_ids: ['f1'], location_id: 'l2', portrait_path: 'u/sable.webp', met_by_pcs: true }),
        row({ id: 'n2', name: 'Sable Thorne', role: 'Twin', portrait_path: 'u/sable2.webp', faction_ids: [] }),
      ],
      factions: [row({ id: 'f1', name: 'The Grey Hand', faction_type: 'Guild', key_figure_ids: ['n1'] })],
      locations: [
        row({ id: 'l1', name: 'Phandalin', location_type: 'Town', parent_id: null, read_aloud: 'Smoke rises over the rooftops.' }),
        row({ id: 'l2', name: 'The Sleeping Giant', location_type: 'Tavern', parent_id: 'l1', map_path: 'u/giant.png' }),
      ],
      lore_entries: [row({ id: 'lo1', title: 'The Black Spider', category: 'Villains', content: 'A drow seeking Wave Echo Cave.', dm_only: true })],
      hooks: [
        row({ id: 'h1', title: 'Find Gundren', state: 'active', is_active: true, category: 'main_plot', description: 'He never arrived.' }),
        row({ id: 'h2', title: 'An old debt', state: null, is_active: false }),
      ],
      ideas: [row({ id: 'i1', text: 'A ghost in the mine', tag: 'npc' })],
      sessions: [row({
        id: 's1', session_number: 1, title: 'Goblin Arrows', status: 'done', session_date: '2026-10-26', summary: 'Ambushed on the road.',
        world_start: { year: 1492, day: 136 }, world_end: { year: 1492, day: 138 }, plan: { scene_ids: [] }, hooks_notes: 'Who took Gundren?',
      })],
      session_recordings: [row({ id: 'r1', session_id: 's1', started_at: '2026-10-26T19:00:00Z' })],
      transcript_segments: [
        row({ id: 't2', recording_id: 'r1', start_ms: 65000, text: 'I search the bodies.', pc_id: 'p1', is_dm: false, speaker_label: 'A', dropped_as_echo: false }),
        row({ id: 't1', recording_id: 'r1', start_ms: 3000, text: 'You see goblins.', pc_id: null, is_dm: true, speaker_label: 'B', dropped_as_echo: false }),
        row({ id: 't3', recording_id: 'r1', start_ms: 4000, text: 'echo', pc_id: null, is_dm: false, speaker_label: 'C', dropped_as_echo: true }),
      ],
      monster_statblocks: [row({ id: 'm1', name: 'Goblin', creature_type: 'humanoid', challenge_rating: '1/4', armor_class: 15, hit_points: 7, dex: 14, str: 8 })],
      encounters: [row({ id: 'e1', name: 'Goblin Ambush', difficulty: 'medium', status: 'ready', sort_order: 0,
        combatants: JSON.stringify([{ id: 'x', source: 'saved', statblock_id: 'm1', name: 'Goblin', creature_type: null, challenge_rating: '1/4', count: 4, notes: null }]) })],
      random_encounter_tables: [row({ id: 'rt1', name: 'Road', die_size: 6, sort_order: 0, entries: JSON.stringify([
        { id: 'a', name: 'Wolves', description: 'Two | hungry', weight: 1, rarity: null },
        { id: 'b', name: 'Nothing', description: '', weight: 1, rarity: null },
      ]) })],
      items: [row({ id: 'it1', name: 'Flame Tongue', item_type: 'weapon', rarity: 'rare', attunement: true, attunement_note: null, image_path: 'u/sword.webp' })],
      item_holdings: [
        row({ id: 'ih1', item_id: 'it1', pc_id: 'p1', quantity: 1, attuned: true, session_id: 's1' }),
        row({ id: 'ih2', item_id: 'it1', pc_id: null, quantity: 2, attuned: false, session_id: null }),
      ],
      modules: [row({ id: 'mo1', title: 'Phandelver', chapter: 'Chapter 1', status: 'active' })],
      submodules: [row({ id: 'sm1', module_id: 'mo1', title: 'Cragmaw Hideout', sort_order: 0 })],
      scenes: [row({ id: 'sc1', submodule_id: 'sm1', title: 'The Cave Mouth', sort_order: 0, read_aloud: 'Water rushes past.\nThe dark yawns.' })],
      handouts: [row({ id: 'ha1', scene_id: 'sc1', title: 'Map', image_path: 'u/map.webp', sort_order: 0 })],
      character_relationships: [row({ id: 'cr1', from_kind: 'pc', from_id: 'p1', to_kind: 'npc', to_id: 'n1', relationship_type: 'rival', label: 'old partners' })],
      entity_session_entries: [row({ id: 'es1', entity_type: 'npc', entity_id: 'n1', session_id: 's1', text: 'Sold @[Kael](pc:p1) a map.' })],
    },
  };
}

describe('slug', () => {
  it('makes file-safe names', () => {
    expect(slug('Faerûn: The Sword Coast!')).toBe('faerun-the-sword-coast');
    expect(slug('  ', 'campaign')).toBe('campaign');
  });
});

describe('picturePaths', () => {
  it('files each picture by kind and name, keeping names apart', () => {
    const pics = picturePaths(fixture());
    expect(pics.get('u/kael.webp')).toBe('pictures/party/kael.webp');
    expect(pics.get('u/sable.webp')).toBe('pictures/cast/sable-thorne.webp');
    expect(pics.get('u/sable2.webp')).toBe('pictures/cast/sable-thorne-2.webp');
    expect(pics.get('u/elm.webp')).toBe('pictures/cast/elminster.webp');
    expect(pics.get('u/giant.png')).toBe('pictures/places/the-sleeping-giant.png');
    expect(pics.get('u/sword.webp')).toBe('pictures/items/flame-tongue.webp');
    expect(pics.get('u/map.webp')).toBe('pictures/handouts/map.webp');
  });
});

describe('markdownFiles', () => {
  const data = fixture();
  const pics = picturePaths(data);
  pics.delete('u/sable2.webp'); // as if it couldn't be fetched
  const files = markdownFiles(data, pics, 1);

  it('writes a file per part that has records, and a transcript per recorded session', () => {
    expect(Object.keys(files).sort()).toEqual([
      'Bestiary.md', 'Cast.md', 'Encounters.md', 'Factions.md', 'Items.md', 'Lore.md', 'Modules.md', 'Party.md',
      'Places.md', 'README.md', 'Sessions.md', 'Threads.md', 'transcripts/session-01.md',
    ]);
  });

  it('opens with a README that links each part and says what’s missing', () => {
    const r = files['README.md'];
    expect(r).toContain('# Shadows over Phandalin');
    expect(r).toContain('*In Faerûn · active · Exported 2026-11-02*');
    expect(r).toContain('- [Cast](Cast.md): 3');
    expect(r).toContain('(6 pictures)');
    expect(r).toContain('1 picture couldn’t be fetched and is missing.');
  });

  it('writes mentions as plain names, marks canon, and links fetched pictures only', () => {
    const cast = files['Cast.md'];
    expect(cast).toContain('Works for the Grey Hand.');
    expect(cast).toContain('*Spymaster · The Grey Hand · at The Sleeping Giant · met by the party*');
    expect(cast).toContain('![Portrait of Sable Thorne](pictures/cast/sable-thorne.webp)');
    expect(cast).not.toContain('sable-thorne-2');
    expect(cast).toContain('*Sage · world canon*');
    expect(cast).toContain('- Session 1 · Goblin Arrows: Sold Kael a map.');
    expect(cast).toContain('- Kael → Sable Thorne: rival (old partners)');
  });

  it('describes the party with what each carries, and the stash', () => {
    const party = files['Party.md'];
    expect(party).toContain('*Elf Wizard · level 5 · played by Sam*');
    expect(party).toContain('*AC 13 · HP 27*');
    expect(party).toContain('- Sable Thorne');
    expect(party).toContain('- Flame Tongue (attuned)');
    expect(party).toContain('## The party’s stash\n\n- Flame Tongue ×2');
  });

  it('dates sessions in the world, lists loot handed out, and links the transcript', () => {
    const s = files['Sessions.md'];
    expect(s).toContain('*Played · Oct 26, 2026 · in the world 14–16 Mirtul 1492 DR*');
    expect(s).toContain('- Flame Tongue to Kael');
    expect(s).toContain('[Transcript](transcripts/session-01.md)');
  });

  it('writes the transcript in order, by speaker, without echoes', () => {
    const t = files['transcripts/session-01.md'];
    expect(t).toContain('**0:03 · DM:** You see goblins.');
    expect(t).toContain('**1:05 · Kael:** I search the bodies.');
    expect(t.indexOf('0:03')).toBeLessThan(t.indexOf('1:05'));
    expect(t).not.toContain('echo');
  });

  it('nests places and threads, and quotes read-aloud', () => {
    expect(files['Places.md']).toContain('*Tavern · within Phandalin*');
    expect(files['Places.md']).toContain('> Smoke rises over the rooftops.');
    expect(files['Threads.md']).toMatch(/## Inbox\n\n- A ghost in the mine \(npc\)/);
    expect(files['Threads.md'].indexOf('## Active')).toBeLessThan(files['Threads.md'].indexOf('## Resolved'));
    expect(files['Modules.md']).toContain('## Chapter 1 · Phandelver');
    expect(files['Modules.md']).toContain('> Water rushes past.\n> The dark yawns.');
    expect(files['Modules.md']).toContain('![Handout: Map](pictures/handouts/map.webp)');
  });

  it('reads encounters and random tables from their stored JSON', () => {
    const e = files['Encounters.md'];
    expect(e).toContain('- 4 × Goblin (CR 1/4)');
    expect(e).toContain('| 1–3 | Wolves | Two \\| hungry |');
    expect(e).toContain('| 4–6 | Nothing |  |');
    expect(files['Bestiary.md']).toContain('*AC 15 · HP 7*');
    expect(files['Bestiary.md']).toContain('| 8 (-1) | 14 (+2) |');
  });

  it('leaves out parts with nothing in them', () => {
    const bare = markdownFiles({ ...data, canon: { npcs: [], locations: [], lore_entries: [] }, tables: empty }, new Map());
    expect(Object.keys(bare)).toEqual(['README.md']);
    expect(bare['README.md']).not.toContain('pictures/');
  });
});

describe('exportJson', () => {
  it('keeps every row as stored, under a named format', () => {
    const json = JSON.parse(exportJson(fixture()));
    expect(json.format).toBe('campaign-manager-export');
    expect(json.version).toBe(1);
    expect(typeof json.tables.encounters[0].combatants).toBe('string');
    expect(json.canon.npcs[0].name).toBe('Elminster');
  });
});
