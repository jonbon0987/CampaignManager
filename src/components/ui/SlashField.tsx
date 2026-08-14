/* ════════════════════════════════════════════════════════════════
   SlashField — string/markdown-backed slash editor.
   Drop-in replacement for textareas: { value, onChange, placeholder }.
   Stores Markdown; inline references serialize as @[Label](kind:id)
   and render as pills. "/" opens a block-command menu, "@" the entity
   reference fast-path (with @kind: scoping); pills show hover previews.

   Pure markdown helpers live in lib/slashMarkdown; the entity index,
   glyphs, hover details and click routing come from EntityRefContext,
   so this works in both world and campaign modes.
   ════════════════════════════════════════════════════════════════ */

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useEntityRefs } from '../../context/EntityRefContext';
import type { EntityRef } from '../../context/EntityRefContext';
import {
  serialize, parseToHTML, pillHTML, indentListItem, outdentListItem,
  KINDS, KIND_GLYPH, KIND_LABEL,
} from '../../lib/slashMarkdown';
import type { RefKind } from '../../lib/slashMarkdown';

type MenuType = 'slash' | 'ref';
interface MenuState { type: MenuType; query: string; kind: RefKind | null; left: number; top: number; }
interface HoverState { kind: RefKind; id: string; left: number; top: number; flip: boolean; }
interface Detected { type: MenuType; query: string; kind: RefKind | null; node: Text; start: number; end: number; rect: DOMRect; }

/* ───────────────── command set ───────────────── */
interface Cmd { id: string; group: string; glyph: string; label: string; sub: string; key?: string; aliases: string[]; run: string; }
const CMDS: Cmd[] = [
  { id: 'text',  group: 'Text',     glyph: 'T',  label: 'Plain text',    sub: 'Turn block into a paragraph', aliases: ['text', 'p', 'paragraph', 'plain', 'body', 'normal', 'unstyle'], run: 'text' },
  { id: 'h',     group: 'Text',     glyph: 'H',  label: 'Heading',       sub: 'Large section title', key: '# ',  aliases: ['h', 'h1', 'heading', 'head', 'title'], run: 'block:H2' },
  { id: 'h2',    group: 'Text',     glyph: 'h',  label: 'Subheading',    sub: 'Smaller title',       key: '## ', aliases: ['h2', 'sub', 'subheading', 'subhead'], run: 'block:H3' },
  { id: 'label', group: 'Text',     glyph: '¶',  label: 'Label',         sub: 'Mono, uppercase',     key: '### ', aliases: ['h3', 'label', 'eyebrow', 'mono'], run: 'block:H4' },
  { id: 'quote', group: 'Text',     glyph: '❝',  label: 'Quote',         sub: 'In-character aside',  key: '> ',  aliases: ['q', 'quote', 'blockquote'], run: 'block:BLOCKQUOTE' },
  { id: 'call',  group: 'Text',     glyph: '❧',  label: 'Callout',       sub: 'Highlighted note',    aliases: ['c', 'callout', 'note', 'info', 'aside'], run: 'callout' },
  { id: 'ul',    group: 'Lists',    glyph: '•',  label: 'Bullet list',   sub: 'Unordered',           key: '- ',  aliases: ['ul', 'bullet', 'list', 'dash', 'unordered'], run: 'ul' },
  { id: 'ol',    group: 'Lists',    glyph: '①',  label: 'Numbered list', sub: 'Ordered',             key: '1. ', aliases: ['ol', 'or', 'ordered', 'number', 'numbered', 'num'], run: 'ol' },
  { id: 'dl',    group: 'Dividers', glyph: '—',  label: 'Divider — line',   sub: 'Plain rule',       aliases: ['d', 'divider', 'hr', 'rule', 'line'], run: 'hr:line' },
  { id: 'dd',    group: 'Dividers', glyph: '·',  label: 'Divider — dotted', sub: 'Dotted rule',      aliases: ['dotted', 'dots', 'dd'], run: 'hr:dotted' },
  { id: 'do',    group: 'Dividers', glyph: '❦',  label: 'Scene break',   sub: 'Ornamental divider',  aliases: ['scene', 'ornament', 'flourish', 'break'], run: 'hr:ornament' },
  { id: 'ref',   group: 'Link',     glyph: '@',  label: 'Reference…',    sub: 'Link an NPC, place, faction…', aliases: ['ref', 'mention', 'link', 'at', 'npc', 'place'], run: 'ref' },
];

