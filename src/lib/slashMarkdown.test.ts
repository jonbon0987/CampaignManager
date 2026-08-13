import { describe, it, expect } from 'vitest';
import {
  parseToHTML, serialize, indentListItem, outdentListItem,
  normalizeKind, serializeRef, refRegex, hasRefs, parseSegments,
  esc, pillHTML, mdToPlain,
} from './slashMarkdown';

const NEW = '@[Kutter](npc:abc-123)';
const LEGACY = '[[npc:12345678-1234-1234-1234-123456789012:Kutter]]';

/** Round-trip markdown → DOM (via parseToHTML) → markdown (via serialize). */
function roundTrip(md: string): string {
  const ed = document.createElement('div');
  ed.innerHTML = parseToHTML(md);
  return serialize(ed);
}

describe('nested lists', () => {
  it('parses indentation into nested <ul>', () => {
    const html = parseToHTML('- A\n- B\n  - B1\n  - B2\n    - B2a\n- C');
    expect(html).toBe(
      '<ul><li>A</li><li>B<ul><li>B1</li><li>B2<ul><li>B2a</li></ul></li></ul></li><li>C</li></ul>',
    );
  });

  it('starts a fresh list when the marker type changes at the same level', () => {
    const html = parseToHTML('- bullet\n1. number');
    expect(html).toBe('<ul><li>bullet</li></ul><ol><li>number</li></ol>');
  });

  it('round-trips a nested unordered list', () => {
    const md = '- A\n- B\n  - B1\n  - B2\n    - B2a\n- C';
    expect(roundTrip(md)).toBe(md);
  });

  it('round-trips nested ordered lists with renumbering', () => {
    const md = '1. one\n2. two\n  1. two-a\n  2. two-b\n3. three';
    expect(roundTrip(md)).toBe(md);
  });

  it('normalizes irregular indentation to a stable 2-space form', () => {
    // Source uses 3-space indent (aligned under "1. "); serialize emits 2 spaces,
    // and a second pass is a fixed point.
    const once = roundTrip('1. one\n   1. deep');
    expect(once).toBe('1. one\n  1. deep');
    expect(roundTrip(once)).toBe(once);
  });

  it('round-trips a mix of ordered and unordered nesting', () => {
    const md = '- top\n  1. first\n  2. second\n- back';
    expect(roundTrip(md)).toBe(md);
  });

  it('leaves flat lists unchanged', () => {
    const md = '- one\n- two\n- three';
    expect(roundTrip(md)).toBe(md);
  });
});

/** Build an editor DOM from markdown and return the nth top-level <li>. */
function editorFrom(md: string) {
  const ed = document.createElement('div');
  ed.innerHTML = parseToHTML(md);
  return ed;
}

describe('indentListItem (Tab)', () => {
  it('nests an item under its previous sibling', () => {
    const ed = editorFrom('- A\n- B');
    const li = ed.querySelectorAll('li')[1] as HTMLElement;
    expect(indentListItem(li)).toBe(true);
    expect(serialize(ed)).toBe('- A\n  - B');
  });

  it('refuses to indent the first item (no previous sibling)', () => {
    const ed = editorFrom('- A\n- B');
    const li = ed.querySelectorAll('li')[0] as HTMLElement;
    expect(indentListItem(li)).toBe(false);
    expect(serialize(ed)).toBe('- A\n- B');
  });

  it('merges into an existing sublist rather than making a second one', () => {
    const ed = editorFrom('- A\n  - A1\n- B');
    const b = [...ed.querySelectorAll('li')].find(l => l.textContent?.startsWith('B'))! as HTMLElement;
    expect(indentListItem(b)).toBe(true);
    expect(serialize(ed)).toBe('- A\n  - A1\n  - B');
  });
});

describe('outdentListItem (Shift+Tab)', () => {
  it('promotes a nested item to a sibling of its parent', () => {
    const ed = editorFrom('- A\n  - B');
    const b = [...ed.querySelectorAll('li')].find(l => l.textContent === 'B')! as HTMLElement;
    expect(outdentListItem(b)).toBe(true);
    expect(serialize(ed)).toBe('- A\n- B');
  });

  it('turns a top-level item into a paragraph', () => {
    const ed = editorFrom('- only');
    const li = ed.querySelector('li') as HTMLElement;
    expect(outdentListItem(li)).toBe(true);
    expect(serialize(ed)).toBe('only');
    expect(ed.querySelector('ul')).toBeNull();
  });

  it('keeps trailing siblings nested under the promoted item', () => {
    const ed = editorFrom('- A\n  - B\n  - C\n  - D');
    const b = [...ed.querySelectorAll('li')].find(l => l.textContent === 'B')! as HTMLElement;
    expect(outdentListItem(b)).toBe(true);
    // B moves up beside A; C and D follow as B's sublist.
    expect(serialize(ed)).toBe('- A\n- B\n  - C\n  - D');
  });

  it('indent then outdent is a no-op', () => {
    const md = '- A\n- B';
    const ed = editorFrom(md);
    const li = ed.querySelectorAll('li')[1] as HTMLElement;
    indentListItem(li);
    outdentListItem(li);
    expect(serialize(ed)).toBe(md);
  });
});

