/* ════════════════════════════════════════════════════════════════
   ModuleDetail.tsx  — Atlas redesign
   Replaces the modal-heavy module screen with an inline,
   autosaving, two-pane editor:

     ┌──────────────┬───────────────────────────────┐
     │ outline rail │  overview  OR  submodule editor│
     │ (module +    │  (everything edits in place,   │
     │  submodules  │   no modals)                   │
     │  + scenes,   │                                │
     │  drag-sort)  │                                │
     └──────────────┴───────────────────────────────┘

   Drop-in replacement: same props + default export as the original.
   ════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useRef, useMemo } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Breadcrumb } from '../ui/Breadcrumb';
import type { Module } from '../../lib/database.types';
import { typeInfo } from './moduleDetail/pickers';
import { ModuleOverview } from './moduleDetail/ModuleOverview';
import { SubmoduleEditor } from './moduleDetail/SubmoduleEditor';

// Styles live in src/index.css — see the "Module Atlas" block appended there.

interface ModuleDetailProps {
  module: Module;
  onBack: () => void;
  onModuleDeleted: () => void;
}

const OVERVIEW = '__overview';

export default function ModuleDetail({ module: mod, onBack, onModuleDeleted }: ModuleDetailProps) {
  const {
    submodules, loadSubmodules, upsertSubmodule,
    scenes, loadScenes,
    submoduleDeps, loadSubmoduleDeps,
  } = useCampaign();

  const [selectedId, setSelectedId] = useState<string>(OVERVIEW);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadSubmodules(mod.id);
    loadSubmoduleDeps(mod.id);
  }, [mod.id, loadSubmodules, loadSubmoduleDeps]);

  const modSubs = useMemo(
    () => submodules.filter(s => s.module_id === mod.id).sort((a, b) => a.sort_order - b.sort_order),
    [submodules, mod.id],
  );

  // keep selection valid
  useEffect(() => {
    if (selectedId !== OVERVIEW && !modSubs.find(s => s.id === selectedId)) setSelectedId(OVERVIEW);
  }, [modSubs, selectedId]);

  // load scenes for expanded rows so the tree can show them
  useEffect(() => {
    Object.entries(openIds).forEach(([id, open]) => { if (open) loadScenes(id); });
  }, [openIds, loadScenes]);

  const selectSub = (id: string) => { setSelectedId(id); if (id !== OVERVIEW) setOpenIds(o => ({ ...o, [id]: true })); };
  const toggleOpen = (id: string) => setOpenIds(o => ({ ...o, [id]: !o[id] }));

  const addSubmodule = async () => {
    await upsertSubmodule({
      module_id: mod.id, title: 'New Submodule', submodule_type: 'location',
      summary: null, content: null, dm_notes: null, sort_order: modSubs.length,
      linked_monster_ids: null, linked_encounter_ids: null,
    });
  };

  /* ── drag reorder of submodules ── */
  const dragFrom = useRef<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const reorder = async (from: number, to: number) => {
    if (from === to) return;
    const arr = [...modSubs];
    const [m] = arr.splice(from, 1); arr.splice(to, 0, m);
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].sort_order !== i) await upsertSubmodule({ ...arr[i], sort_order: i });
    }
  };

  const selectedSub = modSubs.find(s => s.id === selectedId) ?? null;

  return (
    <div className="cm-md" style={{ height: '100%' }}>
      {/* ───── outline rail ───── */}
      <aside className="cm-md-list">
        <div className="cm-md-list-head" style={{ paddingBottom: 0, borderBottom: 'none' }}>
          <Breadcrumb segments={[{ label: 'Modules', onClick: onBack }, { label: mod.title }]} />
        </div>

        <button className={`md-railhead ${selectedId === OVERVIEW ? 'is-active' : ''}`} onClick={() => setSelectedId(OVERVIEW)}>
          <div className="cm-md-eyebrow">
            {mod.chapter ? `Chapter ${mod.chapter} · ` : ''}{mod.status}
          </div>
          <div className="md-railhead-title">{mod.title}</div>
          <div className="md-railhead-hint">Module overview</div>
        </button>

        <div className="cm-md-list-scroll" style={{ flex: 1, overflowY: 'auto' }}>
          <div className="md-treelabel">
            <span className="md-treelabel-text">Submodules</span>
            <span className="md-treelabel-rule" />
          </div>

          {modSubs.map((sub, i) => {
            const info = typeInfo(sub.submodule_type);
            const open = !!openIds[sub.id];
            const subScenes = scenes.filter(s => s.submodule_id === sub.id);
            return (
              <div key={sub.id}>
                <div
                  className={`md-srow ${selectedId === sub.id ? 'is-active' : ''} ${open ? 'is-open' : ''} ${draggingIdx === i ? 'is-dragging' : ''} ${dropIdx === i ? 'is-drop-target' : ''}`}
                  draggable
                  onClick={() => selectSub(sub.id)}
                  onDragStart={() => { dragFrom.current = i; setDraggingIdx(i); }}
                  onDragOver={e => { e.preventDefault(); setDropIdx(i); }}
                  onDrop={() => { if (dragFrom.current != null) reorder(dragFrom.current, i); setDropIdx(null); }}
                  onDragEnd={() => { dragFrom.current = null; setDraggingIdx(null); setDropIdx(null); }}
                >
                  <span className="md-grip" title="Drag to reorder" onClick={e => e.stopPropagation()}>⠿</span>
                  <span className="md-twist" onClick={e => { e.stopPropagation(); toggleOpen(sub.id); }}>
                    {subScenes.length > 0 || open ? '▶' : ''}
                  </span>
                  <span className="md-dot" style={{ background: info.color }} title={info.label} />
                  <span className="md-num">{i + 1}</span>
                  <span className="md-sname">{sub.title || 'Untitled'}</span>
                  {subScenes.length > 0 && <span className="md-scount">{subScenes.length}</span>}
                </div>

                {open && subScenes.length > 0 && (
                  <div className="md-tree-scenes">
                    {subScenes.sort((a, b) => a.sort_order - b.sort_order).map((sc, si) => {
                      const sinfo = typeInfo(sc.scene_type);
                      return (
                        <div className="md-tree-scene" key={sc.id} onClick={() => selectSub(sub.id)}>
                          <span className="md-tree-scene-dot" style={{ background: sinfo.color }} />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{si + 1}. {sc.title}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div className="md-railfoot">
            <button className="md-add md-add-block" onClick={addSubmodule}>＋ Add submodule</button>
          </div>
        </div>
      </aside>

      {/* ───── editor pane ───── */}
      <section className="cm-md-detail" style={{ overflowY: 'auto' }}>
        {selectedId === OVERVIEW
          ? <ModuleOverview module={mod} submodules={modSubs} deps={submoduleDeps}
              onSelect={selectSub} onDeleted={onModuleDeleted} />
          : selectedSub
            ? <SubmoduleEditor submodule={selectedSub} module={mod} siblings={modSubs}
                onDeleted={() => setSelectedId(OVERVIEW)} />
            : null}
      </section>
    </div>
  );
}
