// Import characters from character sheet PDFs. Each sheet is read (its form
// fields, or its text by the assistant), matched to a record by name or made a
// new one, and shown as a list of changes to tick before anything is saved.
// What a sheet becomes (a PC, or an NPC and its stat sheet) comes from `kind`
// (see sheetKinds.ts).

import { useRef, useState } from 'react';
import { Modal } from '../Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Input';
import { sameName, type FieldChange } from '../../lib/characterSheet';
import './sheetImport.css';

/** A record a sheet can be imported into. */
export interface SheetTarget { id: string; name: string }

/** How one kind of record reads a sheet and compares it with what it has. */
export interface SheetKind<R> {
  /** "player character", "NPC". */
  noun: string;
  read(file: File): Promise<{ source: 'form' | 'ai'; result: R }>;
  /** The name on the sheet, to match it to a record. */
  nameOf(result: R): string | undefined;
  /** The changes importing it would make to the record (null: a new one). */
  diff(result: R, targetId: string | null): FieldChange[];
  /** Headings for grouped changes (an NPC and its stat sheet), by group. */
  groupLabel?(group: string, targetId: string | null): string;
  /** A line under the intro, e.g. what else a sheet can be. */
  hint?: string;
}

export interface SheetImport<R> {
  /** The record to update, or null for a new one. */
  targetId: string | null;
  /** The changes, with what's ticked. */
  changes: FieldChange[];
  file: string;
  result: R;
}

interface Row<R> {
  key: number;
  file: string;
  status: 'reading' | 'ready' | 'error';
  error?: string;
  source?: 'form' | 'ai';
  result?: R;
  target: string; // a record id, or NEW
  changes: FieldChange[];
}

const NEW = 'new';
const show = (v: string | number | null) => (v == null || v === '' ? '—' : String(v));
const changeKey = (c: FieldChange) => `${c.group ?? ''}:${c.key}`;

