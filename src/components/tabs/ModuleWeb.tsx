import { useEffect, useRef, useState, useCallback } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Modal } from '../Modal';
import { FormField, inputStyle } from '../FormField';
import { wouldCreateModuleCycle } from '../../lib/moduleUtils';
import type { DependencyType, Module } from '../../lib/database.types';

// ─── types ───────────────────────────────────────────────────────────────────

interface WebNode {
  id: string;
  status: Module['status'];
  label: string;
  chapter: string | null;
  factionId: string | null;
  nodeRole: 'start' | 'boss' | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned: boolean;
}

interface WebEdge {
  id: string;
  from: string;        // prerequisite_id — arrow points FROM here
  to: string;          // dependent_id — arrow points TO here
  depType: DependencyType;
  groupId: string | null;
  label: string | null;
  threshold: number | null;
}

// ─── constants ────────────────────────────────────────────────────────────────

const NODE_RADIUS_NORMAL = 32;
const NODE_RADIUS_START  = 36;
const NODE_RADIUS_BOSS   = 40;

function nodeRadius(role: WebNode['nodeRole']) {
  if (role === 'start') return NODE_RADIUS_START;
  if (role === 'boss')  return NODE_RADIUS_BOSS;
  return NODE_RADIUS_NORMAL;
}

const STATUS_COLOR: Record<Module['status'], string> = {
  planned:   '#6a6490',
  active:    '#c9a84c',
  completed: '#4caf7d',
};

const STATUS_LABEL: Record<Module['status'], string> = {
  planned:   'Planned',
  active:    'Active',
  completed: 'Completed',
};

const REQUIRED_EDGE_COLOR = '#9990b0';
const OPTIONAL_EDGE_COLOR = '#c9a84c';
const THRESHOLD_EDGE_COLOR = '#b080e0';

const FACTION_TYPE_COLORS: Record<string, string> = {
  guild: '#c9a84c', government: '#70a0e0', religious: '#d0c060',
  criminal: '#e05c5c', military: '#60b0a0', arcane: '#b080e0',
  merchant: '#e09050', other: '#9990b0',
};
const NO_FACTION_COLOR = '#6a6490';

// ─── force simulation helpers ─────────────────────────────────────────────────

function distance(a: WebNode, b: WebNode) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy) || 0.001;
}

