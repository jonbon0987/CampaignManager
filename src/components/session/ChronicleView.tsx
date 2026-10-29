// src/components/session/ChronicleView.tsx
// -----------------------------------------------------------
// A session's chronicle, once its write-back is applied: the recap, what each
// player character did and how much of the talk they had, the NPCs met, places
// visited, lore revealed and threads moved — with what was written to the
// campaign and the moments the DM marked, each playable from the recording.
// -----------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, ListChecks, Play } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useEntityRefs } from '../../context/EntityRefContext';
import { useToast } from '../../context/ToastContext';
import { ChronicleAppliedLog, ChronicleProposals, RecordingMoments, RecordingTracks, TranscriptSegments } from '../../lib/db';
import type { ChronicleApplied, ChronicleProposal, RecordingMoment, RecordingTrack, SessionRecording, TranscriptSegment } from '../../lib/database.types';
import type { EntityKind, SessionField } from '../../lib/recording/chronicle';
import { clockLabel, durationLabel } from '../../lib/recording/chronicle';
import { buildChronicle, talkShare, type WrittenItem } from '../../lib/recording/chronicleView';
import { useRecordingPlayer } from '../../hooks/useRecordingPlayer';
import { SfProse } from '../ui/SlashField';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { TranscriptModal } from './TranscriptModal';
import { ChronicleReview } from './ChronicleReview';

const GLYPH: Record<EntityKind | 'session', string> = { session: '❧', pc: '❖', npc: '❦', location: '✦', faction: '◈', lore: '✦', hook: '✧' };
const SESSION_FIELD: Record<SessionField, string> = {
  summary: 'Recap', combats: 'Combat summary', loot_rewards: 'Loot & rewards', hooks_notes: 'Left open for next time', dm_notes: 'DM notes',
};
const FIELD_LABEL: Record<WrittenItem['changes'][number]['field'], string> = { disposition: 'Attitude', status: 'Status', state: 'State' };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** "Wary → Fearful ally", or just "Friendly" for a new entry. */
const changeText = (c: WrittenItem['changes'][number]) => (c.from ? `${cap(c.from)} → ${cap(c.to)}` : cap(c.to));

/** What a write did, for the "Written to the campaign" list. */
function whatChanged(item: WrittenItem): string {
  if (item.created) return 'Created new';
  const parts = item.changes.map(c => (item.kind === 'hook' && c.field === 'state' ? changeText(c) : FIELD_LABEL[c.field]));
  if (item.added) parts.push(item.kind === 'faction' ? 'Overview' : 'Description');
  if (item.entry) parts.push('Session history');
  return parts.join(' · ') || 'Noted';
}

function Section({ glyph, title, aside, children }: { glyph: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="cm-section-head">
        <span aria-hidden="true" style={{ color: 'var(--gold)' }}>{glyph}</span>
        <span className="cm-section-title">{title}</span>
        <div className="cm-section-rule" />
        {aside}
      </div>
      {children}
    </section>
  );
}

const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--radius-lg)' };

