// The SRD library: the System Reference Document's monsters or magic items,
// 2014 or 2024, to browse and copy into the campaign. It opens from Stat sheets,
// Items and an encounter's creature picker; what adding one does is the caller's.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ListRow } from '../ui/ListDetail';
import { MarkdownContent } from '../ui/MarkdownContent';
import { StatBlockBody } from '../tabs/CreatureStatblocks';
import { ITEM_TYPES, RARITIES, rarity } from '../../lib/items';
import {
  CR_ORDER, SRD_CREDIT, SRD_SHORT, baseType, filterItems, filterMonsters, loadSrdItems, loadSrdMonsters,
  srdToStatblock, type SrdEdition, type SrdItem, type SrdMonster,
} from '../../lib/srd';
import type { MonsterStatblock } from '../../lib/database.types';

const MONSTER_TYPES = ['aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Common {
  open: boolean;
  onClose: () => void;
  /** The campaign's rules, which the library starts on. */
  edition: SrdEdition;
  /** The add button: "Add to stat sheets". */
  addLabel: string;
  /** A line under the preview about what adding this one will do, if it's worth saying. */
  note?: (name: string) => string | null;
}

type Props =
  | (Common & { kind: 'monsters'; onAdd: (m: SrdMonster, edition: SrdEdition) => Promise<void> })
  | (Common & { kind: 'items'; onAdd: (i: SrdItem, edition: SrdEdition) => Promise<void> });

/** Mounted only while open, so each opening starts fresh. */
export function SrdLibrary(props: Props) {
  if (!props.open) return null;
  return <Library {...props} />;
}

