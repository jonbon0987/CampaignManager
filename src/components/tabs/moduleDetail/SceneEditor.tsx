/* ════════════════════════════════════════════════════════════════
   moduleDetail/SceneEditor.tsx
   One scene as its own page: the unit a DM actually runs. It saves as
   you type; Prev and Next walk the module's scenes in running order.
   ════════════════════════════════════════════════════════════════ */
import { useRef, useState } from 'react';
import { TitleInput } from '../../ui/TitleInput';
import { useCampaign } from '../../../context/CampaignContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { HandoutGallery } from '../../handouts/HandoutGallery';
import { useHandouts } from '../../../hooks/useHandouts';
import { ReadAloudField } from '../../ui/ReadAloudBlock';
import { useAutoSave } from '../../../hooks/useAutoSave';
import { SaveStatusIndicator } from '../../ui/SaveStatusIndicator';
import { OverflowMenu } from '../../ui/OverflowMenu';
import { SlashField } from '../../ui/SlashField';
import { Button } from '../../ui/Button';
import { limitFor } from '../../../lib/fieldLimits';
import type { Module, Submodule, Scene, MonsterStatblock } from '../../../lib/database.types';
import { TypeTag, InlinePicker, typeInfo, parseLinkedIds, SCENE_TYPES } from './pickers';

interface SceneForm { title: string; scene_type: string; summary: string; content: string; dm_notes: string; read_aloud: string; }

const toForm = (s: Scene): SceneForm => ({
  title: s.title, scene_type: s.scene_type ?? 'encounter', summary: s.summary ?? '', content: s.content ?? '', dm_notes: s.dm_notes ?? '', read_aloud: s.read_aloud ?? '',
});

/** A scene's handouts, loaded when the scene is opened. */
function SceneHandouts({ sceneId }: { sceneId: string }) {
  const { handouts, adding, add, rename, remove } = useHandouts([sceneId]);
  return (
    <HandoutGallery handouts={handouts} adding={adding} onAdd={files => void add(sceneId, files)}
      onRename={(h, t) => void rename(h, t)} onRemove={h => void remove(h)} sharable />
  );
}

