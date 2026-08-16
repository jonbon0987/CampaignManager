import { useState, useEffect } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useToast } from '../../context/ToastContext';
import { Submodules as SubmodulesDB, Scenes as ScenesDB } from '../../lib/db';
import { Modal } from '../Modal';
import { Button } from '../ui/Button';
import type { Hook, Submodule } from '../../lib/database.types';

type Target = 'module' | 'submodule' | 'scene';

const TARGETS: { id: Target; label: string; glyph: string; blurb: string }[] = [
  { id: 'module',    label: 'Module',    glyph: '▣', blurb: 'A new top-level chapter of the adventure.' },
  { id: 'submodule', label: 'Submodule', glyph: '▣', blurb: 'A section inside a module you choose.' },
  { id: 'scene',     label: 'Scene',     glyph: '▸', blurb: 'A beat inside a submodule you choose.' },
];

const moduleLabel = (m: { chapter: string | null; title: string }) =>
  `${m.chapter ? `${m.chapter}. ` : ''}${m.title || 'Untitled Module'}`;

/**
 * Promote a plot thread into the module structure — as a new Module, or as a
 * Submodule / Scene placed under a module/submodule the DM picks from a tree.
 * The thread itself is left in place (non-destructive); this just spawns the
 * structured content, prefilled from the thread's title + summary.
 */
