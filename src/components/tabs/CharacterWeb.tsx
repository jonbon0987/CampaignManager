import { useEffect, useRef, useState, useCallback } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import { FormField, inputStyle } from '../FormField';
import { colors } from '../../lib/theme';
import type { RelationshipType, CharacterKind } from '../../lib/database.types';

// ─── types ───────────────────────────────────────────────────────────────────

interface Node {
  id: string;
  kind: CharacterKind;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned: boolean;
  groupId: string | null;
}

interface Edge {
  id: string;
  from: string;
  to: string;
  type: RelationshipType;
  label: string | null;
}

// ─── constants ────────────────────────────────────────────────────────────────

const EDGE_COLOR: Record<RelationshipType, string> = {
  ally:    colors.green,
  rival:   colors.gold,
  foe:     colors.red,
  neutral: colors.textDim,
};

const EDGE_LABEL: Record<RelationshipType, string> = {
  ally:    'Ally',
  rival:   'Rival',
  foe:     'Foe',
  neutral: 'Neutral',
};

const NODE_RADIUS = 28;
const PC_COLOR    = colors.gold;
const NPC_COLOR   = '#7a8fbf';

// ─── force simulation helpers ─────────────────────────────────────────────────

function distance(a: Node, b: Node) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy) || 0.001;
}

function tickForces(nodes: Node[], edges: Edge[], w: number, h: number) {
  const REPULSION = 22000;
  const LINK_DIST = 280;
  const LINK_K    = 0.025;
  const GROUP_K   = 0.008;
  const CENTER_K  = 0.003;
  const DAMPING   = 0.82;

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const d  = distance(a, b);
      const f  = REPULSION / (d * d);
      const dx = (b.x - a.x) / d;
      const dy = (b.y - a.y) / d;
      if (!a.pinned) { a.vx -= f * dx; a.vy -= f * dy; }
      if (!b.pinned) { b.vx += f * dx; b.vy += f * dy; }
    }
  }

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  for (const e of edges) {
    const a = nodeMap.get(e.from);
    const b = nodeMap.get(e.to);
    if (!a || !b) continue;
    const d  = distance(a, b);
    const f  = (d - LINK_DIST) * LINK_K;
    const dx = (b.x - a.x) / d;
    const dy = (b.y - a.y) / d;
    if (!a.pinned) { a.vx += f * dx; a.vy += f * dy; }
    if (!b.pinned) { b.vx -= f * dx; b.vy -= f * dy; }
  }

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (!a.groupId || a.groupId !== b.groupId) continue;
      const d  = distance(a, b);
      const f  = (d - 100) * GROUP_K;
      const dx = (b.x - a.x) / d;
      const dy = (b.y - a.y) / d;
      if (!a.pinned) { a.vx += f * dx; a.vy += f * dy; }
      if (!b.pinned) { b.vx -= f * dx; b.vy -= f * dy; }
    }
  }

  const cx = w / 2, cy = h / 2;
  for (const n of nodes) {
    if (n.pinned) continue;
    n.vx += (cx - n.x) * CENTER_K;
    n.vy += (cy - n.y) * CENTER_K;
  }

  for (const n of nodes) {
    if (n.pinned) continue;
    n.vx *= DAMPING;
    n.vy *= DAMPING;
    n.x  += n.vx;
    n.y  += n.vy;
    const pad = NODE_RADIUS + 4;
    n.x = Math.max(pad, Math.min(w - pad, n.x));
    n.y = Math.max(pad, Math.min(h - pad, n.y));
  }
}

// ─── drawing ──────────────────────────────────────────────────────────────────

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
) {
  const ang  = Math.atan2(y2 - y1, x2 - x1);
  const len  = 10;
  const half = 0.35;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - len * Math.cos(ang - half), y2 - len * Math.sin(ang - half));
  ctx.lineTo(x2 - len * Math.cos(ang + half), y2 - len * Math.sin(ang + half));
  ctx.closePath();
  ctx.fill();
}

