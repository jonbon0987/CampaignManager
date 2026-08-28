/* ════════════════════════════════════════════════════════════════
   ModuleWeb.tsx — the campaign as a gravity web.

   Chapters are wells on a horizontal time axis; a chapter's parts
   orbit it, a part's scenes orbit that. Dependencies are springs, so
   clusters, gaps and tangles in the story become physical shape.

   Every body carries a ring badge that opens its children in place, a
   `+` bud that creates one, and a `◦` handle you drag onto another
   body to make this a prerequisite of it. The Reveal control moves the
   whole web between Chapters / Parts / Scenes at once.

   The simulation runs on requestAnimationFrame and writes transforms
   straight onto cached SVG elements — React re-renders only when the
   graph's *shape* changes (expansion, filters, records, selection).
   ════════════════════════════════════════════════════════════════ */
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Submodules as SubmodulesDB, Scenes as ScenesDB, SubmoduleDeps as SubmoduleDepsDB } from '../../lib/db';
import { wouldCreateModuleCycle, wouldCreateSubmoduleCycle } from '../../lib/moduleUtils';
import { typeInfo } from './moduleDetail/pickers';
import type { Module, Submodule, Scene, SubmoduleDependency } from '../../lib/database.types';
import { WebSim, type BodyKind, type BodySpec, type LinkSpec, type Body } from './moduleWeb/sim';
import { COL_X, CENTER_Y, SPEC, toRoman, clip, type Selection } from './moduleWeb/shared';
import { StageBar, type Depth, type Status } from './moduleWeb/StageBar';
import { Inspector } from './moduleWeb/Inspector';
import { AddBubble } from './moduleWeb/AddForm';

type GNode = BodySpec & { rec: Module | Submodule | Scene };
type LinkMeta = { type: 'tether' | 'dep'; level?: 'module' | 'sub'; dependency_type?: string };
type GLink = LinkSpec & LinkMeta;

const REFUSAL_MS = 2600;
const FIT_TRACK_MS = 1400;

