import { useState } from 'react';
import type { useAIChat } from '../hooks/useAIChat';
import type { ImportAction } from '../lib/documentImport';
import { entityMeta } from '../lib/documentImport';
import { useCampaign } from '../context/CampaignContext';

type AIChatInstance = ReturnType<typeof useAIChat>;

interface Props {
  chat: AIChatInstance;
  onClose: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const entityGlyph: Record<string, string> = {
  upsertNPC:              '◇',
  upsertPC:               '◈',
  upsertLocation:         '⬡',
  upsertFaction:          '⚑',
  upsertHook:             '↯',
  upsertLore:             '✦',
  upsertModule:           '▣',
  upsertSubmodule:        '▪',
  upsertScene:            '▸',
  upsertRelationship:     '⟷',
  upsertMonsterStatblock: '☠',
  upsertSession:          '◉',
};

const badgeColors: Record<string, { bg: string; text: string; border: string }> = {
  gold:   { bg: '#2a2418', text: 'var(--gold)', border: '#5a4a20' },
  green:  { bg: '#1a2a1a', text: '#6ab87a', border: '#2a5a2a' },
  red:    { bg: '#3a1a1a', text: '#e05c5c', border: '#6a2a2a' },
  blue:   { bg: '#1a2a3a', text: '#70a0e0', border: '#2a4a7a' },
  muted:  { bg: 'var(--paper)', text: 'var(--ink-2)', border: 'var(--rule)' },
  yellow: { bg: '#2a2a1a', text: '#d0c060', border: '#6a6020' },
  orange: { bg: '#3a2010', text: '#e09050', border: '#7a4a20' },
};

const hiddenFields = new Set([
  'faction_ids', 'statblock_id', 'module_id', 'submodule_id', 'sort_order',
  'from_id', 'from_kind', 'to_id', 'to_kind', 'linked_monster_ids',
  'linked_encounter_ids', 'campaign_id', 'id',
]);

function fieldLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Column 2: Action row ──────────────────────────────────────────────────

function ActionRow({
  action,
  accepted,
  selected,
  onToggle,
  onSelect,
  disabled,
  applied,
  failed,
}: {
  action: ImportAction;
  accepted: boolean;
  selected: boolean;
  onToggle: () => void;
  onSelect: () => void;
  disabled: boolean;
  applied: boolean;
  failed: boolean;
}) {
  const meta = entityMeta[action.type];
  const payload = action.payload as Record<string, unknown>;
  const name = String(payload[meta.nameField] ?? '(unnamed)');
  const verb = action.matched_id ? 'UPDATE' : 'CREATE';
  const bc = badgeColors[meta.badgeColor] ?? badgeColors.muted;

  const desc = String(
    payload.description ?? payload.summary ?? payload.content ??
    payload.background ?? payload.synopsis ?? payload.overview ?? ''
  );
  const shortDesc = desc.length > 70 ? desc.slice(0, 67) + '…' : desc;

  const statusColor = applied ? '#6ab87a' : failed ? '#e05c5c' : null;

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '9px 12px',
        borderRadius: 6,
        backgroundColor: selected ? 'var(--paper-2, #1e1c2a)' : 'transparent',
        border: `1px solid ${selected ? 'var(--gold)' : 'transparent'}`,
        opacity: accepted ? 1 : 0.4,
        cursor: 'pointer',
        transition: 'background-color 0.1s, border-color 0.1s, opacity 0.15s',
      }}
    >
      <input
        type="checkbox"
        checked={accepted}
        disabled={disabled}
        onChange={onToggle}
        onClick={e => e.stopPropagation()}
        style={{ accentColor: 'var(--gold)', flexShrink: 0, cursor: disabled ? 'default' : 'pointer' }}
      />
      <span style={{
        fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 700,
        letterSpacing: '0.08em', padding: '2px 5px', borderRadius: 3,
        backgroundColor: bc.bg, color: bc.text, border: `1px solid ${bc.border}`,
        flexShrink: 0,
      }}>
        {verb}
      </span>
      <span style={{ color: statusColor ?? 'var(--gold)', fontSize: 11, flexShrink: 0 }}>
        {applied ? '✓' : failed ? '✕' : (entityGlyph[action.type] ?? '◇')}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--serif)', fontSize: 13, color: statusColor ?? 'var(--ink)',
          fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {name}
        </div>
        {shortDesc && (
          <div style={{
            fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1,
          }}>
            {shortDesc}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Column 3: Detail pane ─────────────────────────────────────────────────

function DetailPane({ action }: { action: ImportAction }) {
  const campaign = useCampaign();
  const meta = entityMeta[action.type];
  const bc = badgeColors[meta.badgeColor] ?? badgeColors.muted;
  const payload = action.payload as Record<string, unknown>;
  const name = String(payload[meta.nameField] ?? '(unnamed)');
  const verb = action.matched_id ? 'UPDATE' : 'CREATE';

  // Look up existing entity for diff
  const lookupList: Array<{ id: string } & Record<string, unknown>> = (() => {
    switch (action.type) {
      case 'upsertNPC':      return campaign.npcs as never;
      case 'upsertPC':       return campaign.pcs as never;
      case 'upsertLocation': return campaign.locations as never;
      case 'upsertFaction':  return campaign.factions as never;
      case 'upsertHook':     return campaign.hooks as never;
      case 'upsertLore':     return campaign.lore as never;
      case 'upsertModule':   return campaign.modules as never;
      case 'upsertSubmodule':return campaign.submodules as never;
      case 'upsertScene':    return campaign.scenes as never;
      case 'upsertMonsterStatblock': return campaign.monsterStatblocks as never;
      default: return [];
    }
  })();

  const existing = action.matched_id
    ? (lookupList.find(e => e.id === action.matched_id) ?? null)
    : null;

  // Build field rows: all payload fields that aren't hidden
  const fields = Object.entries(payload).filter(([key]) => !hiddenFields.has(key));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Detail header */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{
            fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 700,
            letterSpacing: '0.08em', padding: '2px 6px', borderRadius: 3,
            backgroundColor: bc.bg, color: bc.text, border: `1px solid ${bc.border}`,
          }}>
            {verb}
          </span>
          <span style={{ color: 'var(--gold)', fontSize: 13 }}>
            {entityGlyph[action.type] ?? '◇'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {meta.label}
          </span>
        </div>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--ink)', fontWeight: 500 }}>
          {name}
        </div>
        {action.matched_id && existing && (
          <div style={{ fontSize: 11, color: '#70a0e0', marginTop: 4 }}>
            ↺ Updating existing entry
          </div>
        )}
        {!action.matched_id && (
          <div style={{ fontSize: 11, color: '#6ab87a', marginTop: 4 }}>
            + New entry
          </div>
        )}
        {action.reasoning && (
          <div style={{
            marginTop: 8, fontSize: 12, color: 'var(--ink-2)',
            fontStyle: 'italic', lineHeight: 1.5,
            padding: '6px 10px', backgroundColor: 'var(--paper)',
            borderRadius: 5, border: '1px solid var(--rule)',
          }}>
            {action.reasoning}
          </div>
        )}
      </div>

      {/* Fields */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {fields.length === 0 && (
          <div style={{ color: 'var(--ink-3)', fontSize: 13, fontStyle: 'italic' }}>No field details available.</div>
        )}
        {fields.map(([key, newValue]) => {
          const oldValue = existing ? (existing as Record<string, unknown>)[key] : undefined;
          const hasChange = existing && String(oldValue ?? '') !== String(newValue ?? '');
          const isNew = !existing;

          return (
            <div key={key}>
              <div style={{
                fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--gold)',
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, fontWeight: 600,
              }}>
                {fieldLabel(key)}
              </div>

              {/* Old value (only for updates where it changed) */}
              {hasChange && oldValue != null && oldValue !== '' && (
                <div style={{
                  fontSize: 12, color: 'var(--ink-3)', textDecoration: 'line-through',
                  marginBottom: 4, lineHeight: 1.5, wordBreak: 'break-word',
                }}>
                  {String(oldValue)}
                </div>
              )}

              {/* New value */}
              <div style={{
                fontSize: 13, color: isNew || hasChange ? 'var(--ink)' : 'var(--ink-2)',
                lineHeight: 1.6, wordBreak: 'break-word',
                padding: '6px 10px',
                backgroundColor: isNew || hasChange ? 'var(--paper)' : 'transparent',
                borderRadius: 4,
                border: isNew || hasChange ? '1px solid var(--rule)' : 'none',
              }}>
                {newValue == null || newValue === ''
                  ? <span style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>(empty)</span>
                  : typeof newValue === 'boolean'
                    ? (newValue ? 'Yes' : 'No')
                    : String(newValue)
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ProposalsInbox({ chat, onClose }: Props) {
  const { messages, handleApplyImport, dismissImportActions } = chat;

  const groups = messages
    .map((m, idx) => ({ m, idx }))
    .filter(({ m }) => m.role === 'assistant' && m.importActions && m.importActions.length > 0)
    .map(({ m, idx }) => {
      const msg = m as Extract<typeof m, { role: 'assistant' }>;
      return {
        idx,
        title: msg.proposalTitle ?? `${msg.importActions!.length} proposed change${msg.importActions!.length === 1 ? '' : 's'}`,
        source: msg.proposalSource ?? 'Campaign Assistant',
        timestamp: msg.proposalTimestamp ?? 0,
        actions: msg.importActions!,
        applyState: msg.importApplyState ?? { phase: 'pending_confirmation' as const, appliedActionIds: [], failedActionIds: [] },
      };
    });

  const [selectedGroup, setSelectedGroup] = useState(groups.length > 0 ? 0 : -1);
  const [selectedAction, setSelectedAction] = useState<string | null>(
    groups[0]?.actions[0]?.action_id ?? null,
  );
  const [accepted, setAccepted] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of groups) for (const a of g.actions) init[a.action_id] = true;
    return init;
  });

  const group = selectedGroup >= 0 ? groups[selectedGroup] : null;
  const isDone = group?.applyState.phase === 'done';
  const isApplying = group?.applyState.phase === 'applying';
  const appliedIds = new Set(group?.applyState.appliedActionIds ?? []);
  const failedIds = new Set(group?.applyState.failedActionIds ?? []);

  const selectedCount = group
    ? group.actions.filter(a => accepted[a.action_id] && !appliedIds.has(a.action_id)).length
    : 0;

  const detailAction = group?.actions.find(a => a.action_id === selectedAction) ?? group?.actions[0] ?? null;

  function selectGroup(i: number) {
    setSelectedGroup(i);
    setSelectedAction(groups[i]?.actions[0]?.action_id ?? null);
  }

  async function handleApply() {
    if (!group || selectedCount === 0) return;
    const toApply = group.actions.filter(a => accepted[a.action_id] && !appliedIds.has(a.action_id));
    await handleApplyImport(group.idx, toApply);
  }

  function handleDismiss() {
    if (!group) return;
    dismissImportActions(group.idx);
    const remaining = groups.filter((_, i) => i !== selectedGroup);
    const next = remaining.length > 0 ? 0 : -1;
    setSelectedGroup(next);
    setSelectedAction(remaining[0]?.actions[0]?.action_id ?? null);
  }

  if (groups.length === 0) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }} onClick={onClose}>
        <div style={{
          backgroundColor: 'var(--bg)', border: '1px solid var(--rule)', borderRadius: 10,
          padding: '48px 40px', textAlign: 'center', color: 'var(--ink-3)',
          fontFamily: 'var(--serif)', fontSize: 15,
        }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 28, marginBottom: 12, color: 'var(--gold)' }}>✦</div>
          No pending proposals
          <div style={{ marginTop: 24 }}>
            <button onClick={onClose} style={{
              fontSize: 13, color: 'var(--ink-2)', background: 'none',
              border: '1px solid var(--rule)', borderRadius: 6, padding: '6px 16px', cursor: 'pointer',
            }}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        backgroundColor: 'var(--bg)', border: '1px solid var(--rule)', borderRadius: 10,
        width: 'min(1200px, 96vw)', height: 'min(720px, 90vh)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={{
          padding: '16px 24px 12px', borderBottom: '1px solid var(--rule)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>
              Campaign Assistant
            </div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--ink)', fontWeight: 400 }}>
              Proposals inbox
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {group && !isDone && (
              <>
                <button onClick={handleDismiss} disabled={isApplying} style={{
                  background: 'none', border: '1px solid var(--rule)', borderRadius: 6,
                  color: 'var(--ink-2)', fontSize: 13, padding: '6px 16px',
                  cursor: isApplying ? 'default' : 'pointer', opacity: isApplying ? 0.5 : 1,
                }}>
                  Dismiss
                </button>
                <button onClick={handleApply} disabled={isApplying || selectedCount === 0} style={{
                  backgroundColor: 'var(--gold)', color: 'var(--bg)', border: 'none',
                  borderRadius: 6, fontSize: 13, fontWeight: 700, padding: '6px 18px',
                  cursor: isApplying || selectedCount === 0 ? 'default' : 'pointer',
                  opacity: isApplying || selectedCount === 0 ? 0.6 : 1,
                }}>
                  {isApplying ? 'Applying…' : `Apply ${selectedCount} change${selectedCount === 1 ? '' : 's'}`}
                </button>
              </>
            )}
            {isDone && (
              <span style={{ fontSize: 13, color: '#6ab87a', fontWeight: 600 }}>
                ✓ Applied {appliedIds.size} of {group!.actions.length}
                {failedIds.size > 0 && <span style={{ color: '#e05c5c', marginLeft: 8 }}>({failedIds.size} failed)</span>}
              </span>
            )}
            <button onClick={onClose} style={{
              background: 'none', border: '1px solid var(--rule)', borderRadius: 6,
              color: 'var(--ink-2)', fontSize: 16, cursor: 'pointer', padding: '2px 10px',
            }}>
              ×
            </button>
          </div>
        </div>

        {/* ── Three columns ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Col 1 — Proposal groups */}
          <div style={{
            width: 240, flexShrink: 0, borderRight: '1px solid var(--rule)',
            overflowY: 'auto', padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 3,
          }}>
            {groups.map((g, i) => {
              const done = g.applyState.phase === 'done';
              const isSel = i === selectedGroup;
              return (
                <button key={g.idx} onClick={() => selectGroup(i)} style={{
                  background: isSel ? 'var(--paper)' : 'none',
                  border: `1px solid ${isSel ? 'var(--rule)' : 'transparent'}`,
                  borderRadius: 6, padding: '9px 10px', textAlign: 'left',
                  cursor: 'pointer', width: '100%',
                }}>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: 13, color: 'var(--ink)', fontWeight: 500, marginBottom: 2, lineHeight: 1.3 }}>
                    {g.title}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 5 }}>
                    {g.source}{g.timestamp ? ` · ${relativeTime(g.timestamp)}` : ''}
                  </div>
                  <span style={{
                    display: 'inline-block', fontSize: 9, fontFamily: 'var(--mono)',
                    fontWeight: 700, letterSpacing: '0.08em', padding: '2px 6px', borderRadius: 3,
                    ...(done
                      ? { backgroundColor: '#1a2a1a', color: '#6ab87a', border: '1px solid #2a5a2a' }
                      : { backgroundColor: '#2a2418', color: 'var(--gold)', border: '1px solid #5a4a20' }),
                  }}>
                    {done ? 'APPLIED' : `${g.actions.length} PENDING`}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Col 2 — Action list */}
          {group && (
            <div style={{
              width: 300, flexShrink: 0, borderRight: '1px solid var(--rule)',
              overflowY: 'auto', padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              <div style={{ padding: '4px 4px 8px', fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic' }}>
                {group.source}{group.timestamp ? ` · ${relativeTime(group.timestamp)}` : ''}{' · '}{group.actions.length} change{group.actions.length === 1 ? '' : 's'}
              </div>
              {group.actions.map(action => {
                const isApplied = appliedIds.has(action.action_id);
                const isFailed = failedIds.has(action.action_id);
                return (
                  <ActionRow
                    key={action.action_id}
                    action={action}
                    accepted={accepted[action.action_id] ?? true}
                    selected={selectedAction === action.action_id}
                    disabled={isDone || isApplying || isApplied || isFailed}
                    applied={isApplied}
                    failed={isFailed}
                    onToggle={() => setAccepted(prev => ({ ...prev, [action.action_id]: !prev[action.action_id] }))}
                    onSelect={() => setSelectedAction(action.action_id)}
                  />
                );
              })}
            </div>
          )}

          {/* Col 3 — Field detail */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {detailAction
              ? <DetailPane action={detailAction} />
              : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink-3)', fontSize: 13, fontStyle: 'italic' }}>
                  Select a change to see details
                </div>
              )
            }
          </div>

        </div>
      </div>
    </div>
  );
}