export function SceneEditor({ scene, part, module, index, total, prev, next, onOpenScene, onOpenPart, onDeleted }: {
  scene: Scene;
  part: Submodule;
  module: Module;
  /** Its place within its part. */
  index: number;
  total: number;
  /** The scenes either side of it across the module, in running order. */
  prev: Scene | null;
  next: Scene | null;
  onOpenScene: (id: string) => void;
  onOpenPart: () => void;
  onDeleted: () => void;
}) {
  const { upsertScene, deleteScene, monsterStatblocks } = useCampaign();
  const confirm = useConfirm();
  const [form, setForm] = useState<SceneForm>(() => toForm(scene));
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const { status, saveNow } = useAutoSave<SceneForm>({
    data: form,
    delay: 800,
    onSave: async d => {
      await upsertScene({
        id: scene.id,
        submodule_id: scene.submodule_id,
        title: d.title || 'Untitled scene',
        scene_type: d.scene_type || null,
        summary: d.summary || null,
        content: d.content || null,
        dm_notes: d.dm_notes || null,
        read_aloud: d.read_aloud || null,
        sort_order: sceneRef.current.sort_order,
        linked_monster_ids: sceneRef.current.linked_monster_ids,
      });
    },
  });
  const set = <K extends keyof SceneForm>(k: K, v: SceneForm[K]) => setForm(p => ({ ...p, [k]: v }));

  // Leaving takes the last edit with it.
  const go = (open: () => void) => () => { void saveNow().then(open); };

  const linkedIds = parseLinkedIds(scene.linked_monster_ids);
  const linked = linkedIds.map(id => monsterStatblocks.find(m => m.id === id)).filter((m): m is MonsterStatblock => !!m);
  const linkCreature = (id: string) => upsertScene({ ...sceneRef.current, linked_monster_ids: JSON.stringify([...linkedIds, id]) });
  const unlinkCreature = (id: string) => upsertScene({ ...sceneRef.current, linked_monster_ids: JSON.stringify(linkedIds.filter(x => x !== id)) });

  const remove = async () => {
    if (await confirm({ title: 'Delete this scene?', message: `Delete "${scene.title}"? You can undo this from its toast or Recently deleted.`, confirmLabel: 'Delete', danger: true })) {
      await deleteScene(scene.id, scene.submodule_id);
      onDeleted();
    }
  };

  const walker = (
    <nav className="md-scene-walk" aria-label="Scenes in this module">
      <Button variant="ghost" size="sm" disabled={!prev} onClick={prev ? go(() => onOpenScene(prev.id)) : undefined}>‹ {prev ? prev.title || 'Untitled scene' : 'First scene'}</Button>
      <Button variant="ghost" size="sm" disabled={!next} onClick={next ? go(() => onOpenScene(next.id)) : undefined}>{next ? next.title || 'Untitled scene' : 'Last scene'} ›</Button>
    </nav>
  );

  return (
    <div className="cm-detail">
      <div className="md-editor">
        <div className="as-bar">
          <SaveStatusIndicator status={status} onRetry={saveNow} />
          <div className="as-spacer" />
          <OverflowMenu items={[{ label: 'Delete scene', danger: true, onClick: () => void remove() }]} />
        </div>

        <div className="md-eyebrow">
          {module.title} · <Button variant="link" className="md-eyebrow-link" onClick={go(onOpenPart)}>{part.title || 'Untitled part'}</Button> · Scene {index + 1} of {total}
        </div>

        <div className="md-typebar">
          <TypeTag type={form.scene_type} types={SCENE_TYPES} onPick={t => set('scene_type', t)} />
        </div>

        <TitleInput value={form.title} placeholder="Scene title…" aria-label="Scene title"
          onChange={e => set('title', e.target.value)} maxLength={limitFor('scenes', 'title')} />

        <div className="as-fl" style={{ marginTop: 10 }}>
          <label className="as-ll" htmlFor={`scene-beat-${scene.id}`}>The beat</label>
          <input id={`scene-beat-${scene.id}`} className="as-input" value={form.summary} placeholder="What happens here, in a line"
            onChange={e => set('summary', e.target.value)} maxLength={limitFor('scenes', 'summary')} />
        </div>

        <div className="as-fl">
          <ReadAloudField value={form.read_aloud} onChange={v => set('read_aloud', v)} maxLength={limitFor('scenes', 'read_aloud')} />
        </div>

        <div className="as-fl">
          <span className="as-ll">Scene detail</span>
          <SlashField value={form.content} onChange={v => set('content', v)}
            placeholder="Tactics, outcomes, what changes…" minHeight="160px" maxLength={limitFor('scenes', 'content')} />
        </div>

        <div className="md-dm">
          <div className="md-dm-label">DM Notes</div>
          <SlashField value={form.dm_notes} onChange={v => set('dm_notes', v)}
            placeholder="Hidden info, contingencies, secrets…" minHeight="50px" maxLength={limitFor('scenes', 'dm_notes')} />
        </div>

        <div className="as-fl">
          <span className="as-ll">Stat Sheets</span>
          <div className="md-chips">
            {linked.map(m => {
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
              options={monsterStatblocks.filter(m => !linkedIds.includes(m.id)).map(m => ({
                id: m.id, label: m.name, meta: m.challenge_rating ? `CR ${m.challenge_rating}` : undefined,
                glyph: '☠', color: typeInfo(m.creature_type).color,
              }))}
              onPick={linkCreature} />
          </div>
        </div>

        <div className="as-fl">
          <span className="as-ll">Handouts</span>
          <SceneHandouts sceneId={scene.id} />
        </div>

        {walker}
      </div>
    </div>
  );
}
