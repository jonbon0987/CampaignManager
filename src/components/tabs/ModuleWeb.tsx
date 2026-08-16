/* ════════════════════════════════════════════════════════════════
   ModuleWeb.tsx — a force-directed dependency graph with drill-down.

   Top level shows modules linked by their story dependencies. Focus a
   module and drill into its submodules (chained in play order), then into
   a submodule's scenes (also in order). The layout is a force simulation —
   nodes repel, links pull, gravity centres — run to rest synchronously so
   the graph appears settled with no animation frames to stall. Nodes are
   draggable to hand-arrange.

   Click a node to focus it; a focused module/submodule can be drilled into
   or opened in the editor.
   ════════════════════════════════════════════════════════════════ */
import { useState, useMemo, useRef, useEffect } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Submodules as SubmodulesDB, Scenes as ScenesDB } from '../../lib/db';
import { wouldCreateModuleCycle } from '../../lib/moduleUtils';
import type { DependencyType, Module, Submodule, Scene } from '../../lib/database.types';
import { Button } from '../ui/Button';

// ─── node + physics constants ───────────────────────────────────────────────
const NODE_W = 124;
const NODE_H = 52;

const CHARGE = 2800;      // node-to-node repulsion strength
const REPEL_MIN_D = 26;   // clamp repulsion distance so close nodes don't explode
const LINK_DIST = 172;    // preferred length of an edge
const LINK_K = 0.06;      // spring stiffness pulling linked nodes together
const CENTER_K = 0.03;    // gravity toward the canvas centre
const FRICTION = 0.85;    // velocity retained each tick (damping)
const MAX_V = 60;         // per-tick speed cap (stops runaway motion)
const ALPHA_DECAY = 0.985;
const ALPHA_MIN = 0.02;
const MARGIN = 46;        // keep node centres this far from the canvas edge
const MAX_ITERS = 500;    // hard cap on settle iterations

const STATUS_COLOR: Record<Module['status'], string> = {
  planned:   'var(--ink-3)',
  active:    'var(--gold)',
  completed: 'var(--success)',
};
const STATUS_LABEL: Record<Module['status'], string> = {
  planned:   'PLANNED',
  active:    'ACTIVE',
  completed: 'COMPLETE',
};

interface PNode { id: string; x: number; y: number; vx: number; vy: number; }
interface Edge { id: string; from: string; to: string; depType?: DependencyType }
type Pos = { x: number; y: number };

// A rendered graph node, with its display strings precomputed per level.
interface GNode { id: string; title: string; top: string; badge: string; color: string; dashed: boolean }

/** One physics step, mutating node positions in place. */
function step(nodes: PNode[], edges: Edge[], byId: Map<string, PNode>, w: number, h: number, alpha: number) {
  const cx = w / 2, cy = h / 2;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.001) { dx = (i - j); dy = 1; d = Math.sqrt(dx * dx + 1); }
      const eff = Math.max(d, REPEL_MIN_D);
      const f = (CHARGE / eff) * alpha;
      const ux = dx / d, uy = dy / d;
      a.vx += ux * f; a.vy += uy * f;
      b.vx -= ux * f; b.vy -= uy * f;
    }
  }
  for (const e of edges) {
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const f = (d - LINK_DIST) * LINK_K * alpha;
    const ux = dx / d, uy = dy / d;
    a.vx += ux * f; a.vy += uy * f;
    b.vx -= ux * f; b.vy -= uy * f;
  }
  for (const n of nodes) {
    n.vx += (cx - n.x) * CENTER_K * alpha;
    n.vy += (cy - n.y) * CENTER_K * alpha;
    n.vx *= FRICTION; n.vy *= FRICTION;
    const speed = Math.hypot(n.vx, n.vy);
    if (speed > MAX_V) { n.vx = (n.vx / speed) * MAX_V; n.vy = (n.vy / speed) * MAX_V; }
    n.x = Math.max(MARGIN, Math.min(w - MARGIN, n.x + n.vx));
    n.y = Math.max(MARGIN, Math.min(h - MARGIN, n.y + n.vy));
  }
}

