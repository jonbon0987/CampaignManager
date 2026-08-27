import { describe, it, expect } from 'vitest';
import {
  buildModuleStructurePrompt,
  parseModuleStructure,
  countScenes,
  clampField,
  SUBMODULE_TYPES,
  SCENE_TYPES,
} from './moduleStructure';
import { LIMIT } from './fieldLimits';

const MODULE = {
  title: 'The Sunken Crown',
  chapter: '3',
  synopsis: 'The party dives for a drowned regalia the Tide Cult also wants.',
};

describe('buildModuleStructurePrompt', () => {
  it('carries the module fields and the requested counts', () => {
    const p = buildModuleStructurePrompt({ module: MODULE, submoduleCount: 4, scenesPer: 3 });
    expect(p).toContain('The Sunken Crown');
    expect(p).toContain('Chapter: 3');
    expect(p).toContain('drowned regalia');
    expect(p).toContain('author 4 submodules');
    expect(p).toContain('exactly 3 scenes');
    expect(p).toContain('Return exactly 4 submodules.');
  });

  it('singularises a one-submodule, one-scene request', () => {
    const p = buildModuleStructurePrompt({ module: MODULE, submoduleCount: 1, scenesPer: 1 });
    expect(p).toContain('author 1 submodule —');
    expect(p).toContain('exactly 1 scene ');
    expect(p).toContain('Return exactly 1 submodule.');
  });

  it('suppresses scenes when scenesPer is 0', () => {
    const p = buildModuleStructurePrompt({ module: MODULE, submoduleCount: 3, scenesPer: 0 });
    expect(p).toContain('Do NOT author scenes');
    expect(p).not.toContain('exactly 0 scenes');
  });

  it('lists existing submodules as ground not to re-cover', () => {
    const p = buildModuleStructurePrompt({
      module: { ...MODULE, existingTitles: ['The Harbor Bribe', ''] },
      submoduleCount: 2, scenesPer: 2,
    });
    expect(p).toContain('ALREADY has these submodules');
    expect(p).toContain('- The Harbor Bribe');
    // Blank titles are dropped rather than listed as an empty bullet.
    expect(p).not.toContain('- \n');
  });

  it('omits the existing-submodules block when there are none', () => {
    const p = buildModuleStructurePrompt({ module: MODULE, submoduleCount: 2, scenesPer: 2 });
    expect(p).not.toContain('ALREADY has these submodules');
  });

  it('marks the DM description as outranking the synopsis, and appends context + instructions', () => {
    const p = buildModuleStructurePrompt({
      module: MODULE,
      submoduleCount: 3, scenesPer: 2,
      description: 'The crown is a fake.',
      contextBlock: '\n\n== SELECTED CONTEXT ==\nNPC: Harbormaster Vell',
      additional: 'keep the combat light',
    });
    expect(p).toContain('outranks the synopsis');
    expect(p).toContain('The crown is a fake.');
    expect(p).toContain('Harbormaster Vell');
    expect(p).toContain('Additional DM instructions: keep the combat light');
  });

  it('offers only the shared type vocabularies', () => {
    const p = buildModuleStructurePrompt({ module: MODULE, submoduleCount: 2, scenesPer: 2 });
    expect(p).toContain(SUBMODULE_TYPES.join('|'));
    expect(p).toContain(SCENE_TYPES.join('|'));
  });
});

