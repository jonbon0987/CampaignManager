import { describe, it, expect } from 'vitest';
import {
  cleanPlayerRecap, quoteSaid, recapFileName, recapHeading, recapMarkdown, recapNames, recapPlainText, splitRecap, MAX_MOMENTS, MAX_QUOTES,
} from './playerRecap';

const lines = [
  { text: 'You reach the ford as the sun goes down.' },
  { text: 'Okay so I rolled a seventeen on that.' },
  { text: 'Brenna says, You will not take me alive,' },
  { text: 'not while the river runs.' },
  { text: 'I draw my sword!' },
];

describe('quoteSaid', () => {
  it('finds the words on the cited line, whatever the punctuation and capitals', () => {
    expect(quoteSaid('I draw my sword', 5, lines)).toBe(true);
    expect(quoteSaid('“you will NOT take me alive”', 3, lines)).toBe(true);
  });

  it('finds a sentence split across the next line', () => {
    expect(quoteSaid('You will not take me alive, not while the river runs.', 3, lines)).toBe(true);
  });

  it('rejects words that weren’t said there, or a line that doesn’t exist', () => {
    expect(quoteSaid('You will never take me', 3, lines)).toBe(false);
    expect(quoteSaid('I draw my sword', 1, lines)).toBe(false);
    expect(quoteSaid('I draw my sword', 99, lines)).toBe(false);
    expect(quoteSaid('I draw my sword', null, lines)).toBe(false);
  });

  it('matches whole words only', () => {
    expect(quoteSaid('raw my sword', 5, lines)).toBe(false);
  });
});

describe('cleanPlayerRecap', () => {
  it('keeps scenes and beats in order, and quotes that were really said', () => {
    const { scenes } = cleanPlayerRecap({
      scenes: [
        { title: ' The ford ', beats: [
          { text: 'The party reached the ford at dusk.', source_line: 1, quote: null },
          { text: 'Brenna refused to surrender.', source_line: 3, quote: { speaker: 'Brenna', words: '“You will not take me alive”' } },
          { text: 'Kutter drew his sword.', source_line: 5, quote: { speaker: 'Kutter (Sam)', words: 'I draw my sword!' } },
        ] },
      ],
    }, lines);
    expect(scenes).toEqual([{
      title: 'The ford',
      beats: [
        { text: 'The party reached the ford at dusk.', source_line: 1, quote: null },
        { text: 'Brenna refused to surrender.', source_line: 3, quote: { speaker: 'Brenna', words: 'You will not take me alive' } },
        { text: 'Kutter drew his sword.', source_line: 5, quote: { speaker: 'Kutter', words: 'I draw my sword!' } },
      ],
    }]);
  });

  it('drops a quote the transcript doesn’t have, keeping its beat', () => {
    const { scenes: [scene] } = cleanPlayerRecap({ scenes: [{ title: 'Ford', beats: [
      { text: 'Brenna made a threat.', source_line: 3, quote: { speaker: 'Brenna', words: 'You will pay for this' } },
    ] }] }, lines);
    expect(scene.beats[0]).toEqual({ text: 'Brenna made a threat.', source_line: 3, quote: null });
  });

  it('never quotes the DM or an unknown speaker', () => {
    const { scenes: [scene] } = cleanPlayerRecap({ scenes: [{ title: 'Ford', beats: [
      { text: 'Night fell.', source_line: 1, quote: { speaker: 'DM', words: 'You reach the ford' } },
      { text: 'Someone shouted.', source_line: 5, quote: { speaker: 'Speaker C', words: 'I draw my sword' } },
    ] }] }, lines);
    expect(scene.beats.map(b => b.quote)).toEqual([null, null]);
  });

  it('keeps no more than a few quotes', () => {
    const beats = Array.from({ length: MAX_QUOTES + 3 }, () => ({ text: 'Kutter drew.', source_line: 5, quote: { speaker: 'Kutter', words: 'I draw my sword' } }));
    const { scenes: [scene] } = cleanPlayerRecap({ scenes: [{ title: 'Ford', beats }] }, lines);
    expect(scene.beats.filter(b => b.quote)).toHaveLength(MAX_QUOTES);
    expect(scene.beats).toHaveLength(MAX_QUOTES + 3);
  });

  it('drops empty beats and scenes, names an untitled scene, and survives nonsense', () => {
    expect(cleanPlayerRecap({ scenes: [
      { title: 'Empty', beats: [{ text: '  ' }] },
      { title: '', beats: [{ text: 'Something happened.' }] },
      'nonsense',
    ] }, lines).scenes).toEqual([{ title: 'Scene 1', beats: [{ text: 'Something happened.', source_line: null, quote: null }] }]);
    expect(cleanPlayerRecap(null, lines)).toEqual({ scenes: [], moments: [] });
    expect(cleanPlayerRecap({ scenes: 'no', moments: 'no' }, lines)).toEqual({ scenes: [], moments: [] });
  });
});

