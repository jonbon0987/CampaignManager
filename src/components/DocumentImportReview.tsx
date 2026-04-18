// Review panel for AI-parsed document import actions.
//
// Rendered inline inside the AIAssistant panel when an assistant message has
// importActions attached. Shows one card per proposed create/update, with
// field-level old→new diff rows, per-card accept/reject, inline editing,
// and a "Match to…" override dropdown for changing which existing entity is
// being updated.

import { useMemo, useState } from 'react';
import { useCampaign } from '../context/CampaignContext';
import {
  type ImportAction,
  entityMeta,
  describeAction,
  fuzzyMatchByName,
} from '../lib/documentImport';
import { Badge } from './ui/Badge';
import { inputStyle, textareaStyle } from './FormField';

// ── Field label + type metadata (kept minimal — just what we need to render) ──

const longTextFields = new Set([
  'summary', 'description', 'content', 'synopsis', 'history', 'overview',
  'agenda', 'key_figures', 'combats', 'loot_rewards', 'hooks_notes',
  'story_hooks', 'key_npcs', 'background', 'hooks_motivations', 'encounters',
  'rewards', 'dm_notes', 'dm_only_notes',
]);

const booleanFields = new Set(['met_by_pcs', 'is_active', 'dm_only']);

// Fields we never show in the diff UI (foreign keys, internal refs, arrays
// that are handled separately, etc.)
const hiddenFields = new Set([
  'faction_ids', 'statblock_id', 'module_id', 'submodule_id', 'sort_order',
  'from_id', 'from_kind', 'to_id', 'to_kind', 'linked_monster_ids', 'linked_encounter_ids',
]);

function fieldLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface DiffRow {
  key: string;
  oldValue: unknown;
  newValue: unknown;
}

// Compute which fields changed between the current entity (or empty for
// creates) and the AI-proposed payload.
function computeDiffRows(currentEntity: Record<string, unknown> | null, payload: Record<string, unknown>): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const [key, newValue] of Object.entries(payload)) {
    if (hiddenFields.has(key)) continue;
    const oldValue = currentEntity?.[key] ?? null;
    // Skip rows where nothing actually changed.
    const oldStr = oldValue == null ? '' : String(oldValue);
    const newStr = newValue == null ? '' : String(newValue);
    if (oldStr === newStr) continue;
    rows.push({ key, oldValue, newValue });
  }
  return rows;
}

// ── Per-card component ────────────────────────────────────────────────────

interface CardProps {
  action: ImportAction;
  accepted: boolean;
  onToggle: () => void;
  onEditPayload: (nextPayload: Record<string, unknown>) => void;
  onChangeMatch: (matchedId: string | null) => void;
  applying: boolean;
  applied: boolean;
  failed: boolean;
}

