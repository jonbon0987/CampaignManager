// "Build out module" — expand a module's synopsis (plus anything else the DM
// types) into the submodules and scenes it breaks down into. The AI drafts the
// tree, the DM curates it in a review list, and only the checked branches are
// written. Everything appends below the module's existing submodules, so this
// is safe to run twice on a module that's already half-built.
//
// Prompt-building and parsing live in src/lib/moduleStructure.ts; this file is
// the modal around them, mirroring GenerateRandomTableModal's shape.

import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../Modal';
import { Button } from './Button';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import { getAIProvider } from '../../lib/aiProvider';
import { authHeaders } from '../../lib/apiClient';
import { errorMessage } from '../../lib/errors';
import { buildSelectedContextBlock } from '../../lib/campaignContext';
import {
  EntityContextPicker,
  useSelectedContextEntities,
  type ContextRef,
} from './EntityContextPicker';
import {
  buildModuleStructurePrompt, parseModuleStructure, countScenes,
  MIN_SUBMODULES, MAX_SUBMODULES, MIN_SCENES, MAX_SCENES,
  type DraftSubmodule,
} from '../../lib/moduleStructure';
import { moduleTypeMeta } from '../../lib/theme';
import type { Module, Submodule } from '../../lib/database.types';

const typeInfo = (t: string | null) => moduleTypeMeta[t ?? 'other'] ?? moduleTypeMeta.other;