export function ChronicleView({ recording: initial, onClose, onChanged }: {
  recording: SessionRecording;
  onClose: () => void;
  onChanged?: (r: Pick<SessionRecording, 'status' | 'status_detail'>) => void;
}) {
  const { sessions, pcs, npcs, locations, factions, lore, hooks } = useCampaign();
  const { openRef } = useEntityRefs();
  const toast = useToast();
  const { audio, playRecording } = useRecordingPlayer();

  const [recording, setRecording] = useState(initial);
  const [proposals, setProposals] = useState<ChronicleProposal[] | null>(null);
  const [log, setLog] = useState<ChronicleApplied[]>([]);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [tracks, setTracks] = useState<RecordingTrack[]>([]);
  const [moments, setMoments] = useState<RecordingMoment[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showReview, setShowReview] = useState(false);

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

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    // Capture phase, so a modal this was opened from doesn't close with it.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !showTranscript && !showReview) { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [showTranscript, showReview, onClose]);

  const model = useMemo(() => buildChronicle(proposals ?? [], log), [proposals, log]);
  const session = sessions.find(s => s.id === recording.session_id) ?? null;

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
  const open = (kind: EntityKind, id: string | null) => { if (id) { onClose(); openRef(kind, id); } };

  const names = (ids: string[]) => {
    const list = ids.map(id => pcs.find(p => p.id === id)?.character_name).filter(Boolean) as string[];
    return list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  };
  const who = [
    atTable?.length ? `${names(atTable)} at the table` : '',
    onDiscord.size ? `${names([...onDiscord])} on Discord` : '',
  ].filter(Boolean).join(', ');
  const dateLabel = session?.session_date
    ? new Date(`${session.session_date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    : new Date(recording.started_at).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const nameLink = (item: WrittenItem) => (
    currentName(item)
      ? <Button variant="link" onClick={() => open(item.kind, item.entityId)} style={{ fontSize: 15, color: 'var(--ink)', textAlign: 'left', justifyContent: 'flex-start', alignSelf: 'flex-start' }}>{nameOf(item)}</Button>
      : <span style={{ fontSize: 15, color: 'var(--ink-3)' }} title="No longer in this campaign">{item.name}</span>
  );
  const time = (ms: number | null) => (ms == null ? null : (
    <Button variant="ghost" size="xs" onClick={() => play(ms)} title="Play from here" style={{ padding: '0 4px' }}>
      <span className="cm-kbd" style={{ color: 'var(--ink-3)' }}>{clockLabel(ms)}</span>
    </Button>
  ));
  const rows = (items: WrittenItem[], kind: EntityKind) => (
    <div style={{ ...card, padding: '2px 14px' }}>
      {items.map((item, i) => (
        <div key={item.proposalId} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) auto', gap: 10, padding: '10px 0', borderTop: i ? '1px solid var(--rule-soft)' : undefined, alignItems: 'start' }}>
          <span aria-hidden="true" style={{ color: 'var(--gold)', paddingTop: 2 }}>{GLYPH[kind]}</span>
          <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
            <div className="flex flex-wrap items-center gap-2">{nameLink(item)}{item.created && <Badge color="orange">New</Badge>}</div>
            {(item.entry ?? item.added) && <p className="text-sm" style={{ margin: 0, color: 'var(--ink-2)' }}>{item.entry ?? item.added}</p>}
          </div>
          <div className="flex flex-col items-end gap-1">
            {item.changes.map(c => <span key={c.field} className="cm-tag" style={{ whiteSpace: 'nowrap' }}>{changeText(c)}</span>)}
            {time(item.sourceMs)}
          </div>
        </div>
      ))}
    </div>
  );

  const k = model.byKind;
  const written: { key: string; glyph: string; name: string; what: string; item?: WrittenItem }[] = [
    ...model.sessionFields.map(f => ({ key: f, glyph: GLYPH.session, name: SESSION_FIELD[f], what: 'Session record' })),
    ...(['pc', 'npc', 'location', 'faction', 'lore', 'hook'] as EntityKind[]).flatMap(kind => k[kind].map(item => ({ key: item.proposalId, glyph: GLYPH[kind], name: nameOf(item), what: whatChanged(item), item }))),
  ];

  return (
    <div role="dialog" aria-modal="true" aria-label="Session chronicle" style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'var(--bg)', color: 'var(--ink)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ flex: '0 0 auto', borderBottom: '1px solid var(--rule)', padding: '14px clamp(16px, 4vw, 28px)', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '12px 24px' }}>
        <div style={{ flex: '1 1 380px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Button variant="link" onClick={onClose} style={{ alignSelf: 'flex-start' }}><ArrowLeft size={12} /> Back</Button>
          <div className="cm-section-title" style={{ color: 'var(--gold)' }}>Session {session?.session_number ?? ''} · Chronicle</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 28, lineHeight: 1.15, fontWeight: 500 }}>{dateLabel}</h1>
          <p style={{ margin: 0, fontStyle: 'italic', color: 'var(--ink-2)' }}>
            {[durationLabel(recording.duration_ms), who].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setShowTranscript(true)}><FileText size={12} /> Transcript</Button>
          <Button size="sm" onClick={() => setShowReview(true)}><ListChecks size={12} /> Review or undo</Button>
        </div>
      </header>

      <div style={{ flex: '1 1 auto', overflowY: 'auto' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, padding: '22px clamp(16px, 4vw, 28px) 48px', alignItems: 'flex-start' }}>
          <main style={{ flex: '999 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>
            {proposals === null && <p style={{ color: 'var(--ink-3)' }}>Loading the chronicle…</p>}
            {proposals !== null && model.written === 0 && (
              <p style={{ color: 'var(--ink-3)' }}>Nothing from this recording is in the campaign. Review its changes and apply them first.</p>
            )}

            {session?.summary && <Section glyph="❧" title="Summary"><SfProse text={session.summary} /></Section>}

            {party.length > 0 && (
              <Section glyph="❖" title="The Party" aside={<span className="text-xs" style={{ color: 'var(--ink-3)' }}>Share of the players’ talk time</span>}>
                <div className="flex flex-wrap gap-3">
                  {party.map(pc => {
                    const s = share.get(pc.id);
                    const did = k.pc.filter(i => i.entityId === pc.id && i.entry);
                    return (
                      <div key={pc.id} style={{ ...card, flex: '1 1 260px', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div className="flex flex-wrap items-baseline gap-2">
                          <Button variant="link" onClick={() => open('pc', pc.id)} style={{ fontSize: 17, color: 'var(--ink)', justifyContent: 'flex-start' }}>{pc.character_name}</Button>
                          {onDiscord.has(pc.id) && <Badge color="blue">Discord</Badge>}
                          {quiet.has(pc.id) && <Badge color="yellow">Quiet night</Badge>}
                        </div>
                        <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{[[pc.race, pc.class].filter(Boolean).join(' '), pc.player_name].filter(Boolean).join(' · ')}</span>
                        {did.length > 0
                          ? <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>{did.map(i => <li key={i.proposalId} className="text-sm">{i.entry}</li>)}</ul>
                          : <span className="text-sm" style={{ color: 'var(--ink-3)' }}>Nothing written down for this character.</span>}
                        {s != null && (
                          <div className="flex items-center gap-2" style={{ marginTop: 'auto' }}>
                            <div style={{ flex: 1, height: 4, background: 'var(--paper-3)', borderRadius: 999 }}>
                              <div style={{ width: `${Math.round(s * 100)}%`, height: '100%', background: quiet.has(pc.id) ? 'var(--warn)' : 'var(--gold)', borderRadius: 999 }} />
                            </div>
                            <span className="cm-kbd" style={{ color: 'var(--ink-2)' }}>{Math.round(s * 100)}%</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {k.npc.length > 0 && <Section glyph="❦" title="Encounters with NPCs">{rows(k.npc, 'npc')}</Section>}
            {k.location.length > 0 && <Section glyph="✦" title="Places visited">{rows(k.location, 'location')}</Section>}
            {k.lore.length > 0 && <Section glyph="✦" title="Lore revealed">{rows(k.lore, 'lore')}</Section>}
            {k.faction.length > 0 && <Section glyph="◈" title="Factions">{rows(k.faction, 'faction')}</Section>}

            {k.hook.length > 0 && (
              <Section glyph="✧" title="Threads moved">
                <div className="flex flex-wrap gap-3">
                  {k.hook.map(item => {
                    const state = item.changes.find(c => c.field === 'state');
                    return (
                      <div key={item.proposalId} style={{ ...card, borderTop: '2px solid var(--gold-line)', flex: '1 1 280px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span className="cm-kbd" style={{ color: 'var(--gold)', alignSelf: 'flex-start' }}>{item.created ? `New · ${cap(state?.to ?? 'seed')}` : state ? changeText(state) : 'Advanced'}</span>
                        {nameLink(item)}
                        {(item.entry ?? item.added) && <p className="text-sm" style={{ margin: 0, color: 'var(--ink-2)' }}>{item.entry ?? item.added}</p>}
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {(session?.combats || session?.loot_rewards) && (
              <Section glyph="⚔" title="Combats & loot">
                <div className="flex flex-wrap gap-3">
                  {session.combats && <div style={{ ...card, flex: '1 1 280px', padding: 14 }}><div className="as-ll" style={{ marginBottom: 6 }}>Combats</div><SfProse text={session.combats} /></div>}
                  {session.loot_rewards && <div style={{ ...card, flex: '1 1 280px', padding: 14 }}><div className="as-ll" style={{ marginBottom: 6 }}>Loot &amp; rewards</div><SfProse text={session.loot_rewards} /></div>}
                </div>
              </Section>
            )}

            {session?.hooks_notes && <Section glyph="✧" title="Left open for next time"><SfProse text={session.hooks_notes} /></Section>}
            {session?.dm_notes && <Section glyph="✎" title="DM notes" aside={<Badge color="muted">DM only</Badge>}><SfProse text={session.dm_notes} /></Section>}
          </main>

          <aside style={{ flex: '1 1 280px', minWidth: 0, maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Section glyph="◉" title="Recording">
              <div style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => play(0)}><Play size={12} /> Play</Button>
                  <span className="cm-kbd" style={{ color: 'var(--ink-2)' }}>{recording.duration_ms ? clockLabel(recording.duration_ms) : ''}</span>
                </div>
                <audio ref={audio} controls preload="none" style={{ width: '100%', height: 32 }} />
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                  {[
                    recording.audio_expires_at ? `Audio kept until ${new Date(recording.audio_expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Audio kept',
                    segments.length ? `${segments.length.toLocaleString()} transcript lines` : '',
                  ].filter(Boolean).join(' · ')}
                </span>
              </div>
            </Section>

            {written.length > 0 && (
              <Section glyph="❧" title={`Written to the campaign · ${written.length}`}>
                <div style={{ ...card, padding: '4px 14px' }}>
                  {written.map((w, i) => (
                    <div key={w.key} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', gap: 8, padding: '7px 0', borderTop: i ? '1px solid var(--rule-soft)' : undefined }}>
                      <span aria-hidden="true" style={{ color: 'var(--gold)' }}>{w.glyph}</span>
                      <div className="flex flex-col" style={{ minWidth: 0 }}>
                        {w.item ? nameLink(w.item) : <span style={{ fontSize: 15 }}>{w.name}</span>}
                        <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{w.what}</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center gap-2" style={{ padding: '10px 0', borderTop: '1px solid var(--rule-soft)' }}>
                    <span className="text-xs" style={{ color: 'var(--ink-3)', flex: 1 }}>{model.edited} edited by you · {model.skipped} skipped</span>
                    <Button variant="link" onClick={() => setShowReview(true)}>Review or undo</Button>
                  </div>
                </div>
              </Section>
            )}

            {moments.length > 0 && (
              <Section glyph="✦" title="Key moments">
                <div style={{ ...card, padding: '4px 10px' }}>
                  {moments.map((m, i) => (
                    <div key={m.id} className="flex items-center gap-2" style={{ padding: '6px 0', borderTop: i ? '1px solid var(--rule-soft)' : undefined }}>
                      {time(m.at_ms)}
                      <span className="text-sm" style={{ color: m.label ? 'var(--ink)' : 'var(--ink-3)' }}>{m.label || 'Marked moment'}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </aside>
        </div>
      </div>

      {showTranscript && <TranscriptModal recording={recording} onClose={() => setShowTranscript(false)} />}
      {showReview && (
        <ChronicleReview
          recording={recording}
          onClose={() => { setShowReview(false); void load(); }}
          onChanged={r => { setRecording(prev => ({ ...prev, ...r })); onChanged?.(r); }}
        />
      )}
    </div>
  );
}
