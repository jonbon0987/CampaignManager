import { useMemo, useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Modal } from '../Modal';
import { FormField, inputStyle } from '../FormField';
import type { RelationshipType, CharacterKind } from '../../lib/database.types';

// ─── constants ────────────────────────────────────────────────────────────────

const REL_TYPES: RelationshipType[] = ['ally', 'rival', 'foe', 'neutral'];

const REL_COLOR: Record<RelationshipType, string> = {
  ally:    'var(--moss)',
  rival:   'var(--gold-2)',
  foe:     'var(--accent)',
  neutral: 'var(--ink-3)',
};

const REL_LABEL: Record<RelationshipType, string> = {
  ally:    'Ally',
  rival:   'Rival',
  foe:     'Foe',
  neutral: 'Neutral',
};

const SVG_W = 720;
const SVG_H = 520;
const CX = SVG_W / 2;
const CY = SVG_H / 2;
const INNER_R = 110;
const OUTER_R = 220;

function shortLabel(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 8);
  return parts[0].slice(0, 6);
}

// ─── component ────────────────────────────────────────────────────────────────

export default function CharacterWeb() {
  const { pcs, npcs, relationships, upsertRelationship, deleteRelationship } = useCampaign();
  const confirm = useConfirm();

  const [focus, setFocus] = useState<string | null>(null);
  const [metOnly, setMetOnly] = useState(false);
  const [hidden, setHidden] = useState<Record<RelationshipType, boolean>>({
    ally: false, rival: false, foe: false, neutral: true,
  });

  // ── visible nodes & layout ─────────────────────────────────────────────────

  const allNodes = useMemo(() => [
    ...pcs.map(p  => ({ id: p.id, kind: 'pc'  as CharacterKind, label: p.character_name, met: true })),
    ...npcs.map(n => ({ id: n.id, kind: 'npc' as CharacterKind, label: n.name,           met: !!n.met_by_pcs })),
  ], [pcs, npcs]);

  const visibleNodes = useMemo(() =>
    allNodes.filter(n => !(n.kind === 'npc' && metOnly && !n.met)),
    [allNodes, metOnly],
  );

  const layout = useMemo(() => {
    const pcNodes  = visibleNodes.filter(n => n.kind === 'pc');
    const npcNodes = visibleNodes.filter(n => n.kind === 'npc');
    const positions: Record<string, { x: number; y: number }> = {};
    pcNodes.forEach((n, i) => {
      const a = (i / Math.max(pcNodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
      positions[n.id] = { x: CX + Math.cos(a) * INNER_R, y: CY + Math.sin(a) * INNER_R };
    });
    npcNodes.forEach((n, i) => {
      const a = (i / Math.max(npcNodes.length, 1)) * Math.PI * 2 - Math.PI / 2 + 0.15;
      positions[n.id] = { x: CX + Math.cos(a) * OUTER_R, y: CY + Math.sin(a) * OUTER_R };
    });
    return positions;
  }, [visibleNodes]);

  const visibleIds = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes]);

  const visibleEdges = useMemo(() =>
    relationships.filter(r =>
      visibleIds.has(r.from_id) && visibleIds.has(r.to_id) && !hidden[r.relationship_type]
    ),
    [relationships, visibleIds, hidden],
  );

  // ── focus / adjacency ──────────────────────────────────────────────────────

  const focusedEdges = focus
    ? visibleEdges.filter(e => e.from_id === focus || e.to_id === focus)
    : [];

  const focusedNode = visibleNodes.find(n => n.id === focus) ?? null;

  // ── type toggles ───────────────────────────────────────────────────────────

  function toggleType(t: RelationshipType) {
    setHidden(h => ({ ...h, [t]: !h[t] }));
  }

  // ── relationship modal ─────────────────────────────────────────────────────

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

  const allChars = useMemo(() => [
    ...pcs.map(p  => ({ id: p.id, kind: 'pc'  as CharacterKind, name: p.character_name })),
    ...npcs.map(n => ({ id: n.id, kind: 'npc' as CharacterKind, name: n.name })),
  ], [pcs, npcs]);

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

  function openEdit(relId: string) {
    const rel = relationships.find(r => r.id === relId);
    if (!rel) return;
    setEditingId(relId);
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
    if (await confirm('Remove this relationship?')) {
      await deleteRelationship(id);
    }
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
  };

  const isEmpty = allNodes.length === 0;

  return (
    <div className="cw">
      {/* Header */}
      <div className="cw-head">
        <div>
          <div className="cm-md-eyebrow">Relationships</div>
          <h2 className="cm-md-title">Character Web</h2>
        </div>
        <div className="cw-toolbar">
          <button
            className={`cw-legend ${metOnly ? '' : 'is-off'}`}
            onClick={() => setMetOnly(v => !v)}
          >
            Met only
          </button>
          <span className="cm-filter-sep" />
          {REL_TYPES.map(t => (
            <button
              key={t}
              className={`cw-legend ${hidden[t] ? 'is-off' : ''}`}
              onClick={() => toggleType(t)}
            >
              <span className="cw-legend-line" style={{ background: REL_COLOR[t] }} />
              {REL_LABEL[t]}
            </button>
          ))}
          {focus && (
            <>
              <span className="cm-filter-sep" />
              <button className="cw-clear" onClick={() => setFocus(null)}>Clear focus ✕</button>
            </>
          )}
          <span className="cm-filter-sep" />
          <button className="cw-action" style={{ padding: '4px 12px', fontSize: 12 }} onClick={openAdd}>
            + Add Relationship
          </button>
        </div>
      </div>

      {/* Body: canvas + side panel */}
      <div className="cw-body">
        <div className="cw-canvas">
          {isEmpty ? (
            <div className="cw-empty" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div className="cw-empty-glyph">◇</div>
              <div className="cw-empty-title">No characters yet</div>
              <div className="cw-empty-sub">Add PCs and NPCs first, then create relationships.</div>
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              preserveAspectRatio="xMidYMid meet"
              className="cw-svg"
            >
              {/* Guide rings */}
              <circle cx={CX} cy={CY} r={INNER_R} className="cw-ring" />
              <circle cx={CX} cy={CY} r={OUTER_R} className="cw-ring" />
              <text x={CX} y={CY - INNER_R - 8} textAnchor="middle" className="cw-ring-label">PARTY</text>
              <text x={CX} y={CY - OUTER_R - 8} textAnchor="middle" className="cw-ring-label">CAST</text>

              {/* Edges */}
              {visibleEdges.map(e => {
                const a = layout[e.from_id];
                const b = layout[e.to_id];
                if (!a || !b) return null;
                const isFocused = focus && (e.from_id === focus || e.to_id === focus);
                const isDim = focus && !isFocused;
                return (
                  <g key={e.id} className={`cw-edge ${isDim ? 'is-dim' : ''}`}>
                    <line
                      x1={a.x} y1={a.y}
                      x2={b.x} y2={b.y}
                      stroke={REL_COLOR[e.relationship_type]}
                      strokeWidth={isFocused ? 2.5 : 1.4}
                    />
                    {isFocused && e.label && (
                      <text
                        x={(a.x + b.x) / 2}
                        y={(a.y + b.y) / 2 - 6}
                        textAnchor="middle"
                        className="cw-edge-label"
                        fill={REL_COLOR[e.relationship_type]}
                      >
                        {e.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Nodes */}
              {visibleNodes.map(n => {
                const p = layout[n.id];
                if (!p) return null;
                const r = n.kind === 'pc' ? 26 : 22;
                const isDim   = focus && focus !== n.id;
                const isFocus = n.id === focus;
                return (
                  <g
                    key={n.id}
                    transform={`translate(${p.x},${p.y})`}
                    className={`cw-node cw-node-${n.kind} ${isDim ? 'is-dim' : ''} ${isFocus ? 'is-focus' : ''}`}
                    onClick={() => setFocus(isFocus ? null : n.id)}
                  >
                    <circle r={r} className="cw-node-bg" />
                    <circle r={r} className="cw-node-ring" />
                    <text textAnchor="middle" dy="0.32em" className="cw-node-label">
                      {shortLabel(n.label)}
                    </text>
                    <text textAnchor="middle" dy={r + 14} className="cw-node-name">
                      {n.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Side panel */}
        <aside className="cw-side">
          {!focus ? (
            <div className="cw-empty">
              <div className="cw-empty-glyph">◇</div>
              <div className="cw-empty-title">Click any character</div>
              <div className="cw-empty-sub">to focus their relationships and see incoming and outgoing ties.</div>
            </div>
          ) : focusedNode && (
            <>
              <div>
                <div className="cw-side-eyebrow">
                  {focusedNode.kind === 'pc' ? 'Player Character' : 'NPC'}
                </div>
                <h3 className="cw-side-title">{focusedNode.label}</h3>
              </div>

              <div className="cw-rels">
                <div className="cw-rels-head">
                  Relationships ({focusedEdges.length})
                </div>
                {focusedEdges.length === 0 && (
                  <div className="cm-empty is-inline">None recorded.</div>
                )}
                {focusedEdges.map(e => {
                  const otherId = e.from_id === focus ? e.to_id : e.from_id;
                  const other   = visibleNodes.find(n => n.id === otherId);
                  const dir     = e.from_id === focus ? '→' : '←';
                  return (
                    <button
                      key={e.id}
                      className="cw-rel"
                      style={{ '--rel-color': REL_COLOR[e.relationship_type] } as React.CSSProperties}
                      onClick={() => setFocus(otherId)}
                    >
                      <div className="cw-rel-row">
                        <span className="cw-rel-type">{e.relationship_type}</span>
                        <span className="cw-rel-arrow">{dir}</span>
                        <span className="cw-rel-name">{other?.label ?? otherId}</span>
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                          <button
                            onClick={ev => { ev.stopPropagation(); openEdit(e.id); }}
                            className="cw-action-ghost"
                            style={{ padding: '2px 8px', fontSize: 11, borderRadius: 3 }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={ev => { ev.stopPropagation(); handleDelete(e.id); }}
                            className="cw-action-ghost"
                            style={{ padding: '2px 6px', fontSize: 11, borderRadius: 3, color: 'var(--accent)' }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      {e.label && <div className="cw-rel-label">{e.label}</div>}
                    </button>
                  );
                })}
              </div>

              <div className="cw-actions">
                <button className="cw-action" onClick={openAdd}>
                  + Add relationship
                </button>
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Relationship modal */}
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
                <option key={t} value={t}>{REL_LABEL[t]}</option>
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
            style={{ backgroundColor: 'var(--bg)', border: `1px solid ${REL_COLOR[relForm.relationship_type]}` }}
          >
            <span style={{ display: 'inline-block', width: 32, height: 2, backgroundColor: REL_COLOR[relForm.relationship_type], borderRadius: 1 }} />
            <span style={{ color: REL_COLOR[relForm.relationship_type] }}>
              {REL_LABEL[relForm.relationship_type]} — {allChars.find(c => c.id === relForm.from_id)?.name ?? '?'} → {allChars.find(c => c.id === relForm.to_id)?.name ?? '?'}
            </span>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={!relForm.from_id || !relForm.to_id || relForm.from_id === relForm.to_id}
              className="flex-1 py-2 rounded text-sm font-semibold disabled:opacity-40"
              style={{ backgroundColor: 'var(--gold)', color: 'var(--bg)' }}
            >
              {editingId ? 'Save Changes' : 'Add Relationship'}
            </button>
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded text-sm"
              style={{ color: 'var(--ink-2)', border: '1px solid var(--rule)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