export function PromoteThreadModal({ thread, onClose }: { thread: Hook; onClose: () => void }) {
  const { modules, upsertModule, upsertSubmodule, upsertScene } = useCampaign();
  const toast = useToast();

  const [target, setTarget] = useState<Target>('module');
  const [moduleId, setModuleId] = useState<string | null>(null);
  const [submoduleId, setSubmoduleId] = useState<string | null>(null);
  const [subsByModule, setSubsByModule] = useState<Record<string, Submodule[]> | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const title = thread.title?.trim() || 'Untitled Thread';
  const summary = thread.description ?? null;

  // Submodules live per-module and aren't cached globally, so load them for the
  // whole campaign the first time a Scene target (which needs the tree) is chosen.
  useEffect(() => {
    if (target !== 'scene' || subsByModule || modules.length === 0) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading external data (submodule tree) is exactly what effects are for
    setLoadingTree(true);
    Promise.all(modules.map(m => SubmodulesDB.getByModule(m.id).then(subs => [m.id, subs] as const)))
      .then(pairs => { if (!cancelled) setSubsByModule(Object.fromEntries(pairs)); })
      .catch(() => { if (!cancelled) setSubsByModule({}); })
      .finally(() => { if (!cancelled) setLoadingTree(false); });
    return () => { cancelled = true; };
  }, [target, subsByModule, modules]);

  const hasAnySubmodule = subsByModule ? Object.values(subsByModule).some(a => a.length > 0) : false;

  const canPromote =
    target === 'module' ? true :
    target === 'submodule' ? !!moduleId :
    !!submoduleId;

  const promote = async () => {
    if (!canPromote || busy) return;
    setBusy(true); setErr('');
    try {
      if (target === 'module') {
        await upsertModule({
          chapter: null, title, synopsis: summary, status: 'planned', played_session: null,
          encounters: null, rewards: null, dm_notes: null, faction_id: null, node_role: null,
        });
        toast(`Promoted “${title}” to a module.`);
      } else if (target === 'submodule' && moduleId) {
        const subs = subsByModule?.[moduleId] ?? await SubmodulesDB.getByModule(moduleId);
        await upsertSubmodule({
          module_id: moduleId, title, submodule_type: null, summary, content: null, dm_notes: null,
          sort_order: subs.length, linked_monster_ids: null, linked_encounter_ids: null,
        });
        toast(`Promoted “${title}” to a submodule.`);
      } else if (target === 'scene' && submoduleId) {
        const scenes = await ScenesDB.getBySubmodule(submoduleId);
        await upsertScene({
          submodule_id: submoduleId, title, scene_type: null, summary, content: null, dm_notes: null,
          sort_order: scenes.length, linked_monster_ids: null,
        });
        toast(`Promoted “${title}” to a scene.`);
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not promote this thread. Please try again.');
      setBusy(false);
    }
  };

  const rowStyle = (selected: boolean): React.CSSProperties => ({
    display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px',
    borderRadius: 'var(--radius)', border: '1px solid ' + (selected ? 'var(--gold)' : 'var(--rule)'),
    background: selected ? 'color-mix(in srgb, var(--gold) 12%, transparent)' : 'var(--paper-2)',
    color: 'var(--ink)', fontSize: 13, cursor: 'pointer', marginBottom: 6,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Promote thread"
      footer={
        <div className="flex justify-between items-center">
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>The thread stays in place.</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={promote} disabled={!canPromote || busy}>
              {busy ? 'Promoting…' : 'Promote'}
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 4 }}>
        Turn <b style={{ color: 'var(--ink)' }}>{title}</b> into structured adventure content.
      </div>

      {/* Target type */}
      <label className="as-ll" style={{ display: 'block', margin: '14px 0 8px' }}>Promote to</label>
      <div className="flex gap-2">
        {TARGETS.map(t => {
          const active = target === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { setTarget(t.id); setErr(''); }}
              className="flex-1 text-sm rounded transition-colors"
              style={{
                padding: '10px 8px', textAlign: 'center',
                background: active ? 'color-mix(in srgb, var(--gold) 12%, transparent)' : 'var(--paper-2)',
                color: active ? 'var(--ink)' : 'var(--ink-2)',
                border: '1px solid ' + (active ? 'var(--gold)' : 'var(--rule)'),
                fontWeight: active ? 600 : 400,
              }}
            >
              <span style={{ marginRight: 5 }} aria-hidden="true">{t.glyph}</span>{t.label}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>
        {TARGETS.find(t => t.id === target)!.blurb}
      </div>

      {/* Target picker */}
      {target === 'submodule' && (
        <div style={{ marginTop: 16 }}>
          <label className="as-ll" style={{ display: 'block', marginBottom: 8 }}>Add under which module?</label>
          {modules.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic' }}>
              No modules yet — promote to a Module first, or create one in the Modules tab.
            </div>
          ) : (
            modules.map(m => (
              <button key={m.id} onClick={() => setModuleId(m.id)} style={rowStyle(moduleId === m.id)}>
                <span style={{ color: 'var(--gold)', marginRight: 7 }} aria-hidden="true">▣</span>{moduleLabel(m)}
              </button>
            ))
          )}
        </div>
      )}

      {target === 'scene' && (
        <div style={{ marginTop: 16 }}>
          <label className="as-ll" style={{ display: 'block', marginBottom: 8 }}>Add under which submodule?</label>
          {loadingTree ? (
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading modules…</div>
          ) : modules.length === 0 || !hasAnySubmodule ? (
            <div style={{ fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic' }}>
              No submodules yet — promote to a Submodule first, then come back to add a scene under it.
            </div>
          ) : (
            modules.map(m => {
              const subs = subsByModule?.[m.id] ?? [];
              if (subs.length === 0) return null;
              return (
                <div key={m.id} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)', margin: '0 0 6px 2px', fontFamily: 'var(--mono)' }}>
                    {moduleLabel(m)}
                  </div>
                  <div style={{ paddingLeft: 12, borderLeft: '1px solid var(--rule)' }}>
                    {subs.map(s => (
                      <button key={s.id} onClick={() => setSubmoduleId(s.id)} style={rowStyle(submoduleId === s.id)}>
                        <span style={{ color: 'var(--gold)', marginRight: 7 }} aria-hidden="true">▸</span>{s.title || 'Untitled Submodule'}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {err && <div className="fwg-error" style={{ marginTop: 12, color: 'var(--red)', fontSize: 13 }}>{err}</div>}
    </Modal>
  );
}
