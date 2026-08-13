/* ════════════════════════════════════════════════════════════════
   moduleDetail/ModuleOverview.tsx
   The "module overview" state shown when no submodule is selected.
   Edits module-level fields (saved via the bottom Save button) and
   renders a dependency map.
   ════════════════════════════════════════════════════════════════ */
import { useState, useRef } from 'react';
import { useCampaign } from '../../../context/CampaignContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { useManualSave } from '../../../hooks/useManualSave';
import { SaveStatusIndicator } from '../../ui/SaveStatusIndicator';
import { OverflowMenu } from '../../ui/OverflowMenu';
import { SlashField } from '../../ui/SlashField';
import { Button } from '../../ui/Button';
import type { Module, Submodule, SubmoduleDependency } from '../../../lib/database.types';
import { typeInfo } from './pickers';

interface ModuleForm {
  title: string;
  chapter: string;
  synopsis: string;
  rewards: string;
  dm_notes: string;
  status: Module['status'];
  faction_id: string | null;
}

const STATUSES: Module['status'][] = ['planned', 'active', 'completed'];

export function ModuleOverview({ module, submodules, deps, onSelect, onDeleted }: {
  module: Module;
  submodules: Submodule[];
  deps: SubmoduleDependency[];
  onSelect: (id: string) => void;
  onDeleted: () => void;
}) {
  const { upsertModule, deleteModule, factions } = useCampaign();
  const confirm = useConfirm();
  const modRef = useRef(module);
  modRef.current = module;

  const [form, setForm] = useState<ModuleForm>(() => toForm(module));
  const prevId = useRef(module.id);
  if (prevId.current !== module.id) { prevId.current = module.id; setForm(toForm(module)); }

  const { status, save, isDirty } = useManualSave<ModuleForm>({
    data: form,
    resetKey: module.id,
    onSave: async (d) => {
      await upsertModule({
        id: module.id,
        chapter: d.chapter || null,
        title: d.title || 'Untitled Module',
        synopsis: d.synopsis || null,
        encounters: modRef.current.encounters,
        rewards: d.rewards || null,
        dm_notes: d.dm_notes || null,
        status: d.status,
        faction_id: d.faction_id,
        node_role: modRef.current.node_role,
        played_session: modRef.current.played_session,
      });
    },
  });
  const set = <K extends keyof ModuleForm>(k: K, v: ModuleForm[K]) => setForm(p => ({ ...p, [k]: v }));

  const faction = form.faction_id ? factions.find(f => f.id === form.faction_id) : null;
  const byId = Object.fromEntries(submodules.map(s => [s.id, s]));

  return (
    <div className="cm-detail">
      <div className="md-editor">
        <div className="as-bar">
          <div className="as-spacer" />
          <OverflowMenu items={[{
            label: 'Delete Module', danger: true,
            onClick: async () => { if (await confirm(`Delete "${module.title}" and everything in it?`)) { await deleteModule(module.id); onDeleted(); } },
          }]} />
        </div>

        <div className="md-eyebrow">Module overview</div>
        <input className="as-title" value={form.title} placeholder="Module title…"
          onChange={e => set('title', e.target.value)} />

        {/* meta controls */}
        <div className="as-meta" style={{ marginTop: 12 }}>
          <label className="as-mi">
            <span className="as-ml">Chapter</span>
            <input className="md-mini-in" style={{ width: 64 }} value={form.chapter}
              onChange={e => set('chapter', e.target.value)} placeholder="—" />
          </label>
          <label className="as-mi">
            <span className="as-ml">Status</span>
            <div className="as-pills">
              {STATUSES.map(s => (
                <button key={s} className={`as-pill-opt ${form.status === s ? 'is-active' : ''}`}
                  onClick={() => set('status', s)}>{s}</button>
              ))}
            </div>
          </label>
          <label className="as-mi">
            <span className="as-ml">Faction</span>
            <select className="md-mini-in" value={form.faction_id ?? ''}
              onChange={e => set('faction_id', e.target.value || null)}>
              <option value="">None</option>
              {factions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          {faction && <span className="md-chip"><span className="md-chip-glyph" style={{ color: 'var(--gold)' }}>◆</span>{faction.name}</span>}
          <span className="md-chip"><span className="md-chip-cr">{submodules.length} submodules</span></span>
        </div>

        <div className="as-fl" style={{ marginTop: 18 }}>
          <span className="as-ll">Synopsis</span>
          <SlashField value={form.synopsis} onChange={v => set('synopsis', v)}
            placeholder="Overview of this chapter's events, goals and themes…" minHeight="120px" />
        </div>

        <div className="as-fl">
          <span className="as-ll">Rewards</span>
          <SlashField value={form.rewards} onChange={v => set('rewards', v)}
            placeholder="Loot, level-ups, plot rewards…" minHeight="60px" />
        </div>

        <div className="md-dm">
          <div className="md-dm-label">DM Notes</div>
          <SlashField value={form.dm_notes} onChange={v => set('dm_notes', v)}
            placeholder="Secrets, fallbacks, hidden motives…" minHeight="60px" />
        </div>

        {/* dependency map */}
        <div className="as-fl">
          <span className="as-ll">Dependency Map</span>
          {submodules.length === 0
            ? <div className="md-pop-empty" style={{ padding: '2px 0' }}>No submodules yet.</div>
            : (
              <div className="md-depmap">
                {submodules.map((s, i) => {
                  const info = typeInfo(s.submodule_type);
                  const prereqs = deps.filter(d => d.dependent_id === s.id);
                  return (
                    <div className="md-depmap-row" key={s.id}>
                      <button className="md-depmap-node" style={{ borderColor: info.color + '55' }} onClick={() => onSelect(s.id)}>
                        <span className="md-dot" style={{ background: info.color }} />
                        <span className="md-num">{i + 1}</span>
                        <span className="md-depmap-name">{s.title}</span>
                      </button>
                      {prereqs.length > 0 && (
                        <div className="md-depmap-after">
                          <span className="md-dep-arrow">after</span>
                          {prereqs.map(p => {
                            const ps = byId[p.prerequisite_id]; if (!ps) return null;
                            return (
                              <span key={p.id} className={`md-dep-kind md-dep-kind-${p.dependency_type === 'required' ? 'required' : 'optional'}`}
                                onClick={() => onSelect(ps.id)}>{ps.title}</span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
        </div>

        {/* save bar */}
        <div className="md-savebar">
          <SaveStatusIndicator status={status} onRetry={save} />
          <div className="as-spacer" />
          <Button variant="primary" disabled={!isDirty} onClick={save}>Save changes</Button>
        </div>
      </div>
    </div>
  );

  function toForm(m: Module): ModuleForm {
    return { title: m.title, chapter: m.chapter ?? '', synopsis: m.synopsis ?? '', rewards: m.rewards ?? '', dm_notes: m.dm_notes ?? '', status: m.status, faction_id: m.faction_id };
  }
}
