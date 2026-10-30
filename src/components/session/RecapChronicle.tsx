// src/components/session/RecapChronicle.tsx
// -----------------------------------------------------------
// The chronicle, as part of a session's Recap once its write-back is applied:
// what each player character did and how much of the talk they had, the NPCs
// met, places visited, lore revealed and threads moved, what was written to the
// campaign (with undo), and the moments the DM marked, each playable from the
// recording. The recap text, combats, loot and what's left open are the
// session's own fields, edited around this.
// -----------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useEntityRefs } from '../../context/EntityRefContext';
import { useToast } from '../../context/ToastContext';
import { ChronicleAppliedLog, ChronicleProposals, RecordingMoments, RecordingTracks, SessionRecordings, TranscriptSegments } from '../../lib/db';
import type { ChronicleApplied, ChronicleProposal, RecordingMoment, RecordingTrack, SessionRecording, TranscriptSegment } from '../../lib/database.types';
import type { EntityKind } from '../../lib/recording/chronicle';
import { clockLabel, durationLabel } from '../../lib/recording/chronicle';
import { buildChronicle, changeCount, talkShare, whatChanged, type WrittenItem } from '../../lib/recording/chronicleView';
import { undoApplied } from '../../lib/recording/applyChronicle';
import { entityKindColor, threadStateMeta } from '../../lib/theme';
import { useChronicleWriter } from '../../hooks/useChronicleWriter';
import { useRecordingPlayer } from '../../hooks/useRecordingPlayer';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { PlayerBar } from './PlayerBar';

const GLYPH: Record<EntityKind | 'session', string> = { session: '❧', pc: '❖', npc: '❦', location: '✦', faction: '◈', lore: '✦', hook: '✧' };
const SESSION_FIELD: Record<string, string> = {
  summary: 'Recap', combats: 'Combat summary', loot_rewards: 'Loot & rewards', hooks_notes: 'Left open for next time', dm_notes: 'DM notes',
};

const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--radius-lg)' };

/** A section of the recap: its label and rule, as the session page has them. */
function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="cm-section">
      <div className="cm-section-head">
        <span className="cm-section-title">{title}</span>
        <div className="cm-section-rule" />
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A thread state as its badge. */
const StateBadge = ({ state }: { state: string }) => (
  <span className={`cm-state-badge cm-state--${threadStateMeta[state] ? state : 'active'}`}>{threadStateMeta[state]?.label ?? cap(state)}</span>
);

