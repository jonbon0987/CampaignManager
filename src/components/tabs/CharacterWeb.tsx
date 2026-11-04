import { useEffect, useMemo, useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useOpenRecord, useReportRecord } from '../../context/NavigationContext';
import { currentRoute } from '../../hooks/useRouteSync';
import { Modal } from '../Modal';
import { FormField, inputStyle } from '../FormField';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
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
const SVG_H = 640;
const CX = SVG_W / 2;
const CY = SVG_H / 2;
const RING_R: Record<CharacterKind, number> = { pc: 96, npc: 186, faction: 272 };
const RING_LABEL: Record<CharacterKind, string> = { pc: 'PARTY', npc: 'CAST', faction: 'FACTIONS' };
const KIND_NAME: Record<CharacterKind, string> = { pc: 'Player character', npc: 'NPC', faction: 'Faction' };
const KINDS: CharacterKind[] = ['pc', 'npc', 'faction'];
// Each ring leaves a gap at the top for its label, so no node lands on it.
const LABEL_GAP = 0.32;
// Each ring is turned a little, so small rings don't line up in one spoke.
const RING_TURN: Record<CharacterKind, number> = { pc: 0, npc: 0.17, faction: 0.33 };

function shortLabel(name: string) {
  const parts = name.trim().replace(/^the\s+/i, '').split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 8);
  return parts[0].slice(0, 6);
}

/** A faction's node is a hexagon, so it reads as one without relying on colour. */
const hexagon = (r: number) => Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
  return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
}).join(' ');