describe('moments to remember', () => {
  const moment = (text: string, source_line: number, quote: { speaker: string; words: string } | null = null) => ({ text, source_line, quote });

  it('keeps them in order, with quotes that were said, the DM’s at the table included', () => {
    const { moments } = cleanPlayerRecap({ scenes: [], moments: [
      moment('Kutter’s player rolled a natural 1 on the most important roll of the night.', 2),
      moment('Kutter charged a river.', 5, { speaker: 'Kutter (Sam)', words: 'I draw my sword' }),
      moment('The DM set the scene with a groan from the table.', 1, { speaker: 'DM', words: 'You reach the ford' }),
    ] }, lines);
    expect(moments).toEqual([
      moment('Kutter’s player rolled a natural 1 on the most important roll of the night.', 2),
      moment('Kutter charged a river.', 5, { speaker: 'Kutter', words: 'I draw my sword' }),
      moment('The DM set the scene with a groan from the table.', 1, { speaker: 'the DM', words: 'You reach the ford' }),
    ]);
  });

  it('drops quotes that weren’t said, and keeps no more than a handful', () => {
    const many = Array.from({ length: MAX_MOMENTS + 2 }, (_, i) => moment(`Moment ${i}.`, 5, { speaker: 'Kutter', words: 'I sheathe my sword' }));
    const { moments } = cleanPlayerRecap({ moments: many }, lines);
    expect(moments).toHaveLength(MAX_MOMENTS);
    expect(moments.every(m => m.quote === null)).toBe(true);
  });

  it('don’t count against the quotes in the scenes', () => {
    const beats = Array.from({ length: MAX_QUOTES }, () => ({ text: 'Kutter drew.', source_line: 5, quote: { speaker: 'Kutter', words: 'I draw my sword' } }));
    const { scenes, moments } = cleanPlayerRecap({
      scenes: [{ title: 'Ford', beats }],
      moments: [moment('A sword was drawn.', 5, { speaker: 'Kutter', words: 'I draw my sword' })],
    }, lines);
    expect(scenes[0].beats.every(b => b.quote)).toBe(true);
    expect(moments[0].quote).not.toBeNull();
  });
});

describe('recapMarkdown', () => {
  it('writes a heading per scene, a bullet per beat and a quote under its beat', () => {
    expect(recapMarkdown({ moments: [], scenes: [
      { title: 'The ford', beats: [
        { text: 'They reached the ford.', source_line: 1, quote: null },
        { text: 'Brenna refused.', source_line: 3, quote: { speaker: 'Brenna', words: 'You will not take me alive' } },
      ] },
      { title: 'After', beats: [{ text: 'They rested.', source_line: 5, quote: null }] },
    ] })).toBe([
      '### The ford',
      '',
      '- They reached the ford.',
      '- Brenna refused.',
      '  > “You will not take me alive” — Brenna',
      '',
      '### After',
      '',
      '- They rested.',
    ].join('\n'));
  });

  it('ends with the moments to remember, when there are any', () => {
    expect(recapMarkdown({
      scenes: [{ title: 'The ford', beats: [{ text: 'They reached the ford.', source_line: 1, quote: null }] }],
      moments: [
        { text: 'A natural 1 at the worst time.', source_line: 2, quote: null },
        { text: 'Kutter, bravely.', source_line: 5, quote: { speaker: 'Kutter', words: 'I draw my sword' } },
      ],
    })).toBe([
      '### The ford',
      '',
      '- They reached the ford.',
      '',
      '### Moments to remember',
      '',
      '- A natural 1 at the worst time.',
      '- Kutter, bravely.',
      '  > “I draw my sword” — Kutter',
    ].join('\n'));
  });
});

describe('recapPlainText', () => {
  it('reads without Markdown marks, under a heading', () => {
    const md = '### The ford\n\n- They **reached** the ford.\n  > “You will not” — Brenna\n- Then [a map](http://x) *appeared*.';
    expect(recapPlainText(md, 'Session 4 · The Bell')).toBe([
      'Session 4 · The Bell',
      '',
      'THE FORD',
      '',
      '• They reached the ford.',
      '    “You will not” — Brenna',
      '• Then a map appeared.',
    ].join('\n'));
  });
});

describe('naming', () => {
  it('heads and names the recap after its session', () => {
    expect(recapHeading({ session_number: 4, title: ' The Drowned Bell ' })).toBe('Session 4 · The Drowned Bell');
    expect(recapHeading({ session_number: 4, title: null })).toBe('Session 4');
    expect(recapFileName({ session_number: 4, title: 'The Drowned Bell!' }, 'md')).toBe('session-4-the-drowned-bell-recap.md');
    expect(recapFileName({ session_number: 12, title: null }, 'md')).toBe('session-12-recap.md');
  });
});

describe('splitRecap', () => {
  it('keeps a short recap as one post', () => {
    expect(splitRecap('**Session 1**\n\n### A\n\n- one', 100)).toEqual(['**Session 1**\n\n### A\n\n- one']);
  });

  it('splits between scenes first', () => {
    const a = '### A\n\n- ' + 'a'.repeat(40);
    const b = '### B\n\n- ' + 'b'.repeat(40);
    expect(splitRecap(`${a}\n\n${b}`, 60)).toEqual([a, b]);
  });

  it('splits a long scene between its lines, and never makes a post too long', () => {
    const scene = ['### A', '', ...Array.from({ length: 6 }, (_, i) => `- beat ${i} ${'x'.repeat(20)}`)].join('\n');
    const posts = splitRecap(scene, 70);
    expect(posts.length).toBeGreaterThan(1);
    expect(posts.every(p => p.length <= 70)).toBe(true);
    expect(posts.join('\n').replace(/\n+/g, '\n')).toBe(scene.replace(/\n+/g, '\n'));
  });
});

describe('recapNames', () => {
  it('lists names only, by kind', () => {
    expect(recapNames({
      pcs: [
        { character_name: 'Kutter', race: 'Half-orc', class: 'Fighter', is_active: true },
        { character_name: 'Retired', race: null, class: null, is_active: false },
        { character_name: 'Wren', race: null, class: null, is_active: true },
      ],
      npcs: [{ name: 'Brenna Coldwater' }, { name: 'Brenna Coldwater' }, { name: '' }],
      locations: [{ name: 'The Ford' }],
      factions: [],
    })).toBe('The party: Kutter (Half-orc Fighter), Wren\nPeople: Brenna Coldwater\nPlaces: The Ford');
  });
});