/** Run the force sim to rest and return final positions, keyed by id. */
function computeLayout(items: { id: string }[], edges: Edge[], w: number, h: number): Record<string, Pos> {
  const n = items.length;
  if (n === 0) return {};
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.34;
  const nodes: PNode[] = items.map((it, i) => {
    const ang = (i / n) * Math.PI * 2;
    return { id: it.id, x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r, vx: 0, vy: 0 };
  });
  const byId = new Map(nodes.map(nd => [nd.id, nd]));
  let alpha = 1;
  for (let it = 0; it < MAX_ITERS && alpha > ALPHA_MIN; it++) { step(nodes, edges, byId, w, h, alpha); alpha *= ALPHA_DECAY; }
  const out: Record<string, Pos> = {};
  for (const nd of nodes) out[nd.id] = { x: nd.x, y: nd.y };
  return out;
}

// A sequence chain (order 1 → 2 → 3 …) for ordered children.
function sequenceEdges(sorted: { id: string }[]): Edge[] {
  return sorted.slice(1).map((s, i) => ({ id: `seq-${sorted[i].id}-${s.id}`, from: sorted[i].id, to: s.id }));
}

type Level =
  | { kind: 'modules' }
  | { kind: 'submodules'; moduleId: string; moduleTitle: string }
  | { kind: 'scenes'; moduleId: string; moduleTitle: string; submoduleId: string; submoduleTitle: string };