/** Who belongs to what, from the characters' factions and the factions' key figures. */
function membershipsOf(
  pcs: { id: string; faction_ids: string[] | null }[],
  npcs: { id: string; faction_ids: string[] | null }[],
  factions: { id: string; key_figure_ids?: string[] | null }[],
) {
  const seen = new Set<string>();
  const out: { memberId: string; factionId: string }[] = [];
  const add = (memberId: string, factionId: string) => {
    const key = `${memberId}:${factionId}`;
    if (!seen.has(key)) { seen.add(key); out.push({ memberId, factionId }); }
  };
  for (const c of [...pcs, ...npcs]) for (const f of c.faction_ids ?? []) add(c.id, f);
  for (const f of factions) for (const n of f.key_figure_ids ?? []) add(n, f.id);
  return out;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function CharacterWeb({ openId, onOpenConsumed }: { openId?: string | null; onOpenConsumed?: () => void } = {}) {
  const { pcs, npcs, factions, relationships, upsertRelationship, deleteRelationship } = useCampaign();
  const confirm = useConfirm();
  const openRecord = useOpenRecord();

  // Starts on the record in the URL, so switching from the list keeps your place.
  const [focus, setFocus] = useState<string | null>(() => {
    const r = currentRoute();
    return r?.scope === 'campaign' && r.tab === 'cast' ? r.recordId ?? null : null;
  });
  useReportRecord('cast', focus);
  useEffect(() => {
    if (!openId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- following a request from outside the tab (search, Back)
    setFocus(openId);
    onOpenConsumed?.();
  }, [openId, onOpenConsumed]);

  const [metOnly, setMetOnly] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [hidden, setHidden] = useState<Record<RelationshipType, boolean>>({
    ally: false, rival: false, foe: false, neutral: true,
  });

  // ── visible nodes & layout ─────────────────────────────────────────────────

  const allNodes = useMemo(() => [
    ...pcs.map(p  => ({ id: p.id, kind: 'pc'  as CharacterKind, label: p.character_name, met: true })),
    ...npcs.map(n => ({ id: n.id, kind: 'npc' as CharacterKind, label: n.name,           met: !!n.met_by_pcs })),
    ...factions.map(f => ({ id: f.id, kind: 'faction' as CharacterKind, label: f.name,   met: true })),
  ], [pcs, npcs, factions]);

  const visibleNodes = useMemo(() =>
    allNodes.filter(n => !(n.kind === 'npc' && metOnly && !n.met)),
    [allNodes, metOnly],
  );

  const layout = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const kind of KINDS) {
      const ring = visibleNodes.filter(n => n.kind === kind);
      const sweep = Math.PI * 2 - LABEL_GAP * 2;
      ring.forEach((n, i) => {
        const a = -Math.PI / 2 + LABEL_GAP + (i + 0.5 + RING_TURN[kind]) * (sweep / ring.length);
        positions[n.id] = { x: CX + Math.cos(a) * RING_R[kind], y: CY + Math.sin(a) * RING_R[kind] };
      });
    }
    return positions;
  }, [visibleNodes]);

  const visibleIds = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes]);

  const visibleEdges = useMemo(() =>
    relationships.filter(r =>
      visibleIds.has(r.from_id) && visibleIds.has(r.to_id) && !hidden[r.relationship_type]
    ),
    [relationships, visibleIds, hidden],
  );

  const members = useMemo(
    () => membershipsOf(pcs, npcs, factions).filter(m => visibleIds.has(m.memberId) && visibleIds.has(m.factionId)),
    [pcs, npcs, factions, visibleIds],
  );

  // ── focus / adjacency ──────────────────────────────────────────────────────

  const focusedEdges = focus
    ? visibleEdges.filter(e => e.from_id === focus || e.to_id === focus)
    : [];

  const focusedNode = visibleNodes.find(n => n.id === focus) ?? null;
  const focusedMembers = focus ? members.filter(m => m.memberId === focus || m.factionId === focus) : [];

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
    ...factions.map(f => ({ id: f.id, kind: 'faction' as CharacterKind, name: f.name })),
  ], [pcs, npcs, factions]);

  function openAdd() {
    setEditingId(null);
    // Starts from the one in focus, if any.
    const from = allChars.find(c => c.id === focus) ?? allChars[0];
    const to = allChars.find(c => c.id !== from?.id);
    setRelForm({
      from_id:   from?.id ?? '',
      from_kind: from?.kind ?? 'pc',
      to_id:     to?.id ?? '',
      to_kind:   to?.kind ?? 'npc',
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
      <PageHeader className="cw-head" eyebrow="Cast" title="Relationship web">
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
          <button className={`cw-legend ${showMembers ? '' : 'is-off'}`} onClick={() => setShowMembers(v => !v)}>
            <span className="cw-legend-line is-member" />
            Members
          </button>
          {focus && (
            <>
              <span className="cm-filter-sep" />
              <button className="cw-clear" onClick={() => setFocus(null)}>Clear focus ✕</button>
            </>
          )}
          <span className="cm-filter-sep" />
          <Button variant="secondary" size="xs" onClick={openAdd}>
            + Add relationship
          </Button>
        </div>
      </PageHeader>

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
              {KINDS.filter(k => visibleNodes.some(n => n.kind === k)).map(k => (
                <g key={k}>
                  <circle cx={CX} cy={CY} r={RING_R[k]} className="cw-ring" />
                  <text x={CX} y={CY - RING_R[k] + 3} textAnchor="middle" className="cw-ring-label">{RING_LABEL[k]}</text>
                </g>
              ))}

              {/* Who belongs to what: dashed, and not a relationship to edit */}
              {showMembers && members.map(m => {
                const a = layout[m.memberId];
                const b = layout[m.factionId];
                if (!a || !b) return null;
                const isFocused = focus && (m.memberId === focus || m.factionId === focus);
                return (
                  <line key={`${m.memberId}:${m.factionId}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    className={`cw-member ${focus && !isFocused ? 'is-dim' : ''}`} />
                );
              })}

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
                const r = n.kind === 'pc' ? 26 : n.kind === 'faction' ? 25 : 22;
                const isDim   = focus && focus !== n.id;
                const isFocus = n.id === focus;
                const toggle = () => setFocus(isFocus ? null : n.id);
                return (
                  <g
                    key={n.id}
                    transform={`translate(${p.x},${p.y})`}
                    className={`cw-node cw-node-${n.kind} ${isDim ? 'is-dim' : ''} ${isFocus ? 'is-focus' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${n.label || 'Unnamed'}, ${KIND_NAME[n.kind]}`}
                    aria-pressed={isFocus}
                    onClick={toggle}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
                  >
                    {n.kind === 'faction' ? (
                      <>
                        <polygon points={hexagon(r)} className="cw-node-bg" />
                        <polygon points={hexagon(r)} className="cw-node-ring" />
                      </>
                    ) : (
                      <>
                        <circle r={r} className="cw-node-bg" />
                        <circle r={r} className="cw-node-ring" />
                      </>
                    )}
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
          {!focusedNode ? (
            relationships.length === 0 && allNodes.length > 0 ? (
              <div className="cw-empty">
                <div className="cw-empty-glyph">◇</div>
                <div className="cw-empty-title">No relationships yet</div>
                <div className="cw-empty-sub">Connect two characters or factions: who owes whom, who wants whom dead. Or click one to start from them.</div>
                {allNodes.length > 1 && <div className="cw-empty-action"><Button variant="primary" size="sm" onClick={openAdd}>Add the first relationship</Button></div>}
              </div>
            ) : (
              <div className="cw-empty">
                <div className="cw-empty-glyph">◇</div>
                <div className="cw-empty-title">Click any character or faction</div>
                <div className="cw-empty-sub">to focus their relationships and see incoming and outgoing ties.</div>
              </div>
            )
          ) : (
            <>
              <div>
                <div className="cw-side-eyebrow">{KIND_NAME[focusedNode.kind]}</div>
                <h3 className="cw-side-title">{focusedNode.label}</h3>
                <Button variant="link" onClick={() => openRecord('cast', focusedNode.id)}>Open their page</Button>
              </div>

              {focusedMembers.length > 0 && (
                <div className="cw-rels">
                  <div className="cw-rels-head">{focusedNode.kind === 'faction' ? `Members (${focusedMembers.length})` : `Belongs to (${focusedMembers.length})`}</div>
                  {focusedMembers.map(m => {
                    const otherId = m.factionId === focus ? m.memberId : m.factionId;
                    return (
                      <button key={otherId} className="cw-rel" style={{ '--rel-color': 'var(--sky)' } as React.CSSProperties} onClick={() => setFocus(otherId)}>
                        <div className="cw-rel-row"><span className="cw-rel-name">{visibleNodes.find(n => n.id === otherId)?.label ?? otherId}</span></div>
                      </button>
                    );
                  })}
                </div>
              )}

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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={ev => { ev.stopPropagation(); openEdit(e.id); }}
                            style={{ padding: '2px 8px', fontSize: 11, borderRadius: 'var(--radius)' }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={ev => { ev.stopPropagation(); handleDelete(e.id); }}
                            style={{ padding: '2px 6px', fontSize: 11, borderRadius: 'var(--radius)', color: 'var(--accent)' }}
                          >
                            ✕
                          </Button>
                        </div>
                      </div>
                      {e.label && <div className="cw-rel-label">{e.label}</div>}
                    </button>
                  );
                })}
              </div>

              <div className="cw-actions">
                <Button variant="secondary" size="sm" onClick={openAdd}>
                  + Add relationship
                </Button>
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
                  <option key={c.id} value={c.id}>{c.name} ({KIND_NAME[c.kind]})</option>
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
                  <option key={c.id} value={c.id}>{c.name} ({KIND_NAME[c.kind]})</option>
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
