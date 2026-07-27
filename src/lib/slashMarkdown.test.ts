import { describe, it, expect } from 'vitest';
import { parseToHTML, serialize, indentListItem, outdentListItem } from './slashMarkdown';

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
