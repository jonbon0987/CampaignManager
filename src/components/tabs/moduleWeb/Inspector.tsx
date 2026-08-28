/* moduleWeb/Inspector.tsx — the 328px rail beside the stage. Shows what is
   selected: where it sits in the story, what it contains, and what it
   requires / unlocks. Everything here also selects on the stage. */
import { typeInfo } from '../moduleDetail/pickers';
import { MarkdownContent } from '../../ui/MarkdownContent';
import { AddRow } from './AddForm';
import { kindLabel, type Selection } from './shared';
import type { BodyKind } from './sim';
import type { Module, Submodule, Scene, ModuleDependency, SubmoduleDependency } from '../../../lib/database.types';

interface DepRow { id: string; dependency_type: string; label: string; onGo: () => void }

function DepRows({ rows, onDelete }: { rows: DepRow[]; onDelete: (id: string) => void }) {
  return rows.map(r => (
    <div key={r.id} className="orr-dep-row">
      <span className={`orr-dep-kind ${r.dependency_type === 'optional' ? 'is-or' : ''}`}>
        {r.dependency_type === 'optional' ? 'OR' : 'AND'}
      </span>
      {/* eslint-disable-next-line no-restricted-syntax -- bespoke dependency row: a name that reads as text and selects on click */}
      <button className="orr-dep-name" onClick={r.onGo}>{r.label}</button>
      {/* eslint-disable-next-line no-restricted-syntax -- bespoke inline remove glyph */}
      <button className="orr-x" title="Remove" onClick={() => onDelete(r.id)}>✕</button>
    </div>
  ));
}

