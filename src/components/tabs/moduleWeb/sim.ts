/* ════════════════════════════════════════════════════════════════
   moduleWeb/sim.ts — the gravity model behind the Module Web.

   Chapters are wells on a horizontal time axis; modules fall into
   their well, submodules orbit their module, scenes orbit their
   submodule. Dependencies are springs. Everything repels everything.

   The sim mutates its own bodies in place and is driven from a
   requestAnimationFrame loop — it never touches React state.
   ════════════════════════════════════════════════════════════════ */

export type BodyKind = 'module' | 'sub' | 'scene';

/** What the graph builder hands the sim: identity, mass and where the well is. */
export interface BodySpec {
  id: string;
  kind: BodyKind;
  parentId: string | null;
  targetX: number;   // the owning chapter's axis
  r: number;         // drawn radius
  mass: number;
  pad: number;       // hard-separation radius (keeps labels from stacking)
}

export interface Body extends BodySpec {
  x: number; y: number;
  vx: number; vy: number;
  pinned: boolean;
  dragging: boolean;
}

export interface LinkSpec {
  id: string;
  source: string;
  target: string;
  len: number;    // rest length
  stiff: number;  // spring stiffness
}

/** A link with its endpoints resolved to live bodies. */
export interface SimLink extends LinkSpec { a: Body; b: Body }

export class WebSim {
  nodes: Body[] = [];
  byId = new Map<string, Body>();
  links: SimLink[] = [];
  alpha = 1;
  alphaMin = 0.03;
  decay = 0.014;
  gravity = 1;
  centerY: number;

  constructor(centerY: number) { this.centerY = centerY; }

  /** Swap in a new graph, carrying over positions/velocities for bodies that survive. */
  setGraph(specs: BodySpec[], links: LinkSpec[]) {
    const prev = this.byId;
    this.nodes = specs.map(s => {
      const p = prev.get(s.id);
      if (p) return Object.assign(p, s);
      // New bodies bloom out of their parent; roots scatter near their well.
      const par = s.parentId ? prev.get(s.parentId) : null;
      const a = Math.random() * Math.PI * 2;
      const rad = par ? (s.kind === 'scene' ? 18 : 26) : 0;
      return {
        ...s, vx: 0, vy: 0, pinned: false, dragging: false,
        x: (par ? par.x : s.targetX) + Math.cos(a) * rad + (par ? 0 : (Math.random() - 0.5) * 90),
        y: (par ? par.y : this.centerY) + Math.sin(a) * rad + (par ? 0 : (Math.random() - 0.5) * 200),
      };
    });
    this.byId = new Map(this.nodes.map(n => [n.id, n]));
    this.links = links
      .map(l => ({ ...l, a: this.byId.get(l.source)!, b: this.byId.get(l.target)! }))
      .filter(l => l.a && l.b);
    this.reheat(1);
  }

  /** Interactions reheat the sim so it settles around the change. */
  reheat(a = 1) { this.alpha = Math.max(this.alpha, a); }

  /** Run n ticks headlessly — used once on mount so the web opens settled. */
  warm(n: number) { for (let i = 0; i < n; i++) this.tick(); }

  tick() {
    const ns = this.nodes;
    const a = Math.max(this.alpha, this.alphaMin);
    const g = this.gravity;

    /* ── SWAP POINT: quadtree (Barnes–Hut) repulsion ──────────────────
       The charge pass below and the separation pass at the bottom of
       tick() are both O(n²). Fine to ~150 visible bodies; past that,
       replace both with one quadtree built per tick:
         1. insert all nodes into recursively subdivided squares
         2. post-order pass caching each cell's mass + center of mass
         3. per node, walk from root; if cellWidth/distance < θ (~0.9)
            apply one force from the cell's center of mass and stop
            descending, else recurse into its four children
         4. separation reuses the same tree, querying only cells whose
            bounds intersect pad + maxPad
       Two retunes come with it: the d2 > 168100 cutoff goes away (the
       tree gives distance falloff for free), so the well strengths
       below must come DOWN or chapters drift off their axis; and
       clusters get approximated as single masses, so an expanded
       chapter repels its neighbour as a unit.
       ───────────────────────────────────────────────────────────────── */
    // charge — every body pushes every other body away
    for (let i = 0; i < ns.length; i++) {
      const p = ns[i];
      for (let j = i + 1; j < ns.length; j++) {
        const q = ns[j];
        let dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
        if (d2 > 168100) continue;
        if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
        const d = Math.sqrt(d2);
        const f = Math.min(320 * p.mass * q.mass / d2, 9) / d;
        const fx = dx * f, fy = dy * f;
        p.vx -= fx / p.mass * a; p.vy -= fy / p.mass * a;
        q.vx += fx / q.mass * a; q.vy += fy / q.mass * a;
      }
    }

    // springs — tethers hold family together, dependencies set distance.
    // The gravity slider shortens rest lengths as it stiffens.
    const ls = 1.45 - 0.42 * g;
    for (const l of this.links) {
      const p = l.a, q = l.b;
      const dx = q.x - p.x, dy = q.y - p.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const f = (d - l.len * ls) * l.stiff * g * a / d;
      const fx = dx * f, fy = dy * f;
      p.vx += fx / p.mass; p.vy += fy / p.mass;
      q.vx -= fx / q.mass; q.vy -= fy / q.mass;
    }

    // wells — the chapter axis pulls each body toward its moment in the story
    for (const n of ns) {
      const wx = n.kind === 'module' ? 0.020 : n.kind === 'sub' ? 0.008 : 0.003;
      const wy = n.kind === 'module' ? 0.010 : 0.004;
      n.vx += (n.targetX - n.x) * wx * g * a;
      n.vy += (this.centerY - n.y) * wy * g * a;
    }

    // integrate — dragged and pinned bodies go only where the user puts them
    for (const n of ns) {
      if (n.dragging || n.pinned) { n.vx = 0; n.vy = 0; continue; }
      n.vx *= 0.86; n.vy *= 0.86;
      const sp = Math.hypot(n.vx, n.vy);
      if (sp > 14) { n.vx = n.vx / sp * 14; n.vy = n.vy / sp * 14; }
      n.x += n.vx; n.y += n.vy;
    }

    // hard separation so labels never stack
    for (let i = 0; i < ns.length; i++) {
      const p = ns[i];
      for (let j = i + 1; j < ns.length; j++) {
        const q = ns[j];
        const min = p.pad + q.pad;
        const dx = q.x - p.x, dy = q.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d >= min || d === 0) continue;
        const push = (min - d) / d * 0.5, mx = dx * push, my = dy * push;
        if (!p.dragging && !p.pinned) { p.x -= mx; p.y -= my; }
        if (!q.dragging && !q.pinned) { q.x += mx; q.y += my; }
      }
    }

    if (this.alpha > this.alphaMin) this.alpha += (this.alphaMin - this.alpha) * this.decay;
  }
}