function ImportEntityCard({
  action,
  accepted,
  onToggle,
  onEditPayload,
  onChangeMatch,
  applying,
  applied,
  failed,
}: CardProps) {
  const campaign = useCampaign();
  const meta = entityMeta[action.type];

  // Look up the current entity for diff rendering + dropdown options.
  // Each entity type draws from the matching CampaignContext list.
  const { currentEntity, matchCandidates } = useMemo(() => {
    const lookupList: Array<{ id: string; name?: string; title?: string; character_name?: string }> = (() => {
      switch (action.type) {
        case 'upsertNPC':      return campaign.npcs;
        case 'upsertPC':       return campaign.pcs;
        case 'upsertLocation': return campaign.locations;
        case 'upsertFaction':  return campaign.factions;
        case 'upsertHook':     return campaign.hooks;
        case 'upsertLore':     return campaign.lore;
        case 'upsertModule':   return campaign.modules;
        case 'upsertSession':  return campaign.sessions.map(s => ({ id: s.id, title: `Session #${s.session_number}` }));
        case 'upsertSubmodule':return campaign.submodules;
        case 'upsertScene':    return campaign.scenes;
        case 'upsertRelationship': return [];
        case 'upsertMonsterStatblock': return campaign.monsterStatblocks;
      }
    })();

    const current = action.matched_id
      ? (lookupList.find(e => e.id === action.matched_id) ?? null) as Record<string, unknown> | null
      : null;

    const payload = action.payload as Record<string, unknown>;
    const queryName = String(payload[meta.nameField] ?? '');
    const candidates = fuzzyMatchByName(queryName, lookupList, 5);

    return { currentEntity: current, matchCandidates: candidates };
  }, [action, campaign, meta.nameField]);

  const payload = action.payload as Record<string, unknown>;
  const diffRows = computeDiffRows(currentEntity, payload);

  const matchLabel = action.matched_id ? 'Matched existing' : 'New entry';
  const statusTint = applied
    ? { bg: '#1a2a1a', border: '#2a5a2a', label: '✓ Applied' }
    : failed
      ? { bg: '#3a1a1a', border: '#6a2a2a', label: '✕ Failed' }
      : null;

  return (
    <div
      style={{
        border: `1px solid ${statusTint?.border ?? (accepted ? '#3a3660' : '#2e2c4a')}`,
        borderRadius: '8px',
        backgroundColor: statusTint?.bg ?? (accepted ? '#1a1828' : '#141220'),
        padding: '12px',
        opacity: accepted || applied ? 1 : 0.55,
        transition: 'opacity 0.15s, border-color 0.15s',
      }}
    >
      {/* Header row: checkbox, badge, title, match indicator */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <input
          type="checkbox"
          checked={accepted}
          onChange={onToggle}
          disabled={applying || applied}
          style={{ marginTop: '4px', accentColor: '#c9a84c', cursor: applying || applied ? 'default' : 'pointer' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <Badge label={meta.label} color={meta.badgeColor} size="xs" />
            <span style={{ color: '#e8d5b0', fontWeight: 600, fontSize: '13px' }}>
              {describeAction(action)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
            <span
              style={{
                fontSize: '10px',
                color: action.matched_id ? '#70a0e0' : '#6ab87a',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: 600,
              }}
            >
              {action.matched_id ? '↺' : '+'} {matchLabel}
            </span>
            {statusTint && (
              <span style={{ fontSize: '10px', color: statusTint.label.startsWith('✓') ? '#6ab87a' : '#e05c5c' }}>
                {statusTint.label}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Reasoning */}
      {action.reasoning && (
        <div
          style={{
            marginTop: '8px',
            marginLeft: '26px',
            fontSize: '11px',
            color: '#9990b0',
            fontStyle: 'italic',
            lineHeight: 1.5,
          }}
        >
          {action.reasoning}
        </div>
      )}

      {/* Match override (not for relationships, which have no lookup list) */}
      {action.type !== 'upsertRelationship' && matchCandidates.length > 0 && !applied && (
        <div style={{ marginTop: '10px', marginLeft: '26px' }}>
          <label style={{ fontSize: '10px', color: '#6a6490', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Match to
          </label>
          <select
            value={action.matched_id ?? ''}
            disabled={applying}
            onChange={e => onChangeMatch(e.target.value || null)}
            style={{
              ...inputStyle,
              marginTop: '4px',
              padding: '6px 8px',
              fontSize: '12px',
              cursor: applying ? 'default' : 'pointer',
            }}
          >
            <option value="">+ Create new</option>
            {matchCandidates.map(c => {
              const label = (c as { name?: string; title?: string; character_name?: string }).name
                ?? (c as { name?: string; title?: string; character_name?: string }).title
                ?? (c as { name?: string; title?: string; character_name?: string }).character_name
                ?? '(unnamed)';
              return (
                <option key={c.id} value={c.id}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {/* Diff rows */}
      {diffRows.length > 0 && (
        <div style={{ marginTop: '10px', marginLeft: '26px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {diffRows.map(row => (
            <DiffRowEditor
              key={row.key}
              row={row}
              disabled={applying || applied}
              onChange={nextValue => {
                onEditPayload({ ...payload, [row.key]: nextValue });
              }}
            />
          ))}
        </div>
      )}

      {diffRows.length === 0 && !applied && (
        <div style={{ marginTop: '10px', marginLeft: '26px', fontSize: '11px', color: '#6a6490' }}>
          No field changes vs current entity.
        </div>
      )}
    </div>
  );
}

// ── Diff row editor ───────────────────────────────────────────────────────

interface DiffRowEditorProps {
  row: DiffRow;
  disabled: boolean;
  onChange: (next: unknown) => void;
}

function DiffRowEditor({ row, disabled, onChange }: DiffRowEditorProps) {
  const isLongText = longTextFields.has(row.key);
  const isBoolean = booleanFields.has(row.key);
  const label = fieldLabel(row.key);

  const oldDisplay =
    row.oldValue == null || row.oldValue === ''
      ? <span style={{ color: '#4a4470' }}>(empty)</span>
      : <span>{String(row.oldValue)}</span>;

  return (
    <div>
      <div
        style={{
          fontSize: '10px',
          color: '#c9a84c',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '4px',
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '11px',
          color: '#6a6490',
          textDecoration: 'line-through',
          marginBottom: '4px',
          wordBreak: 'break-word',
        }}
      >
        {oldDisplay}
      </div>
      {isBoolean ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#e8d5b0', fontSize: '12px' }}>
          <input
            type="checkbox"
            checked={!!row.newValue}
            disabled={disabled}
            onChange={e => onChange(e.target.checked)}
            style={{ accentColor: '#c9a84c' }}
          />
          {row.newValue ? 'true' : 'false'}
        </label>
      ) : isLongText ? (
        <textarea
          value={String(row.newValue ?? '')}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          style={{ ...textareaStyle, fontSize: '12px', minHeight: '60px' }}
          rows={3}
        />
      ) : (
        <input
          type="text"
          value={String(row.newValue ?? '')}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle, fontSize: '12px', padding: '6px 8px' }}
        />
      )}
    </div>
  );
}

// ── Main review panel ─────────────────────────────────────────────────────

interface Props {
  actions: ImportAction[];
  onApply: (selected: ImportAction[]) => Promise<void>;
  onDismiss: () => void;
  applyState: {
    phase: 'idle' | 'applying' | 'done';
    appliedActionIds: Set<string>;
    failedActionIds: Set<string>;
  };
}

export default function DocumentImportReview({ actions, onApply, onDismiss, applyState }: Props) {
  // UI state keyed by action_id
  const [accepted, setAccepted] = useState<Record<string, boolean>>(
    () => Object.fromEntries(actions.map(a => [a.action_id, true])),
  );
  const [edited, setEdited] = useState<Record<string, ImportAction>>({});

  // Resolve the effective current-state action for each entry (either edited
  // or the original). Edits include matched_id overrides + payload edits.
  const effectiveActions = useMemo(
    () => actions.map(a => edited[a.action_id] ?? a),
    [actions, edited],
  );

  const applying = applyState.phase === 'applying';
  const selectedCount = effectiveActions.filter(a => accepted[a.action_id]).length;

  function updateAction(actionId: string, updater: (current: ImportAction) => ImportAction) {
    setEdited(prev => {
      const base = prev[actionId] ?? actions.find(a => a.action_id === actionId)!;
      return { ...prev, [actionId]: updater(base) };
    });
  }

  async function handleApply() {
    const selected = effectiveActions.filter(a => accepted[a.action_id]);
    if (selected.length === 0) return;
    await onApply(selected);
  }

  return (
    <div style={{ marginTop: '12px', borderTop: '1px solid #3a3660', paddingTop: '10px' }}>
      <div style={{ color: '#9990b0', fontSize: '12px', marginBottom: '10px' }}>
        Proposed changes ({actions.length}):
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {effectiveActions.map(action => {
          const isAccepted = accepted[action.action_id] ?? true;
          const isApplied = applyState.appliedActionIds.has(action.action_id);
          const isFailed = applyState.failedActionIds.has(action.action_id);
          return (
            <ImportEntityCard
              key={action.action_id}
              action={action}
              accepted={isAccepted}
              applying={applying}
              applied={isApplied}
              failed={isFailed}
              onToggle={() => {
                if (applying || isApplied) return;
                setAccepted(prev => ({ ...prev, [action.action_id]: !isAccepted }));
              }}
              onEditPayload={nextPayload => {
                updateAction(action.action_id, curr => ({
                  ...curr,
                  payload: nextPayload as ImportAction['payload'],
                } as ImportAction));
              }}
              onChangeMatch={matchedId => {
                updateAction(action.action_id, curr => ({ ...curr, matched_id: matchedId }));
              }}
            />
          );
        })}
      </div>

      {applyState.phase === 'done' ? (
        <div style={{ marginTop: '12px', color: '#6ab87a', fontSize: '12px', fontWeight: 600 }}>
          ✓ Applied {applyState.appliedActionIds.size} of {actions.length} changes
          {applyState.failedActionIds.size > 0 && (
            <span style={{ color: '#e05c5c', marginLeft: '8px' }}>
              ({applyState.failedActionIds.size} failed)
            </span>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleApply}
            disabled={applying || selectedCount === 0}
            style={{
              backgroundColor: '#c9a84c',
              color: '#0f0e17',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: applying || selectedCount === 0 ? 'default' : 'pointer',
              opacity: applying || selectedCount === 0 ? 0.6 : 1,
            }}
          >
            {applying
              ? `Applying ${applyState.appliedActionIds.size + applyState.failedActionIds.size}/${selectedCount}…`
              : `Apply ${selectedCount} of ${actions.length} changes`}
          </button>
          <button
            onClick={() => {
              const next: Record<string, boolean> = {};
              for (const a of actions) next[a.action_id] = true;
              setAccepted(next);
            }}
            disabled={applying}
            style={ghostBtn}
          >
            Select all
          </button>
          <button
            onClick={() => {
              const next: Record<string, boolean> = {};
              for (const a of actions) next[a.action_id] = false;
              setAccepted(next);
            }}
            disabled={applying}
            style={ghostBtn}
          >
            Select none
          </button>
          <button onClick={onDismiss} disabled={applying} style={ghostBtn}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

const ghostBtn = {
  background: 'none',
  border: '1px solid #3a3660',
  borderRadius: '6px',
  padding: '6px 10px',
  fontSize: '11px',
  color: '#9990b0',
  cursor: 'pointer',
} as const;