function tickForces(nodes: WebNode[], edges: WebEdge[], w: number, h: number) {
  const REPULSION = 18000;
  const LINK_DIST = 320;
  const LINK_K    = 0.035;
  const OR_K      = 0.006;
  const CENTER_K  = 0.003;
  const DAMPING   = 0.80;

  // repulsion between all pairs
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

  // spring forces along edges
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

  // OR group cohesion: pull nodes that share a group_id together
  const groupEdgePairs: Array<[string, string]> = [];
  const seenPairs = new Set<string>();
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const ei = edges[i], ej = edges[j];
      if (!ei.groupId || ei.groupId !== ej.groupId) continue;
      // pull the "to" nodes of same-group edges together
      const key = [ei.to, ej.to].sort().join('|');
      if (!seenPairs.has(key)) {
        seenPairs.add(key);
        groupEdgePairs.push([ei.to, ej.to]);
      }
    }
  }
  for (const [idA, idB] of groupEdgePairs) {
    const a = nodeMap.get(idA);
    const b = nodeMap.get(idB);
    if (!a || !b) continue;
    const d  = distance(a, b);
    const f  = (d - 100) * OR_K;
    const dx = (b.x - a.x) / d;
    const dy = (b.y - a.y) / d;
    if (!a.pinned) { a.vx += f * dx; a.vy += f * dy; }
    if (!b.pinned) { b.vx -= f * dx; b.vy -= f * dy; }
  }

  // center attraction
  const cx = w / 2, cy = h / 2;
  for (const n of nodes) {
    if (n.pinned) continue;
    const ck = n.nodeRole === 'boss' ? CENTER_K * 5 : CENTER_K;
    n.vx += (cx - n.x) * ck;
    n.vy += (cy - n.y) * ck;
    // start nodes drift toward left periphery
    if (n.nodeRole === 'start') {
      n.vx += (w * 0.12 - n.x) * 0.002;
    }
  }

  // integrate
  for (const n of nodes) {
    if (n.pinned) continue;
    n.vx *= DAMPING;
    n.vy *= DAMPING;
    n.x  += n.vx;
    n.y  += n.vy;
    const pad = nodeRadius(n.nodeRole) + 4;
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
  nodes: WebNode[],
  edges: WebEdge[],
  hoveredId: string | null,
  selectedId: string | null,
  w: number,
  h: number,
  dpr: number,
  factionColorMap: Map<string, string>,
) {
  ctx.clearRect(0, 0, w * dpr, h * dpr);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const focusId = selectedId ?? hoveredId;

  // edges
  for (const e of edges) {
    const a = nodeMap.get(e.from);
    const b = nodeMap.get(e.to);
    if (!a || !b) continue;

    const isFocusEdge = focusId !== null && (e.from === focusId || e.to === focusId);
    const isCompleted = a.status === 'completed';
    const hasThreshold = e.depType === 'optional' && e.threshold != null && e.threshold >= 2;
    const color = isCompleted ? STATUS_COLOR.completed
      : hasThreshold ? THRESHOLD_EDGE_COLOR
      : e.depType === 'optional' ? OPTIONAL_EDGE_COLOR : REQUIRED_EDGE_COLOR;
    const rA    = nodeRadius(a.nodeRole);
    const rB    = nodeRadius(b.nodeRole);
    const ang   = Math.atan2(b.y - a.y, b.x - a.x);
    const x1    = a.x + rA * Math.cos(ang);
    const y1    = a.y + rA * Math.sin(ang);
    const x2    = b.x - rB * Math.cos(ang);
    const y2    = b.y - rB * Math.sin(ang);

    ctx.strokeStyle = color;
    ctx.lineWidth   = isFocusEdge ? 2.5 : 1.5;
    ctx.globalAlpha = isFocusEdge ? 0.95 : (focusId ? 0.2 : (isCompleted ? 0.85 : 0.5));

    if (hasThreshold) {
      ctx.setLineDash([12, 4, 4, 4]);
    } else if (e.depType === 'optional') {
      ctx.setLineDash([8, 4]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = color;
    drawArrow(ctx, x1, y1, x2, y2);

    // threshold badge at midpoint: "X/N"
    if (hasThreshold && e.groupId) {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const badgeText = `${e.threshold}`;
      ctx.font = 'bold 10px Georgia, serif';
      const tw = ctx.measureText(badgeText).width;
      ctx.globalAlpha = isFocusEdge ? 0.95 : (focusId ? 0.25 : 0.8);
      ctx.fillStyle = '#0d0c1a';
      ctx.beginPath();
      ctx.arc(mx, my, tw / 2 + 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = THRESHOLD_EDGE_COLOR;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = THRESHOLD_EDGE_COLOR;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, mx, my);
    } else if (e.groupId && e.depType === 'optional') {
      // OR group badge: small dot at midpoint
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      ctx.beginPath();
      ctx.arc(mx, my, 5, 0, Math.PI * 2);
      ctx.fillStyle = OPTIONAL_EDGE_COLOR;
      ctx.globalAlpha = isFocusEdge ? 0.9 : (focusId ? 0.2 : 0.6);
      ctx.fill();
    }

    if (isFocusEdge && e.label) {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      ctx.font         = '12px Georgia, serif';
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
    const r          = nodeRadius(n.nodeRole);
    const factionColor = n.factionId ? (factionColorMap.get(n.factionId) ?? NO_FACTION_COLOR) : NO_FACTION_COLOR;

    ctx.globalAlpha = isFaded ? 0.35 : 1;

    // status-based border style
    const isPlanned   = n.status === 'planned';
    const isActive    = n.status === 'active';
    const isCompleted = n.status === 'completed';

    // glow for active nodes
    if (isActive || isSelected) {
      ctx.shadowColor = isSelected ? '#fff' : factionColor;
      ctx.shadowBlur  = isSelected ? 18 : 12;
    }

    // boss node: outer ring
    if (n.nodeRole === 'boss') {
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#e05c5c';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.stroke();
    }

    // main circle
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = isHovered ? '#2a2840' : (isCompleted ? '#1e2420' : '#1a1828');
    ctx.fill();

    ctx.strokeStyle = isSelected ? '#fff' : factionColor;
    if (isPlanned) {
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
    } else if (isActive) {
      ctx.setLineDash([]);
      ctx.lineWidth = 3;
    } else {
      ctx.setLineDash([]);
      ctx.lineWidth = 1.5;
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.shadowBlur = 0;

    // completed checkmark indicator
    if (isCompleted) {
      ctx.font      = '10px Georgia, serif';
      ctx.fillStyle = STATUS_COLOR.completed;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u2713', n.x + r - 6, n.y - r + 6);
    }

    // start node: star marker above
    if (n.nodeRole === 'start') {
      ctx.font = '14px Georgia, serif';
      ctx.fillStyle = '#c9a84c';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u2605', n.x, n.y - r - 10);
    }

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    // Line 1: chapter number (small, dim)
    if (n.chapter) {
      ctx.font      = '10px Georgia, serif';
      ctx.fillStyle = isHovered ? '#c9a84c' : factionColor;
      ctx.fillText(n.chapter, n.x, n.y - 10);
    }

    // Line 2: title (truncated)
    const maxLen  = r === NODE_RADIUS_BOSS ? 14 : 12;
    const title   = n.label.length > maxLen ? n.label.substring(0, maxLen) + '\u2026' : n.label;
    ctx.font      = `bold 11px Georgia, serif`;
    ctx.fillStyle = isHovered ? '#fff' : '#e8d5b0';
    ctx.fillText(title, n.x, n.chapter ? n.y + 3 : n.y);

    // Status label below node
    ctx.font      = '10px Georgia, serif';
    ctx.fillStyle = STATUS_COLOR[n.status];
    ctx.fillText(STATUS_LABEL[n.status].toUpperCase(), n.x, n.y + r + 13);

    ctx.globalAlpha = 1;
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ModuleWeb() {
  const {
    modules, moduleDeps, upsertModuleDep, deleteModuleDep, selectedCampaignId, factions,
  } = useCampaign();
  const confirm = useConfirm();

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef      = useRef<number>(0);
  const nodesRef     = useRef<WebNode[]>([]);
  const edgesRef     = useRef<WebEdge[]>([]);
  const hoveredRef   = useRef<string | null>(null);
  const selectedRef  = useRef<string | null>(null);
  const dragRef      = useRef<{ id: string; ox: number; oy: number } | null>(null);
  const sizeRef      = useRef({ w: 800, h: 600 });
  const factionColorMapRef = useRef<Map<string, string>>(new Map());

  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set());
  const visibleIdsRef = useRef<Set<string>>(new Set());

  const [hiddenStatuses, setHiddenStatuses] = useState<Set<Module['status']>>(() => new Set());
  const hiddenStatusesRef = useRef<Set<Module['status']>>(new Set());

  const [hiddenFactionIds, setHiddenFactionIds] = useState<Set<string | null>>(() => new Set());
  const hiddenFactionIdsRef = useRef<Set<string | null>>(new Set());

  const [, forceRerender] = useState(0);
  const rerender = useCallback(() => forceRerender(n => n + 1), []);

  // dep modal state
  const [depModalOpen, setDepModalOpen]       = useState(false);
  const [depModalTargetId, setDepModalTargetId] = useState<string | null>(null);
  const [depEditingId, setDepEditingId]       = useState<string | null>(null);
  const [depForm, setDepForm] = useState({
    prerequisite_id: '',
    dependency_type: 'required' as DependencyType,
    group_id: '',
    label: '',
    threshold: '' as string,
  });
  const [depError, setDepError] = useState<string | null>(null);

  // keep refs in sync
  useEffect(() => { visibleIdsRef.current = visibleIds; }, [visibleIds]);
  useEffect(() => { hiddenStatusesRef.current = hiddenStatuses; }, [hiddenStatuses]);
  useEffect(() => { hiddenFactionIdsRef.current = hiddenFactionIds; }, [hiddenFactionIds]);
  useEffect(() => {
    const m = new Map<string, string>();
    for (const f of factions) {
      m.set(f.id, FACTION_TYPE_COLORS[f.type] ?? NO_FACTION_COLOR);
    }
    factionColorMapRef.current = m;
  }, [factions]);

  // ── build nodes & edges ────────────────────────────────────────────────────

  useEffect(() => {
    const { w, h } = sizeRef.current;
    const prevMap = new Map(nodesRef.current.map(n => [n.id, n]));

    const maxChapter = Math.max(
      ...modules.map(m => parseFloat(m.chapter ?? 'NaN')).filter(v => !isNaN(v)),
      1,
    );

    const nodes: WebNode[] = modules.map(mod => {
      const prev = prevMap.get(mod.id);
      const chapterVal = parseFloat(mod.chapter ?? 'NaN');
      const xSeed = isNaN(chapterVal)
        ? w * 0.5 + (Math.random() - 0.5) * w * 0.5
        : (chapterVal / maxChapter) * w * 0.8 + w * 0.1;
      return {
        id:        mod.id,
        status:    mod.status,
        label:     mod.title,
        chapter:   mod.chapter,
        factionId: mod.faction_id,
        nodeRole:  mod.node_role,
        x:         prev?.x  ?? xSeed,
        y:         prev?.y  ?? h * 0.5 + (Math.random() - 0.5) * h * 0.5,
        vx:        prev?.vx ?? 0,
        vy:        prev?.vy ?? 0,
        pinned:    prev?.pinned ?? false,
      };
    });

    const edges: WebEdge[] = moduleDeps.map(d => ({
      id:        d.id,
      from:      d.prerequisite_id,
      to:        d.dependent_id,
      depType:   d.dependency_type,
      groupId:   d.group_id,
      label:     d.label,
      threshold: d.threshold,
    }));

    nodesRef.current = nodes;
    edgesRef.current = edges;

    // sync visibleIds: add new modules, preserve existing visibility, respect hidden statuses/factions
    setVisibleIds(prev => {
      const next = new Set(prev);
      for (const n of nodes) {
        if (!next.has(n.id) && !hiddenStatusesRef.current.has(n.status) && !hiddenFactionIdsRef.current.has(n.factionId)) {
          next.add(n.id);
        }
      }
      for (const id of Array.from(next)) {
        if (!nodes.find(n => n.id === id)) next.delete(id);
      }
      return next;
    });

    rerender();
  }, [modules, moduleDeps, rerender]);

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
      const visNodes = nodesRef.current.filter(n => visibleIdsRef.current.has(n.id));
      const visEdges = edgesRef.current.filter(
        e => visibleIdsRef.current.has(e.from) && visibleIdsRef.current.has(e.to),
      );
      tickForces(visNodes, visEdges, w, h);
      draw(ctx!, visNodes, visEdges, hoveredRef.current, selectedRef.current, w, h, dpr, factionColorMapRef.current);
      animRef.current = requestAnimationFrame(loop);
    }
    animRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, []);

  // ── hit-test ───────────────────────────────────────────────────────────────

  function nodeAt(x: number, y: number): WebNode | null {
    for (const n of nodesRef.current) {
      if (!visibleIdsRef.current.has(n.id)) continue;
      const dx = n.x - x, dy = n.y - y;
      const r = nodeRadius(n.nodeRole);
      if (dx * dx + dy * dy <= r * r) return n;
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

  // ── status filter ──────────────────────────────────────────────────────────

  function toggleStatus(status: Module['status']) {
    setHiddenStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
        // show nodes of this status
        setVisibleIds(ids => {
          const n2 = new Set(ids);
          for (const nd of nodesRef.current) {
            if (nd.status === status) n2.add(nd.id);
          }
          return n2;
        });
      } else {
        next.add(status);
        // hide nodes of this status
        setVisibleIds(ids => {
          const n2 = new Set(ids);
          for (const nd of nodesRef.current) {
            if (nd.status === status) {
              n2.delete(nd.id);
              if (selectedRef.current === nd.id) { selectedRef.current = null; rerender(); }
            }
          }
          return n2;
        });
      }
      return next;
    });
  }

  function showAll() {
    setHiddenStatuses(new Set());
    setVisibleIds(new Set(nodesRef.current.map(n => n.id)));
  }

  function hideAll() {
    setHiddenStatuses(new Set(['planned', 'active', 'completed']));
    setVisibleIds(new Set());
    selectedRef.current = null;
    rerender();
  }

  // ── faction filter ─────────────────────────────────────────────────────────

  function toggleFaction(factionId: string | null) {
    setHiddenFactionIds(prev => {
      const next = new Set(prev);
      if (next.has(factionId)) {
        next.delete(factionId);
        // show nodes of this faction (that aren't status-hidden)
        setVisibleIds(ids => {
          const n2 = new Set(ids);
          for (const nd of nodesRef.current) {
            if (nd.factionId === factionId && !hiddenStatusesRef.current.has(nd.status)) n2.add(nd.id);
          }
          return n2;
        });
      } else {
        next.add(factionId);
        // hide nodes of this faction
        setVisibleIds(ids => {
          const n2 = new Set(ids);
          for (const nd of nodesRef.current) {
            if (nd.factionId === factionId) {
              n2.delete(nd.id);
              if (selectedRef.current === nd.id) { selectedRef.current = null; rerender(); }
            }
          }
          return n2;
        });
      }
      return next;
    });
  }

  // ── dep modal ──────────────────────────────────────────────────────────────

  function openAddDep(targetModuleId: string) {
    setDepModalTargetId(targetModuleId);
    setDepEditingId(null);
    setDepForm({ prerequisite_id: '', dependency_type: 'required', group_id: '', label: '', threshold: '' });
    setDepError(null);
    setDepModalOpen(true);
  }

  function openEditDep(depId: string) {
    const dep = moduleDeps.find(d => d.id === depId);
    if (!dep) return;
    setDepModalTargetId(dep.dependent_id);
    setDepEditingId(depId);
    setDepForm({
      prerequisite_id: dep.prerequisite_id,
      dependency_type: dep.dependency_type,
      group_id: dep.group_id ?? '',
      label: dep.label ?? '',
      threshold: dep.threshold != null ? String(dep.threshold) : '',
    });
    setDepError(null);
    setDepModalOpen(true);
  }

  async function handleSaveDep() {
    if (!depModalTargetId || !depForm.prerequisite_id || !selectedCampaignId) return;
    if (!depEditingId && wouldCreateModuleCycle(moduleDeps, depModalTargetId, depForm.prerequisite_id)) {
      setDepError('This would create a circular dependency.');
      return;
    }
    const group_id = depForm.dependency_type === 'optional'
      ? (depForm.group_id || crypto.randomUUID())
      : null;
    const thresholdVal = depForm.dependency_type === 'optional' && depForm.threshold
      ? parseInt(depForm.threshold, 10) || null
      : null;
    await upsertModuleDep({
      ...(depEditingId ? { id: depEditingId } : {}),
      campaign_id: selectedCampaignId,
      dependent_id: depModalTargetId,
      prerequisite_id: depForm.prerequisite_id,
      dependency_type: depForm.dependency_type,
      group_id,
      label: depForm.label || null,
      threshold: thresholdVal,
    });
    setDepModalOpen(false);
  }

  async function handleDeleteDep(id: string) {
    if (await confirm('Remove this dependency?')) {
      await deleteModuleDep(id);
    }
  }

  // ── derived data for sidebar ───────────────────────────────────────────────

  const selectedNode = nodesRef.current.find(n => n.id === selectedRef.current) ?? null;

  const prereqs   = selectedNode
    ? moduleDeps.filter(d => d.dependent_id === selectedNode.id)
    : [];
  const blockedBy = selectedNode
    ? moduleDeps.filter(d => d.prerequisite_id === selectedNode.id)
    : [];

  // OR groups for the dep modal
  const optionalPrereqsForTarget = depModalTargetId
    ? moduleDeps.filter(d => d.dependent_id === depModalTargetId && d.dependency_type === 'optional')
    : [];
  const orGroups = Array.from(
    new Set(optionalPrereqsForTarget.map(d => d.group_id).filter(Boolean) as string[]),
  );

  // modules available as prerequisites in the modal (exclude self + already added)
  const existingPrereqIds = new Set(
    depModalTargetId
      ? moduleDeps.filter(d => d.dependent_id === depModalTargetId).map(d => d.prerequisite_id)
      : [],
  );
  const availablePrereqs = modules.filter(
    m => m.id !== depModalTargetId && (depEditingId ? true : !existingPrereqIds.has(m.id)),
  );

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
  };

  return (
    <div className="flex flex-col" style={{ height: '80vh', minHeight: 600 }}>
      {/* header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xl font-bold" style={{ color: '#c9a84c', fontFamily: 'Georgia, serif' }}>
          Module Web
        </h2>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-3 text-xs flex-wrap" style={{ color: '#6a6490', fontFamily: 'Georgia, serif' }}>
            <span className="flex items-center gap-1.5">
              <span style={{ display: 'inline-block', width: 24, height: 2, backgroundColor: REQUIRED_EDGE_COLOR, borderRadius: 1 }} />
              Required
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{
                display: 'inline-block', width: 24, height: 2,
                background: `repeating-linear-gradient(90deg, ${OPTIONAL_EDGE_COLOR} 0px, ${OPTIONAL_EDGE_COLOR} 6px, transparent 6px, transparent 10px)`,
                borderRadius: 1,
              }} />
              Optional (OR)
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{
                display: 'inline-block', width: 24, height: 2,
                background: `repeating-linear-gradient(90deg, ${THRESHOLD_EDGE_COLOR} 0px, ${THRESHOLD_EDGE_COLOR} 10px, transparent 10px, transparent 14px, ${THRESHOLD_EDGE_COLOR} 14px, ${THRESHOLD_EDGE_COLOR} 18px, transparent 18px, transparent 22px)`,
                borderRadius: 1,
              }} />
              Threshold
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ color: '#c9a84c', fontSize: 12 }}>{'\u2605'}</span>
              Start
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '2px solid #e05c5c' }} />
              Boss
            </span>
          </span>
          <span className="text-xs italic" style={{ color: '#6a6490' }}>
            Drag · click to inspect · toggle status to filter
          </span>
        </div>
      </div>

      {/* main area: canvas + sidebar */}
      <div className="flex gap-4" style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
        {/* canvas */}
        <div
          ref={containerRef}
          className="rounded-lg border overflow-hidden"
          style={{ flex: '1 1 0', minHeight: 0, backgroundColor: '#0d0c1a', borderColor: '#3a3660', position: 'relative' }}
        >
          {modules.length === 0 && (
            <div
              className="absolute inset-0 flex items-center justify-center text-sm"
              style={{ color: '#6a6490', pointerEvents: 'none' }}
            >
              Add modules first, then create dependencies between them.
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
          style={{ width: 240, backgroundColor: '#1a1828', borderColor: '#3a3660', overflowY: 'auto', flexShrink: 0 }}
        >
          {/* faction legend / filter */}
          {factions.length > 0 && (
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: '#9990b0' }}>Factions</div>
              <div className="flex flex-col gap-1">
                {factions.map(f => {
                  const color = FACTION_TYPE_COLORS[f.type] ?? NO_FACTION_COLOR;
                  const hidden = hiddenFactionIds.has(f.id);
                  const count = modules.filter(m => m.faction_id === f.id).length;
                  return (
                    <button
                      key={f.id}
                      onClick={() => toggleFaction(f.id)}
                      className="text-xs text-left px-2 py-1 rounded flex items-center gap-2"
                      style={{
                        backgroundColor: hidden ? 'transparent' : '#0d0c1a',
                        border: `1px solid ${hidden ? '#3a3660' : color + '44'}`,
                        color: hidden ? '#4a4460' : color,
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = color)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = hidden ? '#3a3660' : color + '44')}
                    >
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        backgroundColor: hidden ? '#3a3660' : color,
                        display: 'inline-block',
                      }} />
                      {f.name}
                      <span style={{ marginLeft: 'auto', color: '#6a6490' }}>{count}</span>
                    </button>
                  );
                })}
                {/* no-faction toggle */}
                {modules.some(m => !m.faction_id) && (
                  <button
                    onClick={() => toggleFaction(null)}
                    className="text-xs text-left px-2 py-1 rounded flex items-center gap-2"
                    style={{
                      backgroundColor: hiddenFactionIds.has(null) ? 'transparent' : '#0d0c1a',
                      border: `1px solid ${hiddenFactionIds.has(null) ? '#3a3660' : NO_FACTION_COLOR + '44'}`,
                      color: hiddenFactionIds.has(null) ? '#4a4460' : NO_FACTION_COLOR,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = NO_FACTION_COLOR)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = hiddenFactionIds.has(null) ? '#3a3660' : NO_FACTION_COLOR + '44')}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      backgroundColor: hiddenFactionIds.has(null) ? '#3a3660' : NO_FACTION_COLOR,
                      display: 'inline-block',
                    }} />
                    No Faction
                    <span style={{ marginLeft: 'auto', color: '#6a6490' }}>{modules.filter(m => !m.faction_id).length}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {factions.length > 0 && <div style={{ height: 1, backgroundColor: '#3a3660' }} />}

          {/* status filter */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold" style={{ color: '#9990b0' }}>Filter by Status</span>
              <div className="flex gap-1">
                <button
                  onClick={showAll}
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ color: '#9990b0', border: '1px solid #3a3660', background: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#e8d5b0')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#9990b0')}
                >
                  All
                </button>
                <button
                  onClick={hideAll}
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ color: '#9990b0', border: '1px solid #3a3660', background: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#e8d5b0')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#9990b0')}
                >
                  None
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {(['planned', 'active', 'completed'] as Module['status'][]).map(status => {
                const hidden = hiddenStatuses.has(status);
                const color  = STATUS_COLOR[status];
                const count  = modules.filter(m => m.status === status).length;
                return (
                  <button
                    key={status}
                    onClick={() => toggleStatus(status)}
                    className="text-xs text-left px-2 py-1.5 rounded flex items-center gap-2"
                    style={{
                      backgroundColor: hidden ? 'transparent' : '#0d0c1a',
                      border: `1px solid ${hidden ? '#3a3660' : color + '66'}`,
                      color: hidden ? '#4a4460' : color,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = color)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = hidden ? '#3a3660' : color + '66')}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      backgroundColor: hidden ? '#3a3660' : color,
                      display: 'inline-block',
                    }} />
                    {STATUS_LABEL[status]}
                    <span style={{ marginLeft: 'auto', color: '#6a6490' }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ height: 1, backgroundColor: '#3a3660' }} />

          {/* selected node info */}
          {selectedNode ? (
            <>
              <div>
                <div
                  className="text-sm font-bold mb-0.5"
                  style={{ color: STATUS_COLOR[selectedNode.status], fontFamily: 'Georgia, serif' }}
                >
                  {selectedNode.chapter ? `${selectedNode.chapter}: ` : ''}{selectedNode.label}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs" style={{ color: '#6a6490' }}>
                    {STATUS_LABEL[selectedNode.status]}
                  </span>
                  {selectedNode.nodeRole && (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{
                      backgroundColor: selectedNode.nodeRole === 'boss' ? '#2a1a1a' : '#2a2410',
                      color: selectedNode.nodeRole === 'boss' ? '#e05c5c' : '#c9a84c',
                      border: `1px solid ${selectedNode.nodeRole === 'boss' ? '#5a2020' : '#5a4a20'}`,
                    }}>
                      {selectedNode.nodeRole === 'start' ? '\u2605 Start' : 'Boss'}
                    </span>
                  )}
                </div>
                {selectedNode.factionId && (() => {
                  const f = factions.find(fc => fc.id === selectedNode.factionId);
                  if (!f) return null;
                  const color = FACTION_TYPE_COLORS[f.type] ?? NO_FACTION_COLOR;
                  return (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, display: 'inline-block', flexShrink: 0 }} />
                      <span className="text-xs" style={{ color }}>{f.name}</span>
                    </div>
                  );
                })()}
              </div>

              {/* prerequisites */}
              <div>
                <div className="text-xs font-semibold mb-1" style={{ color: '#9990b0' }}>
                  Prerequisites ({prereqs.length})
                </div>
                {prereqs.length === 0 && (
                  <div className="text-xs" style={{ color: '#6a6490' }}>None.</div>
                )}
                {prereqs.map(dep => {
                  const prereqMod = modules.find(m => m.id === dep.prerequisite_id);
                  return (
                    <div
                      key={dep.id}
                      className="rounded p-2 flex flex-col gap-1 mb-1"
                      style={{ backgroundColor: '#0d0c1a', border: `1px solid ${dep.dependency_type === 'optional' ? OPTIONAL_EDGE_COLOR + '33' : REQUIRED_EDGE_COLOR + '33'}` }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold" style={{ color: dep.dependency_type === 'optional' ? OPTIONAL_EDGE_COLOR : REQUIRED_EDGE_COLOR }}>
                          {dep.dependency_type}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => openEditDep(dep.id)}
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{ color: '#9990b0', border: '1px solid #3a3660', background: 'none', cursor: 'pointer' }}
                            onMouseEnter={ev => (ev.currentTarget.style.color = '#e8d5b0')}
                            onMouseLeave={ev => (ev.currentTarget.style.color = '#9990b0')}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteDep(dep.id)}
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{ color: '#9990b0', border: '1px solid #3a3660', background: 'none', cursor: 'pointer' }}
                            onMouseEnter={ev => (ev.currentTarget.style.color = '#e05c5c')}
                            onMouseLeave={ev => (ev.currentTarget.style.color = '#9990b0')}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      <div className="text-xs" style={{ color: '#e8d5b0' }}>
                        {'\u2190'} {prereqMod ? (prereqMod.chapter ? `${prereqMod.chapter}: ` : '') + prereqMod.title : dep.prerequisite_id}
                      </div>
                      {dep.threshold != null && dep.threshold >= 2 && (
                        <div className="text-xs" style={{ color: THRESHOLD_EDGE_COLOR }}>
                          Threshold: {dep.threshold} required
                        </div>
                      )}
                      {dep.label && (
                        <div className="text-xs italic" style={{ color: '#9990b0' }}>{dep.label}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* blockers */}
              {blockedBy.length > 0 && (
                <div>
                  <div className="text-xs font-semibold mb-1" style={{ color: '#9990b0' }}>
                    Unlocks ({blockedBy.length})
                  </div>
                  {blockedBy.map(dep => {
                    const depMod = modules.find(m => m.id === dep.dependent_id);
                    return (
                      <div key={dep.id} className="text-xs px-2 py-1 rounded mb-1" style={{ backgroundColor: '#0d0c1a', border: '1px solid #2e2c4a', color: '#9990b0' }}>
                        → {depMod ? (depMod.chapter ? `${depMod.chapter}: ` : '') + depMod.title : dep.dependent_id}
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={() => openAddDep(selectedNode.id)}
                className="text-xs px-3 py-1.5 rounded mt-1"
                style={{ backgroundColor: '#2a2840', color: '#c9a84c', border: '1px solid #3a3660', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#3a3860')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#2a2840')}
              >
                + Add Prerequisite
              </button>
            </>
          ) : (
            <div className="text-xs" style={{ color: '#6a6490' }}>
              Click a node to inspect its dependencies.
            </div>
          )}
        </div>
      </div>

      {/* dep modal */}
      <Modal
        isOpen={depModalOpen}
        onClose={() => setDepModalOpen(false)}
        title={depEditingId ? 'Edit Dependency' : 'Add Prerequisite'}
        onSave={handleSaveDep}
      >
        <div className="flex flex-col gap-4">
          {depModalTargetId && (
            <div className="text-sm" style={{ color: '#9990b0' }}>
              Adding prerequisite for:{' '}
              <span style={{ color: '#e8d5b0', fontWeight: 600 }}>
                {(() => {
                  const m = modules.find(mod => mod.id === depModalTargetId);
                  return m ? (m.chapter ? `${m.chapter}: ` : '') + m.title : '?';
                })()}
              </span>
            </div>
          )}

          <FormField label="Prerequisite Module">
            <select
              value={depForm.prerequisite_id}
              onChange={e => setDepForm(f => ({ ...f, prerequisite_id: e.target.value }))}
              style={selectStyle}
            >
              <option value="">— select module —</option>
              {availablePrereqs.map(m => (
                <option key={m.id} value={m.id}>
                  {m.chapter ? `${m.chapter}: ` : ''}{m.title}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Dependency Type">
            <div className="flex gap-4">
              {(['required', 'optional'] as DependencyType[]).map(t => (
                <label key={t} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#e8d5b0' }}>
                  <input
                    type="radio"
                    name="dep_type"
                    value={t}
                    checked={depForm.dependency_type === t}
                    onChange={() => setDepForm(f => ({ ...f, dependency_type: t, group_id: '' }))}
                  />
                  <span style={{ color: t === 'optional' ? OPTIONAL_EDGE_COLOR : REQUIRED_EDGE_COLOR }}>
                    {t === 'required' ? 'Required (AND)' : 'Optional (OR)'}
                  </span>
                </label>
              ))}
            </div>
          </FormField>

          {depForm.dependency_type === 'optional' && orGroups.length > 0 && (
            <FormField label="OR Group">
              <select
                value={depForm.group_id}
                onChange={e => setDepForm(f => ({ ...f, group_id: e.target.value }))}
                style={selectStyle}
              >
                <option value="">New group</option>
                {orGroups.map(gid => (
                  <option key={gid} value={gid}>
                    Group: {gid.substring(0, 8)}…
                  </option>
                ))}
              </select>
            </FormField>
          )}

          {depForm.dependency_type === 'optional' && (
            <FormField label="Threshold (how many prereqs needed)">
              <input
                type="number"
                min="1"
                value={depForm.threshold}
                onChange={e => setDepForm(f => ({ ...f, threshold: e.target.value }))}
                placeholder="1 (default — any one)"
                style={inputStyle}
              />
              <div className="text-xs mt-1" style={{ color: '#6a6490' }}>
                Leave blank or 1 for "any one of the group". Set to 2+ for threshold gating.
              </div>
            </FormField>
          )}

          <FormField label="Label (optional)">
            <input
              value={depForm.label}
              onChange={e => setDepForm(f => ({ ...f, label: e.target.value }))}
              placeholder="e.g. unlocks after rescue…"
              style={inputStyle}
            />
          </FormField>

          {depError && (
            <div className="text-sm px-3 py-2 rounded" style={{ backgroundColor: '#2a1a1a', color: '#e05c5c', border: '1px solid #5a2020' }}>
              {depError}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
