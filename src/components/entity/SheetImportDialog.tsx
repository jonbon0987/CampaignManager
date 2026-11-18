// Import player characters from character sheet PDFs. Each sheet is read (its
// form fields, or its text by the assistant), matched to a PC by name or made a
// new one, and shown as a list of changes to tick before anything is saved.

import { useRef, useState } from 'react';
import { Modal } from '../Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Input';
import { matchPC, patchFrom, sheetChanges, type FieldChange, type SheetValues } from '../../lib/characterSheet';
import { readCharacterSheet, type SheetRead } from '../../lib/readCharacterSheet';
import type { PlayerCharacter } from '../../lib/database.types';
import './sheetImport.css';

type PCLike = Pick<PlayerCharacter, 'id' | 'character_name'> & Partial<PlayerCharacter>;

export interface SheetImport {
  /** The PC to update, or null for a new one. */
  pcId: string | null;
  /** The ticked changes. */
  patch: SheetValues;
  /** Everything read, for a new PC's name when the sheet has none. */
  file: string;
}

interface Row {
  key: number;
  file: string;
  status: 'reading' | 'ready' | 'error';
  error?: string;
  read?: SheetRead;
  target: string; // a PC id, or 'new'
  changes: FieldChange[];
}

const NEW = 'new';
const show = (v: string | number | null) => (v == null || v === '' ? '—' : String(v));

export function SheetImportDialog({ isOpen, onClose, pcs, target, onApply }: {
  isOpen: boolean;
  onClose: () => void;
  /** The campaign's PCs, to match sheets to. */
  pcs: PCLike[];
  /** Import into this PC only (one sheet). Without it, any number of sheets, each matched by name. */
  target?: PCLike;
  onApply: (imports: SheetImport[]) => Promise<void> | void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);

  const close = () => { setRows([]); setError(''); setSaving(false); onClose(); };

  const pcById = (id: string) => (target && target.id === id ? target : pcs.find(p => p.id === id));
  const changesFor = (read: SheetRead, targetId: string) => sheetChanges(read.values, targetId === NEW ? null : pcById(targetId));

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const list = target ? [files[0]] : Array.from(files);
    const added: Row[] = list.map(f => ({ key: nextKey.current++, file: f.name, status: 'reading', target: target?.id ?? NEW, changes: [] }));
    setRows(prev => (target ? added : [...prev, ...added]));
    list.forEach((file, i) => {
      const key = added[i].key;
      readCharacterSheet(file).then(read => {
        setRows(prev => prev.map(r => {
          if (r.key !== key) return r;
          const t = target?.id ?? matchPC(read.values, pcs)?.id ?? NEW;
          return { ...r, status: 'ready', read, target: t, changes: changesFor(read, t) };
        }));
      }).catch((err: unknown) => {
        setRows(prev => prev.map(r => (r.key === key ? { ...r, status: 'error', error: err instanceof Error ? err.message : 'Couldn’t read this sheet.' } : r)));
      });
    });
  };

  const setTarget = (key: number, t: string) =>
    setRows(prev => prev.map(r => (r.key === key && r.read ? { ...r, target: t, changes: changesFor(r.read, t) } : r)));
  const toggle = (key: number, field: string) =>
    setRows(prev => prev.map(r => (r.key === key ? { ...r, changes: r.changes.map(c => (c.key === field ? { ...c, apply: !c.apply } : c)) } : r)));
  const remove = (key: number) => setRows(prev => prev.filter(r => r.key !== key));

  const ready = rows.filter(r => r.status === 'ready' && r.changes.some(c => c.apply));
  const reading = rows.some(r => r.status === 'reading');

  const apply = async () => {
    if (!ready.length || reading) return;
    setSaving(true);
    setError('');
    try {
      await onApply(ready.map(r => ({ pcId: r.target === NEW ? null : r.target, patch: patchFrom(r.changes), file: r.file })));
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
      title={target ? `Import a sheet into ${target.character_name || 'this character'}` : 'Import character sheets'}
      size="wide"
      onSave={count && !reading && !saving ? () => void apply() : undefined}
      saveLabel={saving ? 'Saving…' : target ? 'Apply changes' : `Import ${count} ${count === 1 ? 'sheet' : 'sheets'}`}
    >
      <div className="shi">
        <p className="shi-intro">
          A PDF from D&amp;D Beyond (“Export to PDF”) or any fillable 5e sheet is read exactly, on this device. Other PDFs are read by the assistant, so check those carefully.
          Nothing changes until you {target ? 'apply' : 'import'}.
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

        {rows.map(r => (
          <section key={r.key} className="shi-sheet" aria-label={r.file}>
            <div className="shi-sheet-head">
              <span className="shi-file">{r.file}</span>
              {r.status === 'ready' && (
                <span className={`shi-source${r.read?.source === 'ai' ? ' is-ai' : ''}`}>
                  {r.read?.source === 'ai' ? 'Read by the assistant' : 'Read from the form'}
                </span>
              )}
              {!target && r.status === 'ready' && (
                <Select look="inline" className="shi-target" aria-label={`Import ${r.file} into`} value={r.target} onChange={e => setTarget(r.key, e.target.value)}>
                  <option value={NEW}>New player character</option>
                  {pcs.map(p => <option key={p.id} value={p.id}>{p.character_name || 'Unnamed PC'}</option>)}
                </Select>
              )}
              {!target && (
                <Button variant="ghost" size="xs" onClick={() => remove(r.key)} aria-label={`Remove ${r.file}`} disabled={saving}>Remove</Button>
              )}
            </div>

            {r.status === 'reading' && <p className="shi-note">Reading…</p>}
            {r.status === 'error' && <p className="shi-note is-error" role="alert">{r.error}</p>}
            {r.status === 'ready' && r.changes.length === 0 && (
              <p className="shi-note">{Object.keys(r.read?.values ?? {}).length ? 'Nothing new: the character already matches this sheet.' : 'Nothing on this sheet could be read.'}</p>
            )}
            {r.status === 'ready' && r.changes.length > 0 && (
              <table className="shi-table">
                <thead>
                  <tr>
                    <th scope="col"><span className="sr-only">Apply</span></th>
                    <th scope="col">Field</th>
                    {r.target !== NEW && <th scope="col">Now</th>}
                    <th scope="col">From the sheet</th>
                  </tr>
                </thead>
                <tbody>
                  {r.changes.map(c => (
                    <tr key={c.key} className={c.apply ? '' : 'is-off'}>
                      <td>
                        <input type="checkbox" checked={c.apply} onChange={() => toggle(r.key, c.key)} aria-label={`Apply ${c.label}`} disabled={saving} />
                      </td>
                      <th scope="row">{c.label}</th>
                      {r.target !== NEW && <td className="shi-now">{show(c.current)}</td>}
                      <td className="shi-next">{show(c.next)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}

        {error && <p className="shi-note is-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
