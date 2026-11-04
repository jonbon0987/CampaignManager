/* ════════════════════════════════════════════════════════════════
   moduleDetail/SubmoduleEditor.tsx
   Right-pane inline editor for one submodule. Text fields (title, type,
   summary, content, DM notes) are committed via an explicit Save button;
   linked stat-sheets, linked encounters, prerequisites, and scene reorder
   apply immediately.
   ════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useRef } from 'react';
import { TitleInput } from '../../ui/TitleInput';
import { useCampaign } from '../../../context/CampaignContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { useAutoSave } from '../../../hooks/useAutoSave';
import { SaveStatusIndicator } from '../../ui/SaveStatusIndicator';
import { OverflowMenu } from '../../ui/OverflowMenu';
import { SlashField } from '../../ui/SlashField';
import { limitFor } from '../../../lib/fieldLimits';
import { wouldCreateSubmoduleCycle } from '../../../lib/moduleUtils';
import type { Module, Submodule, Scene, MonsterStatblock, Encounter } from '../../../lib/database.types';
import {
  TypeTag, InlinePicker, typeInfo, parseLinkedIds, SUBMODULE_TYPES,
} from './pickers';
import { difficultyColors as diffColor } from '../../../lib/theme';

/* ───────────────────────── scene row ───────────────────────── */