function rankCmds(query: string): { c: Cmd; score?: number }[] {
  const q = (query || '').toLowerCase();
  if (!q) return CMDS.map(c => ({ c }));
  const out: { c: Cmd; score: number }[] = [];
  for (const c of CMDS) {
    let best = 99;
    for (const a of c.aliases) {
      if (a === q) best = Math.min(best, 0);
      else if (a.startsWith(q)) best = Math.min(best, 1);
      else if (a.includes(q) || c.label.toLowerCase().includes(q)) best = Math.min(best, 2);
    }
    if (best < 99) out.push({ c, score: best });
  }
  return out.sort((a, b) => a.score - b.score);
}

function filterEntities(query: string, kind: RefKind | null, all: EntityRef[]): EntityRef[] {
  const q = (query || '').toLowerCase().trim();
  let pool = all;
  if (kind) pool = pool.filter(x => x.kind === kind);
  if (!q) {
    const order: Record<string, number> = { npc: 0, location: 1, faction: 2, pc: 3, lore: 4, hook: 5, session: 6, module: 7, statblock: 8 };
    return [...pool].sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9)).slice(0, 24);
  }
  return pool.filter(x => x.label.toLowerCase().includes(q) || (x.sub || '').toLowerCase().includes(q)).slice(0, 24);
}

/* ───────────────── caret / blocks / triggers ───────────────── */
function caretRange(): Range | null { const s = window.getSelection(); if (!s || s.rangeCount === 0 || !s.isCollapsed) return null; return s.getRangeAt(0); }
function blockOf(editor: HTMLElement, node: Node): HTMLElement {
  let n: Node | null = node;
  if (n === editor) return editor;
  while (n && n.parentNode && n.parentNode !== editor) n = n.parentNode;
  return (n as HTMLElement) || editor;
}
function caretToStart(el: Node) { const sel = window.getSelection(); if (!sel) return; const rr = document.createRange(); rr.selectNodeContents(el); rr.collapse(true); sel.removeAllRanges(); sel.addRange(rr); }
function blockAtStart(editor: HTMLElement): HTMLElement | null {
  const r = caretRange(); if (!r) return null;
  let li: Element | null = r.startContainer.nodeType === 1 ? (r.startContainer as Element) : r.startContainer.parentElement;
  li = li && li.closest ? li.closest('li') : null;
  if (li && editor.contains(li)) { const rng = document.createRange(); rng.setStart(li, 0); rng.setEnd(r.startContainer, r.startOffset); if (rng.toString() === '') return li as HTMLElement; }
  const b = blockOf(editor, r.startContainer); if (!b || b === editor) return null;
  const rng = document.createRange(); rng.setStart(b, 0); rng.setEnd(r.startContainer, r.startOffset);
  return rng.toString() === '' ? b : null;
}
function unstyleBlock(block: HTMLElement): HTMLElement { const p = document.createElement('p'); while (block.firstChild) p.appendChild(block.firstChild); if (!p.firstChild) p.appendChild(document.createElement('br')); block.replaceWith(p); caretToStart(p); return p; }
function unstyleListItem(li: HTMLElement) { const list = li.parentNode as HTMLElement | null; if (!list) return; const p = document.createElement('p'); while (li.firstChild) p.appendChild(li.firstChild); if (!p.firstChild) p.appendChild(document.createElement('br')); list.parentNode?.insertBefore(p, list); li.remove(); if (!list.querySelector('li')) list.remove(); caretToStart(p); }

/** The <li> containing the caret, or null when the caret isn't inside a list. */
function currentLi(editor: HTMLElement): HTMLElement | null {
  const r = caretRange(); if (!r) return null;
  const n = r.startContainer.nodeType === 1 ? (r.startContainer as Element) : r.startContainer.parentElement;
  const li = n && n.closest ? n.closest('li') : null;
  return li && editor.contains(li) ? (li as HTMLElement) : null;
}