export function GenerateModuleStructureModal({ module: mod, existing, isOpen, onClose, onCreated }: {
  module: Module;
  /** The module's current submodules — named in the prompt so the AI continues rather than repeats. */
  existing: Submodule[];
  isOpen: boolean;
  onClose: () => void;
  /** Fired with the first new submodule's id, so the caller can select it. */
  onCreated?: (firstId: string) => void;
}) {
  const { upsertSubmodule, upsertScene, overview } = useCampaign();
  const toast = useToast();

  const [submoduleCount, setSubmoduleCount] = useState('4');
  const [scenesPer, setScenesPer] = useState('3');
  const [description, setDescription] = useState('');
  const [additional, setAdditional] = useState('');
  const [selectedContext, setSelectedContext] = useState<ContextRef[]>([]);
  const contextEntities = useSelectedContextEntities(selectedContext);

  const [draft, setDraft] = useState<DraftSubmodule[] | null>(null);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const busy = loading || saving;
  const hasSource = !!mod.synopsis?.trim() || !!description.trim();
  const keptCount = keep.filter(Boolean).length;

  const reset = () => {
    setSubmoduleCount('4'); setScenesPer('3'); setDescription(''); setAdditional('');
    setSelectedContext([]); setDraft(null); setKeep([]); setError('');
  };
  const close = () => { if (busy) return; reset(); onClose(); };

  const handleGenerate = async () => {
    const n = parseInt(submoduleCount.trim(), 10);
    const per = parseInt(scenesPer.trim(), 10);
    if (isNaN(n) || n < MIN_SUBMODULES || n > MAX_SUBMODULES) {
      setError(`Number of submodules must be between ${MIN_SUBMODULES} and ${MAX_SUBMODULES}.`);
      return;
    }
    if (isNaN(per) || per < MIN_SCENES || per > MAX_SCENES) {
      setError(`Scenes per submodule must be between ${MIN_SCENES} and ${MAX_SCENES}.`);
      return;
    }
    if (!hasSource) {
      setError('This module has no synopsis yet — describe what it is below and I\'ll build from that.');
      return;
    }

    const prompt = buildModuleStructurePrompt({
      module: {
        title: mod.title,
        chapter: mod.chapter,
        synopsis: mod.synopsis,
        rewards: mod.rewards,
        dm_notes: mod.dm_notes,
        existingTitles: existing.map(s => s.title),
      },
      submoduleCount: n,
      scenesPer: per,
      description,
      contextBlock: contextEntities.length > 0
        ? buildSelectedContextBlock(contextEntities, { title: overview.title, plotSummary: overview.plotSummary })
        : '',
      additional,
    });

    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/generate-encounter', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ prompt, provider: getAIProvider() }),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `Server error: ${res.status}`);

      const parsed = parseModuleStructure(data.text ?? '');
      setDraft(parsed);
      setKeep(parsed.map(() => true));
    } catch (err) {
      setError(`Generation failed: ${errorMessage(err, 'Unknown error')}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!draft || keptCount === 0 || saving) return;
    setSaving(true);
    setError('');
    let firstId = '';
    let scenesWritten = 0;
    try {
      // Append below what's already there, in the order the AI wrote them.
      let order = existing.length;
      for (let i = 0; i < draft.length; i++) {
        if (!keep[i]) continue;
        const sub = draft[i];
        const saved = await upsertSubmodule({
          module_id: mod.id,
          title: sub.title,
          submodule_type: sub.submodule_type,
          summary: sub.summary,
          content: sub.content,
          dm_notes: sub.dm_notes,
          sort_order: order++,
          linked_monster_ids: null,
          linked_encounter_ids: null,
        });
        if (!saved) throw new Error(`Could not save the submodule "${sub.title}".`);
        if (!firstId) firstId = saved.id;

        for (let s = 0; s < sub.scenes.length; s++) {
          const scene = sub.scenes[s];
          await upsertScene({
            submodule_id: saved.id,
            title: scene.title,
            scene_type: scene.scene_type,
            summary: scene.summary,
            content: scene.content,
            dm_notes: scene.dm_notes,
            sort_order: s,
            linked_monster_ids: null,
          });
          scenesWritten++;
        }
      }
      toast(
        `Added ${keptCount} submodule${keptCount === 1 ? '' : 's'}` +
        (scenesWritten > 0 ? ` and ${scenesWritten} scene${scenesWritten === 1 ? '' : 's'}` : '') +
        ` to ${mod.title}.`,
        'success',
      );
      reset();
      onClose();
      if (firstId) onCreated?.(firstId);
    } catch (err) {
      // Partial writes stay — the DM keeps what landed rather than losing it.
      setError(`Could not finish saving: ${errorMessage(err, 'Unknown error')}`);
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title={draft ? 'Review the outline' : 'Build out module'}
      size="wide"
      footer={
        <div className="flex justify-between items-center">
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {draft
              ? `${keptCount} of ${draft.length} submodule${draft.length === 1 ? '' : 's'} · ${countScenes(draft.filter((_, i) => keep[i]))} scenes`
              : `Appends below ${existing.length} existing submodule${existing.length === 1 ? '' : 's'}.`}
          </span>
          <div className="flex gap-2">
            {draft
              ? <>
                  <Button variant="secondary" onClick={() => { setDraft(null); setKeep([]); }} disabled={busy}>
                    Start over
                  </Button>
                  <Button variant="primary" onClick={handleSave} disabled={busy || keptCount === 0}>
                    {saving ? 'Adding…' : 'Add to module'}
                  </Button>
                </>
              : <>
                  <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
                  <Button variant="primary" onClick={handleGenerate} disabled={busy}>
                    {loading ? 'Drafting…' : 'Generate'}
                  </Button>
                </>}
          </div>
        </div>
      }
    >
      {draft
        ? <DraftReview draft={draft} keep={keep} onToggle={i => setKeep(k => k.map((v, j) => j === i ? !v : v))} error={error} />
        : (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: '1.6' }}>
              The DM Assistant will read <b style={{ color: 'var(--ink)' }}>{mod.title || 'this module'}</b>
              {mod.synopsis?.trim() ? '’s synopsis' : ''} and break it into the sections you'd actually run — each with its own scenes. You review the outline before anything is added.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Submodules">
                <input type="number" min={MIN_SUBMODULES} max={MAX_SUBMODULES} value={submoduleCount}
                  onChange={e => { setSubmoduleCount(e.target.value); setError(''); }}
                  style={inputStyle} disabled={busy} />
              </FormField>
              <FormField label="Scenes in each">
                <input type="number" min={MIN_SCENES} max={MAX_SCENES} value={scenesPer}
                  onChange={e => { setScenesPer(e.target.value); setError(''); }}
                  style={inputStyle} disabled={busy} />
              </FormField>
            </div>

            <FormField label={mod.synopsis?.trim() ? 'Anything else? (optional)' : 'What is this module about?'}>
              <textarea rows={4} value={description}
                onChange={e => { setDescription(e.target.value); setError(''); }}
                placeholder={mod.synopsis?.trim()
                  ? 'The synopsis is already in the prompt — add anything it doesn\'t say. e.g. "the heist goes wrong halfway through", "end it on the docks"'
                  : 'Describe the chapter: where it happens, who\'s involved, what the party is trying to do…'}
                style={textareaStyle} disabled={busy} />
            </FormField>

            <div>
              <EntityContextPicker
                selected={selectedContext}
                onChange={setSelectedContext}
                disabled={busy}
                label="Campaign Context"
              />
              <p className="text-xs mt-1.5" style={{ color: 'var(--ink-3)' }}>
                Add the NPCs, factions, locations, or threads this chapter should pull in.
              </p>
            </div>

            <FormField label="Additional Instructions (optional)">
              <textarea rows={2} value={additional} onChange={e => setAdditional(e.target.value)}
                placeholder="e.g. keep the combat light, make one section a dead end, leave the ending open"
                style={textareaStyle} disabled={busy} />
            </FormField>

            {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
            {loading && (
              <p className="text-sm" style={{ color: 'var(--ink-2)', fontStyle: 'italic' }}>
                Breaking the module down…
              </p>
            )}
          </div>
        )}
    </Modal>
  );
}

/* ── Review list ── */

function DraftReview({ draft, keep, onToggle, error }: {
  draft: DraftSubmodule[];
  keep: boolean[];
  onToggle: (i: number) => void;
  error: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
        Uncheck anything you don't want. Everything you keep is added to the module, where you can edit it inline.
      </p>

      {draft.map((sub, i) => {
        const info = typeInfo(sub.submodule_type);
        return (
          <label
            key={i}
            className="block rounded-lg border p-3 cursor-pointer"
            style={{
              borderColor: keep[i] ? 'var(--gold-line)' : 'var(--rule)',
              background: keep[i] ? 'var(--paper-2)' : 'transparent',
              opacity: keep[i] ? 1 : 0.55,
            }}
          >
            <div className="flex items-start gap-3">
              <input type="checkbox" checked={keep[i]} onChange={() => onToggle(i)} style={{ marginTop: 4 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                  <span style={{ color: info.color }}>{info.glyph}</span>
                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{sub.title}</span>
                  <span className="text-xs" style={{ color: info.color }}>{info.label}</span>
                  {sub.scenes.length > 0 && (
                    <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                      · {sub.scenes.length} scene{sub.scenes.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                {sub.summary && (
                  <div className="text-sm mt-1" style={{ color: 'var(--ink-2)' }}>{sub.summary}</div>
                )}
                {sub.scenes.length > 0 && (
                  <div className="mt-2" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {sub.scenes.map((sc, si) => {
                      const si2 = typeInfo(sc.scene_type);
                      return (
                        <div key={si} className="text-xs flex items-baseline gap-2" style={{ color: 'var(--ink-3)' }}>
                          <span style={{ color: si2.color }}>·</span>
                          <span style={{ color: 'var(--ink-2)' }}>{sc.title}</span>
                          {sc.summary && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>— {sc.summary}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </label>
        );
      })}

      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  );
}