export function SheetImportDialog<R>({ isOpen, onClose, kind, targets, target, onApply }: {
  isOpen: boolean;
  onClose: () => void;
  kind: SheetKind<R>;
  /** The records sheets can be matched to. */
  targets: SheetTarget[];
  /** Import into this record only (one sheet). Without it, any number of sheets, each matched by name. */
  target?: SheetTarget;
  onApply: (imports: SheetImport<R>[]) => Promise<void> | void;
}) {
  const [rows, setRows] = useState<Row<R>[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);

  const close = () => { setRows([]); setError(''); setSaving(false); onClose(); };
  const changesFor = (result: R, t: string) => kind.diff(result, t === NEW ? null : t);
  const match = (result: R) => {
    const name = kind.nameOf(result);
    return name ? targets.find(t => t.name && sameName(t.name, name))?.id : undefined;
  };

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const list = target ? [files[0]] : Array.from(files);
    const added: Row<R>[] = list.map(f => ({ key: nextKey.current++, file: f.name, status: 'reading', target: target?.id ?? NEW, changes: [] }));
    setRows(prev => (target ? added : [...prev, ...added]));
    list.forEach((file, i) => {
      const key = added[i].key;
      kind.read(file).then(({ source, result }) => {
        setRows(prev => prev.map(r => {
          if (r.key !== key) return r;
          const t = target?.id ?? match(result) ?? NEW;
          return { ...r, status: 'ready', source, result, target: t, changes: changesFor(result, t) };
        }));
      }).catch((err: unknown) => {
        setRows(prev => prev.map(r => (r.key === key ? { ...r, status: 'error', error: err instanceof Error ? err.message : 'Couldn’t read this sheet.' } : r)));
      });
    });
  };

  const setTarget = (key: number, t: string) =>
    setRows(prev => prev.map(r => (r.key === key && r.result !== undefined ? { ...r, target: t, changes: changesFor(r.result, t) } : r)));
  const toggle = (key: number, ck: string) =>
    setRows(prev => prev.map(r => (r.key === key ? { ...r, changes: r.changes.map(c => (changeKey(c) === ck ? { ...c, apply: !c.apply } : c)) } : r)));
  const remove = (key: number) => setRows(prev => prev.filter(r => r.key !== key));

  const ready = rows.filter(r => r.status === 'ready' && r.changes.some(c => c.apply));
  const reading = rows.some(r => r.status === 'reading');

  const apply = async () => {
    if (!ready.length || reading) return;
    setSaving(true);
    setError('');
    try {
      await onApply(ready.map(r => ({ targetId: r.target === NEW ? null : r.target, changes: r.changes, file: r.file, result: r.result as R })));
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save the import.');
      setSaving(false);
    }
  };

  const count = ready.length;
  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title={target ? `Import a sheet into ${target.name || `this ${kind.noun}`}` : 'Import character sheets'}
      size="wide"
      onSave={count && !reading && !saving ? () => void apply() : undefined}
      saveLabel={saving ? 'Saving…' : target ? 'Apply changes' : `Import ${count} ${count === 1 ? 'sheet' : 'sheets'}`}
    >
      <div className="shi">
        <p className="shi-intro">
          A PDF from D&amp;D Beyond (“Export to PDF”) or any fillable 5e sheet is read exactly, on this device. Other PDFs are read by the assistant, so check those carefully.
          {kind.hint ? ` ${kind.hint}` : ''} Nothing changes until you {target ? 'apply' : 'import'}.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple={!target}
          hidden
          aria-hidden
          onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
        />
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={saving}>
          {rows.length ? (target ? 'Choose another PDF…' : 'Add more PDFs…') : (target ? 'Choose a PDF…' : 'Choose PDFs…')}
        </Button>

        {rows.map(r => {
          const targetId = r.target === NEW ? null : r.target;
          const groups = [...new Set(r.changes.map(c => c.group))];
          return (
            <section key={r.key} className="shi-sheet" aria-label={r.file}>
              <div className="shi-sheet-head">
                <span className="shi-file">{r.file}</span>
                {r.status === 'ready' && (
                  <span className={`shi-source${r.source === 'ai' ? ' is-ai' : ''}`}>
                    {r.source === 'ai' ? 'Read by the assistant' : 'Read from the form'}
                  </span>
                )}
                {!target && r.status === 'ready' && (
                  <Select look="inline" className="shi-target" aria-label={`Import ${r.file} into`} value={r.target} onChange={e => setTarget(r.key, e.target.value)}>
                    <option value={NEW}>New {kind.noun}</option>
                    {targets.map(t => <option key={t.id} value={t.id}>{t.name || `Unnamed ${kind.noun}`}</option>)}
                  </Select>
                )}
                {!target && (
                  <Button variant="ghost" size="xs" onClick={() => remove(r.key)} aria-label={`Remove ${r.file}`} disabled={saving}>Remove</Button>
                )}
              </div>

              {r.status === 'reading' && <p className="shi-note">Reading…</p>}
              {r.status === 'error' && <p className="shi-note is-error" role="alert">{r.error}</p>}
              {r.status === 'ready' && r.changes.length === 0 && (
                <p className="shi-note">{targetId ? `Nothing new: the ${kind.noun} already matches this sheet.` : 'Nothing on this sheet could be read.'}</p>
              )}
              {r.status === 'ready' && r.changes.length > 0 && (
                <table className="shi-table">
                  <thead>
                    <tr>
                      <th scope="col"><span className="sr-only">Apply</span></th>
                      <th scope="col">Field</th>
                      {targetId && <th scope="col">Now</th>}
                      <th scope="col">From the sheet</th>
                    </tr>
                  </thead>
                  {groups.map(g => (
                    <tbody key={g ?? ''}>
                      {g && kind.groupLabel && (
                        <tr className="shi-group"><th scope="rowgroup" colSpan={targetId ? 4 : 3}>{kind.groupLabel(g, targetId)}</th></tr>
                      )}
                      {r.changes.filter(c => c.group === g).map(c => (
                        <tr key={changeKey(c)} className={c.apply ? '' : 'is-off'}>
                          <td>
                            <input type="checkbox" checked={c.apply} onChange={() => toggle(r.key, changeKey(c))}
                              aria-label={`Apply ${g && kind.groupLabel ? `${kind.groupLabel(g, targetId)}: ` : ''}${c.label}`} disabled={saving} />
                          </td>
                          <th scope="row">{c.label}</th>
                          {targetId && <td className="shi-now">{show(c.current)}</td>}
                          <td className="shi-next">{show(c.next)}</td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              )}
            </section>
          );
        })}

        {error && <p className="shi-note is-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
