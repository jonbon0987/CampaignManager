// src/components/session/RecorderPanel.tsx
// -----------------------------------------------------------
// The session recorder on a session's detail page: start (with per-player
// consent), the live recorder (timer, level, pause, marked moments), resuming an
// interrupted recording, uploading a recording made elsewhere, and the list of
// saved recordings with playback.
// -----------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { Mic, Pause, Play, Square, Upload, Bookmark, X, FileText, ScrollText, ListChecks, BookOpen } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { useRecording } from '../../context/RecordingContext';
import { PlayerConsents, RecordingTracks, SessionAudio, SessionRecordings } from '../../lib/db';
import type { PlayerConsent, RecordingMoment, Session, SessionRecording } from '../../lib/database.types';
import { listMicrophones } from '../../lib/recording/audio';
import { transcription, type TranscriptionState } from '../../lib/recording/transcriptionApi';
import { durationLabel } from '../../lib/recording/chronicle';
import { TranscriptModal } from './TranscriptModal';
import { ChronicleModal } from './ChronicleModal';
import { ChronicleReview } from './ChronicleReview';
import { ChronicleView } from './ChronicleView';
import { Modal } from '../Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

const formatDuration = durationLabel;

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="cm-section-head" style={{ marginBottom: 8 }}>
      <span className="cm-section-title">{label}</span>
      <div className="cm-section-rule" />
    </div>
  );
}

/** Elapsed time on the session clock, ticking once a second. */
function Elapsed({ startedAt, style }: { startedAt: string; style?: React.CSSProperties }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span style={style}>{formatClock(now - Date.parse(startedAt))}</span>;
}