function draw(
  ctx: CanvasRenderingContext2D,
  nodes: Node[],
  edges: Edge[],
  hoveredId: string | null,
  selectedId: string | null,
  hiddenTypes: Set<RelationshipType>,
  w: number,
  h: number,
  dpr: number,
) {
  ctx.clearRect(0, 0, w * dpr, h * dpr);

  const nodeMap  = new Map(nodes.map(n => [n.id, n]));
  const focusId  = selectedId ?? hoveredId;

  // edges
  for (const e of edges) {
    if (hiddenTypes.has(e.type)) continue;
    const a = nodeMap.get(e.from);
    const b = nodeMap.get(e.to);
    if (!a || !b) continue;

    const isFocusEdge = focusId !== null && (e.from === focusId || e.to === focusId);
    const color = EDGE_COLOR[e.type];
    const ang   = Math.atan2(b.y - a.y, b.x - a.x);
    const x1    = a.x + NODE_RADIUS * Math.cos(ang);
    const y1    = a.y + NODE_RADIUS * Math.sin(ang);
    const x2    = b.x - NODE_RADIUS * Math.cos(ang);
    const y2    = b.y - NODE_RADIUS * Math.sin(ang);

    ctx.strokeStyle = color;
    ctx.lineWidth   = isFocusEdge ? 2.5 : 1.5;
    ctx.globalAlpha = isFocusEdge ? 0.95 : (focusId ? 0.2 : 0.5);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.fillStyle = color;
    drawArrow(ctx, x1, y1, x2, y2);

    if (isFocusEdge && e.label) {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      ctx.font         = `12px Georgia, serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(e.label).width;
      ctx.globalAlpha = 0.7;
      ctx.fillStyle   = '#0d0c1a';
      ctx.fillRect(mx - tw / 2 - 3, my - 16, tw + 6, 14);
      ctx.globalAlpha = 1;
      ctx.fillStyle   = color;
      ctx.fillText(e.label, mx, my - 10);
    }

    ctx.globalAlpha = 1;
  }

  // nodes
  for (const n of nodes) {
    const isHovered  = n.id === hoveredId;
    const isSelected = n.id === selectedId;
    const isFaded    = focusId !== null && n.id !== focusId;
    const baseColor  = n.kind === 'pc' ? PC_COLOR : NPC_COLOR;

    ctx.globalAlpha = isFaded ? 0.35 : 1;

    if (isSelected) {
      ctx.shadowColor = baseColor;
      ctx.shadowBlur  = 18;
    }

    ctx.beginPath();
    ctx.arc(n.x, n.y, NODE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = isHovered ? '#2a2840' : '#1a1828';
    ctx.fill();

    ctx.strokeStyle = isSelected ? '#fff' : baseColor;
    ctx.lineWidth   = isSelected ? 2.5 : 1.5;
    ctx.stroke();

    ctx.shadowBlur = 0;

    ctx.fillStyle    = isHovered ? '#fff' : '#e8d5b0';
    ctx.font         = `bold 13px Georgia, serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    const words = n.label.split(' ');
    const line1 = words.slice(0, Math.ceil(words.length / 2)).join(' ');
    const line2 = words.slice(Math.ceil(words.length / 2)).join(' ');
    if (line2) {
      ctx.fillText(line1, n.x, n.y - 7);
      ctx.fillText(line2, n.x, n.y + 7);
    } else {
      ctx.fillText(line1, n.x, n.y);
    }

    ctx.font      = `10px Georgia, serif`;
    ctx.fillStyle = baseColor;
    ctx.fillText(n.kind.toUpperCase(), n.x, n.y + NODE_RADIUS + 13);

    ctx.globalAlpha = 1;
  }
}

// ─── component ────────────────────────────────────────────────────────────────

const REL_TYPES: RelationshipType[] = ['ally', 'rival', 'foe', 'neutral'];

export default function CharacterWeb() {
  const { pcs, npcs, relationships, upsertRelationship, deleteRelationship } = useCampaign();

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef      = useRef<number>(0);
  const nodesRef     = useRef<Node[]>([]);
  const edgesRef     = useRef<Edge[]>([]);
  const hoveredRef   = useRef<string | null>(null);
  const selectedRef  = useRef<string | null>(null);
  const dragRef      = useRef<{ id: string; ox: number; oy: number } | null>(null);
  const sizeRef      = useRef({ w: 800, h: 600 });

  // which characters are shown on the canvas
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set());
  // initialised to "all" once we know the full list
  const initialisedRef = useRef(false);

  // which relationship types are shown
  const [hiddenTypes, setHiddenTypes] = useState<Set<RelationshipType>>(() => new Set());
  const hiddenTypesRef = useRef<Set<RelationshipType>>(new Set());

  const [metOnly, setMetOnly] = useState(true);

  const [, forceRerender] = useState(0);
  const rerender = useCallback(() => forceRerender(n => n + 1), []);

  // keep a ref in sync so the animation loop can read hiddenTypes without
  // causing a re-render cascade
  useEffect(() => {
    hiddenTypesRef.current = hiddenTypes;
  }, [hiddenTypes]);

  // seed visibleIds when characters first load
  useEffect(() => {
    if (initialisedRef.current) return;
    const allIds = [...pcs.map(p => p.id), ...npcs.map(n => n.id)];
    if (allIds.length === 0) return;
    initialisedRef.current = true;
    if (metOnly) {
      const metIds = new Set([
        ...pcs.map(p => p.id),
        ...npcs.filter(n => n.met_by_pcs).map(n => n.id),
      ]);
      setVisibleIds(metIds);
    } else {
      setVisibleIds(new Set(allIds));
    }
  }, [pcs, npcs]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep visibleIds in sync when new characters are added (auto-show them)
  useEffect(() => {
    if (!initialisedRef.current) return;
    setVisibleIds(prev => {
      const next = new Set(prev);
      let changed = false;
      for (const p of pcs)  { if (!next.has(p.id))  { next.add(p.id);  changed = true; } }
      for (const n of npcs) { if (!next.has(n.id) && (!metOnly || n.met_by_pcs)) { next.add(n.id); changed = true; } }
      return changed ? next : prev;
    });
  }, [pcs, npcs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── build nodes & edges from context data ──────────────────────────────────

  useEffect(() => {
    const w = sizeRef.current.w;
    const h = sizeRef.current.h;
    const prevMap = new Map(nodesRef.current.map(n => [n.id, n]));

    const allyAdj = new Map<string, Set<string>>();
    for (const r of relationships) {
      if (r.relationship_type !== 'ally') continue;
      if (!allyAdj.has(r.from_id)) allyAdj.set(r.from_id, new Set());
      if (!allyAdj.has(r.to_id))   allyAdj.set(r.to_id, new Set());
      allyAdj.get(r.from_id)!.add(r.to_id);
      allyAdj.get(r.to_id)!.add(r.from_id);
    }

    const visited  = new Set<string>();
    const groupMap = new Map<string, string>();

    const pcIds = new Set(pcs.map(p => p.id));
    for (const id of pcIds) { groupMap.set(id, 'pcs'); visited.add(id); }

    const allIds = [...pcs.map(p => p.id), ...npcs.map(n => n.id)];
    for (const startId of allIds) {
      if (visited.has(startId)) continue;
      const queue = [startId];
      const component: string[] = [];
      while (queue.length) {
        const cur = queue.shift()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        component.push(cur);
        for (const nb of (allyAdj.get(cur) ?? [])) {
          if (!visited.has(nb)) queue.push(nb);
        }
      }
      if (component.length > 1) {
        const gid = [...component].sort()[0];
        for (const id of component) groupMap.set(id, gid);
      }
    }

    const nodes: Node[] = [
      ...pcs.map(pc => {
        const prev = prevMap.get(pc.id);
        return {
          id:      pc.id,
          kind:    'pc' as CharacterKind,
          label:   pc.character_name,
          x:       prev?.x ?? w * 0.4 + (Math.random() - 0.5) * w * 0.4,
          y:       prev?.y ?? h * 0.4 + (Math.random() - 0.5) * h * 0.4,
          vx:      prev?.vx ?? 0,
          vy:      prev?.vy ?? 0,
          pinned:  prev?.pinned ?? false,
          groupId: groupMap.get(pc.id) ?? null,
        };
      }),
      ...npcs.map(npc => {
        const prev = prevMap.get(npc.id);
        return {
          id:      npc.id,
          kind:    'npc' as CharacterKind,
          label:   npc.name,
          x:       prev?.x ?? w * 0.5 + (Math.random() - 0.5) * w * 0.7,
          y:       prev?.y ?? h * 0.5 + (Math.random() - 0.5) * h * 0.7,
          vx:      prev?.vx ?? 0,
          vy:      prev?.vy ?? 0,
          pinned:  prev?.pinned ?? false,
          groupId: groupMap.get(npc.id) ?? null,
        };
      }),
    ];

    const edges: Edge[] = relationships.map(r => ({
      id:    r.id,
      from:  r.from_id,
      to:    r.to_id,
      type:  r.relationship_type,
      label: r.label,
    }));

    nodesRef.current = nodes;
    edgesRef.current = edges;
    rerender();
  }, [pcs, npcs, relationships, rerender]);

  // ── resize observer ────────────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      sizeRef.current = { w: width, h: height };
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = width  * dpr;
      canvas.height = height * dpr;
      canvas.style.width  = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
      rerender();
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [rerender]);

  // ── animation loop ─────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;
    function loop() {
      if (!running) return;
      const { w, h } = sizeRef.current;
      const dpr = window.devicePixelRatio || 1;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      // only simulate/draw visible nodes and edges between visible nodes
      const visNodes = nodesRef.current.filter(n => visibleIdsRef.current.has(n.id));
      const visEdges = edgesRef.current.filter(
        e => visibleIdsRef.current.has(e.from) && visibleIdsRef.current.has(e.to)
      );
      tickForces(visNodes, visEdges, w, h);
      draw(ctx!, visNodes, visEdges, hoveredRef.current, selectedRef.current, hiddenTypesRef.current, w, h, dpr);
      animRef.current = requestAnimationFrame(loop);
    }
    animRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, []);

  // keep a ref so the animation loop closure can read the latest visibleIds
  const visibleIdsRef = useRef<Set<string>>(visibleIds);
  useEffect(() => {
    visibleIdsRef.current = visibleIds;
  }, [visibleIds]);

  // ── hit-test ───────────────────────────────────────────────────────────────

  function nodeAt(x: number, y: number): Node | null {
    for (const n of nodesRef.current) {
      if (!visibleIdsRef.current.has(n.id)) continue;
      const dx = n.x - x, dy = n.y - y;
      if (dx * dx + dy * dy <= NODE_RADIUS * NODE_RADIUS) return n;
    }
    return null;
  }

  function canvasPos(e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ── pointer events ─────────────────────────────────────────────────────────

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = canvasPos(e);
    const n = nodeAt(x, y);
    const newId = n?.id ?? null;
    if (newId !== hoveredRef.current) {
      hoveredRef.current = newId;
      if (canvasRef.current) canvasRef.current.style.cursor = newId ? 'grab' : 'default';
    }
    if (dragRef.current) {
      const node = nodesRef.current.find(nd => nd.id === dragRef.current!.id);
      if (node) {
        node.x = x + dragRef.current.ox;
        node.y = y + dragRef.current.oy;
        node.vx = 0;
        node.vy = 0;
      }
    }
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = canvasPos(e);
    const n = nodeAt(x, y);
    if (n) {
      dragRef.current = { id: n.id, ox: n.x - x, oy: n.y - y };
      n.pinned = true;
      selectedRef.current = n.id;
      canvasRef.current!.style.cursor = 'grabbing';
      rerender();
    } else {
      selectedRef.current = null;
      rerender();
    }
  }, [rerender]);

  const onMouseUp = useCallback(() => {
    if (dragRef.current) {
      const node = nodesRef.current.find(n => n.id === dragRef.current!.id);
      if (node) node.pinned = false;
      dragRef.current = null;
      if (canvasRef.current) canvasRef.current.style.cursor = hoveredRef.current ? 'grab' : 'default';
    }
  }, []);

  // ── visibility helpers ─────────────────────────────────────────────────────

  const allCharIds = [...pcs.map(p => p.id), ...npcs.map(n => n.id)];

  function toggleCharacter(id: string) {
    setMetOnly(false);
    setVisibleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (selectedRef.current === id) { selectedRef.current = null; rerender(); }
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const metNpcIds = new Set(npcs.filter(n => n.met_by_pcs).map(n => n.id));
  const pcIds     = new Set(pcs.map(p => p.id));

  function showAll()     { setVisibleIds(new Set(allCharIds)); }
  function hideAll()     { setVisibleIds(new Set()); selectedRef.current = null; rerender(); }
  function showMetOnly() {
    const next = new Set([...pcIds, ...metNpcIds]);
    setVisibleIds(next);
    if (selectedRef.current && !next.has(selectedRef.current)) {
      selectedRef.current = null;
      rerender();
    }
  }

  function handleMetOnlyToggle() {
    const next = !metOnly;
    setMetOnly(next);
    if (next) showMetOnly();
    else showAll();
  }

  function toggleType(t: RelationshipType) {
    setHiddenTypes(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  // ── relationship editor modal ──────────────────────────────────────────────

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [relForm, setRelForm] = useState({
    from_id:   '',
    from_kind: 'pc' as CharacterKind,
    to_id:     '',
    to_kind:   'npc' as CharacterKind,
    relationship_type: 'neutral' as RelationshipType,
    label:     '',
  });

  const allChars = [
    ...pcs.map(p  => ({ id: p.id,  kind: 'pc'  as CharacterKind, name: p.character_name })),
    ...npcs.map(n => ({ id: n.id,  kind: 'npc' as CharacterKind, name: n.name })),
  ];

  function openAdd() {
    setEditingId(null);
    setRelForm({
      from_id:   allChars[0]?.id ?? '',
      from_kind: allChars[0]?.kind ?? 'pc',
      to_id:     allChars[1]?.id ?? '',
      to_kind:   allChars[1]?.kind ?? 'npc',
      relationship_type: 'neutral',
      label: '',
    });
    setModalOpen(true);
  }

  function openEdit(edgeId: string) {
    const rel = relationships.find(r => r.id === edgeId);
    if (!rel) return;
    setEditingId(edgeId);
    setRelForm({
      from_id:   rel.from_id,
      from_kind: rel.from_kind,
      to_id:     rel.to_id,
      to_kind:   rel.to_kind,
      relationship_type: rel.relationship_type,
      label: rel.label ?? '',
    });
    setModalOpen(true);
  }

  async function handleSave() {
    await upsertRelationship({
      ...(editingId ? { id: editingId } : {}),
      from_id:   relForm.from_id,
      from_kind: relForm.from_kind,
      to_id:     relForm.to_id,
      to_kind:   relForm.to_kind,
      relationship_type: relForm.relationship_type,
      label: relForm.label || null,
    });
    setModalOpen(false);
  }

  async function handleDelete(id: string) {
    if (confirm('Remove this relationship?')) {
      await deleteRelationship(id);
    }
  }

  // sidebar: selected node info
  const visNodes   = nodesRef.current.filter(n => visibleIds.has(n.id));
  const selectedNode  = visNodes.find(n => n.id === selectedRef.current) ?? null;
  const selectedEdges = selectedNode
    ? edgesRef.current.filter(
        e => (e.from === selectedNode.id || e.to === selectedNode.id)
          && visibleIds.has(e.from) && visibleIds.has(e.to)
      )
    : [];

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
  };

  // group chars for the filter panel
  const pcList      = pcs.map(p => ({ id: p.id, kind: 'pc'  as CharacterKind, name: p.character_name }));
  const metNpcList  = npcs.filter(n =>  n.met_by_pcs).map(n => ({ id: n.id, kind: 'npc' as CharacterKind, name: n.name }));
  const unmetNpcList = npcs.filter(n => !n.met_by_pcs).map(n => ({ id: n.id, kind: 'npc' as CharacterKind, name: n.name }));

  const [unmetExpanded, setUnmetExpanded] = useState(false);

  return (
    <div className="flex flex-col" style={{ height: '80vh', minHeight: 600 }}>
      {/* header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xl font-bold" style={{ color: '#c9a84c', fontFamily: 'Georgia, serif' }}>
          Character Web
        </h2>
        <button
          onClick={openAdd}
          className="px-4 py-2 rounded text-sm font-semibold"
          style={{ backgroundColor: '#a07830', color: '#e8d5b0' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#c9a84c')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#a07830')}
        >
          + Add Relationship
        </button>
      </div>

      {/* legend — clickable type toggles */}
      <div className="flex flex-wrap gap-4 mb-3 text-xs" style={{ color: '#9990b0', fontFamily: 'Georgia, serif' }}>
        {REL_TYPES.map(t => {
          const hidden = hiddenTypes.has(t);
          return (
            <button
              key={t}
              onClick={() => toggleType(t)}
              className="flex items-center gap-1.5"
              title={hidden ? `Show ${EDGE_LABEL[t]}` : `Hide ${EDGE_LABEL[t]}`}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                color: hidden ? '#4a4460' : '#9990b0',
                textDecoration: hidden ? 'line-through' : 'none',
                opacity: hidden ? 0.5 : 1,
              }}
            >
              <span style={{
                display: 'inline-block', width: 28, height: 2,
                backgroundColor: hidden ? '#4a4460' : EDGE_COLOR[t],
                borderRadius: 1,
              }} />
              {EDGE_LABEL[t]}
            </button>
          );
        })}
        <span className="flex items-center gap-1 ml-4">
          <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: `2px solid ${PC_COLOR}`, backgroundColor: '#1a1828' }} />
          PC
        </span>
        <span className="flex items-center gap-1">
          <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: `2px solid ${NPC_COLOR}`, backgroundColor: '#1a1828' }} />
          NPC
        </span>
        <button
          onClick={handleMetOnlyToggle}
          className="ml-auto flex items-center gap-1.5 text-xs px-2 py-0.5 rounded transition-colors"
          title={metOnly ? 'Show all NPCs' : 'Show only NPCs the party has met'}
          style={{
            backgroundColor: metOnly ? '#1a2e3a' : '#22203a',
            color:           metOnly ? '#4ab8d4' : '#6a6490',
            border:          `1px solid ${metOnly ? '#2a6080' : '#3a3660'}`,
            cursor: 'pointer',
          }}
        >
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            backgroundColor: metOnly ? '#4ab8d4' : '#4a4870',
            display: 'inline-block',
          }} />
          Met only
        </button>
        <span className="italic" style={{ color: '#6a6490' }}>Drag nodes · click to inspect · click legend to filter</span>
      </div>

      {/* main area: canvas + sidebar */}
      <div className="flex gap-4" style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
        {/* canvas */}
        <div
          ref={containerRef}
          className="rounded-lg border overflow-hidden"
          style={{ flex: '1 1 0', minHeight: 0, backgroundColor: '#0d0c1a', borderColor: '#3a3660', position: 'relative' }}
        >
          {allCharIds.length === 0 && (
            <div
              className="absolute inset-0 flex items-center justify-center text-sm"
              style={{ color: '#6a6490', pointerEvents: 'none' }}
            >
              Add PCs and NPCs first, then create relationships between them.
            </div>
          )}
          <canvas
            ref={canvasRef}
            style={{ display: 'block', width: '100%', height: '100%' }}
            onMouseMove={onMouseMove}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          />
        </div>

        {/* sidebar */}
        <div
          className="rounded-lg border p-3 flex flex-col gap-3"
          style={{ width: 240, backgroundColor: '#1a1828', borderColor: '#3a3660', overflowY: 'auto' }}
        >
          {/* ── character filter ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold" style={{ color: '#9990b0' }}>Characters</span>
              <div className="flex gap-1">
                <button
                  onClick={() => { setMetOnly(false); showAll(); }}
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ color: '#9990b0', border: '1px solid #3a3660' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#e8d5b0')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#9990b0')}
                >
                  All
                </button>
                <button
                  onClick={() => { setMetOnly(false); hideAll(); }}
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ color: '#9990b0', border: '1px solid #3a3660' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#e8d5b0')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#9990b0')}
                >
                  None
                </button>
              </div>
            </div>

            {pcList.length > 0 && (
              <div className="mb-1">
                <div className="text-xs mb-1" style={{ color: '#6a6490' }}>PCs</div>
                <div className="flex flex-col gap-0.5">
                  {pcList.map(c => {
                    const on = visibleIds.has(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleCharacter(c.id)}
                        className="text-xs text-left px-2 py-1 rounded flex items-center gap-2"
                        style={{
                          backgroundColor: on ? '#2a2020' : 'transparent',
                          border: `1px solid ${on ? PC_COLOR + '66' : '#3a3660'}`,
                          color: on ? PC_COLOR : '#4a4460',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = PC_COLOR)}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = on ? PC_COLOR + '66' : '#3a3660')}
                      >
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                          backgroundColor: on ? PC_COLOR : '#4a4460',
                          display: 'inline-block',
                        }} />
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {(metNpcList.length > 0 || unmetNpcList.length > 0) && (
              <div>
                {metNpcList.length > 0 && (
                  <>
                    <div className="text-xs mb-1 mt-1" style={{ color: '#6a6490' }}>NPCs — Met</div>
                    <div className="flex flex-col gap-0.5">
                      {metNpcList.map(c => {
                        const on = visibleIds.has(c.id);
                        return (
                          <button
                            key={c.id}
                            onClick={() => toggleCharacter(c.id)}
                            className="text-xs text-left px-2 py-1 rounded flex items-center gap-2"
                            style={{
                              backgroundColor: on ? '#181e2a' : 'transparent',
                              border: `1px solid ${on ? NPC_COLOR + '66' : '#3a3660'}`,
                              color: on ? NPC_COLOR : '#4a4460',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = NPC_COLOR)}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = on ? NPC_COLOR + '66' : '#3a3660')}
                          >
                            <span style={{
                              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                              backgroundColor: on ? NPC_COLOR : '#4a4460',
                              display: 'inline-block',
                            }} />
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {unmetNpcList.length > 0 && (
                  <div className="mt-1">
                    <button
                      onClick={() => setUnmetExpanded(v => !v)}
                      className="text-xs mb-1 flex items-center gap-1 w-full"
                      style={{ color: '#6a6490', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      <span style={{ fontSize: 9 }}>{unmetExpanded ? '▼' : '▶'}</span>
                      NPCs — Unmet ({unmetNpcList.length})
                    </button>
                    {unmetExpanded && (
                      <div className="flex flex-col gap-0.5">
                        {unmetNpcList.map(c => {
                          const on = visibleIds.has(c.id);
                          return (
                            <button
                              key={c.id}
                              onClick={() => toggleCharacter(c.id)}
                              className="text-xs text-left px-2 py-1 rounded flex items-center gap-2"
                              style={{
                                backgroundColor: on ? '#181e2a' : 'transparent',
                                border: `1px solid ${on ? '#5a5080' : '#3a3660'}`,
                                color: on ? '#9990b0' : '#4a4460',
                                cursor: 'pointer',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.borderColor = '#5a5080')}
                              onMouseLeave={e => (e.currentTarget.style.borderColor = on ? '#5a5080' : '#3a3660')}
                            >
                              <span style={{
                                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                                backgroundColor: on ? '#6a6490' : '#3a3660',
                                display: 'inline-block',
                              }} />
                              {c.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ height: 1, backgroundColor: '#3a3660' }} />

          {/* ── selected node info ── */}
          {selectedNode ? (
            <>
              <div>
                <div
                  className="text-sm font-bold mb-0.5"
                  style={{ color: selectedNode.kind === 'pc' ? PC_COLOR : NPC_COLOR, fontFamily: 'Georgia, serif' }}
                >
                  {selectedNode.label}
                </div>
                <div className="text-xs" style={{ color: '#6a6490' }}>
                  {selectedNode.kind === 'pc' ? 'Player Character' : 'NPC'}
                </div>
              </div>
              <div className="text-xs font-semibold" style={{ color: '#9990b0' }}>
                Relationships ({selectedEdges.length})
              </div>
              {selectedEdges.length === 0 && (
                <div className="text-xs" style={{ color: '#6a6490' }}>None yet.</div>
              )}
              {selectedEdges.map(e => {
                const otherId = e.from === selectedNode.id ? e.to : e.from;
                const other = nodesRef.current.find(n => n.id === otherId);
                return (
                  <div
                    key={e.id}
                    className="rounded p-2 flex flex-col gap-1"
                    style={{ backgroundColor: '#0d0c1a', border: `1px solid ${EDGE_COLOR[e.type]}33` }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold" style={{ color: EDGE_COLOR[e.type] }}>
                        {EDGE_LABEL[e.type]}
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(e.id)}
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{ color: '#9990b0', border: '1px solid #3a3660' }}
                          onMouseEnter={ev => (ev.currentTarget.style.color = '#e8d5b0')}
                          onMouseLeave={ev => (ev.currentTarget.style.color = '#9990b0')}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(e.id)}
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{ color: '#9990b0', border: '1px solid #3a3660' }}
                          onMouseEnter={ev => (ev.currentTarget.style.color = '#e05c5c')}
                          onMouseLeave={ev => (ev.currentTarget.style.color = '#9990b0')}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div className="text-xs" style={{ color: '#e8d5b0' }}>
                      {e.from === selectedNode.id ? '→' : '←'} {other?.label ?? otherId}
                    </div>
                    {e.label && (
                      <div className="text-xs italic" style={{ color: '#9990b0' }}>{e.label}</div>
                    )}
                  </div>
                );
              })}
              <button
                onClick={openAdd}
                className="text-xs px-3 py-1.5 rounded mt-1"
                style={{ backgroundColor: '#2a2840', color: '#c9a84c', border: '1px solid #3a3660' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#3a3860')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#2a2840')}
              >
                + Add relationship
              </button>
            </>
          ) : (
            <div className="text-xs" style={{ color: '#6a6490' }}>
              Click a node to see its relationships.
            </div>
          )}
        </div>
      </div>

      {/* modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Relationship' : 'Add Relationship'}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="From">
              <select
                value={relForm.from_id}
                onChange={e => {
                  const id   = e.target.value;
                  const kind = allChars.find(c => c.id === id)?.kind ?? 'pc';
                  setRelForm(f => ({ ...f, from_id: id, from_kind: kind }));
                }}
                style={selectStyle}
              >
                {allChars.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.kind.toUpperCase()})</option>
                ))}
              </select>
            </FormField>

            <FormField label="To">
              <select
                value={relForm.to_id}
                onChange={e => {
                  const id   = e.target.value;
                  const kind = allChars.find(c => c.id === id)?.kind ?? 'npc';
                  setRelForm(f => ({ ...f, to_id: id, to_kind: kind }));
                }}
                style={selectStyle}
              >
                {allChars.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.kind.toUpperCase()})</option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Relationship Type">
            <select
              value={relForm.relationship_type}
              onChange={e => setRelForm(f => ({ ...f, relationship_type: e.target.value as RelationshipType }))}
              style={selectStyle}
            >
              {REL_TYPES.map(t => (
                <option key={t} value={t}>{EDGE_LABEL[t]}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Label (optional)">
            <input
              value={relForm.label}
              onChange={e => setRelForm(f => ({ ...f, label: e.target.value }))}
              placeholder="e.g. old rivals, rescued her, sworn enemies…"
              style={inputStyle}
            />
          </FormField>

          <div
            className="flex items-center gap-2 px-3 py-2 rounded text-xs"
            style={{ backgroundColor: '#0d0c1a', border: `1px solid ${EDGE_COLOR[relForm.relationship_type]}` }}
          >
            <span style={{ display: 'inline-block', width: 32, height: 2, backgroundColor: EDGE_COLOR[relForm.relationship_type], borderRadius: 1 }} />
            <span style={{ color: EDGE_COLOR[relForm.relationship_type] }}>
              {EDGE_LABEL[relForm.relationship_type]} — {allChars.find(c => c.id === relForm.from_id)?.name ?? '?'} → {allChars.find(c => c.id === relForm.to_id)?.name ?? '?'}
            </span>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={!relForm.from_id || !relForm.to_id || relForm.from_id === relForm.to_id}
              className="flex-1 py-2 rounded text-sm font-semibold disabled:opacity-40"
              style={{ backgroundColor: '#a07830', color: '#e8d5b0' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#c9a84c')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#a07830')}
            >
              {editingId ? 'Save Changes' : 'Add Relationship'}
            </button>
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded text-sm"
              style={{ color: '#9990b0', border: '1px solid #3a3660' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#e8d5b0')}
              onMouseLeave={e => (e.currentTarget.style.color = '#9990b0')}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