/** A scene in its part's list: it opens as its own page, and drags to reorder. */
function SceneRow({ scene, index, onOpen, onDragStart, onDrop, onDragEnd, dragging }: {
  scene: Scene;
  index: number;
  onOpen: () => void;
  onDragStart: (i: number) => void;
  onDrop: (i: number) => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const info = typeInfo(scene.scene_type);
  return (
    <div className={`md-scene-row${dragging ? ' is-dragging' : ''}`} draggable
      onDragStart={() => onDragStart(index)} onDragOver={e => e.preventDefault()} onDrop={() => onDrop(index)} onDragEnd={onDragEnd}>
      <span className="md-grip" title="Drag to reorder">⠿</span>
      <span className="md-scene-num">{index + 1}</span>
      <span className="md-glyph" style={{ color: info.color }} title={info.label} aria-hidden>{info.glyph}</span>
      <button type="button" className="md-scene-open" onClick={onOpen}>
        <span className="md-scene-name">{scene.title || 'Untitled scene'}</span>
        {scene.summary && <span className="md-scene-beat">{scene.summary}</span>}
      </button>
      <span className="md-scene-kind">{info.label}</span>
    </div>
  );
}

/* ───────────────────── submodule editor ───────────────────── */

interface SubForm { title: string; submodule_type: string; summary: string; content: string; dm_notes: string; }

export function SubmoduleEditor({ submodule, module, siblings, onDeleted, onOpenScene }: {
  submodule: Submodule;
  module: Module;
  siblings: Submodule[];
  onDeleted: () => void;
  onOpenScene: (id: string) => void;
}) {
  const {
    upsertSubmodule, deleteSubmodule,
    scenes, loadScenes, upsertScene,
    monsterStatblocks, encounters,
    submoduleDeps, upsertSubmoduleDep, deleteSubmoduleDep,
  } = useCampaign();
  const confirm = useConfirm();

  const [form, setForm] = useState<SubForm>(() => toForm(submodule));
  const subRef = useRef(submodule);
  subRef.current = submodule;

  useEffect(() => { loadScenes(submodule.id); }, [submodule.id, loadScenes]);

  const { status, saveNow: save } = useAutoSave<SubForm>({
    data: form,
    delay: 800,
    onSave: async (d) => {
      await upsertSubmodule({
        id: submodule.id,
        module_id: submodule.module_id,
        title: d.title || 'Untitled',
        submodule_type: d.submodule_type || null,
        summary: d.summary || null,
        content: d.content || null,
        dm_notes: d.dm_notes || null,
        sort_order: subRef.current.sort_order,
        linked_monster_ids: subRef.current.linked_monster_ids,
        linked_encounter_ids: subRef.current.linked_encounter_ids,
      });
    },
  });
  const set = <K extends keyof SubForm>(k: K, v: SubForm[K]) => setForm(p => ({ ...p, [k]: v }));

  /* linked stat sheets */
  const monsterIds = parseLinkedIds(submodule.linked_monster_ids);
  const linkedMonsters = monsterIds.map(id => monsterStatblocks.find(m => m.id === id)).filter((m): m is MonsterStatblock => !!m);
  const linkCreature = (id: string) => upsertSubmodule({ ...subRef.current, linked_monster_ids: JSON.stringify([...monsterIds, id]) });
  const unlinkCreature = (id: string) => upsertSubmodule({ ...subRef.current, linked_monster_ids: JSON.stringify(monsterIds.filter(x => x !== id)) });

  /* linked encounters */
  const encIds = parseLinkedIds(submodule.linked_encounter_ids);
  const linkedEncs = encIds.map(id => encounters.find(e => e.id === id)).filter((e): e is Encounter => !!e);
  const linkEnc = (id: string) => upsertSubmodule({ ...subRef.current, linked_encounter_ids: JSON.stringify([...encIds, id]) });
  const unlinkEnc = (id: string) => upsertSubmodule({ ...subRef.current, linked_encounter_ids: JSON.stringify(encIds.filter(x => x !== id)) });

  /* dependencies */
  const prereqs = submoduleDeps.filter(d => d.dependent_id === submodule.id);
  const [depKind, setDepKind] = useState<'required' | 'optional'>('required');
  const addDep = (prereqId: string) => {
    if (wouldCreateSubmoduleCycle(submoduleDeps, submodule.id, prereqId)) return;
    upsertSubmoduleDep({
      dependent_id: submodule.id, prerequisite_id: prereqId,
      dependency_type: depKind, group_id: depKind === 'optional' ? crypto.randomUUID() : null, label: null,
    });
  };

  /* scenes for this submodule + drag reorder */
  const subScenes = scenes.filter(s => s.submodule_id === submodule.id).sort((a, b) => a.sort_order - b.sort_order);
  const dragFrom = useRef<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const reorderScenes = async (from: number, to: number) => {
    if (from === to) return;
    const arr = [...subScenes];
    const [m] = arr.splice(from, 1); arr.splice(to, 0, m);
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].sort_order !== i) await upsertScene({ ...arr[i], sort_order: i });
    }
  };

  return (
    <div className="cm-detail">
      <div className="md-editor">
        {/* action bar */}
        <div className="as-bar">
          <SaveStatusIndicator status={status} onRetry={save} />
          <div className="as-spacer" />
          <OverflowMenu items={[{
            label: 'Delete part', danger: true,
            onClick: async () => { if (await confirm(`Delete "${submodule.title}" and all its scenes?`)) { await deleteSubmodule(submodule.id, submodule.module_id); onDeleted(); } },
          }]} />
        </div>

        <div className="md-eyebrow">
          {module.title} · Part {siblings.findIndex(s => s.id === submodule.id) + 1} of {siblings.length}
        </div>

        <div className="md-typebar">
          <TypeTag type={form.submodule_type} types={SUBMODULE_TYPES} onPick={t => set('submodule_type', t)} />
        </div>

        <TitleInput value={form.title} placeholder="Part title…"
          onChange={e => set('title', e.target.value)} maxLength={limitFor('submodules', 'title')} />

        {/* summary */}
        <div className="as-fl" style={{ marginTop: 10 }}>
          <span className="as-ll">Summary</span>
          <SlashField value={form.summary} onChange={v => set('summary', v)}
            placeholder="Short summary shown in the outline…" minHeight="50px" maxLength={limitFor('submodules', 'summary')} />
        </div>

        {/* content */}
        <div className="as-fl">
          <span className="as-ll">Full Write-Up</span>
          <SlashField value={form.content} onChange={v => set('content', v)}
            placeholder="History, atmosphere, key details, DM guidance…" minHeight="220px" maxLength={limitFor('submodules', 'content')} />
        </div>

        {/* dm notes */}
        <div className="md-dm">
          <div className="md-dm-label">DM Notes</div>
          <SlashField value={form.dm_notes} onChange={v => set('dm_notes', v)}
            placeholder="Hidden info, contingencies, secrets…" minHeight="50px" maxLength={limitFor('submodules', 'dm_notes')} />
        </div>

        {/* linked stat sheets */}
        <div className="as-fl">
          <span className="as-ll">Stat Sheets</span>
          <div className="md-chips">
            {linkedMonsters.map(m => {
              const ci = typeInfo(m.creature_type);
              return (
                <span key={m.id} className="md-chip">
                  <span className="md-chip-glyph" style={{ color: ci.color }}>☠</span>{m.name}
                  {m.challenge_rating && <span className="md-chip-cr">CR {m.challenge_rating}</span>}
                  <button title="Unlink" onClick={() => unlinkCreature(m.id)}>✕</button>
                </span>
              );
            })}
            <InlinePicker label="Stat sheet"
              options={monsterStatblocks.filter(m => !monsterIds.includes(m.id)).map(m => ({
                id: m.id, label: m.name, meta: m.challenge_rating ? `CR ${m.challenge_rating}` : undefined,
                glyph: '☠', color: typeInfo(m.creature_type).color,
              }))}
              onPick={linkCreature} />
          </div>
        </div>

        {/* linked encounters */}
        <div className="as-fl">
          <span className="as-ll">Encounters</span>
          <div className="md-chips">
            {linkedEncs.map(e => (
              <span key={e.id} className="md-chip">
                <span className="md-chip-glyph" style={{ color: diffColor[e.difficulty ?? ''] ?? 'var(--gold)' }}>⚔</span>{e.name}
                {e.difficulty && <span className="md-chip-cr" style={{ color: diffColor[e.difficulty] }}>{e.difficulty}</span>}
                <button title="Unlink" onClick={() => unlinkEnc(e.id)}>✕</button>
              </span>
            ))}
            <InlinePicker label="Encounter"
              options={encounters.filter(e => !encIds.includes(e.id)).map(e => ({
                id: e.id, label: e.name, meta: e.difficulty ?? undefined, glyph: '⚔', color: diffColor[e.difficulty ?? ''] ?? 'var(--gold)',
              }))}
              onPick={linkEnc} />
          </div>
        </div>

        {/* dependencies */}
        <div className="as-fl">
          <span className="as-ll">Prerequisites</span>
          <div>
            {prereqs.length === 0 && <div className="md-pop-empty" style={{ padding: '2px 0' }}>No prerequisites.</div>}
            {prereqs.map(dep => {
              const ps = siblings.find(s => s.id === dep.prerequisite_id);
              if (!ps) return null;
              return (
                <div className="md-dep" key={dep.id}>
                  <span className="md-dep-arrow">needs</span>
                  <span className={`md-dep-kind md-dep-kind-${dep.dependency_type === 'required' ? 'required' : 'optional'}`}>
                    {dep.dependency_type === 'required' ? 'AND' : 'OR'}
                  </span>
                  <span className="md-dep-name">{ps.title}</span>
                  <button className="md-iconbtn is-danger" title="Remove" onClick={() => deleteSubmoduleDep(dep.id)}>✕</button>
                </div>
              );
            })}
            <div style={{ marginTop: 6 }}>
              <InlinePicker label="Prerequisite"
                radio={{ value: depKind, options: [{ value: 'required', label: 'Required (AND)' }, { value: 'optional', label: 'Optional (OR)' }], onChange: v => setDepKind(v as 'required' | 'optional') }}
                options={siblings.filter(s => s.id !== submodule.id && !prereqs.find(d => d.prerequisite_id === s.id)).map(s => ({
                  id: s.id, label: s.title, glyph: typeInfo(s.submodule_type).glyph, color: typeInfo(s.submodule_type).color,
                }))}
                onPick={addDep} />
            </div>
          </div>
        </div>

        {/* scenes */}
        <div className="as-fl">
          <span className="as-ll">Scenes · {subScenes.length}</span>
          <div className="md-scene-list">
            {subScenes.length === 0 && <div className="md-pop-empty" style={{ padding: '2px 0' }}>No scenes yet — add the beats you'll run from.</div>}
            {subScenes.map((sc, i) => (
              <SceneRow key={sc.id} scene={sc} index={i} onOpen={() => onOpenScene(sc.id)}
                dragging={draggingIdx === i}
                onDragStart={(idx) => { dragFrom.current = idx; setDraggingIdx(idx); }}
                onDrop={(idx) => { if (dragFrom.current != null) reorderScenes(dragFrom.current, idx); }}
                onDragEnd={() => { dragFrom.current = null; setDraggingIdx(null); }}
              />
            ))}
            <button className="md-add" style={{ marginTop: 6 }} onClick={async () => {
              const made = await upsertScene({
                submodule_id: submodule.id, title: 'New scene', scene_type: 'encounter',
                summary: null, content: null, dm_notes: null, sort_order: subScenes.length, linked_monster_ids: null,
              });
              if (made) onOpenScene(made.id);
            }}>＋ Scene</button>
          </div>
        </div>
      </div>
    </div>
  );

  function toForm(s: Submodule): SubForm {
    return { title: s.title, submodule_type: s.submodule_type ?? 'location', summary: s.summary ?? '', content: s.content ?? '', dm_notes: s.dm_notes ?? '' };
  }
}
