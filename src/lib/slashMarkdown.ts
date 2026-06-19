/* ════════════════════════════════════════════════════════════════
   slashMarkdown — shared markdown ⟷ DOM helpers for SlashField.
   Stores Markdown. Inline references serialize as @[Label](kind:id)
   and render as .rre-pill spans. Legacy [[kind:uuid:Name]] links are
   still parsed on read (back-compat) and rewritten to the new format
   when the field next saves.
   ════════════════════════════════════════════════════════════════ */

export type RefKind =
  | 'npc' | 'pc' | 'faction' | 'location' | 'lore'
  | 'module' | 'session' | 'hook' | 'statblock';

/** Ordered list used by the @-reference menu and default sorting. */
export const KINDS: RefKind[] = [
  'npc', 'pc', 'faction', 'location', 'lore', 'module', 'session', 'hook', 'statblock',
];

export const KIND_GLYPH: Record<RefKind, string> = {
  pc: '◈', npc: '◇', faction: '❖', location: '✦', lore: '❦',
  module: '❧', session: '✧', hook: '❂', statblock: '✜',
};

export const KIND_LABEL: Record<RefKind, string> = {
  pc: 'PC', npc: 'NPC', faction: 'Faction', location: 'Place', lore: 'Lore',
  module: 'Module', session: 'Session', hook: 'Hook', statblock: 'Statblock',
};

/** The legacy [[…]] format used `creature` for what we now call `statblock`. */
export function normalizeKind(kind: string): RefKind {
  if (kind === 'creature') return 'statblock';
  return kind as RefKind;
}

/** Emit a reference in the canonical @[Label](kind:id) format. */
export function serializeRef(kind: string, id: string, label: string): string {
  return `@[${label}](${normalizeKind(kind)}:${id})`;
}

/* ───────────────── reference segment parsing (read) ───────────────── */

export type RefSegment =
  | { type: 'text'; value: string }
  | { type: 'entity'; entityType: RefKind; id: string; displayName: string };

/* Matches new @[Label](kind:id) OR legacy [[kind:uuid:Name]] / [[kind:uuid]]. */
const NEW_REF = '@\\[([^\\]]*)\\]\\((npc|pc|faction|location|lore|module|session|hook|statblock|creature):([\\w-]+)\\)';
const LEGACY_REF = '\\[\\[(creature|npc|location|session|faction|hook):([a-f0-9-]{36})(?::([^\\]]*))?\\]\\]';

/** Fresh global regex (callers must not share lastIndex). */
export function refRegex(): RegExp {
  return new RegExp(`${NEW_REF}|${LEGACY_REF}`, 'g');
}

/** True if the text contains any inline reference (either format). */
export function hasRefs(text: string): boolean {
  return refRegex().test(text);
}

export function parseSegments(text: string): RefSegment[] {
  const segments: RefSegment[] = [];
  const re = refRegex();
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, m.index) });
    }
    if (m[2] !== undefined) {
      // new format: m[1]=label, m[2]=kind, m[3]=id
      segments.push({ type: 'entity', entityType: normalizeKind(m[2]), id: m[3], displayName: m[1] ?? '' });
    } else {
      // legacy format: m[4]=kind, m[5]=uuid, m[6]=name
      segments.push({ type: 'entity', entityType: normalizeKind(m[4]), id: m[5], displayName: m[6] ?? '' });
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}

/* ───────────────── markdown serialize (DOM → string) ───────────────── */

function inlineSer(el: Node): string {
  let out = '';
  el.childNodes.forEach(n => {
    if (n.nodeType === 3) { out += n.nodeValue; return; }
    if (n.nodeType !== 1) return;
    const e = n as HTMLElement;
    if (e.classList && e.classList.contains('rre-pill')) {
      out += serializeRef(e.dataset.refKind || 'npc', e.dataset.refId || '', e.dataset.refLabel || '');
    } else if (e.tagName === 'BR') {
      out += ' ';
    } else if (e.tagName === 'STRONG' || e.tagName === 'B') {
      out += '**' + inlineSer(e) + '**';
    } else if (e.tagName === 'EM' || e.tagName === 'I') {
      out += '*' + inlineSer(e) + '*';
    } else {
      out += inlineSer(e);
    }
  });
  return out;
}

