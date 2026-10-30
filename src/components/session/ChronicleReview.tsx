// src/components/session/ChronicleReview.tsx
// -----------------------------------------------------------
// Review the Chronicle: every change a recording proposes, grouped by what it
// touches. The DM edits, re-points, accepts or skips each one, hears the moment
// it came from, then applies the accepted ones — and can undo that write-back.
// Nothing in the campaign changes until Apply.
// -----------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Pencil, Undo2 } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import {
  ChronicleAppliedLog, ChronicleProposals, RecordingTracks, SessionRecordings, TranscriptSegments,
} from '../../lib/db';
import type { ChronicleApplied, ChronicleProposal, RecordingTrack, SessionRecording, TranscriptSegment } from '../../lib/database.types';
import type { ChronicleAction, ChronicleGroup, EntityKind, SessionField } from '../../lib/recording/chronicle';
import { applyProposals, effectiveAction, MAIN_TEXT, retarget, undoApplied, type ProposalEdits } from '../../lib/recording/applyChronicle';
import { useChronicleWriter } from '../../hooks/useChronicleWriter';
import { useRecordingPlayer } from '../../hooks/useRecordingPlayer';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { entityKindColor } from '../../lib/theme';
import { TranscriptModal } from './TranscriptModal';
import { PlayerBar } from './PlayerBar';

// --------------- Labels ---------------

// Each card is named in its kind's color, as entity links are.
const GROUPS: { key: ChronicleGroup; label: string; glyph: string; color: string }[] = [
  { key: 'session', label: 'Session record', glyph: '❧', color: entityKindColor.session },
  { key: 'pcs', label: 'Player characters', glyph: '❖', color: entityKindColor.pc },
  { key: 'npcs', label: 'Non-Player Characters', glyph: '❦', color: entityKindColor.npc },
  { key: 'locations', label: 'Locations', glyph: '✦', color: entityKindColor.location },
  { key: 'lore', label: 'Lore', glyph: '✦', color: entityKindColor.lore },
  { key: 'factions', label: 'Factions', glyph: '◈', color: entityKindColor.faction },
  { key: 'threads', label: 'Threads', glyph: '✧', color: entityKindColor.hook },
  { key: 'loot', label: 'Loot & rewards', glyph: '⚔', color: entityKindColor.pc },
];

const SESSION_FIELD: Record<SessionField, string> = {
  summary: 'Recap', combats: 'Combat summary', loot_rewards: 'Loot & rewards', hooks_notes: 'Left open for next time', dm_notes: 'DM notes',
};
const NOUN: Record<EntityKind, string> = { pc: 'player character', npc: 'NPC', location: 'location', faction: 'faction', lore: 'lore entry', hook: 'thread' };
const SET_LABEL: Record<string, string> = { disposition: 'Attitude toward the party', status: 'Status', state: 'Thread state' };
const MAIN_LABEL: Record<string, string> = { description: 'description', overview: 'overview', content: 'entry' };
const NPC_STATUSES = ['active', 'deceased', 'unknown'];
const THREAD_STATES = ['seed', 'active', 'cold', 'resolved'];

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

// --------------- The campaign, as the cards need it ---------------

function useEntityLookup() {
  const { pcs, npcs, locations, factions, lore, hooks, sessions } = useCampaign();
  return useMemo(() => {
    const lists: Record<EntityKind, { id: string; label: string; row: Record<string, unknown> }[]> = {
      pc: pcs.map(r => ({ id: r.id, label: r.character_name, row: r as unknown as Record<string, unknown> })),
      npc: npcs.map(r => ({ id: r.id, label: r.name, row: r as unknown as Record<string, unknown> })),
      location: locations.map(r => ({ id: r.id, label: r.name, row: r as unknown as Record<string, unknown> })),
      faction: factions.map(r => ({ id: r.id, label: r.name, row: r as unknown as Record<string, unknown> })),
      lore: lore.map(r => ({ id: r.id, label: r.title, row: r as unknown as Record<string, unknown> })),
      hook: hooks.map(r => ({ id: r.id, label: r.title, row: r as unknown as Record<string, unknown> })),
    };
    for (const k of Object.keys(lists) as EntityKind[]) lists[k].sort((a, b) => a.label.localeCompare(b.label));
    return {
      lists,
      get: (kind: EntityKind, id: string | null) => (id ? lists[kind].find(e => e.id === id) ?? null : null),
      session: (id: string) => sessions.find(s => s.id === id) ?? null,
    };
  }, [pcs, npcs, locations, factions, lore, hooks, sessions]);
}

