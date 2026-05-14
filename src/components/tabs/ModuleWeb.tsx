import { useState, useMemo, useRef, useEffect } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Modal } from '../Modal';
import { FormField, inputStyle } from '../FormField';
import { wouldCreateModuleCycle } from '../../lib/moduleUtils';
import type { DependencyType, Module } from '../../lib/database.types';

// ─── constants ────────────────────────────────────────────────────────────────

const NODE_W = 120;
const NODE_H = 56;
const COL_GAP = 160;
const ROW_GAP = 100;

const STATUS_COLOR: Record<Module['status'], string> = {
  planned:   'var(--ink-3)',
  active:    'var(--gold)',
  completed: '#4caf7d',
};

const STATUS_LABEL: Record<Module['status'], string> = {
  planned:   'PLANNED',
  active:    'ACTIVE',
  completed: 'COMPLETE',
};

// ─── layout helpers ────────────────────────────────────────────────────────────

interface LayoutNode {
  id: string;
  mod: Module;
  col: number;
  row: number;
  x: number;
  y: number;
}

function computeLayout(modules: Module[], edges: { from: string; to: string }[]): LayoutNode[] {
  if (modules.length === 0) return [];

  // Assign columns by chapter number; fall back to topological order
  const chapterMap = new Map<string, number>();
  for (const m of modules) {
    const ch = parseFloat(m.chapter ?? 'NaN');
    chapterMap.set(m.id, isNaN(ch) ? 999 : ch);
  }

  // Sort modules by chapter
  const sorted = [...modules].sort((a, b) =>
    (chapterMap.get(a.id) ?? 999) - (chapterMap.get(b.id) ?? 999),
  );

  // Group into columns by chapter value (integer part)
  const colMap = new Map<number, string[]>();
  for (const m of sorted) {
    const ch = chapterMap.get(m.id) ?? 999;
    const col = Math.floor(ch);
    if (!colMap.has(col)) colMap.set(col, []);
    colMap.get(col)!.push(m.id);
  }

  const colKeys = Array.from(colMap.keys()).sort((a, b) => a - b);
  const colIndex = new Map(colKeys.map((k, i) => [k, i]));

  const nodes: LayoutNode[] = [];
  for (const m of sorted) {
    const ch = chapterMap.get(m.id) ?? 999;
    const col = colIndex.get(Math.floor(ch)) ?? 0;
    const colIds = colMap.get(Math.floor(ch)) ?? [];
    const row = colIds.indexOf(m.id);
    const colCount = colKeys.length;
    const x = 60 + col * (NODE_W + COL_GAP);
    const y = 60 + row * (NODE_H + ROW_GAP);
    nodes.push({ id: m.id, mod: m, col, row, x, y });
    void colCount;
  }

  return nodes;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ModuleWeb() {
  const {
    modules, moduleDeps, upsertModuleDep, deleteModuleDep, selectedCampaignId,
  } = useCampaign();
  const confirm = useConfirm();

  const [focusId, setFocusId] = useState<string | null>(null);
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<Module['status']>>(new Set());
  const svgRef = useRef<SVGSVGElement>(null);

  // dep modal
  const [depModalOpen, setDepModalOpen] = useState(false);
  const [depModalTargetId, setDepModalTargetId] = useState<string | null>(null);
  const [depForm, setDepForm] = useState({
    prerequisite_id: '',
    dependency_type: 'required' as DependencyType,
    label: '',
  });
  const [depError, setDepError] = useState<string | null>(null);

  const edges = useMemo(() =>
    moduleDeps.map(d => ({ id: d.id, from: d.prerequisite_id, to: d.dependent_id, depType: d.dependency_type, label: d.label })),
    [moduleDeps],
  );

  const visibleModules = useMemo(() =>
    modules.filter(m => !hiddenStatuses.has(m.status)),
    [modules, hiddenStatuses],
  );

  const nodes = useMemo(() =>
    computeLayout(visibleModules, edges),
    [visibleModules, edges],
  );

  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  // SVG viewport size
  const svgW = useMemo(() => {
    if (nodes.length === 0) return 800;
    return Math.max(...nodes.map(n => n.x + NODE_W)) + 80;
  }, [nodes]);
  const svgH = useMemo(() => {
    if (nodes.length === 0) return 500;
    return Math.max(...nodes.map(n => n.y + NODE_H)) + 80;
  }, [nodes]);

  // Edge path: connect right-center of prereq to left-center of dependent
  function edgePath(fromNode: LayoutNode, toNode: LayoutNode): string {
    const x1 = fromNode.x + NODE_W;
    const y1 = fromNode.y + NODE_H / 2;
    const x2 = toNode.x;
    const y2 = toNode.y + NODE_H / 2;
    const cx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
  }

  // Focused module data
  const focusedMod = focusId ? modules.find(m => m.id === focusId) ?? null : null;
  const focusPrereqs = focusId ? moduleDeps.filter(d => d.dependent_id === focusId) : [];
  const focusUnlocks = focusId ? moduleDeps.filter(d => d.prerequisite_id === focusId) : [];

  // Status filter toggle
  function toggleStatus(s: Module['status']) {
    setHiddenStatuses(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
    setFocusId(null);
  }

  // Dep modal
  function openAddDep(targetId: string) {
    setDepModalTargetId(targetId);
    setDepForm({ prerequisite_id: '', dependency_type: 'required', label: '' });
    setDepError(null);
    setDepModalOpen(true);
  }

  async function handleSaveDep() {
    if (!depModalTargetId || !depForm.prerequisite_id || !selectedCampaignId) return;
    if (wouldCreateModuleCycle(moduleDeps, depModalTargetId, depForm.prerequisite_id)) {
      setDepError('This would create a circular dependency.');
      return;
    }
    await upsertModuleDep({
      campaign_id: selectedCampaignId,
      dependent_id: depModalTargetId,
      prerequisite_id: depForm.prerequisite_id,
      dependency_type: depForm.dependency_type,
      group_id: depForm.dependency_type === 'optional' ? crypto.randomUUID() : null,
      label: depForm.label || null,
    });
    setDepModalOpen(false);
  }

  async function handleDeleteDep(id: string) {
    if (await confirm('Remove this dependency?')) await deleteModuleDep(id);
  }

  const existingPrereqIds = new Set(
    depModalTargetId ? moduleDeps.filter(d => d.dependent_id === depModalTargetId).map(d => d.prerequisite_id) : [],
  );
  const availablePrereqs = modules.filter(m => m.id !== depModalTargetId && !existingPrereqIds.has(m.id));

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
  };

  return (
    <div className="mw">
      {/* Header */}
      <div className="mw-head">
        <div>
          <div className="cm-md-eyebrow">Story Dependencies</div>
          <h2 className="cm-md-title">Module Web</h2>
        </div>
        <div className="mw-head-filters">
          {(['completed', 'active', 'planned'] as Module['status'][]).map(s => {
            const hidden = hiddenStatuses.has(s);
            return (
              <label
                key={s}
                className="mw-filter-check"
                style={{ opacity: hidden ? 0.45 : 1 }}
              >
                <input
                  type="checkbox"
                  checked={!hidden}
                  onChange={() => toggleStatus(s)}
                  style={{ accentColor: STATUS_COLOR[s] }}
                />
                <span style={{ color: hidden ? 'var(--ink-3)' : STATUS_COLOR[s] }}>
                  {s}
                </span>
              </label>
            );
          })}
          {focusId && (
            <button
              className="mw-clear-focus"
              onClick={() => setFocusId(null)}
            >
              Clear focus ×
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="mw-body">
        {/* Canvas: SVG */}
        <div className="mw-canvas">
          {modules.length === 0 ? (
            <div className="mw-empty">
              <div className="mw-empty-glyph">❧</div>
              <div className="mw-empty-title">No modules yet</div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
                Add modules first, then create dependencies.
              </div>
            </div>
          ) : (
            <svg
              ref={svgRef}
              width={svgW}
              height={svgH}
              style={{ display: 'block', minWidth: svgW, minHeight: svgH }}
            >
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="var(--ink-3)" />
                </marker>
                <marker id="arrow-active" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="var(--gold)" />
                </marker>
              </defs>

              {/* Edges */}
              {edges.map(e => {
                const from = nodeMap.get(e.from);
                const to = nodeMap.get(e.to);
                if (!from || !to) return null;
                const isFocused = focusId === e.from || focusId === e.to;
                const dimmed = focusId !== null && !isFocused;
                return (
                  <path
                    key={e.id}
                    d={edgePath(from, to)}
                    fill="none"
                    stroke={isFocused ? 'var(--gold)' : 'var(--ink-3)'}
                    strokeWidth={isFocused ? 1.5 : 1}
                    strokeDasharray={e.depType === 'optional' ? '5 3' : undefined}
                    markerEnd={isFocused ? 'url(#arrow-active)' : 'url(#arrow)'}
                    opacity={dimmed ? 0.15 : 0.6}
                  />
                );
              })}

              {/* Nodes */}
              {nodes.map(n => {
                const isActive = n.id === focusId;
                const dimmed = focusId !== null && !isActive;
                const status = n.mod.status;
                const color = STATUS_COLOR[status];
                const isPlanned = status === 'planned';
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x},${n.y})`}
                    style={{ cursor: 'pointer', opacity: dimmed ? 0.3 : 1 }}
                    onClick={() => setFocusId(n.id === focusId ? null : n.id)}
                  >
                    {/* Node rect */}
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx={3}
                      ry={3}
                      fill={isActive ? 'var(--paper-2)' : 'var(--paper)'}
                      stroke={isActive ? color : 'var(--rule)'}
                      strokeWidth={isActive ? 1.5 : 1}
                      strokeDasharray={isPlanned ? '4 3' : undefined}
                    />
                    {/* Chapter label */}
                    {n.mod.chapter && (
                      <text
                        x={NODE_W / 2}
                        y={16}
                        textAnchor="middle"
                        fontSize={9}
                        letterSpacing={1}
                        fontFamily="var(--mono)"
                        fill="var(--ink-3)"
                      >
                        Ch. {n.mod.chapter}
                      </text>
                    )}
                    {/* Status badge */}
                    <text
                      x={NODE_W / 2}
                      y={n.mod.chapter ? 28 : 20}
                      textAnchor="middle"
                      fontSize={8}
                      letterSpacing={0.5}
                      fontFamily="var(--mono)"
                      fontWeight="600"
                      fill={color}
                    >
                      {STATUS_LABEL[status]}
                    </text>
                    {/* Title */}
                    <text
                      x={NODE_W / 2}
                      y={n.mod.chapter ? 43 : 38}
                      textAnchor="middle"
                      fontSize={11}
                      fontFamily="var(--serif)"
                      fill={isActive ? 'var(--ink)' : 'var(--ink-2)'}
                    >
                      {n.mod.title.length > 14 ? n.mod.title.substring(0, 13) + '…' : n.mod.title}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Right panel */}
        <aside className="mw-side">
          {focusedMod ? (
            <>
              {/* Module header in panel */}
              <div className="mw-side-head">
                <div className="mw-side-eyebrow">
                  {focusedMod.chapter ? `Chapter ${focusedMod.chapter} · ` : ''}{STATUS_LABEL[focusedMod.status]}
                </div>
                <div className="mw-side-title">{focusedMod.title}</div>
                {focusedMod.synopsis && (
                  <div className="mw-side-synopsis">{focusedMod.synopsis}</div>
                )}
              </div>

              {/* Requires */}
              {focusPrereqs.length > 0 && (
                <div className="mw-side-section">
                  <div className="mw-side-section-label">Requires</div>
                  {focusPrereqs.map(dep => {
                    const m = modules.find(md => md.id === dep.prerequisite_id);
                    if (!m) return null;
                    return (
                      <div key={dep.id} className="mw-side-row">
                        <span className="mw-side-row-label">
                          Ch. {m.chapter} · {m.title}
                        </span>
                        <button
                          className="mw-side-row-del"
                          onClick={() => handleDeleteDep(dep.id)}
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Unlocks */}
              {focusUnlocks.length > 0 && (
                <div className="mw-side-section">
                  <div className="mw-side-section-label">Unlocks</div>
                  {focusUnlocks.map(dep => {
                    const m = modules.find(md => md.id === dep.dependent_id);
                    if (!m) return null;
                    return (
                      <div key={dep.id} className="mw-side-row">
                        <span className="mw-side-row-label">
                          Ch. {m.chapter} · {m.title}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {focusPrereqs.length === 0 && focusUnlocks.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic', padding: '8px 0' }}>
                  No dependencies yet.
                </div>
              )}

              {/* Actions */}
              <div className="mw-side-actions">
                <button
                  className="mw-side-btn-primary"
                  onClick={() => openAddDep(focusedMod.id)}
                >
                  + Add Dependency
                </button>
              </div>
            </>
          ) : (
            <div className="mw-empty" style={{ paddingTop: 32 }}>
              <div className="mw-empty-glyph">❧</div>
              <div className="mw-empty-title">Select a module</div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
                Click a node to inspect its dependencies.
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Dep modal */}
      <Modal
        isOpen={depModalOpen}
        onClose={() => setDepModalOpen(false)}
        title="Add Dependency"
        onSave={handleSaveDep}
      >
        <div className="flex flex-col gap-4">
          {depModalTargetId && (
            <div className="text-sm" style={{ color: 'var(--ink-2)' }}>
              Adding prerequisite for:{' '}
              <span style={{ color: 'var(--ink)', fontWeight: 600 }}>
                {(() => {
                  const m = modules.find(mod => mod.id === depModalTargetId);
                  return m ? (m.chapter ? `Ch. ${m.chapter}: ` : '') + m.title : '?';
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
                  {m.chapter ? `Ch. ${m.chapter}: ` : ''}{m.title}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Dependency Type">
            <div className="flex gap-4">
              {(['required', 'optional'] as DependencyType[]).map(t => (
                <label key={t} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--ink)' }}>
                  <input
                    type="radio"
                    name="dep_type"
                    value={t}
                    checked={depForm.dependency_type === t}
                    onChange={() => setDepForm(f => ({ ...f, dependency_type: t }))}
                  />
                  {t === 'required' ? 'Required (AND)' : 'Optional (OR)'}
                </label>
              ))}
            </div>
          </FormField>
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