function detect(editor: HTMLElement): Detected | null {
  const r = caretRange(); if (!r) return null;
  const node = r.startContainer;
  if (node.nodeType !== 3 || !editor.contains(node)) return null;
  const textNode = node as Text;
  const before = (textNode.nodeValue || '').slice(0, r.startOffset);
  const mk = (type: MenuType, len: number, query: string, kind: RefKind | null): Detected => {
    const start = Math.max(0, r.startOffset - len);
    const rng = document.createRange(); rng.setStart(textNode, start); rng.setEnd(textNode, r.startOffset);
    return { type, query, kind, node: textNode, start, end: r.startOffset, rect: rng.getBoundingClientRect() };
  };
  let m = before.match(/(?:^|\s)\/([\w]*)$/);
  if (m) return mk('slash', 1 + m[1].length, m[1], null);
  m = before.match(/(?:^|[\s([—])@(?:([a-z]+):)?([\w\-' ]*)$/i);
  if (m) {
    const kindRaw = (m[1] || '').toLowerCase();
    const kind = (KINDS as string[]).includes(kindRaw) ? (kindRaw as RefKind) : null;
    const len = 1 + (m[1] ? m[1].length + 1 : 0) + (m[2] ? m[2].length : 0);
    return mk('ref', len, m[2] || '', kind);
  }
  return null;
}

interface SlashFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
  variant?: 'fluid' | 'sectioned' | 'default';
  /**
   * Soft character limit. When set, a live counter is shown; it turns into a
   * warning once the (serialized markdown) length exceeds the limit. This is a
   * soft cap — the authoritative block happens on save (see lib/fieldLimits +
   * the db.ts write layer). A hard cap mid-typing is avoided because this is a
   * contentEditable rich editor, not a plain textarea.
   */
  maxLength?: number;
}

export function SlashField({ value, onChange, placeholder, minHeight, variant = 'sectioned', maxLength }: SlashFieldProps) {
  const { entities, detailFor, openRef } = useEntityRefs();
  const edRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState<HoverState | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overCard = useRef(false);
  const lastEmit = useRef(value || '');
  const mounted = useRef(false);
  const [charCount, setCharCount] = useState(value?.length ?? 0);

  // mount once — DOM authoritative afterward (component is keyed per field)
  useEffect(() => {
    if (mounted.current || !edRef.current) return;
    edRef.current.innerHTML = parseToHTML(value || '') || '<p><br></p>';
    lastEmit.current = value || '';
    setCharCount((value || '').length);
    updateEmpty();
    mounted.current = true;
    try { document.execCommand('styleWithCSS', false, 'false'); } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateEmpty = () => {
    const ed = edRef.current; if (!ed) return;
    const empty = ed.textContent?.trim() === '' && !ed.querySelector('.rre-pill,hr,.se-hr-orn,li');
    ed.dataset.empty = empty ? 'true' : 'false';
  };

  const emit = () => {
    const ed = edRef.current; if (!ed) return;
    updateEmpty();
    const md = serialize(ed);
    setCharCount(md.length);
    if (md !== lastEmit.current) { lastEmit.current = md; onChange?.(md); }
  };

  const placeMenu = (rect: DOMRect, w = 320) => {
    const left = Math.min(rect.left, window.innerWidth - w - 12);
    let top = rect.bottom + 6;
    if (top > window.innerHeight - 200) top = Math.max(8, rect.top - 6 - 280);
    return { left: Math.max(8, left), top };
  };

  const refreshMenu = useCallback(() => {
    const ed = edRef.current; if (!ed) return;
    const d = detect(ed);
    if (!d) { setMenu(null); return; }
    const { left, top } = placeMenu(d.rect);
    setMenu(prev => {
      const next: MenuState = { type: d.type, query: d.query, kind: d.kind, left, top };
      if (prev && prev.type === next.type && prev.query === next.query && prev.kind === next.kind && prev.left === next.left && prev.top === next.top) return prev;
      return next;
    });
  }, []);
  const closeMenu = () => { setMenu(null); setActive(0); };

  const removeTrigger = () => {
    const ed = edRef.current; if (!ed) return;
    const d = detect(ed); if (!d) return;
    const rng = document.createRange(); rng.setStart(d.node, d.start); rng.setEnd(d.node, d.end);
    rng.deleteContents();
    const sel = window.getSelection(); if (!sel) return; sel.removeAllRanges(); rng.collapse(true); sel.addRange(rng);
  };

  const insertEntity = (entry: EntityRef) => {
    const ed = edRef.current; if (!ed) return; ed.focus(); removeTrigger();
    const sel = window.getSelection(); if (!sel) return; const r = sel.getRangeAt(0);
    const tmp = document.createElement('div'); tmp.innerHTML = pillHTML(entry.kind, entry.id, entry.label);
    const pill = tmp.firstChild as HTMLElement; r.insertNode(pill);
    const space = document.createTextNode(' '); pill.after(space);
    const r2 = document.createRange(); r2.setStart(space, 1); r2.collapse(true);
    sel.removeAllRanges(); sel.addRange(r2);
    closeMenu(); emit();
  };

  const replaceOrInsertBlock = (newEl: HTMLElement, opts: { caretInside: boolean; caretTarget?: HTMLElement }) => {
    const ed = edRef.current; if (!ed) return; const r = caretRange();
    const block = r ? blockOf(ed, r.startContainer) : null;
    const empty = !!block && block !== ed && block.textContent?.trim() === '' && !block.querySelector('.rre-pill');
    if (block && block !== ed && empty) block.replaceWith(newEl);
    else if (block && block !== ed) block.after(newEl);
    else ed.appendChild(newEl);
    const sel = window.getSelection(); if (!sel) return;
    if (opts.caretInside) { const tgt = opts.caretTarget || newEl; const rr = document.createRange(); rr.selectNodeContents(tgt); rr.collapse(true); sel.removeAllRanges(); sel.addRange(rr); }
    else { const p = document.createElement('p'); p.appendChild(document.createElement('br')); newEl.after(p); const rr = document.createRange(); rr.setStart(p, 0); rr.collapse(true); sel.removeAllRanges(); sel.addRange(rr); }
  };
  const insertTextBlock = (tag: string) => { const el = document.createElement(tag); el.appendChild(document.createElement('br')); replaceOrInsertBlock(el, { caretInside: true }); };
  const insertList = (tag: string) => { const list = document.createElement(tag); const li = document.createElement('li'); li.appendChild(document.createElement('br')); list.appendChild(li); replaceOrInsertBlock(list, { caretInside: true, caretTarget: li }); };
  const insertCallout = () => { const p = document.createElement('p'); p.className = 'se-callout'; p.appendChild(document.createElement('br')); replaceOrInsertBlock(p, { caretInside: true }); };
  const insertDivider = (style: string) => { let el: HTMLElement; if (style === 'ornament') { el = document.createElement('div'); el.className = 'se-hr-orn'; el.contentEditable = 'false'; } else { el = document.createElement('hr'); el.className = 'se-hr' + (style === 'dotted' ? ' se-hr-dotted' : ''); } replaceOrInsertBlock(el, { caretInside: false }); };

  // In-place block transforms for the markdown shortcuts (# , > , - , 1. …).
  // We retag/wrap the current block via the DOM rather than document.execCommand,
  // whose formatBlock/insert*List support is unreliable outside Chrome (Safari and
  // Firefox silently no-op), which left the shortcuts doing nothing in those browsers.
  const retagBlock = (tag: string) => {
    const ed = edRef.current; if (!ed) return; const r = caretRange();
    const block = r ? blockOf(ed, r.startContainer) : null;
    if (!block || block === ed) { insertTextBlock(tag); return; }
    const el = document.createElement(tag);
    while (block.firstChild) el.appendChild(block.firstChild);
    if (!el.firstChild) el.appendChild(document.createElement('br'));
    block.replaceWith(el); caretToStart(el);
  };
  const wrapInList = (tag: string) => {
    const ed = edRef.current; if (!ed) return; const r = caretRange();
    const block = r ? blockOf(ed, r.startContainer) : null;
    if (!block || block === ed) { insertList(tag); return; }
    const list = document.createElement(tag); const li = document.createElement('li');
    while (block.firstChild) li.appendChild(block.firstChild);
    if (!li.firstChild) li.appendChild(document.createElement('br'));
    list.appendChild(li); block.replaceWith(list); caretToStart(li);
  };

  const runCmd = (c: Cmd) => {
    const ed = edRef.current; if (!ed) return; ed.focus(); removeTrigger();
    const run = c.run;
    if (run.startsWith('block:')) insertTextBlock(run.split(':')[1]);
    else if (run === 'ul') insertList('ul');
    else if (run === 'ol') insertList('ol');
    else if (run === 'callout') insertCallout();
    else if (run.startsWith('hr:')) insertDivider(run.split(':')[1]);
    else if (run === 'text') { const r = caretRange(); const b = r ? blockOf(ed, r.startContainer) : null; if (b && b !== ed) { if (b.tagName === 'LI') unstyleListItem(b); else unstyleBlock(b); } }
    else if (run === 'ref') { document.execCommand('insertText', false, '@'); setTimeout(refreshMenu, 0); emit(); return; }
    closeMenu(); emit();
  };

  /* hover preview */
  const onOver = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const pill = target.closest('.rre-pill') as HTMLElement | null;
    if (!pill || !edRef.current?.contains(pill)) return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    const kind = pill.dataset.refKind as RefKind; const id = pill.dataset.refId || '';
    hoverTimer.current = setTimeout(() => {
      const rc = pill.getBoundingClientRect();
      const flip = rc.bottom > window.innerHeight - 180;
      const left = Math.min(rc.left, window.innerWidth - 292);
      const top = flip ? rc.top - 8 : rc.bottom + 8;
      setHover({ kind, id, left: Math.max(8, left), top, flip });
    }, 150);
  };
  const onOut = (e: React.MouseEvent) => {
    const to = e.relatedTarget as HTMLElement | null;
    if (to && to.closest && to.closest('.sf-hovercard')) return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => { if (!overCard.current) setHover(null); }, 240);
  };

  const slashItems = menu && menu.type === 'slash' ? rankCmds(menu.query) : [];
  const refItems = menu && menu.type === 'ref' ? filterEntities(menu.query, menu.kind, entities) : [];
  const count = menu ? (menu.type === 'slash' ? slashItems.length : refItems.length) : 0;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' && !menu) {
      const r = caretRange();
      if (r && r.startContainer.nodeType === 3) {
        const ed = edRef.current!; const block = blockOf(ed, r.startContainer);
        const rng = document.createRange(); rng.setStart(block, 0); rng.setEnd(r.startContainer, r.startOffset);
        const pre = rng.toString();
        const blockMap: Record<string, string> = { '#': 'H2', '##': 'H3', '###': 'H4', '>': 'BLOCKQUOTE' };
        const isOl = /^\d+\.$/.test(pre);
        if (blockMap[pre] || pre === '-' || pre === '*' || isOl) {
          e.preventDefault(); rng.deleteContents();
          const sel = window.getSelection(); if (sel) { sel.removeAllRanges(); rng.collapse(true); sel.addRange(rng); }
          if (pre === '-' || pre === '*') wrapInList('ul');
          else if (isOl) wrapInList('ol');
          else retagBlock(blockMap[pre] === 'BLOCKQUOTE' ? 'blockquote' : blockMap[pre].toLowerCase());
          emit(); return;
        }
      }
    }
    if (menu) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(count - 1, i + 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)); return; }
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (menu.type === 'slash') { if (slashItems[active]) runCmd(slashItems[active].c); }
        else if (refItems[active]) insertEntity(refItems[active]);
        return;
      }
    }
    if (e.key === 'Tab' && !menu) {
      const ed = edRef.current!;
      const li = currentLi(ed);
      if (li) {
        e.preventDefault();
        const sel = window.getSelection();
        const saved = sel && sel.rangeCount ? { c: sel.getRangeAt(0).startContainer, o: sel.getRangeAt(0).startOffset } : null;
        const ok = e.shiftKey ? outdentListItem(li) : indentListItem(li);
        if (ok && saved) {
          try { const rr = document.createRange(); rr.setStart(saved.c, saved.o); rr.collapse(true); sel!.removeAllRanges(); sel!.addRange(rr); } catch { /* node moved out of range */ }
        }
        if (ok) emit();
        return;
      }
    }
    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      if (sel && sel.isCollapsed) {
        const ed = edRef.current!;
        const headBlock = blockAtStart(ed);
        if (headBlock) {
          const tag = headBlock.tagName;
          if (/^(H2|H3|H4|BLOCKQUOTE)$/.test(tag) || (headBlock.classList && headBlock.classList.contains('se-callout'))) { e.preventDefault(); unstyleBlock(headBlock); emit(); return; }
          if (tag === 'LI') { e.preventDefault(); unstyleListItem(headBlock); emit(); return; }
        }
        const r = sel.getRangeAt(0);
        const prev = r.startOffset === 0 ? r.startContainer.previousSibling
          : (r.startContainer.nodeType === 1 ? r.startContainer.childNodes[r.startOffset - 1] : null);
        const prevEl = prev as HTMLElement | null;
        if (prevEl && prevEl.classList && prevEl.classList.contains('rre-pill')) { e.preventDefault(); prevEl.remove(); emit(); }
      }
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'i')) { e.preventDefault(); document.execCommand(e.key === 'b' ? 'bold' : 'italic'); emit(); }
  };

  useEffect(() => { setActive(0); }, [menu?.query, menu?.kind, menu?.type]);

  useEffect(() => {
    if (!menu && !hover) return;
    const onScrollClose = (e: Event) => {
      // Ignore scrolling that happens inside the menu/hovercard themselves —
      // only close when the page or editor container scrolls (the popups are
      // position:fixed and would otherwise detach from the caret).
      const t = e.target;
      if (t instanceof Element && t.closest('.sf-menu, .sf-hovercard')) return;
      if (menu) setMenu(null);
      if (hover) setHover(null);
    };
    window.addEventListener('scroll', onScrollClose, true);
    return () => window.removeEventListener('scroll', onScrollClose, true);
  }, [menu, hover]);

  const wrapClass = ['sf-wrap', variant === 'fluid' ? 'v5-fluid' : variant === 'sectioned' ? 'v5-sectioned' : ''].filter(Boolean).join(' ');

  return (
    <div className={wrapClass}>
      <div
        ref={edRef}
        className="sf-editor"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder || 'Write…'}
        data-empty="true"
        style={minHeight ? { minHeight } : undefined}
        onInput={() => { emit(); refreshMenu(); }}
        onKeyUp={refreshMenu}
        onMouseUp={refreshMenu}
        onKeyDown={onKeyDown}
        onMouseOver={onOver}
        onMouseOut={onOut}
        onBlur={() => setTimeout(() => setMenu(null), 160)}
      />
      {maxLength != null && (
        <div
          className="sf-counter"
          aria-live="polite"
          style={{
            textAlign: 'right',
            fontSize: '11px',
            fontFamily: 'var(--serif)',
            marginTop: '2px',
            color: charCount > maxLength ? 'var(--red)' : 'var(--ink-3)',
          }}
        >
          {charCount > maxLength
            ? `${(charCount - maxLength).toLocaleString()} over limit`
            : `${charCount.toLocaleString()} / ${maxLength.toLocaleString()}`}
        </div>
      )}
      {menu && createPortal(
        <div className="sf-menu" style={{ left: menu.left, top: menu.top }} onMouseDown={e => e.preventDefault()}>
          {menu.type === 'slash'
            ? <SlashMenu items={slashItems} active={active} query={menu.query} onPick={c => runCmd(c)} setActive={setActive} />
            : <RefMenu items={refItems} active={active} query={menu.query} kind={menu.kind} onPick={insertEntity} setActive={setActive} />}
        </div>, document.body)}
      {hover && createPortal(
        <HoverCard {...hover} detail={detailFor(hover.kind, hover.id)} onOpen={() => { openRef(hover.kind, hover.id); setHover(null); }}
          onEnter={() => { overCard.current = true; if (hoverTimer.current) clearTimeout(hoverTimer.current); }}
          onLeave={() => { overCard.current = false; setHover(null); }} />, document.body)}
    </div>
  );
}