type Lookup = ReturnType<typeof useEntityLookup>;

interface CardView {
  name: string;
  badge: { label: string; color: 'blue' | 'gold' | 'orange' | 'muted' };
  note: string;
  changes: { label: string; before: string; after: string }[];
  body: { label: string; text: string } | null;
  tags: string[];
  entry: string | null;
}

/**
 * How a card reads. An applied change is described against the row as it was
 * before the write (from the applied log); otherwise the campaign already
 * holds the new values and there'd be nothing to compare.
 */
function describe(a: ChronicleAction, lookup: Lookup, before?: Record<string, unknown> | null): CardView {
  if (a.kind === 'session') {
    const session = lookup.session(a.session_id);
    const current = ((before ?? session)?.[a.field] as string | null | undefined)?.trim();
    const label = SESSION_FIELD[a.field] ?? a.field;
    return {
      name: `Session ${session?.session_number ?? '?'} — ${label}`,
      badge: current ? { label: 'Add note', color: 'gold' } : { label: 'Update', color: 'blue' },
      note: current ? `Adds to the current ${label.toLowerCase()}` : `Fills in the ${label.toLowerCase()}`,
      changes: [], body: { label, text: a.value }, tags: [], entry: null,
    };
  }
  const found = lookup.get(a.entity_type, a.matched_id);
  const existing = found && before ? { ...found, row: before } : found;
  const main = MAIN_TEXT[a.entity_type];
  if (!a.matched_id) {
    const tags = ['role', 'location_type', 'faction_type', 'category', 'state', 'disposition']
      .map(f => a.set[f]).filter((v): v is string => typeof v === 'string' && !!v);
    return {
      name: a.name, badge: { label: 'New entry', color: 'orange' }, note: `New ${NOUN[a.entity_type]}`,
      changes: [], tags,
      body: main && typeof a.set[main] === 'string' && a.set[main] ? { label: 'Description', text: String(a.set[main]) } : null,
      entry: a.entry,
    };
  }
  const changes = Object.entries(a.set)
    .filter(([f, v]) => SET_LABEL[f] && existing?.row[f] !== v)
    .map(([f, v]) => ({ label: SET_LABEL[f], before: String(existing?.row[f] ?? '—'), after: String(v) }));
  const appendField = Object.keys(a.append).find(f => a.append[f]);
  const tags = a.set.met_by_pcs === true && existing?.row.met_by_pcs === false ? ['Marks as met'] : [];
  return {
    name: existing?.label ?? a.name,
    badge: changes.length ? { label: 'Update', color: 'blue' } : { label: 'Add note', color: 'gold' },
    note: existing ? (appendField ? `Adds to ${MAIN_LABEL[appendField] ?? appendField}` : 'Adds to Session History') : 'This entry no longer exists',
    changes,
    body: appendField ? { label: `Adds to ${MAIN_LABEL[appendField] ?? appendField}`, text: a.append[appendField] } : null,
    tags,
    entry: a.entry,
  };
}

// --------------- Editing one card ---------------