describe('parseModuleStructure', () => {
  const good = JSON.stringify({
    submodules: [
      {
        title: 'The Harbor Bribe',
        type: 'social',
        summary: 'Buy passage past the harbormaster.',
        content: 'Long write-up.',
        dm_notes: 'Vell folds at 50gp.',
        scenes: [
          { title: 'The Toll Office', type: 'social', summary: 'Vell names his price.' },
          { title: 'Cutting Him Out', type: 'exploration', content: 'Sneak the seawall.' },
        ],
      },
      { title: 'The Dive', type: 'exploration', scenes: [] },
    ],
  });

  it('maps titles, types, and nested scenes', () => {
    const subs = parseModuleStructure(good);
    expect(subs).toHaveLength(2);
    expect(subs[0].title).toBe('The Harbor Bribe');
    expect(subs[0].submodule_type).toBe('social');
    expect(subs[0].scenes.map(s => s.title)).toEqual(['The Toll Office', 'Cutting Him Out']);
    expect(subs[0].scenes[1].scene_type).toBe('exploration');
    expect(subs[1].scenes).toEqual([]);
  });

  it('leaves absent optional fields null rather than empty strings', () => {
    const subs = parseModuleStructure(good);
    expect(subs[1].summary).toBeNull();
    expect(subs[1].content).toBeNull();
    expect(subs[0].scenes[0].content).toBeNull();
  });

  it('strips code fences', () => {
    expect(parseModuleStructure('```json\n' + good + '\n```')).toHaveLength(2);
  });

  it('accepts a bare array without the wrapper object', () => {
    const subs = parseModuleStructure(JSON.stringify([{ title: 'Alone', scenes: [] }]));
    expect(subs[0].title).toBe('Alone');
  });

  it('falls back to a valid type when the model invents one', () => {
    const subs = parseModuleStructure(JSON.stringify({
      submodules: [{ title: 'X', type: 'shenanigans', scenes: [{ title: 'Y', type: 'interpretive-dance' }] }],
    }));
    expect(subs[0].submodule_type).toBe('location');
    expect(subs[0].scenes[0].scene_type).toBe('encounter');
  });

  it('accepts the DB column names as well as the short "type" key', () => {
    const subs = parseModuleStructure(JSON.stringify({
      submodules: [{ title: 'X', submodule_type: 'heist', scenes: [{ title: 'Y', scene_type: 'trap' }] }],
    }));
    expect(subs[0].submodule_type).toBe('heist');
    expect(subs[0].scenes[0].scene_type).toBe('trap');
  });

  it('titles an untitled scene rather than dropping it, when it has other content', () => {
    const subs = parseModuleStructure(JSON.stringify({
      submodules: [{ title: 'X', scenes: [{ summary: 'a beat with no name' }] }],
    }));
    expect(subs[0].scenes[0].title).toBe('Untitled scene');
  });

  it('skips junk entries in the arrays', () => {
    const subs = parseModuleStructure(JSON.stringify({
      submodules: [null, 'nope', { title: 'Real', scenes: [null, { title: 'S' }] }],
    }));
    expect(subs).toHaveLength(1);
    expect(subs[0].scenes).toHaveLength(1);
  });

  it('throws when nothing usable came back', () => {
    expect(() => parseModuleStructure('{"submodules":[]}')).toThrow(/no usable submodules/);
    expect(() => parseModuleStructure('not json')).toThrow();
  });

  it('trims generated text to the column caps so one long write-up cannot reject the tree', () => {
    const subs = parseModuleStructure(JSON.stringify({
      submodules: [{
        title: 'T'.repeat(LIMIT.NAME + 50),
        content: 'C'.repeat(LIMIT.BODY + 100),
        scenes: [{ title: 'S', summary: 'x'.repeat(LIMIT.PROSE + 10) }],
      }],
    }));
    expect(subs[0].title).toHaveLength(LIMIT.NAME);
    expect(subs[0].content).toHaveLength(LIMIT.BODY);
    expect(subs[0].scenes[0].summary).toHaveLength(LIMIT.PROSE);
  });
});

describe('clampField', () => {
  it('passes through values inside the cap and leaves nulls alone', () => {
    expect(clampField('submodules', 'title', 'Short')).toBe('Short');
    expect(clampField('submodules', 'title', null)).toBeNull();
  });
  it('leaves uncapped columns untouched', () => {
    const long = 'x'.repeat(100_000);
    expect(clampField('submodules', 'not_a_column', long)).toBe(long);
  });
});

describe('countScenes', () => {
  it('totals scenes across the tree', () => {
    const subs = parseModuleStructure(JSON.stringify({
      submodules: [
        { title: 'A', scenes: [{ title: '1' }, { title: '2' }] },
        { title: 'B', scenes: [{ title: '3' }] },
        { title: 'C', scenes: [] },
      ],
    }));
    expect(countScenes(subs)).toBe(3);
    expect(countScenes([])).toBe(0);
  });
});