export default function ModuleWeb({ onOpen, initialModuleId }: { onOpen?: (id: string) => void; initialModuleId?: string | null }) {
  const { modules, moduleDeps, upsertModuleDep, deleteModuleDep, selectedCampaignId } = useCampaign();
  const confirm = useConfirm();

  // Start drilled into a module's submodules when opened with one in context
  // (e.g. switching to the Dependencies view while a module is open).
  const [level, setLevel] = useState<Level>(() => {
    if (initialModuleId) {
      const m = modules.find(mm => mm.id === initialModuleId);
      if (m) return { kind: 'submodules', moduleId: m.id, moduleTitle: m.title || 'Untitled' };
    }
    return { kind: 'modules' };
  });
  const [subs, setSubs] = useState<Submodule[]>([]);   // submodules of the drilled module
  const [scns, setScns] = useState<Scene[]>([]);        // scenes of the drilled submodule
  const [childLoading, setChildLoading] = useState(false);

  const [focusId, setFocusId] = useState<string | null>(null);
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<Module['status']>>(new Set());
  const [size, setSize] = useState({ w: 900, h: 560 });
  const [overrides, setOverrides] = useState<Record<string, Pos>>({});

  const [adding, setAdding] = useState(false);
  const [depForm, setDepForm] = useState({ prerequisite_id: '', dependency_type: 'required' as DependencyType, label: '' });
  const [depError, setDepError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Navigate levels, always clearing per-level view state.
  const goTo = (next: Level) => { setLevel(next); setFocusId(null); setOverrides({}); setAdding(false); };

  // Load the drilled module's submodules / submodule's scenes.
  useEffect(() => {
    if (level.kind === 'modules') return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading external data (children of the drilled node)
    setChildLoading(true);
    const p = level.kind === 'submodules'
      ? SubmodulesDB.getByModule(level.moduleId).then(r => { if (!cancelled) setSubs(r); })
      : ScenesDB.getBySubmodule(level.submoduleId).then(r => { if (!cancelled) setScns(r); });
    p.catch(() => {}).finally(() => { if (!cancelled) setChildLoading(false); });
    return () => { cancelled = true; };
  }, [level]);

  const visibleModules = useMemo(() => modules.filter(m => !hiddenStatuses.has(m.status)), [modules, hiddenStatuses]);

  // Build the current level's nodes + edges.
  const { nodes, edges } = useMemo<{ nodes: GNode[]; edges: Edge[] }>(() => {
    if (level.kind === 'modules') {
      const vis = new Set(visibleModules.map(m => m.id));
      const nodes = visibleModules.map(m => ({
        id: m.id, title: m.title || 'Untitled',
        top: m.chapter ? `Ch. ${m.chapter}` : '', badge: STATUS_LABEL[m.status],
        color: STATUS_COLOR[m.status], dashed: m.status === 'planned',
      }));
      const edges: Edge[] = moduleDeps
        .filter(d => vis.has(d.prerequisite_id) && vis.has(d.dependent_id))
        .map(d => ({ id: d.id, from: d.prerequisite_id, to: d.dependent_id, depType: d.dependency_type }));
      return { nodes, edges };
    }
    if (level.kind === 'submodules') {
      const sorted = [...subs].sort((a, b) => a.sort_order - b.sort_order);
      const nodes = sorted.map((s, i) => ({
        id: s.id, title: s.title || 'Untitled', top: `#${i + 1}`,
        badge: (s.submodule_type || 'submodule').toUpperCase(), color: 'var(--gold)', dashed: false,
      }));
      return { nodes, edges: sequenceEdges(sorted) };
    }
    const sorted = [...scns].sort((a, b) => a.sort_order - b.sort_order);
    const nodes = sorted.map((s, i) => ({
      id: s.id, title: s.title || 'Untitled', top: `#${i + 1}`,
      badge: (s.scene_type || 'scene').toUpperCase(), color: 'var(--sky)', dashed: false,
    }));
    return { nodes, edges: sequenceEdges(sorted) };
  }, [level, visibleModules, moduleDeps, subs, scns]);

  const layout = useMemo(() => computeLayout(nodes, edges, size.w, size.h), [nodes, edges, size.w, size.h]);
  const pos = (id: string): Pos => overrides[id] ?? layout[id] ?? { x: size.w / 2, y: size.h / 2 };

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const apply = () => setSize({ w: Math.max(el.clientWidth, 320), h: Math.max(el.clientHeight, 320) });
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ─── drag ────────────────────────────────────────────────────────────────
  const dragRef = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const svgPoint = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onNodePointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = svgPoint(e), cur = pos(id);
    dragRef.current = { id, dx: p.x - cur.x, dy: p.y - cur.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = svgPoint(e);
    drag.moved = true;
    setOverrides(o => ({ ...o, [drag.id]: { x: p.x - drag.dx, y: p.y - drag.dy } }));
  };
  const onNodePointerUp = (id: string) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved) setFocusId(prev => (prev === id ? null : id));
  };

  // ─── focus + dependency editing (module level) ─────────────────────────────
  const focusedMod = level.kind === 'modules' && focusId ? modules.find(m => m.id === focusId) ?? null : null;
  const focusedSub = level.kind === 'submodules' && focusId ? subs.find(s => s.id === focusId) ?? null : null;
  const focusedScene = level.kind === 'scenes' && focusId ? scns.find(s => s.id === focusId) ?? null : null;
  const focusedNode = focusId ? nodes.find(n => n.id === focusId) ?? null : null;

  const focusPrereqs = focusedMod ? moduleDeps.filter(d => d.dependent_id === focusedMod.id) : [];
  const focusUnlocks = focusedMod ? moduleDeps.filter(d => d.prerequisite_id === focusedMod.id) : [];

  const toggleStatus = (s: Module['status']) => {
    setHiddenStatuses(prev => { const next = new Set(prev); if (next.has(s)) next.delete(s); else next.add(s); return next; });
    setFocusId(null);
  };

  const startAdd = () => { setDepForm({ prerequisite_id: '', dependency_type: 'required', label: '' }); setDepError(null); setAdding(true); };
  const handleSaveDep = async () => {
    if (!focusedMod || !depForm.prerequisite_id || !selectedCampaignId) return;
    if (wouldCreateModuleCycle(moduleDeps, focusedMod.id, depForm.prerequisite_id)) { setDepError('This would create a circular dependency.'); return; }
    await upsertModuleDep({
      campaign_id: selectedCampaignId, dependent_id: focusedMod.id, prerequisite_id: depForm.prerequisite_id,
      dependency_type: depForm.dependency_type, group_id: depForm.dependency_type === 'optional' ? crypto.randomUUID() : null,
      label: depForm.label || null,
    });
    setAdding(false);
  };
  const handleDeleteDep = async (id: string) => { if (await confirm('Remove this dependency?')) await deleteModuleDep(id); };

  const existingPrereqIds = new Set(focusedMod ? moduleDeps.filter(d => d.dependent_id === focusedMod.id).map(d => d.prerequisite_id) : []);
  const availablePrereqs = modules.filter(m => m.id !== focusedMod?.id && !existingPrereqIds.has(m.id));

  const drillModuleId = level.kind === 'modules' ? null : level.moduleId;

  return (
    <div className="mw">
      <div className="mw-head">
        <div>
          <div className="cm-md-eyebrow">Story Dependencies</div>
          {/* Breadcrumb doubles as the title once you drill in. */}
          <h2 className="cm-md-title" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button className="mw-crumb" onClick={() => goTo({ kind: 'modules' })} disabled={level.kind === 'modules'}>Module Web</button>
            {level.kind !== 'modules' && <>
              <span className="mw-crumb-sep">›</span>
              <button className="mw-crumb" onClick={() => goTo({ kind: 'submodules', moduleId: level.moduleId, moduleTitle: level.moduleTitle })} disabled={level.kind === 'submodules'}>{level.moduleTitle}</button>
            </>}
            {level.kind === 'scenes' && <>
              <span className="mw-crumb-sep">›</span>
              <button className="mw-crumb" disabled>{level.submoduleTitle}</button>
            </>}
          </h2>
        </div>
        <div className="mw-head-filters">
          {level.kind === 'modules' && (['completed', 'active', 'planned'] as Module['status'][]).map(s => {
            const hidden = hiddenStatuses.has(s);
            return (
              <label key={s} className="mw-filter-check" style={{ opacity: hidden ? 0.45 : 1 }}>
                <input type="checkbox" checked={!hidden} onChange={() => toggleStatus(s)} style={{ accentColor: STATUS_COLOR[s] }} />
                <span style={{ color: hidden ? 'var(--ink-3)' : STATUS_COLOR[s] }}>{s}</span>
              </label>
            );
          })}
          {focusId && <button className="mw-clear-focus" onClick={() => setFocusId(null)}>Clear focus ×</button>}
        </div>
      </div>

      <div className="mw-body">
        <div className="mw-canvas" ref={canvasRef}>
          {childLoading && nodes.length === 0 ? (
            <div className="mw-empty"><div className="mw-empty-glyph">❧</div><div className="mw-empty-title">Loading…</div></div>
          ) : nodes.length === 0 ? (
            <div className="mw-empty">
              <div className="mw-empty-glyph">❧</div>
              <div className="mw-empty-title">
                {level.kind === 'modules' ? 'No modules yet' : level.kind === 'submodules' ? 'No submodules in this module' : 'No scenes in this submodule'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
                {level.kind === 'modules' ? 'Add modules first, then create dependencies.' : 'Add them in the module editor, then they’ll chain up here in order.'}
              </div>
            </div>
          ) : (
            <svg ref={svgRef} width={size.w} height={size.h} style={{ display: 'block', touchAction: 'none' }} onPointerMove={onPointerMove}>
              <defs>
                <marker id="mw-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="var(--ink-3)" /></marker>
                <marker id="mw-arrow-on" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="var(--gold)" /></marker>
              </defs>
              {edges.map(e => {
                const a = pos(e.from), b = pos(e.to);
                const on = focusId === e.from || focusId === e.to;
                const dim = focusId !== null && !on;
                const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
                const ux = dx / d, uy = dy / d, pad = NODE_H / 2 + 6;
                return (
                  <line key={e.id}
                    x1={a.x + ux * (NODE_W / 2 - 8)} y1={a.y + uy * (NODE_H / 2 - 8)}
                    x2={b.x - ux * pad} y2={b.y - uy * pad}
                    stroke={on ? 'var(--gold)' : 'var(--ink-3)'} strokeWidth={on ? 1.75 : 1.1}
                    strokeDasharray={e.depType === 'optional' ? '5 3' : undefined}
                    markerEnd={on ? 'url(#mw-arrow-on)' : 'url(#mw-arrow)'} opacity={dim ? 0.12 : 0.6} />
                );
              })}
              {nodes.map(n => {
                const p = pos(n.id);
                const isActive = n.id === focusId;
                const dim = focusId !== null && !isActive;
                return (
                  <g key={n.id} transform={`translate(${p.x - NODE_W / 2},${p.y - NODE_H / 2})`}
                    style={{ cursor: 'grab', opacity: dim ? 0.3 : 1 }}
                    onPointerDown={e => onNodePointerDown(e, n.id)} onPointerUp={() => onNodePointerUp(n.id)}
                    onDoubleClick={() => drillModuleId ? onOpen?.(drillModuleId) : onOpen?.(n.id)}>
                    <rect width={NODE_W} height={NODE_H} rx={4} ry={4}
                      fill={isActive ? 'var(--paper-2)' : 'var(--paper)'}
                      stroke={isActive ? n.color : 'var(--rule)'} strokeWidth={isActive ? 1.75 : 1}
                      strokeDasharray={n.dashed ? '4 3' : undefined} />
                    {n.top && <text x={NODE_W / 2} y={15} textAnchor="middle" fontSize={9} letterSpacing={1} fontFamily="var(--mono)" fill="var(--ink-3)">{n.top}</text>}
                    <text x={NODE_W / 2} y={n.top ? 27 : 20} textAnchor="middle" fontSize={8} letterSpacing={0.5} fontFamily="var(--mono)" fontWeight="600" fill={n.color}>{n.badge}</text>
                    <text x={NODE_W / 2} y={n.top ? 42 : 37} textAnchor="middle" fontSize={11} fontFamily="var(--serif)" fill={isActive ? 'var(--ink)' : 'var(--ink-2)'}>
                      {n.title.length > 15 ? n.title.substring(0, 14) + '…' : n.title}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        <aside className="mw-side">
          {focusedMod ? (
            <>
              <div className="mw-side-head">
                <div className="mw-side-eyebrow">{focusedMod.chapter ? `Chapter ${focusedMod.chapter} · ` : ''}{STATUS_LABEL[focusedMod.status]}</div>
                <div className="mw-side-title">{focusedMod.title}</div>
                {focusedMod.synopsis && <div className="mw-side-synopsis">{focusedMod.synopsis}</div>}
                <button className="mw-side-open" onClick={() => goTo({ kind: 'submodules', moduleId: focusedMod.id, moduleTitle: focusedMod.title })}>View submodules →</button>
                {onOpen && <button className="mw-side-open" onClick={() => onOpen(focusedMod.id)}>Open in editor →</button>}
              </div>

              {focusPrereqs.length > 0 && (
                <div className="mw-side-section">
                  <div className="mw-side-section-label">Requires</div>
                  {focusPrereqs.map(dep => {
                    const m = modules.find(md => md.id === dep.prerequisite_id);
                    if (!m) return null;
                    return (
                      <div key={dep.id} className="mw-side-row">
                        <span className={`md-dep-kind md-dep-kind-${dep.dependency_type === 'required' ? 'required' : 'optional'}`}>{dep.dependency_type === 'required' ? 'AND' : 'OR'}</span>
                        <span className="mw-side-row-label">{m.chapter ? `Ch. ${m.chapter} · ` : ''}{m.title}</span>
                        <button className="mw-side-row-del" onClick={() => handleDeleteDep(dep.id)} title="Remove">✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
              {focusUnlocks.length > 0 && (
                <div className="mw-side-section">
                  <div className="mw-side-section-label">Unlocks</div>
                  {focusUnlocks.map(dep => {
                    const m = modules.find(md => md.id === dep.dependent_id);
                    if (!m) return null;
                    return (
                      <div key={dep.id} className="mw-side-row">
                        <span className="mw-side-row-label">{m.chapter ? `Ch. ${m.chapter} · ` : ''}{m.title}</span>
                        <button className="mw-side-row-del" onClick={() => handleDeleteDep(dep.id)} title="Remove">✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
              {focusPrereqs.length === 0 && focusUnlocks.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic', padding: '8px 0' }}>No dependencies yet.</div>
              )}

              <div className="mw-side-actions">
                {!adding ? (
                  <Button variant="primary" size="sm" onClick={startAdd} disabled={availablePrereqs.length === 0}>+ Add Dependency</Button>
                ) : (
                  <div className="mw-depadd">
                    <div className="mw-depadd-title">New prerequisite for <b>{focusedMod.title}</b></div>
                    <select className="as-input" value={depForm.prerequisite_id} onChange={e => setDepForm(f => ({ ...f, prerequisite_id: e.target.value }))}>
                      <option value="">— select module —</option>
                      {availablePrereqs.map(m => <option key={m.id} value={m.id}>{m.chapter ? `Ch. ${m.chapter}: ` : ''}{m.title}</option>)}
                    </select>
                    <div className="as-pills" style={{ marginTop: 8 }}>
                      {(['required', 'optional'] as DependencyType[]).map(t => (
                        <button key={t} className={`as-pill-opt ${depForm.dependency_type === t ? 'is-active' : ''}`} onClick={() => setDepForm(f => ({ ...f, dependency_type: t }))}>
                          {t === 'required' ? 'Required (AND)' : 'Optional (OR)'}
                        </button>
                      ))}
                    </div>
                    <input className="as-input" style={{ marginTop: 8 }} value={depForm.label} placeholder="Label (optional) — e.g. unlocks after rescue…" onChange={e => setDepForm(f => ({ ...f, label: e.target.value }))} />
                    {depError && <div className="mw-depadd-err">{depError}</div>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <Button variant="primary" size="sm" disabled={!depForm.prerequisite_id} onClick={handleSaveDep}>Add</Button>
                      <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (focusedSub || focusedScene) && focusedNode ? (
            <div className="mw-side-head">
              <div className="mw-side-eyebrow">{focusedNode.top} · {focusedNode.badge}</div>
              <div className="mw-side-title">{focusedNode.title}</div>
              {(focusedSub?.summary || focusedScene?.summary) && <div className="mw-side-synopsis">{focusedSub?.summary || focusedScene?.summary}</div>}
              {focusedSub && <button className="mw-side-open" onClick={() => goTo({ kind: 'scenes', moduleId: (level as Extract<Level, { kind: 'submodules' }>).moduleId, moduleTitle: (level as Extract<Level, { kind: 'submodules' }>).moduleTitle, submoduleId: focusedSub.id, submoduleTitle: focusedSub.title })}>View scenes →</button>}
              {onOpen && drillModuleId && <button className="mw-side-open" onClick={() => onOpen(drillModuleId)}>Open module →</button>}
            </div>
          ) : (
            <div className="mw-empty" style={{ paddingTop: 32 }}>
              <div className="mw-empty-glyph">❧</div>
              <div className="mw-empty-title">Select a node</div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
                {level.kind === 'modules'
                  ? 'Click a module to inspect dependencies or drill into its submodules. Drag to rearrange.'
                  : 'Click a node to inspect it, drag to rearrange, or use the breadcrumb to go back up.'}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