function EditForm({ draft, setDraft, lookup, onCancel, onSave, saving }: {
  draft: ChronicleAction;
  setDraft: (a: ChronicleAction) => void;
  lookup: Lookup;
  onCancel: () => void;
  onSave: (accept: boolean) => void;
  saving: boolean;
}) {
  const area = (value: string, onChange: (v: string) => void, label: string, rows = 3) => (
    <label className="flex flex-col">
      <span className="as-ll">{label}</span>
      <textarea className="as-input" rows={rows} value={value} onChange={e => onChange(e.target.value)} style={{ resize: 'vertical', lineHeight: 1.5 }} />
    </label>
  );

  let fields: React.ReactNode;
  if (draft.kind === 'session') {
    fields = area(draft.value, v => setDraft({ ...draft, value: v }), SESSION_FIELD[draft.field], 6);
  } else {
    const a = draft;
    const main = MAIN_TEXT[a.entity_type];
    const isNew = !a.matched_id;
    const setField = (f: string, v: string) => {
      const set = { ...a.set };
      if (v) set[f] = v; else delete set[f];
      if (f === 'state' && v) set.is_active = v !== 'resolved';
      setDraft({ ...a, set });
    };
    fields = (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {a.entity_type !== 'pc' && (
            <label className="flex flex-col">
              <span className="as-ll">Goes to</span>
              <select
                className="as-select"
                value={a.matched_id ?? '__new'}
                onChange={e => {
                  const id = e.target.value === '__new' ? null : e.target.value;
                  setDraft(retarget(a, id, id ? lookup.get(a.entity_type, id)?.label ?? a.name : a.name));
                }}
              >
                <option value="__new">+ New {NOUN[a.entity_type]}</option>
                {lookup.lists[a.entity_type].map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </label>
          )}
          {isNew && (
            <label className="flex flex-col">
              <span className="as-ll">Name</span>
              <input
                className="as-input"
                value={a.name}
                onChange={e => {
                  const nameField = a.entity_type === 'lore' || a.entity_type === 'hook' ? 'title' : 'name';
                  setDraft({ ...a, name: e.target.value, set: { ...a.set, [nameField]: e.target.value } });
                }}
              />
            </label>
          )}
          {a.entity_type === 'npc' && (
            <>
              <label className="flex flex-col">
                <span className="as-ll">Attitude toward the party</span>
                <input className="as-input" value={String(a.set.disposition ?? '')} placeholder="No change" onChange={e => setField('disposition', e.target.value)} />
              </label>
              <label className="flex flex-col">
                <span className="as-ll">Status</span>
                <select className="as-select" value={String(a.set.status ?? '')} onChange={e => setField('status', e.target.value)}>
                  {!isNew && <option value="">No change</option>}
                  {NPC_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </>
          )}
          {a.entity_type === 'hook' && (
            <label className="flex flex-col">
              <span className="as-ll">Thread state</span>
              <select className="as-select" value={String(a.set.state ?? '')} onChange={e => setField('state', e.target.value)}>
                {!isNew && <option value="">No change</option>}
                {THREAD_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
        </div>
        {main && (isNew
          ? area(String(a.set[main] ?? ''), v => setDraft({ ...a, set: { ...a.set, [main]: v } }), 'Description')
          : area(a.append[main] ?? '', v => setDraft({ ...a, append: { ...a.append, [main]: v } }), `Add to ${MAIN_LABEL[main] ?? main} (optional)`))}
        {area(a.entry ?? '', v => setDraft({ ...a, entry: v }), 'Session History line', 2)}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3" style={{ background: 'var(--paper-3)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: 14 }}>
      {fields}
      <div className="flex flex-wrap gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={() => onSave(false)} disabled={saving}>Save edits</Button>
        <Button size="sm" variant="primary" onClick={() => onSave(true)} disabled={saving}>Save &amp; accept</Button>
      </div>
    </div>
  );
}

// --------------- Source panel ---------------

function SourcePanel({ proposal, segments, player, onOpenTranscript }: {
  proposal: ChronicleProposal | null;
  segments: TranscriptSegment[];
  /** The player row, playing this proposal's moment. */
  player: React.ReactNode;
  onOpenTranscript: () => void;
}) {
  const pcs = useCampaign().pcs;

  const at = proposal?.source_ms ?? null;
  const nearest = useMemo(() => {
    if (at == null || !segments.length) return -1;
    let best = 0;
    for (let i = 0; i < segments.length; i++) if (Math.abs(segments[i].start_ms - at) < Math.abs(segments[best].start_ms - at)) best = i;
    return best;
  }, [at, segments]);
  const context = nearest >= 0 ? segments.slice(Math.max(0, nearest - 2), nearest + 3) : [];
  const who = (s: TranscriptSegment) => (s.is_dm ? 'DM' : s.pc_id ? pcs.find(p => p.id === s.pc_id)?.character_name ?? 'Player' : s.speaker_label ?? 'Unknown');

  return (
    <aside aria-label="Source" style={{ flex: '1 1 280px', minWidth: 0, maxWidth: 380, position: 'sticky', top: 16, background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="cm-section-head"><span className="cm-section-title">{at != null ? `Heard at ${clock(at)}` : 'Source'}</span><div className="cm-section-rule" /></div>
        {player}
      </div>
      {proposal == null ? (
        <p className="text-sm" style={{ color: 'var(--ink-3)', margin: 14 }}>Pick a change to see where it came from.</p>
      ) : at == null ? (
        <p className="text-sm" style={{ color: 'var(--ink-3)', margin: 14 }}>This change sums up the whole session rather than one moment.</p>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {context.map(s => {
            const hl = s.id === segments[nearest].id;
            return (
              <li key={s.id} style={{ padding: '6px 8px', borderRadius: 'var(--radius)', border: `1px solid ${hl ? 'var(--gold-line)' : 'transparent'}`, background: hl ? 'var(--gold-dim)' : 'transparent' }}>
                <div className="flex gap-2 items-baseline"><span className="cm-kbd" style={{ color: 'var(--ink-3)' }}>{clock(s.start_ms)}</span><span className="text-xs" style={{ color: 'var(--gold)', fontWeight: 500 }}>{who(s)}</span></div>
                <p className="text-sm" style={{ margin: '2px 0 0', color: 'var(--ink)' }}>{s.text}</p>
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex flex-wrap gap-2" style={{ padding: '10px 14px', borderTop: '1px solid var(--rule)' }}>
        <Button size="xs" onClick={onOpenTranscript} title="Say who a voice is, in the transcript">Fix speaker</Button>
        <Button size="xs" onClick={onOpenTranscript}>Open full transcript</Button>
      </div>
    </aside>
  );
}

// --------------- The screen ---------------

export function ChronicleReview({ recording, onClose, onChanged }: {
  recording: SessionRecording;
  onClose: () => void;
  onChanged: (r: Pick<SessionRecording, 'status' | 'status_detail'>) => void;
}) {
  const lookup = useEntityLookup();
  const confirm = useConfirm();
  const toast = useToast();
  const writerCtx = useMemo(() => ({ recordingId: recording.id, sessionId: recording.session_id }), [recording.id, recording.session_id]);
  const writer = useChronicleWriter(writerCtx);

  const [proposals, setProposals] = useState<ChronicleProposal[] | null>(null);
  const [applied, setApplied] = useState<ChronicleApplied[]>([]);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [tracks, setTracks] = useState<RecordingTrack[]>([]);
  const [filter, setFilter] = useState<ChronicleGroup | 'all'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: ChronicleAction } | null>(null);
  const [busy, setBusy] = useState<'save' | 'apply' | 'undo' | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<{ name: string; message: string }[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const { audio, playing, positionMs, loading, pause, playTrack, playRecording } = useRecordingPlayer();

  const load = useCallback(async () => {
    const [p, log] = await Promise.all([ChronicleProposals.getByRecording(recording.id), ChronicleAppliedLog.getByRecording(recording.id)]);
    setProposals(p);
    setApplied(log);
  }, [recording.id]);

  useEffect(() => {
    load().catch(e => toast(errorMessage(e), 'error'));
    Promise.all([TranscriptSegments.getByRecording(recording.id), RecordingTracks.getByRecording(recording.id)])
      .then(([s, t]) => { setSegments(s.filter(x => !x.dropped_as_echo)); setTracks(t); })
      .catch(() => {});
  }, [recording.id, load, toast]);

  // Escape closes the screen unless a card is being edited.
  useEffect(() => {
    // Capture phase, so a modal this was opened from doesn't close with it.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editing && !showTranscript) { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [editing, showTranscript, onClose]);

  const setStatus = async (ids: string[], status: 'pending' | 'accepted' | 'skipped') => {
    setProposals(prev => prev?.map(p => (ids.includes(p.id) ? { ...p, status } : p)) ?? prev);
    try {
      await Promise.all(ids.map(id => ChronicleProposals.update(id, { status })));
    } catch (e) {
      toast(errorMessage(e), 'error');
      void load();
    }
  };

  const saveEdit = async (accept: boolean) => {
    if (!editing) return;
    setBusy('save');
    try {
      const edits: ProposalEdits = { action: editing.draft };
      const saved = await ChronicleProposals.update(editing.id, { edits: edits as unknown as Record<string, unknown>, ...(accept ? { status: 'accepted' as const } : {}) });
      setProposals(prev => prev?.map(p => (p.id === saved.id ? saved : p)) ?? prev);
      setEditing(null);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const all = proposals ?? [];
  const counts = {
    accepted: all.filter(p => p.status === 'accepted').length,
    skipped: all.filter(p => p.status === 'skipped').length,
    pending: all.filter(p => p.status === 'pending').length,
    applied: all.filter(p => p.status === 'applied').length,
    edited: all.filter(p => p.edits).length,
  };
  // Nothing left to accept or apply: every change is applied or skipped.
  const settled = proposals !== null && counts.pending === 0 && counts.accepted === 0;
  const live = applied.filter(r => !r.undone_at);
  const beforeOf = (proposalId: string) =>
    live.find(r => r.proposal_id === proposalId && r.entity_table !== 'entity_session_entries')?.before as Record<string, unknown> | null | undefined;
  const nameOf = (p: ChronicleProposal) => describe(effectiveAction(p), lookup).name;

  const apply = async () => {
    if (!writer) return;
    const accepted = all.filter(p => p.status === 'accepted');
    if (!accepted.length) return;
    if (!(await confirm({ title: `Apply ${accepted.length} change${accepted.length === 1 ? '' : 's'}?`, message: 'They’re written to your campaign now. You can undo this write-back afterwards.', confirmLabel: 'Apply' }))) return;
    setBusy('apply');
    try {
      const res = await applyProposals(accepted, writer, (done, total) => setProgress({ done, total }));
      setFailures(res.failed.map(f => ({ name: nameOf(accepted.find(p => p.id === f.id)!), message: f.message })));
      const stillPending = counts.pending > 0;
      const detail = `Applied ${res.applied.length} change${res.applied.length === 1 ? '' : 's'}${res.failed.length ? `; ${res.failed.length} couldn’t be applied` : ''}.`;
      const status = stillPending || res.failed.length ? 'review' : 'applied';
      await SessionRecordings.update(recording.id, { status, status_detail: detail });
      onChanged({ status, status_detail: detail });
      toast(detail, res.failed.length ? 'error' : 'success');
      await load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const undo = async () => {
    if (!writer) return;
    if (!(await confirm({ title: 'Undo this write-back?', message: 'Entries it created are deleted and entries it changed go back to how they were — including any edits you made to them since.', confirmLabel: 'Undo write-back', danger: true }))) return;
    setBusy('undo');
    try {
      const res = await undoApplied(live, writer, (done, total) => setProgress({ done, total }));
      const detail = res.failed.length ? `Undo finished with ${res.failed.length} problem${res.failed.length === 1 ? '' : 's'}.` : 'Write-back undone. The changes are back to review.';
      await SessionRecordings.update(recording.id, { status: 'review', status_detail: detail });
      onChanged({ status: 'review', status_detail: detail });
      setFailures(res.failed.map(f => ({ name: 'Undo', message: f.message })));
      toast(detail, res.failed.length ? 'error' : 'success');
      await load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  // A card's moment plays on the track its line was heard on (a Discord
  // player's own track, say), else whichever track covers that time.
  const playFrom = (p: ChronicleProposal) => {
    const ms = p.source_ms;
    if (ms == null) return;
    setSelected(p.id);
    let nearest: TranscriptSegment | null = null;
    for (const s of segments) if (!nearest || Math.abs(s.start_ms - ms) < Math.abs(nearest.start_ms - ms)) nearest = s;
    const track = nearest ? tracks.find(t => t.id === nearest.track_id) : undefined;
    const go = track ? playTrack(track, ms) : playRecording(recording.id, ms);
    go.catch(e => toast(errorMessage(e), 'error'));
  };

  const visibleGroups = GROUPS.filter(g => filter === 'all' || filter === g.key)
    .map(g => ({ ...g, items: all.filter(p => p.group_key === g.key) }))
    .filter(g => g.items.length);
  const selectedProposal = all.find(p => p.id === selected) ?? null;
  const session = lookup.session(recording.session_id);

  return (
    <div role="dialog" aria-modal="true" aria-label="Review the Chronicle" style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'var(--bg)', color: 'var(--ink)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ flex: '0 0 auto', background: 'var(--bg)', borderBottom: '1px solid var(--rule)', padding: '14px 28px', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '12px 24px' }}>
        <div style={{ flex: '1 1 380px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Button variant="link" onClick={onClose} style={{ alignSelf: 'flex-start' }}><ArrowLeft size={12} /> Back</Button>
          <div className="cm-section-title" style={{ color: 'var(--gold)' }}>Session {session?.session_number ?? ''} · Review</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 30, lineHeight: 1.15, fontWeight: 500 }}>Review the Chronicle</h1>
          <p style={{ margin: 0, fontStyle: 'italic', color: 'var(--ink-2)' }}>
            {settled && counts.applied
              ? `${counts.applied} change${counts.applied === 1 ? '' : 's'} applied to the campaign. Undo the write-back to send them back to review.`
              : `${all.length} proposed changes. Edit, accept or skip each one — nothing reaches the campaign until you apply.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="cm-kbd" style={{ color: 'var(--ink-2)' }}>
            <span style={{ color: 'var(--success)' }}>{counts.accepted} accepted</span> · {counts.edited} edited · {counts.skipped} skipped · <span style={{ color: 'var(--gold)' }}>{counts.pending} to review</span>{counts.applied ? ` · ${counts.applied} applied` : ''}
          </span>
          {live.length > 0 && <Button variant="danger" onClick={() => void undo()} disabled={!!busy}><Undo2 size={12} /> {busy === 'undo' ? `Undoing${progress ? ` ${progress.done + 1} of ${progress.total}` : ''}…` : 'Undo write-back'}</Button>}
          {/* Once every change is applied or skipped there's nothing left to accept or apply. */}
          {!settled && (
            <>
              <Button onClick={() => void setStatus(all.filter(p => p.status === 'pending').map(p => p.id), 'accepted')} disabled={!counts.pending || !!busy}>Accept the rest</Button>
              <Button variant="primary" onClick={() => void apply()} disabled={!counts.accepted || !!busy || !writer}>
                {busy === 'apply' ? `Applying${progress ? ` ${progress.done + 1} of ${progress.total}` : ''}…` : `Apply ${counts.accepted} change${counts.accepted === 1 ? '' : 's'}`}
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Only the body scrolls, so the header and the sticky source panel never overlap. */}
      <div style={{ flex: '1 1 auto', overflowY: 'auto' }}>
      {failures.length > 0 && (
        <div role="alert" style={{ margin: '16px 28px 0', padding: '10px 14px', borderRadius: 'var(--radius)', background: 'var(--red-bg)', border: '1px solid var(--red-line)' }}>
          {failures.map((f, i) => <div key={i} className="text-sm" style={{ color: 'var(--ink)' }}><strong style={{ color: 'var(--red)' }}>{f.name}:</strong> {f.message}</div>)}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, padding: '20px 28px 48px', alignItems: 'flex-start' }}>
        <nav aria-label="Filter changes" style={{ flex: '1 1 190px', maxWidth: 230, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[{ key: 'all' as const, label: 'All changes', glyph: '❖', n: all.length }, ...GROUPS.map(g => ({ key: g.key, label: g.label, glyph: g.glyph, n: all.filter(p => p.group_key === g.key).length }))]
            .filter(f => f.key === 'all' || f.n > 0)
            .map(f => (
              <Button
                key={f.key}
                variant="ghost"
                size="sm"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                style={{ justifyContent: 'flex-start', gap: 10, background: filter === f.key ? 'var(--paper-2)' : undefined, boxShadow: filter === f.key ? 'inset 2px 0 0 var(--gold)' : undefined, color: filter === f.key ? 'var(--ink)' : undefined }}
              >
                <span aria-hidden="true" style={{ width: 16, color: 'var(--gold)' }}>{f.glyph}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{f.label}</span>
                <span className="cm-kbd" style={{ color: 'var(--ink-3)' }}>{f.n}</span>
              </Button>
            ))}
        </nav>

        <main style={{ flex: '999 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 26 }}>
          {proposals === null && <p style={{ color: 'var(--ink-3)' }}>Loading proposals…</p>}
          {proposals?.length === 0 && <p style={{ color: 'var(--ink-3)' }}>This recording has no proposed changes. Write the chronicle from the session's recording first.</p>}
          {visibleGroups.map(g => {
            const pending = g.items.filter(p => p.status === 'pending');
            return (
              <section key={g.key} className="flex flex-col gap-2">
                <div className="cm-section-head">
                  <span aria-hidden="true" style={{ color: 'var(--gold)' }}>{g.glyph}</span>
                  <span className="cm-section-title">{g.label} · {g.items.length}</span>
                  <div className="cm-section-rule" />
                  {pending.length > 1 && <Button variant="link" onClick={() => void setStatus(pending.map(p => p.id), 'accepted')}>Accept all {pending.length}</Button>}
                </div>
                {g.items.map(p => {
                  const isEditing = editing?.id === p.id;
                  const view = describe(isEditing ? editing.draft : effectiveAction(p), lookup, p.status === 'applied' ? beforeOf(p.id) : undefined);
                  const isSel = selected === p.id;
                  const border = isEditing ? 'var(--gold-line)' : p.status === 'accepted' ? 'var(--success-line)' : p.status === 'applied' ? 'var(--rule-soft)' : 'var(--rule)';
                  return (
                    <article
                      key={p.id}
                      onClick={() => setSelected(p.id)}
                      style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: isSel ? 'var(--paper-2)' : 'var(--paper)', border: `1px solid ${border}`, boxShadow: isSel ? 'inset 2px 0 0 var(--gold)' : undefined, opacity: p.status === 'skipped' && !isEditing ? 0.55 : 1 }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span aria-hidden="true" style={{ fontSize: 16, color: g.color }}>{g.glyph}</span>
                        <span style={{ fontWeight: 500, fontSize: 16, color: g.color }}>{view.name}</span>
                        <Badge color={view.badge.color}>{view.badge.label}</Badge>
                        {p.edits && <Badge color="muted">✎ Edited</Badge>}
                        {view.tags.map(t => <span key={t} className="cm-tag">{t}</span>)}
                        <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{view.note}</span>
                        <span style={{ flex: 1 }} />
                        {p.status === 'applied' && <Badge color="green">Applied</Badge>}
                        {!isEditing && p.status === 'pending' && (
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <Button size="sm" variant="ghost" onClick={() => void setStatus([p.id], 'skipped')}>Skip</Button>
                            <Button size="sm" onClick={() => { setSelected(p.id); setEditing({ id: p.id, draft: effectiveAction(p) }); }}><Pencil size={11} /> Edit</Button>
                            <Button size="sm" variant="primary" onClick={() => void setStatus([p.id], 'accepted')}>Accept</Button>
                          </div>
                        )}
                        {!isEditing && (p.status === 'accepted' || p.status === 'skipped') && (
                          <div className="flex gap-2 items-center" onClick={e => e.stopPropagation()}>
                            <Badge color={p.status === 'accepted' ? 'green' : 'muted'}>{p.status === 'accepted' ? <span style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Check size={10} /> Accepted</span> : 'Skipped'}</Badge>
                            {p.status === 'accepted' && <Button variant="link" onClick={() => setEditing({ id: p.id, draft: effectiveAction(p) })}>Edit</Button>}
                            <Button variant="link" onClick={() => void setStatus([p.id], 'pending')}>Undo</Button>
                          </div>
                        )}
                      </div>

                      {isEditing ? (
                        <div onClick={e => e.stopPropagation()}>
                          <EditForm
                            draft={editing.draft}
                            setDraft={d => setEditing({ id: p.id, draft: d })}
                            lookup={lookup}
                            onCancel={() => setEditing(null)}
                            onSave={accept => void saveEdit(accept)}
                            saving={busy === 'save'}
                          />
                        </div>
                      ) : (
                        <>
                          {view.changes.map(c => (
                            <div key={c.label} className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="text-xs" style={{ color: 'var(--ink-3)', minWidth: 160 }}>{c.label}</span>
                              <span style={{ color: 'var(--ink-3)', textDecoration: 'line-through' }}>{c.before}</span>
                              <span aria-hidden="true" style={{ color: 'var(--gold)' }}>→</span>
                              <span style={{ fontWeight: 500 }}>{c.after}</span>
                            </div>
                          ))}
                          {view.body && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{view.body.text}</p>}
                          {view.entry && (
                            <p className="text-sm" style={{ margin: 0, color: 'var(--ink-2)' }}>
                              <span className="cm-section-title" style={{ marginRight: 8 }}>History</span>{view.entry}
                            </p>
                          )}
                        </>
                      )}

                      {p.source_quote && (
                        <div className="flex gap-2 items-baseline" style={{ borderTop: '1px solid var(--rule-soft)', paddingTop: 10 }}>
                          {p.source_ms != null && (
                            <Button
                              size="xs"
                              aria-label={`Play source at ${clock(p.source_ms)}`}
                              onClick={e => { e.stopPropagation(); playFrom(p); }}
                              style={{ flex: '0 0 auto', background: 'var(--paper-3)', color: 'var(--gold)', fontFamily: 'var(--mono)' }}
                            >
                              ▶ {clock(p.source_ms)}
                            </Button>
                          )}
                          <span className="text-sm" style={{ color: 'var(--ink-2)', fontStyle: 'italic' }}>
                            “{p.source_quote}” <span style={{ fontStyle: 'normal', color: 'var(--ink-3)' }}>— {p.source_speaker}</span>
                          </span>
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>
            );
          })}
        </main>

        <SourcePanel
          proposal={selectedProposal}
          segments={segments}
          onOpenTranscript={() => setShowTranscript(true)}
          player={(
            <PlayerBar
              audio={audio} playing={playing} positionMs={positionMs} loading={loading} onPause={pause}
              atMs={selectedProposal?.source_ms ?? null}
              totalMs={recording.duration_ms}
              onPlay={() => { if (selectedProposal) playFrom(selectedProposal); }}
              label="Play from here"
            />
          )}
        />
      </div>
      </div>

      {showTranscript && <TranscriptModal recording={recording} onClose={() => setShowTranscript(false)} />}
    </div>
  );
}
