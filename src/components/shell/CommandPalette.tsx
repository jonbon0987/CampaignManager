// ⌘K: one bar to search, jump, create and ask. Typing finds records and
// actions. "2d6+3" (or "roll 2d6+3") rolls dice right here, and anything else
// can go to the assistant. Replaces the ⌘/ search overlay and the Session Tools
// search.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface PaletteItem {
  /** Unique across the list. */
  key: string;
  label: string;
  detail?: string;
  /** Heading the item is listed under. */
  group: string;
  glyph: string;
  /** Extra text the query is matched against (a record's content, say). */
  keywords?: string;
  /** Actions show before anything is typed; records only once you search. */
  action?: boolean;
  run: () => void;
}

const DICE = /^(?:roll\s+)?(\d*)d(\d+)\s*([+-]\s*\d+)?$/i;
const MAX_RESULTS = 40;

function rollDice(count: number, sides: number, mod: number) {
  const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
  return { rolls, total: rolls.reduce((a, b) => a + b, 0) + mod };
}

export default function CommandPalette({ open, onClose, items, onAsk, placeholder }: {
  open: boolean;
  onClose: () => void;
  items: PaletteItem[];
  /** Sends the query to the assistant. Absent hides the "Ask" row. */
  onAsk?: (query: string) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [roll, setRoll] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // A fresh, empty bar each time it opens, with the caret in it.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(''); setActive(0); setRoll(null);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  const results = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.filter(i => i.action);
    const found: PaletteItem[] = [];
    const dice = q.match(DICE);
    if (dice) {
      const count = Math.min(parseInt(dice[1] || '1', 10), 100);
      const sides = parseInt(dice[2], 10);
      const mod = dice[3] ? parseInt(dice[3].replace(/\s/g, ''), 10) : 0;
      const expr = `${count}d${sides}${mod > 0 ? `+${mod}` : mod < 0 ? mod : ''}`;
      if (sides > 0) {
        found.push({
          key: 'dice', group: 'Dice', glyph: '⚄', label: `Roll ${expr}`, detail: 'Enter to roll; it stays open to roll again',
          run: () => {
            const r = rollDice(count, sides, mod);
            setRoll(`${expr} → ${r.total}${count > 1 || mod ? `   [${r.rolls.join(', ')}]${mod ? ` ${mod > 0 ? '+' : ''}${mod}` : ''}` : ''}`);
          },
        });
      }
    }
    // Names first: a label that starts with the query, then one with a word
    // that does, then anywhere in the label, then the detail line, then content.
    const score = (i: PaletteItem) => {
      const label = i.label.toLowerCase();
      if (label.startsWith(q)) return 0;
      if (label.includes(` ${q}`)) return 1;
      if (label.includes(q)) return 2;
      if (i.detail?.toLowerCase().includes(q)) return 3;
      if (i.keywords?.toLowerCase().includes(q)) return 4;
      return -1;
    };
    const ranked = items
      .map((item, order) => ({ item, order, s: score(item) }))
      .filter(r => r.s >= 0)
      .sort((a, b) => a.s - b.s || a.order - b.order)
      .slice(0, MAX_RESULTS);
    for (const r of ranked) found.push(r.item);
    if (onAsk && !dice) {
      found.push({ key: 'ask', group: 'Assistant', glyph: '✦', label: `Ask the assistant: “${query.trim()}”`, run: () => { onAsk(query.trim()); onClose(); } });
    }
    return found;
  }, [query, items, onAsk, onClose]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const choose = (item: PaletteItem) => {
    item.run();
    if (item.key !== 'dice' && item.key !== 'ask') onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); choose(results[active]); }
  };

  // Group in order of first appearance.
  const groups: { name: string; items: { item: PaletteItem; idx: number }[] }[] = [];
  results.forEach((item, idx) => {
    let g = groups.find(x => x.name === item.group);
    if (!g) { g = { name: item.group, items: [] }; groups.push(g); }
    g.items.push({ item, idx });
  });

  return createPortal(
    <div className="cm-pal-scrim" onMouseDown={onClose}>
      <div className="cm-pal" role="dialog" aria-modal="true" aria-label="Search, jump, create or ask" onMouseDown={e => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="cm-pal-input">
          <span aria-hidden="true" className="cm-pal-glyph">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={placeholder}
            aria-label="Search, jump, create or ask"
            role="combobox"
            aria-expanded="true"
            aria-controls="cm-pal-list"
            aria-activedescendant={results[active] ? `cm-pal-${active}` : undefined}
          />
          <kbd className="cm-kbd">Esc</kbd>
        </div>
        {roll && <div className="cm-pal-roll" role="status">⚄ {roll}</div>}
        <div className="cm-pal-list" id="cm-pal-list" role="listbox" ref={listRef}>
          {results.length === 0 && <div className="cm-pal-empty">Nothing matches “{query}”.</div>}
          {groups.map(g => (
            <div key={g.name} role="group" aria-label={g.name}>
              <div className="cm-pal-group">{g.name}</div>
              {g.items.map(({ item, idx }) => (
                <div
                  key={item.key}
                  id={`cm-pal-${idx}`}
                  data-idx={idx}
                  role="option"
                  aria-selected={idx === active}
                  className={`cm-pal-item ${idx === active ? 'is-active' : ''}`}
                  onMouseMove={() => setActive(idx)}
                  onClick={() => choose(item)}
                >
                  <span className="cm-pal-item-glyph" aria-hidden="true">{item.glyph}</span>
                  <span className="cm-pal-item-text">
                    <span className="cm-pal-item-label">{item.label}</span>
                    {item.detail && <span className="cm-pal-item-detail">{item.detail}</span>}
                  </span>
                  {idx === active && <kbd className="cm-kbd" aria-hidden="true">↵</kbd>}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="cm-pal-foot">
          <span><kbd className="cm-kbd">↑↓</kbd> move</span>
          <span><kbd className="cm-kbd">↵</kbd> open</span>
          <span>Try <em>2d20+5</em>{onAsk ? ', or ask anything' : ''}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