export default function ModuleWeb({ onOpen, initialModuleId }: {
  onOpen?: (id: string) => void;
  initialModuleId?: string | null;
}) {
  const { modules, moduleDeps, selectedCampaignId, upsertModuleDep, deleteModuleDep } = useCampaign();

  /* ── campaign-wide children + submodule dependencies ────────────────────── */
  // The context loads submodules/scenes one module at a time; the web needs the
  // whole campaign at once, so it holds its own copy.
  const [submodules, setSubmodules] = useState<Submodule[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [subDeps, setSubDeps] = useState<SubmoduleDependency[]>([]);
  const [loading, setLoading] = useState(true);

  const moduleIdKey = modules.map(m => m.id).sort().join(',');
  useEffect(() => {
    const ids = moduleIdKey ? moduleIdKey.split(',') : [];
    let cancelled = false;
    (async () => {
      const subs = await SubmodulesDB.getByModules(ids);
      const subIds = subs.map(s => s.id);
      const [scns, deps] = await Promise.all([
        ScenesDB.getBySubmodules(subIds),
        SubmoduleDepsDB.getBySubmodules(subIds),
      ]);
      if (cancelled) return;
      setSubmodules(subs); setScenes(scns); setSubDeps(deps);
    })().catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [moduleIdKey]);

  /* ── view state ─────────────────────────────────────────────────────────── */
  const [depth, setDepth] = useState<Depth>('custom');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initialModuleId ? [initialModuleId] : []));
  const [sel, setSel] = useState<Selection | null>(() => initialModuleId ? { id: initialModuleId, kind: 'module' } : null);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<Set<string>>(() => new Set());
  const [filters, setFilters] = useState<Set<Status>>(() => new Set<Status>(['planned', 'active', 'completed']));
  const [gravity, setGravity] = useState(1);
  const [adding, setAdding] = useState<{ parentId: string; kind: 'sub' | 'scene' } | null>(null);
  const [linkTarget, setLinkTarget] = useState<string | null>(null);
  const [linkBlock, setLinkBlock] = useState<{ id: string; reason: string } | null>(null);

  /* Per-frame values live in refs — touching state here would re-render at 60fps. */
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const rubberRef = useRef<SVGPathElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const nodeEls = useRef(new Map<string, SVGGElement>());
  const linkEls = useRef(new Map<string, SVGPathElement>());
  const simRef = useRef<WebSim>(null);
  if (!simRef.current) simRef.current = new WebSim(CENTER_Y);
  const viewRef = useRef({ x: 0, y: 0, k: 1 });
  const linkingRef = useRef<{ from: string; x: number; y: number; blocked: boolean } | null>(null);
  const firstRef = useRef(true);
  const anchorRef = useRef<string | null>(null);
  const lodRef = useRef('lod-near');
  const camRef = useRef<{ x: number; y: number; k: number } | null>(null);
  const fitUntil = useRef(0);
  const refuseT = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── graph ──────────────────────────────────────────────────────────────── */
  const graph = useMemo(() => {
    const nodes: GNode[] = [], links: GLink[] = [];
    modules.filter(m => filters.has(m.status)).forEach(m => {
      const tx = COL_X(m.chapter);
      nodes.push({ id: m.id, kind: 'module', parentId: null, targetX: tx, rec: m, ...SPEC.module });
      if (!expanded.has(m.id)) return;
      submodules.filter(s => s.module_id === m.id).sort((a, b) => a.sort_order - b.sort_order).forEach(s => {
        nodes.push({ id: s.id, kind: 'sub', parentId: m.id, targetX: tx, rec: s, ...SPEC.sub });
        links.push({ id: `t${s.id}`, source: m.id, target: s.id, type: 'tether', len: 108, stiff: 0.055 });
        if (!expanded.has(s.id)) return;
        scenes.filter(x => x.submodule_id === s.id).sort((a, b) => a.sort_order - b.sort_order).forEach(x => {
          nodes.push({ id: x.id, kind: 'scene', parentId: s.id, targetX: tx, rec: x, ...SPEC.scene });
          links.push({ id: `t${x.id}`, source: s.id, target: x.id, type: 'tether', len: 48, stiff: 0.08 });
        });
      });
    });
    const ids = new Set(nodes.map(n => n.id));
    moduleDeps.forEach(d => {
      if (!ids.has(d.prerequisite_id) || !ids.has(d.dependent_id)) return;
      links.push({ id: d.id, source: d.prerequisite_id, target: d.dependent_id, type: 'dep', level: 'module',
        dependency_type: d.dependency_type, len: 330, stiff: 0.026 });
    });
    subDeps.forEach(d => {
      if (!ids.has(d.prerequisite_id) || !ids.has(d.dependent_id)) return;
      links.push({ id: d.id, source: d.prerequisite_id, target: d.dependent_id, type: 'dep', level: 'sub',
        dependency_type: d.dependency_type, len: 138, stiff: 0.042 });
    });
    return { nodes, links };
  }, [modules, submodules, scenes, subDeps, moduleDeps, expanded, filters]);

  const counts = useMemo(() => ({
    modules: graph.nodes.filter(n => n.kind === 'module').length,
    subs: graph.nodes.filter(n => n.kind === 'sub').length,
    scenes: graph.nodes.filter(n => n.kind === 'scene').length,
  }), [graph]);

  /* Selection dims everything but the selection, its two levels of children,
     its ancestor chain, and anything joined to it by a dependency. */
  const related = useMemo(() => {
    if (!sel) return null;
    const s = new Set([sel.id]);
    const byId = new Map(graph.nodes.map(n => [n.id, n]));
    for (let pass = 0; pass < 2; pass++) graph.nodes.forEach(n => { if (n.parentId && s.has(n.parentId)) s.add(n.id); });
    let up = byId.get(sel.id);
    while (up?.parentId) { s.add(up.parentId); up = byId.get(up.parentId); }
    graph.links.forEach(l => {
      if (l.type !== 'dep') return;
      if (l.source === sel.id) s.add(l.target);
      if (l.target === sel.id) s.add(l.source);
    });
    return s;
  }, [sel, graph]);

  /* ── camera + paint ─────────────────────────────────────────────────────── */
  const toWorld = (cx: number, cy: number) => {
    const r = stageRef.current!.getBoundingClientRect(), v = viewRef.current;
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  };

  const fit = useCallback(() => {
    const ns = simRef.current!.nodes, r = stageRef.current?.getBoundingClientRect();
    if (!ns.length || !r) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    ns.forEach(n => {
      x0 = Math.min(x0, n.x - n.pad); x1 = Math.max(x1, n.x + n.pad);
      y0 = Math.min(y0, n.y - n.pad); y1 = Math.max(y1, n.y + n.pad);
    });
    const k = Math.max(0.14, Math.min(r.width / (x1 - x0 + 60), (r.height - 110) / (y1 - y0 + 60), 1.1));
    viewRef.current = { k, x: r.width / 2 - k * (x0 + x1) / 2, y: (r.height + 40) / 2 - k * (y0 + y1) / 2 };
  }, []);

  const centerOn = useCallback((id: string | undefined, k?: number) => {
    const r = stageRef.current?.getBoundingClientRect(); if (!r) return;
    const n = id ? simRef.current!.byId.get(id) : null;
    const v = viewRef.current, kk = k ?? v.k;
    const cx = n ? n.x : COL_X('2'), cy = n ? n.y : CENTER_Y;
    viewRef.current = { k: kk, x: r.width / 2 - kk * cx, y: (r.height + 50) / 2 - kk * cy };
  }, []);

  /** Ease the camera toward a body, but only when it is near an edge or offscreen. */
  const panIntoView = useCallback((id: string) => {
    const r = stageRef.current?.getBoundingClientRect(), n = simRef.current!.byId.get(id);
    if (!r || !n) return;
    const v = viewRef.current, sx = n.x * v.k + v.x, sy = n.y * v.k + v.y, m = 120;
    if (sx > m && sx < r.width - m && sy > m && sy < r.height - m) return;
    const k = Math.max(v.k, 0.62);
    camRef.current = { k, x: r.width / 2 - k * n.x, y: (r.height + 50) / 2 - k * n.y };
  }, []);

  const paint = useCallback(() => {
    const sim = simRef.current!, v = viewRef.current;

    // Fit re-frames every frame for a beat — the sim is usually still spreading.
    if (fitUntil.current && performance.now() < fitUntil.current) fit();
    else fitUntil.current = 0;

    const goal = camRef.current;
    if (goal) {
      v.x += (goal.x - v.x) * 0.16; v.y += (goal.y - v.y) * 0.16; v.k += (goal.k - v.k) * 0.16;
      if (Math.abs(goal.x - v.x) + Math.abs(goal.y - v.y) + Math.abs(goal.k - v.k) * 200 < 1.5) {
        Object.assign(v, goal); camRef.current = null;
      }
    }
    worldRef.current?.setAttribute('transform', `translate(${v.x.toFixed(2)},${v.y.toFixed(2)}) scale(${v.k.toFixed(3)})`);

    for (const n of sim.nodes) {
      nodeEls.current.get(n.id)?.setAttribute('transform', `translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`);
    }
    for (const l of sim.links) {
      const el = linkEls.current.get(l.id);
      if (!el) continue;
      const m = l as typeof l & LinkMeta;
      const a = l.a, b = l.b;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      // Inset by each body's radius so lines never touch the discs; dependency
      // targets clear a further 9px for the arrowhead.
      const pad = m.type === 'dep' ? 9 : 2;
      const x1 = a.x + ux * (a.r + 2), y1 = a.y + uy * (a.r + 2);
      const x2 = b.x - ux * (b.r + pad), y2 = b.y - uy * (b.r + pad);
      if (m.type === 'tether') {
        el.setAttribute('d', `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`);
      } else {
        const bend = m.level === 'module' ? 0.16 : 0.2;
        const qx = (x1 + x2) / 2 - uy * d * bend, qy = (y1 + y2) / 2 + ux * d * bend;
        el.setAttribute('d', `M${x1.toFixed(1)} ${y1.toFixed(1)}Q${qx.toFixed(1)} ${qy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`);
      }
    }

    const lk = linkingRef.current, rb = rubberRef.current;
    if (rb) {
      if (lk) {
        const a = sim.byId.get(lk.from);
        rb.setAttribute('d', a ? `M${a.x} ${a.y}L${lk.x} ${lk.y}` : '');
        rb.style.opacity = '1';
        rb.classList.toggle('is-blocked', lk.blocked);
      } else rb.style.opacity = '0';
    }

    // The bubble follows its body, clamped to stay inside the stage.
    const bub = bubbleRef.current, an = anchorRef.current ? sim.byId.get(anchorRef.current) : null;
    if (bub && an) {
      const r = stageRef.current!.getBoundingClientRect();
      const px = Math.max(10, Math.min(an.x * v.k + v.x + an.r * v.k + 14, r.width - 234));
      const py = Math.max(58, Math.min(an.y * v.k + v.y - 26, r.height - 210));
      bub.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
    }

    const lod = v.k < 0.34 ? 'lod-far' : v.k < 0.58 ? 'lod-mid' : 'lod-near';
    if (svgRef.current && lodRef.current !== lod) {
      svgRef.current.classList.remove('lod-far', 'lod-mid', 'lod-near');
      svgRef.current.classList.add(lod);
      lodRef.current = lod;
    }
  }, [fit]);

  useEffect(() => {
    let raf = 0;
    const loop = () => { simRef.current!.tick(); paint(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paint]);

  useEffect(() => { simRef.current!.gravity = gravity; simRef.current!.reheat(0.6); }, [gravity]);

  useEffect(() => {
    const sim = simRef.current!;
    sim.setGraph(graph.nodes, graph.links);
    sim.nodes.forEach(n => { n.pinned = pinned.has(n.id); });
    // Warm the first real graph headlessly so the web opens settled rather
    // than visibly exploding — but wait for the children to land first.
    if (firstRef.current && !loading) {
      firstRef.current = false;
      sim.warm(320);
      sim.alpha = 0.35;
      centerOn(sel?.id, 0.95);
    }
    paint();
    // `pinned` and `sel` are read, not tracked — they have their own effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, loading]);

  useEffect(() => {
    simRef.current!.nodes.forEach(n => { n.pinned = pinned.has(n.id); });
    simRef.current!.reheat(0.5);
  }, [pinned]);

  useEffect(() => { if (sel) panIntoView(sel.id); }, [sel, panIntoView]);

  // The bubble's anchor can vanish (its chapter gets filtered out, say).
  useEffect(() => {
    if (adding && !graph.nodes.some(n => n.id === adding.parentId)) { setAdding(null); anchorRef.current = null; }
  }, [graph, adding]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAdding(null); setSel(null); anchorRef.current = null; } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  useEffect(() => () => { if (refuseT.current) clearTimeout(refuseT.current); }, []);

  /* ── controls ───────────────────────────────────────────────────────────── */
  const applyDepth = (d: Exclude<Depth, 'custom'>) => {
    setDepth(d);
    if (d === 'modules') return setExpanded(new Set());
    const s = new Set(modules.map(m => m.id));
    if (d === 'scenes') submodules.forEach(x => s.add(x.id));
    setExpanded(s);
  };
  // Hand-toggling a badge means the segmented control no longer describes the web.
  const toggleExpand = (id: string) => {
    setDepth('custom');
    setExpanded(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const expandTo = (id: string) => setExpanded(p => (p.has(id) ? p : new Set(p).add(id)));
  const toggleFilter = (k: Status) => setFilters(p => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  /* ── writes ─────────────────────────────────────────────────────────────── */
  const addChild = async (parentId: string, kind: 'sub' | 'scene', title: string, type: string) => {
    if (kind === 'sub') {
      const created = await SubmodulesDB.upsert({
        module_id: parentId, title, submodule_type: type,
        summary: null, content: null, dm_notes: null,
        sort_order: submodules.filter(s => s.module_id === parentId).length,
        linked_monster_ids: null, linked_encounter_ids: null,
      });
      setSubmodules(p => [...p, created]);
      expandTo(parentId);
      setSel({ id: created.id, kind: 'sub' });
    } else {
      const created = await ScenesDB.upsert({
        submodule_id: parentId, title, scene_type: type,
        summary: null, content: null, dm_notes: null,
        sort_order: scenes.filter(s => s.submodule_id === parentId).length,
        linked_monster_ids: null,
      });
      setScenes(p => [...p, created]);
      expandTo(parentId);
      setSel({ id: created.id, kind: 'scene' });
    }
    simRef.current!.reheat(1);
  };

  const addDep = async (kind: BodyKind, prerequisite_id: string, dependent_id: string) => {
    if (kind === 'module') {
      if (!selectedCampaignId) return;
      await upsertModuleDep({
        campaign_id: selectedCampaignId, dependent_id, prerequisite_id,
        dependency_type: 'required', group_id: null, label: null, threshold: null,
      });
    } else {
      const created = await SubmoduleDepsDB.upsert({
        dependent_id, prerequisite_id, dependency_type: 'required', group_id: null, label: null,
      });
      setSubDeps(p => [...p, created]);
    }
    simRef.current!.reheat(1);
  };

  const deleteDep = async (id: string, kind: BodyKind) => {
    if (kind === 'module') await deleteModuleDep(id);
    else { await SubmoduleDepsDB.delete(id); setSubDeps(p => p.filter(d => d.id !== id)); }
  };

  /* ── dependency drags ───────────────────────────────────────────────────── */
  /** Judge a prerequisite drag n → t (t would come to require n). Illegal drops
      refuse out loud rather than silently no-op'ing. */
  const judgeLink = useCallback((n: GNode | Body, t: Body): { ok: boolean; reason?: string } => {
    if (t.id === n.id) return { ok: false };
    if (t.kind !== n.kind) {
      return { ok: false, reason: t.kind === 'scene' || n.kind === 'scene'
        ? 'Scenes run in order — they take no prerequisites'
        : 'Chapters require chapters; parts require parts' };
    }
    if (n.kind === 'scene') return { ok: false, reason: 'Scenes run in order — they take no prerequisites' };
    if (n.kind !== 'module' && t.parentId !== n.parentId) {
      return { ok: false, reason: 'A part can only require another part in the same chapter' };
    }
    const set: { prerequisite_id: string; dependent_id: string }[] = n.kind === 'module' ? moduleDeps : subDeps;
    if (set.some(d => d.prerequisite_id === n.id && d.dependent_id === t.id)) {
      return { ok: false, reason: 'Already a prerequisite' };
    }
    const cyclic = n.kind === 'module'
      ? wouldCreateModuleCycle(moduleDeps, t.id, n.id)
      : wouldCreateSubmoduleCycle(subDeps, t.id, n.id);
    if (cyclic) return { ok: false, reason: 'That would make a circular dependency' };
    return { ok: true };
  }, [moduleDeps, subDeps]);

  const refuse = (reason: string) => {
    setLinkBlock(b => (b ? { ...b, reason } : b));
    if (refuseT.current) clearTimeout(refuseT.current);
    refuseT.current = setTimeout(() => setLinkBlock(null), REFUSAL_MS);
  };

  function onHandleDown(e: React.PointerEvent, n: GNode) {
    e.stopPropagation();
    camRef.current = null; fitUntil.current = 0;
    const w = toWorld(e.clientX, e.clientY);
    linkingRef.current = { from: n.id, x: w.x, y: w.y, blocked: false };
    // Pick the NEAREST body in range, not the first one that matches.
    const nearest = (p: { x: number; y: number }) => {
      let best: Body | null = null, bd = 1e9;
      for (const t of simRef.current!.nodes) {
        if (t.id === n.id) continue;
        const d = Math.hypot(t.x - p.x, t.y - p.y);
        if (d < t.r + 14 && d < bd) { bd = d; best = t; }
      }
      return best;
    };
    const move = (ev: PointerEvent) => {
      const p = toWorld(ev.clientX, ev.clientY);
      linkingRef.current = { ...linkingRef.current!, x: p.x, y: p.y };
      const hit = nearest(p), j = hit ? judgeLink(n, hit) : null;
      linkingRef.current.blocked = !!(hit && j && !j.ok);
      setLinkTarget(hit && j?.ok ? hit.id : null);
      setLinkBlock(hit && j && !j.ok && j.reason ? { id: hit.id, reason: j.reason } : null);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const hit = nearest(toWorld(ev.clientX, ev.clientY));
      const j = hit ? judgeLink(n, hit) : null;
      if (hit && j?.ok) void addDep(n.kind, n.id, hit.id);
      else if (hit && j?.reason) refuse(j.reason);
      else setLinkBlock(null);
      linkingRef.current = null;
      setLinkTarget(null);
      simRef.current!.reheat(0.6);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /* ── stage interaction ──────────────────────────────────────────────────── */
  function onNodeDown(e: React.PointerEvent, n: GNode) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const node = simRef.current!.byId.get(n.id);
    if (!node) return;
    camRef.current = null; fitUntil.current = 0;
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      // A 4px threshold keeps a sloppy click from becoming a nudge.
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 4) return;
      moved = true;
      const w = toWorld(ev.clientX, ev.clientY);
      node.x = w.x; node.y = w.y; node.dragging = true;
      simRef.current!.reheat(0.75);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      node.dragging = false;
      simRef.current!.reheat(0.55);
      if (!moved) { setSel({ id: n.id, kind: n.kind }); setAdding(null); anchorRef.current = null; }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function onStageDown(e: React.PointerEvent) {
    if ((e.target as Element).closest('.orr-node')) return;
    setSel(null); setAdding(null); anchorRef.current = null;
    camRef.current = null; fitUntil.current = 0;
    const v = viewRef.current, sx = e.clientX - v.x, sy = e.clientY - v.y;
    svgRef.current?.classList.add('is-panning');
    const move = (ev: PointerEvent) => { v.x = ev.clientX - sx; v.y = ev.clientY - sy; };
    const up = () => {
      svgRef.current?.classList.remove('is-panning');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function onWheel(e: React.WheelEvent) {
    camRef.current = null; fitUntil.current = 0;
    const v = viewRef.current, r = stageRef.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const k = Math.max(0.3, Math.min(2.2, v.k * Math.exp(-e.deltaY * 0.0014)));
    v.x = mx - (mx - v.x) * (k / v.k); v.y = my - (my - v.y) * (k / v.k); v.k = k;
  }

  // Wheel must be non-passive to preventDefault the page scroll.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);

  /* ── open / select plumbing ─────────────────────────────────────────────── */
  const moduleIdOf = (id: string, kind: BodyKind) => {
    if (kind === 'module') return id;
    const sub = kind === 'sub'
      ? submodules.find(s => s.id === id)
      : submodules.find(s => s.id === scenes.find(x => x.id === id)?.submodule_id);
    return sub ? sub.module_id : id;
  };
  const handleOpen = (id: string, kind: BodyKind) => onOpen?.(moduleIdOf(id, kind));

  const selectFromPanel = (id: string, kind: BodyKind) => {
    setSel({ id, kind });
    if (kind === 'sub') {
      const s = submodules.find(x => x.id === id);
      if (s) expandTo(s.module_id);
    }
    if (kind === 'scene') {
      const sc = scenes.find(x => x.id === id);
      const s = sc ? submodules.find(x => x.id === sc.submodule_id) : null;
      if (s) setExpanded(p => new Set(p).add(s.module_id).add(s.id));
    }
  };

  const openBubble = (n: GNode) => {
    anchorRef.current = n.id;
    setSel({ id: n.id, kind: n.kind });
    expandTo(n.id);
    setAdding({ parentId: n.id, kind: n.kind === 'module' ? 'sub' : 'scene' });
  };

  /* ── render ─────────────────────────────────────────────────────────────── */
  const chapters = modules.filter(m => filters.has(m.status));
  const childCount = (n: GNode) =>
    n.kind === 'module' ? submodules.filter(s => s.module_id === n.id).length
      : n.kind === 'sub' ? scenes.filter(s => s.submodule_id === n.id).length : 0;

  return (
    <div className="orr">
      <div className="orr-stage" ref={stageRef}>
        <StageBar
          depth={depth} setDepth={applyDepth}
          gravity={gravity} setGravity={setGravity}
          filters={filters} toggleFilter={toggleFilter} counts={counts}
          onSettle={() => simRef.current!.reheat(1)}
          onFit={() => {
            camRef.current = null; setSel(null); setAdding(null); anchorRef.current = null;
            fitUntil.current = performance.now() + FIT_TRACK_MS;
            fit();
          }} />

        <svg className="orr-svg lod-near" ref={svgRef} onPointerDown={onStageDown} onWheel={onWheel}>
          <defs>
            <marker id="orr-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="var(--ink-3)" />
            </marker>
            <marker id="orr-arrow-hot" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="var(--gold)" />
            </marker>
            <radialGradient id="orr-well">
              <stop offset="0%" stopColor="#c9a84c" stopOpacity=".055" />
              <stop offset="70%" stopColor="#c9a84c" stopOpacity=".014" />
              <stop offset="100%" stopColor="#c9a84c" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="orr-well-hot">
              <stop offset="0%" stopColor="#c9a84c" stopOpacity=".13" />
              <stop offset="70%" stopColor="#c9a84c" stopOpacity=".03" />
              <stop offset="100%" stopColor="#c9a84c" stopOpacity="0" />
            </radialGradient>
          </defs>

          <g ref={worldRef}>
            {/* Chapter wells — the time axis the whole web hangs on. */}
            <g className="orr-wells">
              {chapters.map(m => {
                const x = COL_X(m.chapter), act = m.status === 'active';
                return (
                  <g key={m.id}>
                    <circle cx={x} cy={CENTER_Y} r={230} fill={`url(#${act ? 'orr-well-hot' : 'orr-well'})`} />
                    <line className="orr-axis" x1={x} y1={CENTER_Y - 330} x2={x} y2={CENTER_Y + 330} />
                    <text className={`orr-axis-label ${act ? 'is-active' : ''}`} x={x} y={CENTER_Y - 348}>CH. {m.chapter ?? '—'}</text>
                  </g>
                );
              })}
              {chapters.length > 0 && (
                <line className="orr-timeline"
                  x1={COL_X(chapters[0].chapter) - 130} y1={CENTER_Y - 330}
                  x2={COL_X(chapters[chapters.length - 1].chapter) + 130} y2={CENTER_Y - 330} />
              )}
            </g>

            <g className="orr-links">
              {graph.links.map(l => {
                const hot = !!sel && (l.source === sel.id || l.target === sel.id);
                const dim = !!sel && !hot && !(related!.has(l.source) && related!.has(l.target));
                return (
                  <path key={l.id}
                    ref={el => { if (el) linkEls.current.set(l.id, el); else linkEls.current.delete(l.id); }}
                    className={[
                      'orr-link', `orr-link-${l.type}`,
                      l.level === 'sub' ? 'is-sub' : '',
                      l.dependency_type === 'optional' ? 'is-or' : '',
                      hot ? 'is-hot' : '', dim ? 'is-dim' : '',
                    ].filter(Boolean).join(' ')}
                    markerEnd={l.type === 'dep' ? (hot ? 'url(#orr-arrow-hot)' : 'url(#orr-arrow)') : undefined} />
                );
              })}
              <path className="orr-rubber" ref={rubberRef} />
            </g>

            <g className="orr-nodes">
              {graph.nodes.map(n => {
                const isSel = sel?.id === n.id;
                const dim = !!sel && !related!.has(n.id);
                const kids = childCount(n), open = expanded.has(n.id);
                const rec = n.rec;
                const info = n.kind === 'module' ? null
                  : typeInfo(n.kind === 'sub' ? (rec as Submodule).submodule_type : (rec as Scene).scene_type);
                const cls = [
                  'orr-node', `orr-${n.kind}`,
                  isSel ? 'is-sel' : '', hover === n.id ? 'is-hover' : '', dim ? 'is-dim' : '',
                  n.kind === 'module' ? `is-${(rec as Module).status}` : '',
                  pinned.has(n.id) ? 'is-pinned' : '',
                  linkTarget === n.id ? 'is-target' : '',
                  linkBlock?.id === n.id ? 'is-blocked' : '',
                ].filter(Boolean).join(' ');
                const aff = n.kind === 'module' ? { b: 21, h: 44, r: 10 } : { b: 12, h: 26, r: 8 };
                const at = simRef.current!.byId.get(n.id) ?? { x: n.targetX, y: CENTER_Y };
                return (
                  <g key={n.id} className={cls}
                    style={info ? ({ '--tc': info.color } as React.CSSProperties) : undefined}
                    transform={`translate(${at.x.toFixed(1)},${at.y.toFixed(1)})`}
                    ref={el => { if (el) nodeEls.current.set(n.id, el); else nodeEls.current.delete(n.id); }}
                    onPointerDown={e => onNodeDown(e, n)}
                    onPointerEnter={() => setHover(n.id)}
                    onPointerLeave={() => setHover(h => (h === n.id ? null : h))}
                    onDoubleClick={e => { e.stopPropagation(); handleOpen(n.id, n.kind); }}>

                    {n.kind === 'module' && <>
                      <circle className="orr-halo" r={40} />
                      <circle className="orr-disc" r={28} />
                      <circle className="orr-ring" r={34} />
                      <text className="orr-roman" y={8}>{toRoman(parseInt((rec as Module).chapter ?? '', 10))}</text>
                      <text className="orr-label" y={58}>{clip(rec.title, 24)}</text>
                      <text className="orr-meta" y={73}>{(rec as Module).status} · {kids} {kids === 1 ? 'part' : 'parts'}</text>
                    </>}
                    {n.kind === 'sub' && <>
                      <circle className="orr-disc" r={15} />
                      <text className="orr-glyph" y={5}>{info!.glyph}</text>
                      <text className="orr-label orr-label-sm" y={33}>{clip(rec.title, 22)}</text>
                    </>}
                    {n.kind === 'scene' && <>
                      <circle className="orr-dot" r={6} />
                      <text className="orr-label orr-label-xs" y={21}>{clip(rec.title, 20)}</text>
                    </>}

                    {n.kind !== 'scene' && <>
                      {kids > 0 && (
                        <g className="orr-badge" transform={`translate(${aff.b},${aff.b})`}
                          onPointerDown={e => { e.stopPropagation(); toggleExpand(n.id); simRef.current!.reheat(1); }}>
                          <circle r={aff.r} />
                          <text y={aff.r > 9 ? 4 : 3.5}>{open ? '–' : kids}</text>
                        </g>
                      )}
                      <g className="orr-bud" transform={`translate(${aff.b},${-aff.b})`}
                        onPointerDown={e => { e.stopPropagation(); openBubble(n); }}>
                        <circle r={aff.r} />
                        <text y={aff.r > 9 ? 4 : 3.5}>+</text>
                      </g>
                      <g className="orr-handle" transform={`translate(${aff.h},0)`} onPointerDown={e => onHandleDown(e, n)}>
                        <circle className="orr-handle-hit" r={13} />
                        <circle className="orr-handle-dot" r={5.5} />
                      </g>
                    </>}
                  </g>
                );
              })}
            </g>
          </g>
        </svg>

        {adding && (
          <AddBubble key={adding.parentId} bubbleRef={bubbleRef} kind={adding.kind}
            onClose={() => { setAdding(null); anchorRef.current = null; }}
            onAdd={(title, type) => {
              void addChild(adding.parentId, adding.kind, title, type);
              setAdding(null); anchorRef.current = null;
            }} />
        )}

        {!loading && modules.length === 0 && (
          <div className="orr-stage-empty">
            <div className="orr-side-empty-glyph">✦</div>
            <div className="orr-side-empty-title">No modules yet</div>
            <p>Add a module in the list view, then its chapters, parts and dependencies appear here.</p>
          </div>
        )}

        <div className="orr-legend">
          <span><i className="orr-lg-line" /> requires</span>
          <span><i className="orr-lg-line is-or" /> optional</span>
          <span><i className="orr-lg-line is-tether" /> contains</span>
          <span className="orr-legend-hint">drag a body · scroll to zoom · double-click to open</span>
        </div>

        {linkBlock && <div className="orr-refuse" role="status">✕ {linkBlock.reason}</div>}
      </div>

      <Inspector
        sel={sel} modules={modules} submodules={submodules} scenes={scenes}
        moduleDeps={moduleDeps} subDeps={subDeps}
        onSelect={selectFromPanel} onOpen={handleOpen}
        onAddChild={(parentId, kind, title, type) => void addChild(parentId, kind, title, type)}
        onDeleteDep={(id, kind) => void deleteDep(id, kind)}
        isPinned={!!sel && pinned.has(sel.id)}
        onTogglePin={() => sel && setPinned(p => { const n = new Set(p); if (n.has(sel.id)) n.delete(sel.id); else n.add(sel.id); return n; })} />
    </div>
  );
}