export function Inspector({
  sel, modules, submodules, scenes, moduleDeps, subDeps,
  onSelect, onOpen, onAddChild, onDeleteDep, isPinned, onTogglePin,
}: {
  sel: Selection | null;
  modules: Module[];
  submodules: Submodule[];
  scenes: Scene[];
  moduleDeps: ModuleDependency[];
  subDeps: SubmoduleDependency[];
  onSelect: (id: string, kind: BodyKind) => void;
  onOpen: (id: string, kind: BodyKind) => void;
  onAddChild: (parentId: string, kind: 'sub' | 'scene', title: string, type: string) => void;
  onDeleteDep: (id: string, kind: BodyKind) => void;
  isPinned: boolean;
  onTogglePin: () => void;
}) {
  if (!sel) {
    return (
      <aside className="orr-side">
        <div className="orr-side-empty">
          <div className="orr-side-empty-glyph">✦</div>
          <div className="orr-side-empty-title">Nothing selected</div>
          <p>
            Click a body to inspect it. Click its <b>ring badge</b> to open the parts inside,
            and drag the <b>◦ handle</b> from one body to another to make it a prerequisite.
          </p>
        </div>
      </aside>
    );
  }

  const { kind } = sel;
  const scene = kind === 'scene' ? scenes.find(x => x.id === sel.id) ?? null : null;
  const sub = kind === 'sub'
    ? submodules.find(s => s.id === sel.id) ?? null
    : scene ? submodules.find(s => s.id === scene.submodule_id) ?? null : null;
  const mod = kind === 'module'
    ? modules.find(m => m.id === sel.id) ?? null
    : sub ? modules.find(m => m.id === sub.module_id) ?? null : null;

  const rec = scene ?? sub ?? mod;
  if (!rec || !mod) return <aside className="orr-side" />;

  const info = kind === 'module' ? null : typeInfo(scene ? scene.scene_type : sub?.submodule_type);
  const kids = kind === 'module'
    ? submodules.filter(s => s.module_id === mod.id).sort((a, b) => a.sort_order - b.sort_order)
    : kind === 'sub' && sub
      ? scenes.filter(s => s.submodule_id === sub.id).sort((a, b) => a.sort_order - b.sort_order)
      : [];

  // Scenes run in order within their part and take no dependencies.
  const depSet: { id: string; dependent_id: string; prerequisite_id: string; dependency_type: string }[] =
    kind === 'module' ? moduleDeps : kind === 'sub' ? subDeps : [];
  const nameOf = (id: string) =>
    (kind === 'module' ? modules.find(m => m.id === id)?.title : submodules.find(s => s.id === id)?.title) ?? '—';
  const prereqs = depSet.filter(d => d.dependent_id === rec.id)
    .map(d => ({ ...d, label: nameOf(d.prerequisite_id), onGo: () => onSelect(d.prerequisite_id, kind) }));
  const unlocks = depSet.filter(d => d.prerequisite_id === rec.id)
    .map(d => ({ ...d, label: nameOf(d.dependent_id), onGo: () => onSelect(d.dependent_id, kind) }));

  const prose = kind === 'module' ? mod.synopsis : (scene ?? sub)?.summary;

  return (
    <aside className="orr-side">
      <div className="orr-side-scroll">
        <div className="orr-side-head">
          <div className="orr-side-crumb">
            {kind === 'module' ? `Chapter ${mod.chapter ?? '—'}` : (
              <>
                <button onClick={() => onSelect(mod.id, 'module')}>Ch. {mod.chapter ?? '—'}</button>
                {kind === 'scene' && sub && <> › <button onClick={() => onSelect(sub.id, 'sub')}>{sub.title}</button></>}
              </>
            )}
          </div>
          <h2 className="orr-side-title">{rec.title || 'Untitled'}</h2>
          <div className="orr-side-tags">
            {kind === 'module'
              ? <span className={`orr-tag is-${mod.status}`}>{mod.status}</span>
              : info && <span className="orr-tag" style={{ color: info.color, borderColor: `${info.color}55` }}>{info.glyph} {info.label}</span>}
            <span className="orr-tag is-quiet">{kindLabel[kind]}</span>
            {kind !== 'scene' && <span className="orr-tag is-quiet">{kids.length} {kind === 'module' ? 'parts' : 'scenes'}</span>}
          </div>
        </div>

        {prose && <MarkdownContent text={prose} className="orr-side-prose" />}

        <div className="orr-side-btns">
          {/* The editor takes module ids only — a part or scene opens its owning module. */}
          {/* eslint-disable-next-line no-restricted-syntax -- bespoke rail control matching the stage bar */}
          <button className="orr-btn is-primary" onClick={() => onOpen(rec.id, kind)}>
            {kind === 'module' ? 'Open in editor →' : 'Open module →'}
          </button>
          {/* eslint-disable-next-line no-restricted-syntax -- bespoke rail toggle matching the stage bar */}
          <button className={`orr-btn ${isPinned ? 'is-on' : ''}`} onClick={onTogglePin} title="Hold this body in place">
            {isPinned ? '⦿ Pinned' : '⦾ Pin'}
          </button>
        </div>

        {kind !== 'scene' && (
          <div className="orr-side-sec">
            <div className="orr-side-sec-label">{kind === 'module' ? 'Parts' : 'Scenes'}</div>
            {kids.map(k => {
              const ki = typeInfo('submodule_type' in k ? k.submodule_type : k.scene_type);
              const sc = kind === 'module' ? scenes.filter(s => s.submodule_id === k.id).length : 0;
              return (
                // eslint-disable-next-line no-restricted-syntax -- bespoke child row, a list item that selects
                <button key={k.id} className="orr-kid" onClick={() => onSelect(k.id, kind === 'module' ? 'sub' : 'scene')}>
                  <span className="orr-kid-glyph" style={{ color: ki.color }}>{ki.glyph}</span>
                  <span className="orr-kid-title">{k.title || 'Untitled'}</span>
                  {sc > 0 && <span className="orr-kid-meta">{sc}</span>}
                </button>
              );
            })}
            {kids.length === 0 && <div className="orr-side-none">Nothing here yet.</div>}
            <AddRow
              label={kind === 'module' ? 'New part' : 'New scene'}
              kind={kind === 'module' ? 'sub' : 'scene'}
              onAdd={(title, type) => onAddChild(rec.id, kind === 'module' ? 'sub' : 'scene', title, type)} />
          </div>
        )}

        {kind !== 'scene' && (
          <div className="orr-side-sec">
            <div className="orr-side-sec-label">Requires</div>
            {prereqs.length
              ? <DepRows rows={prereqs} onDelete={id => onDeleteDep(id, kind)} />
              : <div className="orr-side-none">Nothing — this can open cold.</div>}
            <div className="orr-side-sec-label" style={{ marginTop: 14 }}>Unlocks</div>
            {unlocks.length
              ? <DepRows rows={unlocks} onDelete={id => onDeleteDep(id, kind)} />
              : <div className="orr-side-none">Nothing yet.</div>}
            <div className="orr-side-hint">Drag the <b>◦</b> handle on this body onto another to add a prerequisite.</div>
          </div>
        )}
      </div>
    </aside>
  );
}
