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
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Breadcrumb } from '../ui/Breadcrumb';
import type { Module } from '../../lib/database.types';
import { typeInfo } from './moduleDetail/pickers';
import { ModuleOverview } from './moduleDetail/ModuleOverview';
import { SubmoduleEditor } from './moduleDetail/SubmoduleEditor';
import { SceneEditor } from './moduleDetail/SceneEditor';

// Styles live in src/index.css — see the "Module Atlas" block appended there.

interface ModuleDetailProps {
  module: Module;
  onBack: () => void;
  onModuleDeleted: () => void;
  /**
   * The part or scene asked for from outside (Play's agenda, the palette, the
   * URL, Back), or null for the overview. A new request moves there even when
   * the id is one it was already asked for.
   */
  target?: { id: string | null; n: number };
  /** Told which part or scene is open (null for the overview), for the URL. */
  onPartChange?: (partOrSceneId: string | null) => void;
}

const OVERVIEW = '__overview';

export default function ModuleDetail({ module: mod, onBack, onModuleDeleted, target, onPartChange }: ModuleDetailProps) {
  const {
    submodules, upsertSubmodule,
    scenes, loadModuleTree,
    submoduleDeps, loadSubmoduleDeps,
  } = useCampaign();

  const [selectedId, setSelectedId] = useState<string>(target?.id ?? OVERVIEW);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>(() => (target?.id ? { [target.id]: true } : {}));
  const targetN = target?.n;
  const targetId = target?.id ?? null;
  useEffect(() => {
    if (targetN === undefined) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- following a request from outside (Back, a link)
    setSelectedId(targetId ?? OVERVIEW);
    if (targetId) setOpenIds(o => (o[targetId] ? o : { ...o, [targetId]: true }));
  }, [targetN, targetId]);

  // The whole tree: a scene can be opened directly, and Prev and Next walk every part.
  const [treeReady, setTreeReady] = useState(false);
  useEffect(() => {
    void loadModuleTree().catch(() => {}).finally(() => setTreeReady(true));
    loadSubmoduleDeps(mod.id);
  }, [mod.id, loadModuleTree, loadSubmoduleDeps]);

  const modSubs = useMemo(
    () => submodules.filter(s => s.module_id === mod.id).sort((a, b) => a.sort_order - b.sort_order),
    [submodules, mod.id],
  );

  useEffect(() => { onPartChange?.(selectedId === OVERVIEW ? null : selectedId); }, [selectedId, onPartChange]);

  // The module's scenes in running order: by part, then within each part.
  const scenesOf = useCallback((subId: string) => scenes.filter(s => s.submodule_id === subId).sort((a, b) => a.sort_order - b.sort_order), [scenes]);
  const running = useMemo(() => modSubs.flatMap(sub => scenesOf(sub.id)), [modSubs, scenesOf]);

  const selectedSub = modSubs.find(s => s.id === selectedId) ?? null;
  const selectedScene = running.find(s => s.id === selectedId) ?? null;
  const sceneAt = selectedScene ? running.indexOf(selectedScene) : -1;
  const scenePart = selectedScene ? modSubs.find(s => s.id === selectedScene.submodule_id) ?? null : null;

  // Keep the selection valid once the tree has loaded, and its part open in the outline.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the tree it's checked against loads after mount
    if (treeReady && selectedId !== OVERVIEW && !selectedSub && !selectedScene) setSelectedId(OVERVIEW);
  }, [treeReady, selectedId, selectedSub, selectedScene]);
  const openPartId = scenePart?.id;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follows a scene opened from outside, as well as the outline
    if (openPartId) setOpenIds(o => (o[openPartId] ? o : { ...o, [openPartId]: true }));
  }, [openPartId]);

  const selectSub = (id: string) => { setSelectedId(id); if (id !== OVERVIEW) setOpenIds(o => ({ ...o, [id]: true })); };
  const toggleOpen = (id: string) => setOpenIds(o => ({ ...o, [id]: !o[id] }));

  const addSubmodule = async () => {
    await upsertSubmodule({
      module_id: mod.id, title: 'New part', submodule_type: 'location',
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
            <span className="md-treelabel-text">Parts</span>
            <span className="md-treelabel-rule" />
          </div>

          {modSubs.map((sub, i) => {
            const info = typeInfo(sub.submodule_type);
            const open = !!openIds[sub.id];
            const subScenes = scenesOf(sub.id);
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
                  <span className="md-glyph" style={{ color: info.color }} title={info.label} aria-hidden>{info.glyph}</span>
                  <span className="md-num">{i + 1}</span>
                  <span className="md-sname">{sub.title || 'Untitled'}</span>
                  {subScenes.length > 0 && <span className="md-scount">{subScenes.length}</span>}
                </div>

                {open && subScenes.length > 0 && (
                  <div className="md-tree-scenes">
                    {subScenes.map((sc, si) => {
                      const sinfo = typeInfo(sc.scene_type);
                      return (
                        <button type="button" className={`md-tree-scene${selectedId === sc.id ? ' is-active' : ''}`} key={sc.id}
                          aria-current={selectedId === sc.id ? 'page' : undefined} onClick={() => setSelectedId(sc.id)}>
                          <span className="md-glyph is-small" style={{ color: sinfo.color }} title={sinfo.label} aria-hidden>{sinfo.glyph}</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{si + 1}. {sc.title}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div className="md-railfoot">
            <button className="md-add md-add-block" onClick={addSubmodule}>＋ Add part</button>
          </div>
        </div>
      </aside>

      {/* ───── editor pane ───── */}
      <section className="cm-md-detail" style={{ overflowY: 'auto' }}>
        {selectedId === OVERVIEW
          ? <ModuleOverview key={mod.id} module={mod} submodules={modSubs} deps={submoduleDeps}
              onSelect={selectSub} onDeleted={onModuleDeleted} />
          : selectedSub
            ? <SubmoduleEditor key={selectedSub.id} submodule={selectedSub} module={mod} siblings={modSubs}
                onOpenScene={setSelectedId} onDeleted={() => setSelectedId(OVERVIEW)} />
            : selectedScene && scenePart
              ? <SceneEditor key={selectedScene.id} scene={selectedScene} part={scenePart} module={mod}
                  index={scenesOf(scenePart.id).indexOf(selectedScene)} total={scenesOf(scenePart.id).length}
                  prev={running[sceneAt - 1] ?? null} next={running[sceneAt + 1] ?? null}
                  onOpenScene={setSelectedId} onOpenPart={() => setSelectedId(scenePart.id)} onDeleted={() => setSelectedId(scenePart.id)} />
              : null}
      </section>
    </div>
  );
}