function Library(props: Props) {
  const { kind, onClose, addLabel, note } = props;
  const [edition, setEdition] = useState<SrdEdition>(props.edition);
  const [monsters, setMonsters] = useState<SrdMonster[] | null>(null);
  const [items, setItems] = useState<SrdItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [minCr, setMinCr] = useState('');
  const [maxCr, setMaxCr] = useState('');
  const [rare, setRare] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // The edition's file is fetched the first time it's shown, then kept.
  useEffect(() => {
    let live = true;
    const done = <T,>(set: (v: T) => void) => (v: T) => { if (live) set(v); };
    const fail = () => { if (live) setFailed(true); };
    if (kind === 'monsters') loadSrdMonsters(edition).then(done(setMonsters), fail);
    else loadSrdItems(edition).then(done(setItems), fail);
    return () => { live = false; };
  }, [kind, edition]);

  const loaded = kind === 'monsters' ? monsters : items;
  const shown: (SrdMonster | SrdItem)[] = useMemo(() => kind === 'monsters'
    ? filterMonsters(monsters ?? [], { q, type, minCr, maxCr })
    : filterItems(items ?? [], { q, type, rarity: rare }),
  [kind, monsters, items, q, type, minCr, maxCr, rare]);
  const selected = shown.find(e => e.id === selectedId) ?? shown[0] ?? null;

  useEffect(() => {
    listRef.current?.querySelector('.cm-row.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [selected?.id]);

  const switchEdition = (ed: SrdEdition) => {
    if (ed === edition) return;
    setEdition(ed);
    setSelectedId(null);
    if (kind === 'monsters') setMonsters(null); else setItems(null);
  };

  const add = async () => {
    if (!selected || adding) return;
    setAdding(true);
    setError('');
    try {
      if (props.kind === 'monsters') await props.onAdd(selected as SrdMonster, edition);
      else await props.onAdd(selected as SrdItem, edition);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add it.');
      setAdding(false);
    }
  };

  // Arrow keys move through the list from the search box; Enter adds.
  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); void add(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const at = selected ? shown.indexOf(selected) : -1;
    const next = shown[Math.min(shown.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (next) setSelectedId(next.id);
  };

  const noun = kind === 'monsters' ? 'creatures' : 'magic items';
  const credit = SRD_CREDIT[edition];
  const selectedNote = selected && note ? note(selected.name) : null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={kind === 'monsters' ? 'SRD creatures' : 'SRD magic items'}
      size="xl"
      footer={
        <div className="srd-foot">
          <p className="srd-credit">
            Contains material from the <a href={credit.url} target="_blank" rel="noreferrer">{credit.name}</a> by
            Wizards of the Coast LLC, licensed under <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noreferrer">CC BY 4.0</a>,
            trimmed to fit. Compiled by <a href="https://github.com/5e-bits/5e-srd-api" target="_blank" rel="noreferrer">5e-bits</a> (MIT).
          </p>
          <div className="srd-actions">
            {error && <span className="srd-error" role="alert">{error}</span>}
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={() => void add()} disabled={!selected || adding}>
              {adding ? 'Adding…' : addLabel}
            </Button>
          </div>
        </div>
      }
    >
      <div className="srd">
        <div className="srd-bar">
          <div className="srd-editions" role="radiogroup" aria-label="Rules">
            {(['2014', '2024'] as const).map(ed => (
              // eslint-disable-next-line no-restricted-syntax -- a radio styled as a pill, like the wrap-up's
              <button key={ed} type="button" role="radio" aria-checked={edition === ed} className={`cm-pill is-subtle${edition === ed ? ' is-active' : ''}`}
                onClick={() => switchEdition(ed)}>
                {ed} · {SRD_SHORT[ed]}
              </button>
            ))}
          </div>
          <input className="as-input srd-search" type="search" value={q} autoFocus aria-label={`Search ${noun}`}
            placeholder={kind === 'monsters' ? 'Search creatures, e.g. goblin, dragon' : 'Search magic items, e.g. cloak, +1'}
            onChange={e => { setQ(e.target.value); setSelectedId(null); }} onKeyDown={onSearchKey} />
          <div className="srd-filters">
            <select className="as-select" value={type} aria-label="Type" onChange={e => { setType(e.target.value); setSelectedId(null); }}>
              <option value="">All types</option>
              {kind === 'monsters'
                ? MONSTER_TYPES.map(t => <option key={t} value={t}>{cap(t)}</option>)
                : ITEM_TYPES.filter(t => !['gear', 'treasure'].includes(t.id)).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            {kind === 'monsters' ? (
              <span className="srd-cr">
                <select className="as-select" value={minCr} aria-label="Lowest CR" onChange={e => { setMinCr(e.target.value); setSelectedId(null); }}>
                  <option value="">CR any</option>
                  {CR_ORDER.map(c => <option key={c} value={c}>CR {c}</option>)}
                </select>
                <span aria-hidden>to</span>
                <select className="as-select" value={maxCr} aria-label="Highest CR" onChange={e => { setMaxCr(e.target.value); setSelectedId(null); }}>
                  <option value="">any</option>
                  {CR_ORDER.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </span>
            ) : (
              <select className="as-select" value={rare} aria-label="Rarity" onChange={e => { setRare(e.target.value); setSelectedId(null); }}>
                <option value="">Any rarity</option>
                {RARITIES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            )}
          </div>
        </div>

        {failed ? (
          <div className="cm-empty is-inline">The SRD library couldn’t be loaded. Check the connection and open it again.</div>
        ) : !loaded ? (
          <div className="cm-empty is-inline">Opening the {SRD_SHORT[edition]}…</div>
        ) : (
          <div className="srd-split">
            <div className="srd-list" ref={listRef}>
              <div className="srd-count" aria-live="polite">
                {shown.length === loaded.length ? `${loaded.length} ${noun}` : `${shown.length} of ${loaded.length} ${noun}`}
              </div>
              {shown.length === 0
                ? <div className="cm-empty is-inline">Nothing matches. Try fewer filters, or the other edition.</div>
                : shown.map(e => (
                  <ListRow key={e.id} active={selected?.id === e.id} onClick={() => setSelectedId(e.id)}
                    glyph={kind === 'monsters' ? '◆' : '✠'} title={e.name} subtitle={rowLine(e, kind)} />
                ))}
            </div>
            <div className="srd-preview">
              {selected && (kind === 'monsters'
                ? <MonsterPreview m={selected as SrdMonster} edition={edition} />
                : <ItemPreview i={selected as SrdItem} />)}
              {selectedNote && <p className="as-hint srd-note">{selectedNote}</p>}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function rowLine(e: SrdMonster | SrdItem, kind: Props['kind']): string {
  if (kind === 'monsters') {
    const m = e as SrdMonster;
    return [`CR ${m.cr}`, baseType(m.type), `${m.xp.toLocaleString()} XP`].join(' · ');
  }
  const i = e as SrdItem;
  return [ITEM_TYPES.find(t => t.id === i.type)?.label, i.rarityText.toLowerCase() || null, i.attunement && 'attunement'].filter(Boolean).join(' · ');
}

/** The stat block as it will be saved. */
function MonsterPreview({ m, edition }: { m: SrdMonster; edition: SrdEdition }) {
  const sheet = { ...srdToStatblock(m, edition), id: m.id } as MonsterStatblock;
  return (
    <article className="srd-entry">
      <h3 className="srd-name">{m.name}</h3>
      <p className="srd-meta">CR {m.cr} · {m.xp.toLocaleString()} XP · {SRD_SHORT[edition]}</p>
      <StatBlockBody m={sheet} />
    </article>
  );
}

function ItemPreview({ i }: { i: SrdItem }) {
  const r = rarity(i.rarity);
  return (
    <article className="srd-entry">
      <h3 className="srd-name">{i.name}</h3>
      <p className="srd-meta">{i.line}{r && <> <Badge color={r.color}>{r.label}</Badge></>}</p>
      <MarkdownContent text={i.text} />
    </article>
  );
}