/** Input level, drawn straight to the DOM so it doesn't re-render the page. */
function LevelMeter({ getLevel }: { getLevel: () => number }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    let shown = 0;
    const tick = () => {
      // Rise fast, fall slowly, like a VU meter.
      const next = getLevel();
      shown = next > shown ? next : shown * 0.9;
      if (bar.current) bar.current.style.width = `${Math.round(shown * 100)}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getLevel]);
  return (
    <div aria-hidden="true" style={{ flex: '1 1 160px', minWidth: 120, height: 6, borderRadius: 999, background: 'var(--paper-3)', overflow: 'hidden' }}>
      <div ref={bar} style={{ width: 0, height: '100%', background: 'var(--gold)', transition: 'width 60ms linear' }} />
    </div>
  );
}

// --------------- Start dialog ---------------

function StartRecordingModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const { pcs, selectedCampaignId } = useCampaign();
  const { start, busy } = useRecording();
  const toast = useToast();
  const activePcs = pcs.filter(p => p.is_active);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [atTable, setAtTable] = useState<Set<string>>(() => new Set(activePcs.map(p => p.id)));
  const [consents, setConsents] = useState<PlayerConsent[] | null>(null); // null while loading

  useEffect(() => {
    void listMicrophones().then(setMics).catch(() => setMics([]));
    if (selectedCampaignId) void PlayerConsents.getAll(selectedCampaignId).then(setConsents).catch(() => setConsents([]));
  }, [selectedCampaignId]);

  const consentFor = (pcId: string) => consents?.find(c => c.pc_id === pcId && !c.revoked_at);
  const missingConsent = consents ? activePcs.filter(p => atTable.has(p.id) && !consentFor(p.id)) : [];

  const toggleConsent = async (pcId: string) => {
    if (!selectedCampaignId) return;
    try {
      const current = consentFor(pcId);
      const saved = current
        ? await PlayerConsents.revoke(current.id)
        : await PlayerConsents.grant({ campaign_id: selectedCampaignId, pc_id: pcId, method: 'in_person' });
      setConsents(prev => [...(prev ?? []).filter(c => c.pc_id !== pcId), saved]);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const toggleTable = (pcId: string) => setAtTable(prev => {
    const next = new Set(prev);
    if (next.has(pcId)) next.delete(pcId); else next.add(pcId);
    return next;
  });

  const begin = async () => {
    try {
      await start(session.id, { deviceId: deviceId || undefined, tablePcIds: [...atTable] });
      onClose();
    } catch (e) {
      const msg = errorMessage(e);
      toast(/denied|NotAllowed/i.test(msg) ? 'Microphone access was blocked. Allow it in your browser’s site settings and try again.' : msg, 'error');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Record Session ${session.session_number}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={begin} disabled={busy || consents === null || missingConsent.length > 0}>
            <Mic size={14} /> {busy ? 'Starting…' : 'Start recording'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="as-fl">
          <label className="as-ll" htmlFor="rec-mic">Table microphone</label>
          <select id="rec-mic" className="as-select" value={deviceId} onChange={e => setDeviceId(e.target.value)}>
            <option value="">System default</option>
            {mics.filter(m => m.deviceId && m.deviceId !== 'default').map(m => (
              <option key={m.deviceId} value={m.deviceId}>{m.label || 'Microphone'}</option>
            ))}
          </select>
        </div>

        <div>
          <SectionLabel label="Players at the table" />
          {activePcs.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--ink-3)', margin: 0 }}>No active player characters in this campaign yet.</p>
          ) : (
            <ul className="flex flex-col" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {activePcs.map(pc => {
                const consent = consentFor(pc.id);
                const here = atTable.has(pc.id);
                return (
                  <li key={pc.id} className="flex items-center gap-3 flex-wrap" style={{ padding: '8px 0', borderBottom: '1px solid var(--rule-soft)' }}>
                    <label className="flex items-center gap-2" style={{ flex: '1 1 200px', color: here ? 'var(--ink)' : 'var(--ink-3)' }}>
                      <input type="checkbox" checked={here} onChange={() => toggleTable(pc.id)} />
                      <span style={{ fontWeight: 500 }}>{pc.character_name}</span>
                      {pc.player_name && <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{pc.player_name}</span>}
                    </label>
                    <label className="flex items-center gap-2 text-xs" style={{ color: consent ? 'var(--success)' : 'var(--ink-2)' }}>
                      <input type="checkbox" checked={!!consent} disabled={consents === null} onChange={() => void toggleConsent(pc.id)} />
                      {consent ? `Agreed to recording · ${new Date(consent.consented_at).toLocaleDateString()}` : 'Agreed to recording'}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs" style={{ color: missingConsent.length ? 'var(--warn)' : 'var(--ink-3)', margin: '10px 0 0' }}>
            {consents === null && activePcs.length > 0
              ? 'Checking who has agreed to recording…'
              : missingConsent.length
              ? `Ask ${missingConsent.map(p => p.player_name || p.character_name).join(', ')} before recording, or untick them if they aren’t here.`
              : 'Consent is remembered for this campaign. Untick anyone who isn’t at the table tonight.'}
          </p>
        </div>

        <p className="text-xs" style={{ color: 'var(--ink-3)', margin: 0 }}>
          Audio is saved on this device every minute and uploaded to your private storage as you go. Keep this tab open; switching tabs in the app is fine.
        </p>
      </div>
    </Modal>
  );
}

// --------------- Live recorder ---------------

function MomentRow({ moment, onRename, onDelete }: { moment: RecordingMoment; onRename: (label: string) => void; onDelete: () => void }) {
  // Only this input edits the label, so local state never goes stale.
  const [label, setLabel] = useState(moment.label ?? '');
  return (
    <li className="flex items-center gap-2">
      <span className="cm-kbd" style={{ color: 'var(--gold)', minWidth: 56 }}>{formatClock(moment.at_ms)}</span>
      <input
        className="as-input"
        style={{ flex: 1, padding: '3px 8px', fontSize: 13 }}
        value={label}
        placeholder="What happened? (optional)"
        aria-label={`Label for moment at ${formatClock(moment.at_ms)}`}
        maxLength={240}
        onChange={e => setLabel(e.target.value)}
        onBlur={() => { if (label !== (moment.label ?? '')) onRename(label); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      <Button variant="ghost" size="xs" aria-label="Remove moment" onClick={onDelete}><X size={14} /></Button>
    </li>
  );
}

function LiveRecorder() {
  const { live, busy, upload, getLevel, pause, resume, markMoment, renameMoment, deleteMoment, end, retryUploads } = useRecording();
  const confirm = useConfirm();
  const toast = useToast();
  if (!live) return null;
  const { recording, paused, moments } = live;

  const stop = async () => {
    if (!(await confirm({ title: 'End recording?', message: 'The recording stops and the audio is saved to this session.', confirmLabel: 'End & save' }))) return;
    try {
      await end(recording.id);
      toast('Recording saved', 'success');
    } catch (e) {
      toast(`Couldn’t finish saving: ${errorMessage(e)} You can try again from this session.`, 'error');
    }
  };

  return (
    <section aria-label="Recorder" style={{ background: 'var(--paper-2)', border: '1px solid var(--rule)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: paused ? 'var(--ink-3)' : 'var(--red)', boxShadow: paused ? 'none' : '0 0 0 4px var(--red-dim)' }} />
          <Badge color={paused ? 'muted' : 'red'}>{paused ? 'Paused' : 'Recording'}</Badge>
          <Elapsed startedAt={recording.started_at} style={{ fontFamily: 'var(--mono)', fontSize: 22, color: 'var(--ink)', letterSpacing: '0.04em' }} />
        </div>
        <LevelMeter getLevel={getLevel} />
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => void markMoment().catch(e => toast(errorMessage(e), 'error'))} disabled={paused}>
            <Bookmark size={13} /> Mark moment <span className="cm-kbd">M</span>
          </Button>
          {paused
            ? <Button size="sm" onClick={resume}><Play size={13} /> Resume</Button>
            : <Button size="sm" onClick={pause}><Pause size={13} /> Pause</Button>}
          <Button size="sm" variant="primary" onClick={() => void stop()} disabled={busy}>
            <Square size={12} /> {busy ? 'Saving…' : 'End & save'}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs" style={{ color: 'var(--ink-3)', borderTop: '1px solid var(--rule-soft)', paddingTop: 10 }}>
        <span>Saved every minute{upload.pending > 0 ? ` · ${upload.pending} waiting to upload` : ' · all uploaded'}</span>
        {upload.error && (
          <span style={{ color: 'var(--warn)' }}>
            Upload paused: {upload.error} <Button variant="link" onClick={retryUploads}>Retry now</Button>
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>{(recording.settings.tablePcIds?.length ?? 0)} at the table · consent recorded</span>
      </div>

      {moments.length > 0 && (
        <div>
          <SectionLabel label={`Marked moments · ${moments.length}`} />
          <ul className="flex flex-col gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {moments.map(m => (
              <MomentRow
                key={m.id}
                moment={m}
                onRename={label => void renameMoment(m, label).catch(e => toast(errorMessage(e), 'error'))}
                onDelete={() => void deleteMoment(m.id).catch(e => toast(errorMessage(e), 'error'))}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// --------------- Saved recordings ---------------

const STATUS_LABEL: Record<string, { label: string; color: 'gold' | 'green' | 'red' | 'muted' | 'blue' }> = {
  processing: { label: 'Saved', color: 'muted' },
  uploading: { label: 'Saving', color: 'muted' },
  review: { label: 'Ready to review', color: 'gold' },
  applied: { label: 'Applied', color: 'green' },
  failed: { label: 'Failed', color: 'red' },
  cancelled: { label: 'Cancelled', color: 'muted' },
};

const POLL_MS = 8_000;

function SavedRecordingRow({ recording: initial, onDiscard }: { recording: SessionRecording; onDiscard: () => void }) {
  const toast = useToast();
  const [audio, setAudio] = useState<{ label: string; url: string }[] | null>(null);
  const [recording, setRecording] = useState(initial);
  const [tracks, setTracks] = useState<TranscriptionState['tracks'] | null>(null);
  const [starting, setStarting] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showChronicle, setShowChronicle] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showView, setShowView] = useState(false);
  const status = STATUS_LABEL[recording.status] ?? { label: recording.status, color: 'muted' as const };

  useEffect(() => { setRecording(initial); }, [initial]);

  useEffect(() => {
    let cancelled = false;
    RecordingTracks.getByRecording(initial.id)
      .then(rows => { if (!cancelled) setTracks(rows.filter(t => t.storage_path)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [initial.id]);

  const transcribing = !!tracks?.some(t => t.transcription_status === 'submitted');
  const canTranscribe = !!tracks?.some(t => t.transcription_status === 'pending' || t.transcription_status === 'failed');
  const transcribed = !!tracks?.length && tracks.every(t => t.transcription_status === 'done');

  // While AssemblyAI works, ask the server to check in every few seconds.
  useEffect(() => {
    if (!transcribing) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const state = await transcription(initial.id, 'poll');
        if (cancelled) return;
        setTracks(state.tracks);
        setRecording(r => ({ ...r, ...state.recording }));
      } catch (e) {
        if (!cancelled) setRecording(r => ({ ...r, status_detail: e instanceof Error ? e.message : String(e) }));
      }
    };
    const t = setInterval(() => void tick(), POLL_MS);
    void tick();
    return () => { cancelled = true; clearInterval(t); };
  }, [transcribing, initial.id]);

  const transcribe = async () => {
    setStarting(true);
    try {
      const state = await transcription(recording.id, 'start');
      setTracks(state.tracks);
      setRecording(r => ({ ...r, ...state.recording }));
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setStarting(false);
    }
  };

  const listen = async () => {
    try {
      const tracks = (await RecordingTracks.getByRecording(recording.id)).filter(t => t.storage_path);
      setAudio(await Promise.all(tracks.map(async t => ({ label: t.label ?? 'Audio', url: await SessionAudio.signedUrl(t.storage_path!) }))));
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <li style={{ padding: '10px 0', borderBottom: '1px solid var(--rule-soft)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="flex items-center gap-3 flex-wrap">
        <Badge color={status.color}>{status.label}</Badge>
        <span className="text-sm" style={{ color: 'var(--ink)' }}>
          {new Date(recording.started_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
        {recording.duration_ms ? <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{formatDuration(recording.duration_ms)}</span> : null}
        <span style={{ flex: 1 }} />
        {recording.status === 'applied' && (
          <Button size="xs" variant="primary" onClick={() => setShowView(true)}><BookOpen size={11} /> Chronicle</Button>
        )}
        {(recording.status === 'review' || recording.status === 'applied') && (
          <Button size="xs" variant={recording.status === 'review' ? 'primary' : 'secondary'} onClick={() => setShowReview(true)}>
            <ListChecks size={11} /> {recording.status === 'review' ? 'Review changes' : 'Review'}
          </Button>
        )}
        {transcribed && recording.status !== 'applied' && (
          <Button size="xs" variant={recording.status === 'review' ? 'secondary' : 'primary'} onClick={() => setShowChronicle(true)}>
            <ScrollText size={11} /> {recording.status === 'review' ? 'Rewrite chronicle' : 'Write the chronicle'}
          </Button>
        )}
        {transcribed && <Button size="xs" onClick={() => setShowTranscript(true)}><FileText size={11} /> Transcript</Button>}
        {canTranscribe && !transcribing && (
          <Button size="xs" variant="primary" onClick={() => void transcribe()} disabled={starting}>
            {starting ? 'Starting…' : tracks?.some(t => t.transcription_status === 'failed') ? 'Try transcribing again' : 'Transcribe'}
          </Button>
        )}
        {!audio && <Button size="xs" onClick={() => void listen()}><Play size={11} /> Listen</Button>}
        <Button size="xs" variant="danger" onClick={onDiscard}>Delete</Button>
      </div>
      {transcribing ? (
        <span className="text-xs flex items-center gap-2" style={{ color: 'var(--ink-2)' }}>
          <span aria-hidden="true" style={{ color: 'var(--gold)' }}>◐</span>
          Transcribing… this takes a few minutes per hour of audio. You can leave this page.
        </span>
      ) : recording.status_detail && (
        <span className="text-xs" style={{ color: recording.status === 'failed' ? 'var(--red)' : 'var(--ink-3)' }}>{recording.status_detail}</span>
      )}
      {showTranscript && <TranscriptModal recording={recording} onClose={() => setShowTranscript(false)} />}
      {showReview && (
        <ChronicleReview
          recording={recording}
          onClose={() => setShowReview(false)}
          onChanged={r => setRecording(prev => ({ ...prev, ...r }))}
        />
      )}
      {showView && (
        <ChronicleView
          recording={recording}
          onClose={() => setShowView(false)}
          onChanged={r => setRecording(prev => ({ ...prev, ...r }))}
        />
      )}
      {showChronicle && (
        <ChronicleModal
          recording={recording}
          rewrite={recording.status === 'review'}
          onClose={() => setShowChronicle(false)}
          onOpenTranscript={() => { setShowChronicle(false); setShowTranscript(true); }}
          onWritten={r => setRecording(prev => ({ ...prev, status: r.status, status_detail: r.status_detail }))}
        />
      )}
      {audio?.map(a => (
        <div key={a.url} className="flex items-center gap-2 flex-wrap">
          <span className="text-xs" style={{ color: 'var(--ink-2)', minWidth: 120 }}>{a.label}</span>
          <audio controls preload="metadata" src={a.url} style={{ flex: 1, minWidth: 220, height: 32 }} />
        </div>
      ))}
    </li>
  );
}

// --------------- Panel ---------------

export function RecorderPanel({ session }: { session: Session }) {
  const { sessions } = useCampaign();
  const { live, interrupted, busy, version, resumeInterrupted, end, discard, uploadFile } = useRecording();
  const confirm = useConfirm();
  const toast = useToast();
  const [starting, setStarting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState<SessionRecording[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    SessionRecordings.getBySession(session.id)
      .then(rows => { if (!cancelled) setSaved(rows.filter(r => r.status !== 'recording' && r.status !== 'uploading')); })
      .catch(e => console.error('Failed to load recordings', e));
    return () => { cancelled = true; };
  }, [session.id, version]);

  const isLiveHere = live?.recording.session_id === session.id;
  const liveElsewhere = live && !isLiveHere ? sessions.find(s => s.id === live.recording.session_id) : null;
  const interruptedHere = interrupted.filter(r => r.session_id === session.id);

  const run = async (fn: () => Promise<void>, ok?: string) => {
    try { await fn(); if (ok) toast(ok, 'success'); } catch (e) { toast(errorMessage(e), 'error'); }
  };

  const confirmDiscard = async (r: SessionRecording) => {
    if (await confirm({ title: 'Delete recording?', message: 'The audio and anything transcribed from it are deleted. This can’t be undone.', confirmLabel: 'Delete', danger: true })) {
      await run(() => discard(r.id), 'Recording deleted');
    }
  };

  const onFile = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    setUploading(true);
    await run(() => uploadFile(session.id, file), 'Recording uploaded');
    setUploading(false);
  };

  return (
    <div className="cm-section">
      <SectionLabel label="Recording" />
      <div className="flex flex-col gap-3">
        {isLiveHere && <LiveRecorder />}

        {interruptedHere.map(r => (
          <div key={r.id} role="status" style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn-line)', borderRadius: 'var(--radius-lg)', padding: '12px 14px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <span className="text-sm" style={{ flex: '1 1 260px', color: 'var(--ink)' }}>
              {r.status === 'uploading'
                ? 'This recording ended but didn’t finish saving.'
                : `A recording started ${new Date(r.started_at).toLocaleTimeString(undefined, { timeStyle: 'short' })} was interrupted. Audio up to the interruption is kept.`}
            </span>
            {r.status === 'recording' && !live && (
              <Button size="sm" variant="primary" disabled={busy} onClick={() => void run(() => resumeInterrupted(r))}><Mic size={13} /> Resume recording</Button>
            )}
            <Button size="sm" disabled={busy} onClick={() => void run(() => end(r.id), 'Recording saved')}>{r.status === 'uploading' ? 'Try saving again' : 'End & save'}</Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void confirmDiscard(r)}>Delete</Button>
          </div>
        ))}

        {!live && interruptedHere.length === 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="primary" size="sm" onClick={() => setStarting(true)} disabled={busy}><Mic size={13} /> Record this session</Button>
            <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()} disabled={busy}>
              <Upload size={13} /> {uploading ? 'Uploading…' : 'Upload a recording'}
            </Button>
            <input ref={fileInput} type="file" accept="audio/*,.m4a,.webm,.ogg,.opus,.flac" hidden onChange={e => void onFile(e.target.files?.[0])} />
            <span className="text-xs" style={{ color: 'var(--ink-3)' }}>The recording is transcribed and turned into proposed updates you review before anything changes.</span>
          </div>
        )}

        {liveElsewhere && (
          <p className="text-xs" style={{ color: 'var(--ink-3)', margin: 0 }}>
            Session {liveElsewhere.session_number} is being recorded. End that recording to record this one.
          </p>
        )}

        {saved.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {saved.map(r => <SavedRecordingRow key={r.id} recording={r} onDiscard={() => void confirmDiscard(r)} />)}
          </ul>
        )}
      </div>
      {starting && <StartRecordingModal session={session} onClose={() => setStarting(false)} />}
    </div>
  );
}

/** A small "● REC" pill for the top bar while a recording runs anywhere in the app. */
export function RecordingIndicator({ onOpen }: { onOpen: () => void }) {
  const { live } = useRecording();
  if (!live) return null;
  return (
    <Button
      size="xs"
      onClick={onOpen}
      aria-label={live.paused ? 'Recording paused — open Session Notes' : 'Recording — open Session Notes'}
      style={{ borderRadius: 999, borderColor: live.paused ? 'var(--rule)' : 'var(--red-line)', background: live.paused ? 'var(--paper-2)' : 'var(--red-bg)', color: live.paused ? 'var(--ink-2)' : 'var(--red)', fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}
    >
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: live.paused ? 'var(--ink-3)' : 'var(--red)' }} />
      {live.paused ? 'PAUSED' : 'REC'} <Elapsed startedAt={live.recording.started_at} />
    </Button>
  );
}