/** One applied recording's part of the Recap. */
export function RecapChronicle({ recording: initial, onChanged }: {
  recording: SessionRecording;
  /** The write-back was undone, so the recording is back to review. */
  onChanged?: () => void;
}) {
  const { pcs, npcs, locations, factions, lore, hooks } = useCampaign();
  const { openRef } = useEntityRefs();
  const toast = useToast();
  const confirm = useConfirm();
  const { audio, playing, positionMs, loading, pause, playRecording } = useRecordingPlayer();
  const writerCtx = useMemo(() => ({ recordingId: initial.id, sessionId: initial.session_id }), [initial.id, initial.session_id]);
  const writer = useChronicleWriter(writerCtx);
  const recording = initial;

  const [proposals, setProposals] = useState<ChronicleProposal[] | null>(null);
  const [log, setLog] = useState<ChronicleApplied[]>([]);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [tracks, setTracks] = useState<RecordingTrack[]>([]);
  const [moments, setMoments] = useState<RecordingMoment[]>([]);
  const [undoing, setUndoing] = useState(false);

  const load = useCallback(() => Promise.all([
    ChronicleProposals.getByRecording(initial.id),
    ChronicleAppliedLog.getByRecording(initial.id),
    TranscriptSegments.getByRecording(initial.id),
    RecordingTracks.getByRecording(initial.id),
    RecordingMoments.getByRecording(initial.id),
  ]).then(([p, l, s, t, m]) => {
    setProposals(p);
    setLog(l);
    setSegments(s.filter(x => !x.dropped_as_echo));
    setTracks(t);
    setMoments([...m].sort((a, b) => a.at_ms - b.at_ms));
  }).catch(e => toast(errorMessage(e), 'error')), [initial.id, toast]);

  useEffect(() => { void load(); }, [load, initial.status]);

  const model = useMemo(() => buildChronicle(proposals ?? [], log), [proposals, log]);

  // Names as the campaign has them now (so a rename since shows), or null for
  // an entry that's been deleted.
  const currentName = useMemo(() => {
    const names = new Map<string, string>();
    pcs.forEach(r => names.set(`pc:${r.id}`, r.character_name));
    npcs.forEach(r => names.set(`npc:${r.id}`, r.name));
    locations.forEach(r => names.set(`location:${r.id}`, r.name));
    factions.forEach(r => names.set(`faction:${r.id}`, r.name));
    lore.forEach(r => names.set(`lore:${r.id}`, r.title));
    hooks.forEach(r => names.set(`hook:${r.id}`, r.title));
    return (item: WrittenItem) => names.get(`${item.kind}:${item.entityId}`) ?? null;
  }, [pcs, npcs, locations, factions, lore, hooks]);
  const nameOf = (item: WrittenItem) => currentName(item) ?? item.name;

  // Who played, and where from.
  const atTable = recording.settings.tablePcIds;
  const { onDiscord, party, share, quiet } = useMemo(() => {
    const discord = new Set(tracks.filter(t => t.source === 'discord' && t.pc_id).map(t => t.pc_id!));
    const ids = [...new Set([
      ...(atTable ?? []), ...discord,
      ...model.byKind.pc.map(i => i.entityId), ...segments.map(s => s.pc_id),
    ].filter((id): id is string => !!id))];
    return {
      onDiscord: discord,
      party: ids.map(id => pcs.find(p => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p),
      ...talkShare(segments, ids),
    };
  }, [tracks, atTable, model, segments, pcs]);

  const play = (ms: number) => void playRecording(recording.id, ms).catch(e => toast(errorMessage(e), 'error'));
  const open = (kind: EntityKind, id: string | null) => { if (id) openRef(kind, id); };

  const undo = async () => {
    if (!writer) return;
    if (!(await confirm({ title: 'Undo this write-back?', message: 'Entries it created are deleted and entries it changed go back to how they were — including any edits you made to them since.', confirmLabel: 'Undo write-back', danger: true }))) return;
    setUndoing(true);
    try {
      const res = await undoApplied(log.filter(r => !r.undone_at), writer);
      const detail = res.failed.length ? `Undo finished with ${res.failed.length} problem${res.failed.length === 1 ? '' : 's'}.` : 'Write-back undone. The changes are back to review.';
      await SessionRecordings.update(recording.id, { status: 'review', status_detail: detail });
      toast(detail, res.failed.length ? 'error' : 'success');
      onChanged?.();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setUndoing(false);
    }
  };

  /** An entity's name in its kind's color, opening it; greyed if it's since been deleted. */
  const nameLink = (item: WrittenItem, opts: { glyph?: boolean; size?: number; color?: string } = {}) => {
    const color = opts.color ?? entityKindColor[item.kind];
    const text = `${opts.glyph ? `${GLYPH[item.kind]} ` : ''}${nameOf(item)}`;
    return currentName(item)
      ? <Button variant="link" onClick={() => open(item.kind, item.entityId)} style={{ fontSize: opts.size ?? 15, fontWeight: 500, color, textDecoration: 'none', textAlign: 'left', justifyContent: 'flex-start', alignSelf: 'flex-start' }}>{text}</Button>
      : <span style={{ fontSize: opts.size ?? 15, color: 'var(--ink-3)' }} title="No longer in this campaign">{text}</span>;
  };
  const time = (ms: number | null) => (ms == null ? null : (
    <Button variant="ghost" size="xs" onClick={() => play(ms)} title="Play from here" style={{ padding: '0 4px' }}>
      <span className="cm-kbd" style={{ color: 'var(--ink-3)' }}>▶ {clockLabel(ms)}</span>
    </Button>
  ));
  const text = (item: WrittenItem) => item.entry ?? item.added;

  if (proposals === null) return <p className="text-sm" style={{ color: 'var(--ink-3)', margin: 0 }}>Loading the chronicle…</p>;

  const k = model.byKind;
  const written: { key: string; kind: EntityKind | 'session'; name: string; what: string; meta: string; item?: WrittenItem }[] = [
    ...model.sessionFields.map(f => ({ key: f, kind: 'session' as const, name: SESSION_FIELD[f] ?? f, what: 'This session', meta: '1' })),
    ...(['npc', 'pc', 'location', 'lore', 'faction', 'hook'] as EntityKind[]).flatMap(kind => k[kind].map(item => ({
      key: item.proposalId, kind, name: nameOf(item), what: whatChanged(item), meta: item.created ? 'new' : String(changeCount(item)), item,
    }))),
  ];
  // Lore revealed: lore entries (world canon or this table's) and what the party learned of factions.
  const knowledge = [...k.lore, ...k.faction];
  const isCanon = (item: WrittenItem) => item.kind === 'lore' && lore.find(r => r.id === item.entityId)?.campaign_id === null;

  return (
    <div className="rc">
      {party.length > 0 && (
        <Section title="The party" aside={<span className="rc-aside">Share of the players’ talk time</span>}>
          <div className="rc-party">
            {party.map(pc => {
              const s = share.get(pc.id);
              const isQuiet = quiet.has(pc.id);
              const did = k.pc.filter(i => i.entityId === pc.id && i.entry);
              return (
                <article key={pc.id} style={{ ...card, borderColor: isQuiet ? 'var(--orange-line)' : 'var(--rule)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Button variant="link" onClick={() => open('pc', pc.id)} style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink)', textDecoration: 'none', justifyContent: 'flex-start' }}>{pc.character_name}</Button>
                    <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{[[pc.race, pc.class].filter(Boolean).join(' '), pc.player_name].filter(Boolean).join(' · ')}</span>
                    {onDiscord.has(pc.id) && <span className="cm-tag" style={{ color: 'var(--link-faction)', borderColor: 'var(--link-faction-line)' }}>◈ Discord</span>}
                    {isQuiet && <Badge color="orange">Quiet night</Badge>}
                  </div>
                  {did.length > 0
                    ? <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', display: 'flex', flexDirection: 'column', gap: 4 }}>{did.map(i => <li key={i.proposalId}>{i.entry}</li>)}</ul>
                    : <span className="text-sm" style={{ color: 'var(--ink-3)' }}>Nothing written down for this character.</span>}
                  {s != null && (
                    <div className="flex items-center gap-2" style={{ marginTop: 'auto' }}>
                      <div aria-hidden="true" style={{ flex: 1, height: 4, background: 'var(--paper-3)', borderRadius: 999 }}>
                        <div style={{ width: `${Math.round(s * 100)}%`, height: '100%', background: isQuiet ? 'var(--orange)' : 'var(--gold)', borderRadius: 999 }} />
                      </div>
                      <span className="cm-kbd" style={{ color: 'var(--ink-2)' }}>{Math.round(s * 100)}%</span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </Section>
      )}

      {k.npc.length > 0 && (
        <Section title="NPCs met">
          <div style={card}>
            {k.npc.map((item, i) => (
              <div key={item.proposalId} className="rc-npc" style={{ borderTop: i ? '1px solid var(--rule-soft)' : undefined }}>
                <div className="flex flex-wrap items-center gap-2">{nameLink(item, { glyph: true })}{item.created && <Badge color="orange">New</Badge>}</div>
                <span>{text(item)}</span>
                <div className="flex flex-col items-end gap-1">
                  {item.changes.map(c => (
                    <span key={c.field} className="text-xs" style={{ whiteSpace: 'nowrap', color: 'var(--ink-3)' }}>
                      {c.from ? <>{cap(c.from)} → </> : null}<span style={{ color: 'var(--success)' }}>{cap(c.to)}</span>
                    </span>
                  ))}
                  {time(item.sourceMs)}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {knowledge.length > 0 && (
        <Section title="Lore revealed">
          {knowledge.map(item => {
            const canon = isCanon(item);
            return (
              <div key={item.proposalId} className={`cm-originband ${canon ? 'is-canon' : 'is-local'}`} style={{ margin: 0 }}>
                <span className="cm-originband-glyph" aria-hidden="true">{GLYPH[item.kind]}</span>
                <div className="cm-originband-body">
                  <div className="cm-originband-kicker">{nameOf(item)} · {canon ? 'world canon' : 'this table'}{item.created ? ' · new' : ''}</div>
                  <div className="cm-originband-text">{text(item)}</div>
                  {currentName(item) && (
                    <div className="cm-originband-actions"><Button variant="link" onClick={() => open(item.kind, item.entityId)}>Open {item.kind === 'faction' ? 'faction' : 'entry'} ↗</Button></div>
                  )}
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {k.location.length > 0 && (
        <Section title="Places visited">
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
            {k.location.map((item, i) => (
              <li key={item.proposalId} style={{ display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr) auto', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--rule-soft)' : undefined, alignItems: 'start' }}>
                <span aria-hidden="true" style={{ color: 'var(--link-location)', paddingTop: 2 }}>✦</span>
                <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
                  <div className="flex flex-wrap items-center gap-2">{nameLink(item, { color: 'var(--ink)' })}{item.created && <Badge color="orange">New</Badge>}</div>
                  {text(item) && <span className="text-sm" style={{ color: 'var(--ink-2)' }}>{text(item)}</span>}
                </div>
                {time(item.sourceMs)}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {k.hook.length > 0 && (
        <Section title="Threads moved">
          <div className="flex flex-wrap gap-3">
            {k.hook.map(item => {
              const change = item.changes.find(c => c.field === 'state');
              const now = change?.to ?? hooks.find(h => h.id === item.entityId)?.state ?? 'active';
              return (
                <div key={item.proposalId} style={{ ...card, borderTop: `2px solid ${threadStateMeta[now]?.line ?? 'var(--rule)'}`, flex: '1 1 240px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="flex flex-wrap items-center gap-2">
                    {item.created && <Badge color="orange">New</Badge>}
                    {change?.from && !item.created && <><StateBadge state={change.from} /><span aria-hidden="true" style={{ color: 'var(--ink-3)' }}>→</span></>}
                    <StateBadge state={now} />
                    {!change && !item.created && <span className="text-xs" style={{ color: 'var(--ink-3)' }}>advanced</span>}
                  </div>
                  {nameLink(item, { color: 'var(--ink)', size: 16 })}
                  {text(item) && <span className="text-sm" style={{ color: 'var(--ink-2)' }}>{text(item)}</span>}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {moments.length > 0 && (
        <Section title="Key moments">
          <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '6px 10px', alignItems: 'baseline' }}>
            {moments.map(m => (
              <div key={m.id} style={{ display: 'contents' }}>
                <Button variant="ghost" size="xs" onClick={() => play(m.at_ms)} title="Play from here" style={{ padding: '0 4px', justifySelf: 'start' }}>
                  <span className="cm-kbd" style={{ color: 'var(--gold)' }}>{clockLabel(m.at_ms)}</span>
                </Button>
                <span style={{ fontSize: 14, color: m.label ? 'var(--ink)' : 'var(--ink-3)' }}>{m.label || 'Marked moment'}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {written.length > 0 && (
        <Section title={`Written to the campaign · ${written.length}`}>
          <div style={{ ...card, padding: 6 }}>
            {written.map(w => {
              const body = (
                <>
                  <span className="cm-row-glyph" style={{ color: entityKindColor[w.kind] }}>{GLYPH[w.kind]}</span>
                  <span className="cm-row-body"><span className="cm-row-title">{w.name}</span><span className="cm-row-sub">{w.what}</span></span>
                  <span className="cm-row-meta">{w.meta}</span>
                </>
              );
              return w.item && currentName(w.item)
                // eslint-disable-next-line no-restricted-syntax -- a list row (.cm-row), not a button style
                ? <button key={w.key} type="button" className="cm-row" onClick={() => open(w.item!.kind, w.item!.entityId)}>{body}</button>
                : <div key={w.key} className="cm-row" style={{ cursor: 'default' }}>{body}</div>;
            })}
            <div className="flex flex-wrap items-center gap-2" style={{ padding: 8, borderTop: '1px solid var(--rule-soft)' }}>
              <span className="text-xs" style={{ color: 'var(--ink-3)', flex: 1 }}>{model.edited} edited by you · {model.skipped} skipped</span>
              <Button size="xs" variant="danger" onClick={() => void undo()} disabled={undoing || !writer}>{undoing ? 'Undoing…' : 'Undo this write-back'}</Button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <PlayerBar audio={audio} playing={playing} positionMs={positionMs} loading={loading} onPause={pause} atMs={null} totalMs={recording.duration_ms} onPlay={() => play(positionMs ?? 0)} />
            <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
              {[
                durationLabel(recording.duration_ms),
                recording.audio_expires_at ? `audio kept until ${new Date(recording.audio_expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'audio kept',
                segments.length ? `${segments.length.toLocaleString()} transcript lines` : '',
              ].filter(Boolean).join(' · ')}
            </span>
          </div>
        </Section>
      )}
    </div>
  );
}