function SlashMenu({ items, active, query, onPick, setActive }: { items: { c: Cmd }[]; active: number; query: string; onPick: (c: Cmd) => void; setActive: (i: number) => void; }) {
  return (
    <>
      <div className="sf-menu-head">Insert{query && <span className="sf-q">&nbsp;“{query}”</span>}</div>
      <div className="sf-scroll">
        {items.length === 0 && <div className="sf-item" style={{ cursor: 'default', color: 'var(--ink-3)' }}>No command matches “{query}”</div>}
        {items.map(({ c }, i) => {
          const showGroup = !query && (i === 0 || items[i - 1].c.group !== c.group);
          return (
            <div key={c.id}>
              {showGroup && <div className="sf-group">{c.group}</div>}
              <div className={`sf-item ${i === active ? 'is-active' : ''}`} onMouseEnter={() => setActive(i)} onMouseDown={e => { e.preventDefault(); onPick(c); }}>
                <span className="sf-cmd-glyph">{c.glyph}</span>
                <span className="sf-item-main"><div className="sf-item-label">{c.label}</div><div className="sf-item-sub">{c.sub}</div></span>
                <span className="sf-item-key">{c.key ? c.key.trim() : '/' + c.aliases[0]}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="sf-foot"><span><kbd>↑↓</kbd> move</span><span><kbd>⏎</kbd> apply</span><span className="sf-sp">type to filter</span></div>
    </>
  );
}

function RefMenu({ items, active, query, kind, onPick, setActive }: { items: EntityRef[]; active: number; query: string; kind: RefKind | null; onPick: (it: EntityRef) => void; setActive: (i: number) => void; }) {
  return (
    <>
      <div className="sf-menu-head">{kind ? `${KIND_LABEL[kind]}s` : 'Reference'}{query && <span className="sf-q">&nbsp;“{query}”</span>}</div>
      <div className="sf-scroll">
        {items.length === 0 && <div className="sf-item" style={{ cursor: 'default', color: 'var(--ink-3)' }}>No matches</div>}
        {items.map((it, i) => (
          <div key={it.kind + it.id} className={`sf-item ${i === active ? 'is-active' : ''}`} style={{ gridTemplateColumns: '22px 1fr auto' }}
            onMouseEnter={() => setActive(i)} onMouseDown={e => { e.preventDefault(); onPick(it); }}>
            <span className="sf-ref-glyph">{KIND_GLYPH[it.kind]}</span>
            <span className="sf-item-main"><div className="sf-item-label">{it.label}</div>{it.sub && <div className="sf-ref-sub">{it.sub}</div>}</span>
            <span className="sf-ref-kind">{KIND_LABEL[it.kind]}</span>
          </div>
        ))}
      </div>
      <div className="sf-foot"><span><kbd>↑↓</kbd> move</span><span><kbd>⏎</kbd> insert</span><span className="sf-sp">@npc: to scope</span></div>
    </>
  );
}

/** Cap the hover-card description so a long entry can't make the card huge. */
const HOVER_DESC_MAX = 240;
function clampDesc(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= HOVER_DESC_MAX ? trimmed : trimmed.slice(0, HOVER_DESC_MAX).trimEnd() + '…';
}

function HoverCard({ kind, detail, left, top, flip, onOpen, onEnter, onLeave }: HoverState & { detail: { label: string; sub: string; desc: string; meta: string[] }; onOpen: () => void; onEnter: () => void; onLeave: () => void; }) {
  return (
    <div className={`sf-hovercard ${flip ? 'flip' : ''}`} style={{ left, top }} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="sf-hc-top">
        <div className="sf-hc-glyph">{KIND_GLYPH[kind]}</div>
        <div><div className="sf-hc-name">{detail.label}</div><div className="sf-hc-kind">{KIND_LABEL[kind]}{detail.sub ? ` · ${detail.sub}` : ''}</div></div>
      </div>
      {detail.desc && <p className="sf-hc-desc">{clampDesc(detail.desc)}</p>}
      {detail.meta && detail.meta.length > 0 && <div className="sf-hc-meta">{detail.meta.map((m, i) => <span key={i} className="sf-hc-tag">{m}</span>)}</div>}
      <div className="sf-hc-actions"><span className="sf-hc-btn primary" onMouseDown={e => { e.preventDefault(); onOpen(); }}>Open ↗</span></div>
    </div>
  );
}

/* ───────────────── read-only renderer ───────────────── */
export function SfProse({ text, className }: { text?: string | null; className?: string }) {
  const { openRef } = useEntityRefs();
  if (!text || !text.trim()) return <div className="cm-read-empty">—</div>;
  const onClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const pill = target.closest('.rre-pill') as HTMLElement | null;
    if (!pill) return;
    const kind = pill.dataset.refKind as RefKind | undefined; const id = pill.dataset.refId;
    if (kind && id) openRef(kind, id);
  };
  return (
    <div
      className={'cm-prose sf-prose' + (className ? ' ' + className : '')}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: parseToHTML(text) }}
    />
  );
}