describe('normalizeKind', () => {
  it('maps the legacy "creature" kind to "statblock"', () => {
    expect(normalizeKind('creature')).toBe('statblock');
  });
  it('passes other kinds through unchanged', () => {
    expect(normalizeKind('npc')).toBe('npc');
    expect(normalizeKind('location')).toBe('location');
  });
});

describe('serializeRef', () => {
  it('emits the canonical @[Label](kind:id) form', () => {
    expect(serializeRef('npc', 'abc-123', 'Kutter')).toBe('@[Kutter](npc:abc-123)');
  });
  it('normalizes creature → statblock in the output', () => {
    expect(serializeRef('creature', 'x1', 'Troll')).toBe('@[Troll](statblock:x1)');
  });
});

describe('refRegex', () => {
  it('returns a fresh regex each call (no shared lastIndex)', () => {
    const a = refRegex();
    const b = refRegex();
    expect(a).not.toBe(b);
    a.exec(`x ${NEW}`);
    // b is fresh, so it still matches from the start
    expect(b.exec(`x ${NEW}`)).not.toBeNull();
  });
});

describe('hasRefs', () => {
  it('detects new-format references', () => {
    expect(hasRefs(`hello ${NEW} world`)).toBe(true);
  });
  it('detects legacy-format references', () => {
    expect(hasRefs(`see ${LEGACY}`)).toBe(true);
  });
  it('is false for plain text', () => {
    expect(hasRefs('just some prose, no refs')).toBe(false);
  });
});

describe('parseSegments', () => {
  it('returns a single text segment for plain text', () => {
    expect(parseSegments('hello world')).toEqual([{ type: 'text', value: 'hello world' }]);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseSegments('')).toEqual([]);
  });

  it('splits surrounding text around a new-format reference', () => {
    expect(parseSegments(`Hi ${NEW}!`)).toEqual([
      { type: 'text', value: 'Hi ' },
      { type: 'entity', entityType: 'npc', id: 'abc-123', displayName: 'Kutter' },
      { type: 'text', value: '!' },
    ]);
  });

  it('parses a legacy reference and keeps the uuid + name', () => {
    expect(parseSegments(LEGACY)).toEqual([
      { type: 'entity', entityType: 'npc', id: '12345678-1234-1234-1234-123456789012', displayName: 'Kutter' },
    ]);
  });

  it('normalizes a legacy creature reference to statblock', () => {
    const seg = parseSegments('[[creature:12345678-1234-1234-1234-123456789012:Troll]]');
    expect(seg).toEqual([
      { type: 'entity', entityType: 'statblock', id: '12345678-1234-1234-1234-123456789012', displayName: 'Troll' },
    ]);
  });

  it('handles multiple references in one string', () => {
    const segs = parseSegments(`${NEW} and @[Duskward](location:loc-9)`);
    expect(segs.filter(s => s.type === 'entity')).toHaveLength(2);
  });
});

describe('esc', () => {
  it('escapes HTML-significant characters', () => {
    expect(esc('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d &quot;e&quot;');
  });
  it('leaves safe text untouched', () => {
    expect(esc("Kutter's forge")).toBe("Kutter's forge");
  });
});

describe('pillHTML', () => {
  it('embeds escaped kind/id/label data attributes and the kind glyph', () => {
    const html = pillHTML('npc', 'id-1', 'Kutter');
    expect(html).toContain('class="rre-pill"');
    expect(html).toContain('data-ref-kind="npc"');
    expect(html).toContain('data-ref-id="id-1"');
    expect(html).toContain('data-ref-label="Kutter"');
    expect(html).toContain('◇'); // npc glyph
  });
  it('normalizes creature → statblock', () => {
    expect(pillHTML('creature', 'x', 'T')).toContain('data-ref-kind="statblock"');
  });
  it('escapes a label containing HTML', () => {
    expect(pillHTML('npc', 'x', '<b>&')).toContain('data-ref-label="&lt;b&gt;&amp;"');
  });
});

describe('mdToPlain', () => {
  it('returns an empty string for null/undefined', () => {
    expect(mdToPlain(null)).toBe('');
    expect(mdToPlain(undefined)).toBe('');
  });
  it('strips heading markers', () => {
    expect(mdToPlain('## The Citadel')).toBe('The Citadel');
  });
  it('turns list markers into bullets', () => {
    expect(mdToPlain('- one\n- two')).toBe('• one • two');
  });
  it('reduces references to their label / name', () => {
    expect(mdToPlain(`Meet ${NEW}`)).toBe('Meet Kutter');
    expect(mdToPlain(LEGACY)).toBe('Kutter');
  });
  it('strips bold and italic emphasis', () => {
    expect(mdToPlain('a **bold** and *italic* word')).toBe('a bold and italic word');
  });
  it('collapses whitespace and drops divider lines', () => {
    expect(mdToPlain('one\n---\ntwo')).toBe('one two');
  });
});