export function serialize(editor: HTMLElement): string {
  const lines: string[] = [];
  editor.childNodes.forEach(node => {
    if (node.nodeType === 3) {
      const t = (node.nodeValue || '').replace(/\s+/g, ' ');
      if (t.trim()) lines.push(t.trim());
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === 'H2') lines.push('## ' + inlineSer(el));
    else if (tag === 'H3') lines.push('### ' + inlineSer(el));
    else if (tag === 'H4') lines.push('#### ' + inlineSer(el));
    else if (el.classList && el.classList.contains('se-callout')) lines.push('> [!note] ' + inlineSer(el));
    else if (tag === 'BLOCKQUOTE') lines.push('> ' + inlineSer(el));
    else if (tag === 'UL') el.querySelectorAll(':scope > li').forEach(li => lines.push('- ' + inlineSer(li)));
    else if (tag === 'OL') { let i = 1; el.querySelectorAll(':scope > li').forEach(li => lines.push((i++) + '. ' + inlineSer(li))); }
    else if (el.classList && el.classList.contains('se-hr-orn')) lines.push('❦❦❦');
    else if (tag === 'HR') lines.push(el.classList && el.classList.contains('se-hr-dotted') ? '···' : '---');
    else { const s = inlineSer(el).trim(); lines.push(s); }
  });
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

/* ───────────────── markdown parse (string → HTML) ───────────────── */

export function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

export function pillHTML(kind: string, id: string, label: string): string {
  const k = normalizeKind(kind);
  const g = KIND_GLYPH[k] || '·';
  return `<span class="rre-pill" contenteditable="false" data-ref-kind="${esc(k)}" data-ref-id="${esc(id)}" data-ref-label="${esc(label)}"><span class="rre-pill-glyph">${g}</span><span class="rre-pill-label">${esc(label)}</span></span>`;
}

function inlineHTML(text: string): string {
  let out = '';
  const re = new RegExp(`${NEW_REF}|${LEGACY_REF}|\\*\\*([^*]+)\\*\\*|\\*([^*]+)\\*`, 'gi');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out += esc(text.slice(last, m.index));
    if (m[2] !== undefined) out += pillHTML(m[2], m[3], m[1] ?? '');          // new ref
    else if (m[4] !== undefined) out += pillHTML(m[4], m[5], m[6] ?? '');     // legacy ref
    else if (m[7] !== undefined) out += '<strong>' + esc(m[7]) + '</strong>'; // bold
    else if (m[8] !== undefined) out += '<em>' + esc(m[8]) + '</em>';         // italic
    last = re.lastIndex;
  }
  out += esc(text.slice(last));
  return out || '<br>';
}

export function parseToHTML(md: string): string {
  const lines = (md || '').split('\n');
  let html = '';
  let i = 0;
  const isUL = (l: string) => /^[-*]\s+/.test(l);
  const isOL = (l: string) => /^\d+\.\s+/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }
    if (isUL(line)) { html += '<ul>'; while (i < lines.length && isUL(lines[i])) { html += '<li>' + inlineHTML(lines[i].replace(/^[-*]\s+/, '')) + '</li>'; i++; } html += '</ul>'; continue; }
    if (isOL(line)) { html += '<ol>'; while (i < lines.length && isOL(lines[i])) { html += '<li>' + inlineHTML(lines[i].replace(/^\d+\.\s+/, '')) + '</li>'; i++; } html += '</ol>'; continue; }
    if (/^####\s+/.test(line)) html += '<h4>' + inlineHTML(line.replace(/^####\s+/, '')) + '</h4>';
    else if (/^###\s+/.test(line)) html += '<h3>' + inlineHTML(line.replace(/^###\s+/, '')) + '</h3>';
    else if (/^##\s+/.test(line)) html += '<h2>' + inlineHTML(line.replace(/^##\s+/, '')) + '</h2>';
    else if (/^#\s+/.test(line)) html += '<h2>' + inlineHTML(line.replace(/^#\s+/, '')) + '</h2>';
    else if (/^>\s*\[!note\]\s?/.test(line)) html += '<p class="se-callout">' + inlineHTML(line.replace(/^>\s*\[!note\]\s?/, '')) + '</p>';
    else if (/^>\s+/.test(line)) html += '<blockquote>' + inlineHTML(line.replace(/^>\s+/, '')) + '</blockquote>';
    else if (/^(---|—{3,})$/.test(line.trim())) html += '<hr class="se-hr"/>';
    else if (/^(···|\.{3,})$/.test(line.trim())) html += '<hr class="se-hr se-hr-dotted"/>';
    else if (/^(❦+|❦(\s*·\s*❦)*)$/.test(line.trim())) html += '<div class="se-hr-orn" contenteditable="false"></div>';
    else html += '<p>' + inlineHTML(line) + '</p>';
    i++;
  }
  return html;
}

/* ───────────────── strip markdown to one clean line ───────────────── */

export function mdToPlain(md: string | null | undefined): string {
  if (!md) return '';
  const lines = String(md).split('\n').map(l => l
    .replace(/^#{1,4}\s+/, '')
    .replace(/^>\s*\[!note\]\s?/, '')
    .replace(/^>\s+/, '')
    .replace(/^[-*]\s+/, '• ')
    .replace(/^(---|···|❦+|❦(\s*·\s*❦)*)\s*$/, ''),
  );
  return lines.join(' ')
    .replace(new RegExp(NEW_REF, 'gi'), '$1')
    .replace(new RegExp(LEGACY_REF, 'gi'), '$3')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ').trim();
}
