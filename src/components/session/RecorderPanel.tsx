// src/components/session/RecorderPanel.tsx
// -----------------------------------------------------------
// The session recorder on a session's detail page: start (with per-player
// consent), the live recorder (timer, level, pause, marked moments), resuming an
// interrupted recording, uploading a recording made elsewhere, and the list of
// saved recordings with playback.
// -----------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { Mic, Pause, Play, Square, Upload, Bookmark, X, ScrollText, ListChecks } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { useRecording } from '../../context/RecordingContext';
import { PlayerConsents, RecordingTracks, SessionAudio, SessionRecordings } from '../../lib/db';
import type { PlayerConsent, RecordingMoment, Session, SessionRecording, SpeakerLink } from '../../lib/database.types';
import { listMicrophones } from '../../lib/recording/audio';
import { transcription } from '../../lib/recording/transcriptionApi';
import { durationLabel } from '../../lib/recording/chronicle';
import { savedChronicleSettings, useWriteChronicle } from '../../hooks/useWriteChronicle';
import { TranscriptModal } from './TranscriptModal';
import { ChronicleModal } from './ChronicleModal';
import { ChronicleReview } from './ChronicleReview';
import { PostRecapModal } from './PostRecapModal';
import { OverflowMenu } from '../ui/OverflowMenu';
import { useChroniclePipelineMaybe } from '../../context/ChroniclePipelineContext';
import { STAGE_LABEL, type PipelineStage } from '../../lib/recording/pipeline';
import { DiscordMembers, DiscordStateLine } from './DiscordVoice';
import { useDiscordBot, useDiscordCapture } from '../../hooks/useDiscordBot';
import { rememberChannel, rememberedChannel, voiceChannels } from '../../lib/discord';
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

const WAVE_BARS = 64;

/** The last few seconds of sound as bars, newest on the right. */
function Waveform({ getLevel, paused }: { getLevel: () => number; paused: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (paused) return;
    const levels: number[] = Array(WAVE_BARS).fill(0);
    const t = setInterval(() => {
      levels.shift();
      levels.push(getLevel());
      const bars = box.current?.children;
      if (!bars) return;
      for (let i = 0; i < bars.length; i++) {
        const el = bars[i] as HTMLElement;
        el.style.height = `${Math.max(4, Math.round(levels[i] * 42))}px`;
      }
    }, 120);
    return () => clearInterval(t);
  }, [getLevel, paused]);
  return (
    <div ref={box} aria-hidden="true" style={{ flex: '1 1 280px', minWidth: 200, height: 44, display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden' }}>
      {Array.from({ length: WAVE_BARS }, (_, i) => (
        <span key={i} style={{ flex: '0 0 4px', height: 4, borderRadius: 2, background: paused ? 'var(--ink-4)' : 'var(--gold)', transition: 'height 100ms linear' }} />
      ))}
    </div>
  );
}

// --------------- Start dialog ---------------

/** Mic, consent and Discord for a session's recording, then it starts. */
export function StartRecordingModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const { pcs, selectedCampaignId } = useCampaign();
  const { start, busy } = useRecording();
  const toast = useToast();
  const activePcs = pcs.filter(p => p.is_active);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [atTable, setAtTable] = useState<Set<string>>(() => new Set(activePcs.map(p => p.id)));
  const [consents, setConsents] = useState<PlayerConsent[] | null>(null); // null while loading
  const bot = useDiscordBot();
  const channels = voiceChannels(bot.presence);
  const [channelId, setChannelId] = useState<string | null>(() => rememberedChannel(selectedCampaignId));
  const channel = bot.online ? channels.find(c => c.channelId === channelId) ?? null : null;

  // Someone linked to a PC in the Discord channel isn't at the table.
  const memberKey = channel?.members.map(m => m.id).join(',') ?? '';
  const onLinks = (links: SpeakerLink[]) => {
    const inChannel = new Set(memberKey.split(',').filter(Boolean));
    const remote = new Set(links.filter(l => l.pc_id && inChannel.has(l.discord_user_id)).map(l => l.pc_id!));
    if (remote.size) setAtTable(prev => new Set([...prev].filter(id => !remote.has(id))));
  };

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
      rememberChannel(selectedCampaignId, channel?.channelId ?? null);
      await start(session.id, {
        deviceId: deviceId || undefined,
        tablePcIds: [...atTable],
        discord: channel ? { guildId: channel.guildId, channelId: channel.channelId, channelName: channel.channelName } : null,
      });
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

        <div>
          <SectionLabel label="Players on Discord" />
          {!bot.loaded ? (
            <p className="text-sm" style={{ color: 'var(--ink-3)', margin: 0 }}>Checking for the Discord bot…</p>
          ) : !bot.online ? (
            <p className="text-sm" style={{ color: 'var(--ink-3)', margin: 0 }}>
              To record players on Discord, start the DM Lair bot on this computer (<span className="cm-kbd">npm run bot</span>). Setup is in Settings → Discord.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <select className="as-select" aria-label="Discord voice channel" value={channel?.channelId ?? ''} onChange={e => setChannelId(e.target.value || null)}>
                <option value="">Don’t record Discord</option>
                {channels.map(c => (
                  <option key={c.channelId} value={c.channelId}>{c.label}{c.members.length ? ` · ${c.members.filter(m => !m.bot).length} in it` : ''}</option>
                ))}
              </select>
              {channel && <DiscordMembers members={channel.members} consents={consents} onLinksChange={onLinks} />}
              {channel && (
                <p className="text-xs" style={{ color: 'var(--ink-3)', margin: 0 }}>
                  The bot records each person on their own track and posts a notice in the channel. Tick “Agreed to recording” above for players on Discord too.
                </p>
              )}
            </div>
          )}
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
  const { pcs } = useCampaign();
  const discord = useDiscordCapture(live?.recording ?? null);
  const bot = useDiscordBot(!!live?.recording.discord_state);
  const [consents, setConsents] = useState<PlayerConsent[] | null>(null);
  const [mic, setMic] = useState<string | null>(null);
  const campaignId = live?.recording.campaign_id;
  const trackId = live?.trackId;
  const recordingId = live?.recording.id;
  useEffect(() => {
    if (campaignId) PlayerConsents.getAll(campaignId).then(setConsents).catch(() => setConsents([]));
  }, [campaignId]);
  // The table microphone's name, as the track was saved with it.
  useEffect(() => {
    if (!recordingId || !trackId) return;
    RecordingTracks.getByRecording(recordingId).then(ts => setMic(ts.find(t => t.id === trackId)?.label ?? null)).catch(() => {});
  }, [recordingId, trackId]);
  if (!live) return null;
  const { recording, paused, moments } = live;
  const target = recording.settings.discord;
  const channel = target ? voiceChannels(bot.presence).find(c => c.channelId === target.channelId) : null;

  const stop = async () => {
    if (!(await confirm({ title: 'End recording?', message: 'The recording stops and the audio is saved to this session.', confirmLabel: 'End & save' }))) return;
    try {
      await end(recording.id);
      toast('Recording saved', 'success');
    } catch (e) {
      toast(`Couldn’t finish saving: ${errorMessage(e)} You can try again from this session.`, 'error');
    }
  };

  const atTable = (recording.settings.tablePcIds ?? []).map(id => pcs.find(p => p.id === id)?.character_name).filter(Boolean) as string[];
  const sourceCard: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 };

  return (
    <section aria-label="Recorder" style={{ background: 'var(--paper-2)', border: '1px solid var(--rule)', borderRadius: 'var(--radius-lg)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="flex items-center flex-wrap" style={{ gap: 18 }}>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: '50%', background: paused ? 'var(--ink-3)' : 'var(--red)', boxShadow: paused ? 'none' : '0 0 0 4px var(--red-dim)' }} />
          <Badge color={paused ? 'muted' : 'red'}>{paused ? 'Paused' : 'Recording'}</Badge>
          <Elapsed startedAt={recording.started_at} style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 500, color: 'var(--ink)', letterSpacing: '0.04em' }} />
        </div>
        <Waveform getLevel={getLevel} paused={paused} />
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={() => void markMoment().catch(e => toast(errorMessage(e), 'error'))} disabled={paused}>
            <Bookmark size={13} /> Mark moment <span className="cm-kbd">M</span>
          </Button>
          {paused
            ? <Button onClick={resume}><Play size={13} /> Resume</Button>
            : <Button onClick={pause}><Pause size={13} /> Pause</Button>}
          <Button variant="primary" onClick={() => void stop()} disabled={busy}>
            <Square size={12} /> {busy ? 'Saving…' : 'End & save'}
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, borderTop: '1px solid var(--rule-soft)', paddingTop: 14 }}>
        <div style={sourceCard}>
          <div className="flex items-center gap-2 flex-wrap">
            <span aria-hidden="true" style={{ color: 'var(--gold)' }}>✦</span>
            <span style={{ fontWeight: 500 }}>At the table</span>
            <Badge color={paused ? 'muted' : 'green'}>{paused ? 'Paused' : 'Live'}</Badge>
            <span style={{ flex: 1 }} />
            {mic && <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{mic}</span>}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: 'var(--ink-2)', width: 110 }}>Room level</span>
            <LevelMeter getLevel={getLevel} />
          </div>
          <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
            {atTable.length ? `You${atTable.length > 1 ? ', ' : ' and '}${atTable.length > 1 ? `${atTable.slice(0, -1).join(', ')} and ${atTable[atTable.length - 1]}` : atTable[0]} · consent recorded` : 'You'}
          </span>
        </div>

        {target && (
          <div style={sourceCard}>
            <div className="flex items-center gap-2 flex-wrap">
              <span aria-hidden="true" style={{ color: 'var(--link-faction)' }}>◈</span>
              <span style={{ fontWeight: 500 }}>On Discord</span>
              <DiscordStateLine state={discord?.discord_state} detail={null} botOnline={bot.online} />
              <span style={{ flex: 1 }} />
              <span className="text-xs" style={{ color: 'var(--ink-3)' }}>#{target.channelName}{bot.presence?.bot_tag ? ` · ${bot.presence.bot_tag.replace(/#\d+$/, '')}` : ''}</span>
            </div>
            {discord?.discord_detail && (
              <span className="text-xs" style={{ color: discord.discord_state === 'failed' ? 'var(--warn)' : 'var(--ink-2)' }}>
                {discord.discord_state === 'failed' && <span aria-hidden="true">△ </span>}{discord.discord_detail}
              </span>
            )}
            <details>
              <summary className="text-xs" style={{ cursor: 'pointer', color: 'var(--gold)' }}>Who’s who on Discord</summary>
              <div style={{ marginTop: 8 }}>
                {channel
                  ? <DiscordMembers members={channel.members} consents={consents} />
                  : <p className="text-sm" style={{ color: 'var(--ink-3)', margin: 0 }}>The bot can’t see this channel right now.</p>}
              </div>
            </details>
          </div>
        )}
      </div>

      <div className="flex items-center flex-wrap text-xs" style={{ gap: '8px 20px', color: 'var(--ink-3)' }}>
        <span>Saved every minute{upload.pending > 0 ? ` · ${upload.pending} waiting to upload` : ' · all uploaded'}</span>
        {target && <span style={{ color: 'var(--ink-2)' }}><span aria-hidden="true" style={{ color: 'var(--gold)' }}>✧</span> Wear headphones so the table mic doesn’t hear Discord twice</span>}
        {upload.error && (
          <span style={{ color: 'var(--warn)' }}>
            Upload paused: {upload.error} <Button variant="link" onClick={retryUploads}>Retry now</Button>
          </span>
        )}
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

const STAGE_COLOR: Record<PipelineStage, 'gold' | 'green' | 'red' | 'muted' | 'blue'> = {
  saving: 'muted', 'not-transcribed': 'muted', transcribing: 'muted', transcribed: 'blue', writing: 'muted', ready: 'gold', applied: 'green',
};

/**
 * One recording as one row: where it is on its way to a chronicle, the one
 * step it needs next, and everything else in a menu. The steps run on their
 * own for recordings started with that on (see ChroniclePipelineContext).
 */
function SavedRecordingRow({ recording: initial, session, onDiscard }: { recording: SessionRecording; session: Session; onDiscard: () => void }) {
  const toast = useToast();
  const pipeline = useChroniclePipelineMaybe();
  const entry = pipeline.entryFor(initial.id);
  const [audio, setAudio] = useState<{ label: string; url: string }[] | null>(null);
  const [recording, setRecording] = useState(initial);
  const [busy, setBusy] = useState<null | 'transcribe' | 'fill'>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showChronicle, setShowChronicle] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showPost, setShowPost] = useState(false);
  const writeChronicle = useWriteChronicle();

  useEffect(() => { setRecording(entry?.recording ?? initial); }, [initial, entry?.recording]);

  const stage: PipelineStage = entry?.stage ?? (recording.status === 'applied' ? 'applied' : recording.status === 'review' ? 'ready' : 'not-transcribed');
  const missing = stage === 'ready' ? recording.settings.chronicleMissing ?? [] : [];
  const transcribed = stage === 'transcribed' || stage === 'writing' || stage === 'ready' || stage === 'applied';
  const changed = () => pipeline.refresh();

  const transcribe = async () => {
    setBusy('transcribe');
    try {
      await transcription(recording.id, 'start');
      changed();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const fillIn = async () => {
    setBusy('fill');
    try {
      const result = await writeChronicle(recording, savedChronicleSettings(recording), true);
      setRecording(r => ({ ...r, status: result.status, status_detail: result.status_detail, settings: result.settings }));
      changed();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
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

  // The one thing to do next.
  const next = (() => {
    if (stage === 'not-transcribed') {
      return <Button size="xs" variant="primary" onClick={() => void transcribe()} disabled={!!busy}>{busy === 'transcribe' ? 'Starting…' : 'Transcribe'}</Button>;
    }
    if (stage === 'transcribed') {
      return <Button size="xs" variant="primary" onClick={() => setShowChronicle(true)}><ScrollText size={11} /> Write the chronicle</Button>;
    }
    if (stage === 'ready' && missing.length > 0) {
      return <Button size="xs" variant="primary" onClick={() => void fillIn()} disabled={!!busy}><ScrollText size={11} /> {busy === 'fill' ? 'Writing…' : 'Fill in missing parts'}</Button>;
    }
    if (stage === 'ready') {
      return <Button size="xs" variant="primary" onClick={() => setShowReview(true)}><ListChecks size={11} /> Review {entry?.pending ? `${entry.pending} change${entry.pending === 1 ? '' : 's'}` : 'changes'}</Button>;
    }
    return null;
  })();

  const moving = stage === 'saving' || stage === 'transcribing' || stage === 'writing';
  const detail = moving
    ? stage === 'transcribing' ? 'Transcribing… a few minutes per hour of audio. You can leave this page.'
      : stage === 'writing' ? 'Writing the chronicle… a minute or two. You can leave this page.'
      : 'Saving the audio…'
    : entry?.error ?? recording.status_detail;

  const menu = [
    ...(transcribed ? [{ label: 'Transcript', onClick: () => setShowTranscript(true) }] : []),
    ...(audio ? [] : [{ label: 'Listen', onClick: () => void listen() }]),
    ...(stage === 'ready' && missing.length > 0 ? [{ label: 'Review changes', onClick: () => setShowReview(true) }] : []),
    ...(stage === 'ready' ? [{ label: 'Rewrite the chronicle', onClick: () => setShowChronicle(true) }] : []),
    ...(stage === 'applied' ? [{ label: 'Review the write-back', onClick: () => setShowReview(true) }] : []),
    ...(stage === 'applied' ? [{ label: 'Post player recap to Discord', onClick: () => setShowPost(true) }] : []),
    { label: 'Delete recording', onClick: onDiscard, danger: true },
  ];

  return (
    <li className="rr">
      <div className="rr-row">
        <Badge color={STAGE_COLOR[stage]}>{moving && <span aria-hidden="true">◐ </span>}{STAGE_LABEL[stage]}</Badge>
        <span className="rr-when">
          {new Date(recording.started_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          {recording.duration_ms ? <span className="rr-len"> · {formatDuration(recording.duration_ms)}</span> : null}
        </span>
        <span style={{ flex: 1 }} />
        {next}
        <OverflowMenu items={menu} />
      </div>
      {detail && (
        <span className="rr-detail" style={{ color: entry?.error || recording.status === 'failed' ? 'var(--red)' : missing.length ? 'var(--warn)' : undefined }}>{detail}</span>
      )}
      {showTranscript && <TranscriptModal recording={recording} onClose={() => setShowTranscript(false)} />}
      {showReview && (
        <ChronicleReview
          recording={recording}
          onClose={() => { setShowReview(false); changed(); }}
          onChanged={r => { setRecording(prev => ({ ...prev, ...r })); changed(); }}
        />
      )}
      {showChronicle && (
        <ChronicleModal
          recording={recording}
          rewrite={stage === 'ready'}
          onClose={() => setShowChronicle(false)}
          onOpenTranscript={() => { setShowChronicle(false); setShowTranscript(true); }}
          onWritten={r => { setRecording(prev => ({ ...prev, status: r.status, status_detail: r.status_detail, settings: r.settings })); changed(); }}
        />
      )}
      {showPost && <PostRecapModal recording={recording} session={session} onClose={() => setShowPost(false)} />}
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
            {saved.map(r => <SavedRecordingRow key={r.id} recording={r} session={session} onDiscard={() => void confirmDiscard(r)} />)}
          </ul>
        )}
      </div>
      {starting && <StartRecordingModal session={session} onClose={() => setStarting(false)} />}
    </div>
  );
}

/** A small "● REC" pill for the top bar while a recording runs anywhere in the app. */
export function RecordingIndicator({ onOpen }: { onOpen: (sessionId: string) => void }) {
  const { live } = useRecording();
  if (!live) return null;
  return (
    <Button
      size="xs"
      onClick={() => onOpen(live.recording.session_id)}
      aria-label={live.paused ? 'Recording paused — open the session being recorded' : 'Recording — open the session being recorded'}
      style={{ borderRadius: 999, borderColor: live.paused ? 'var(--rule)' : 'var(--red-line)', background: live.paused ? 'var(--paper-2)' : 'var(--red-bg)', color: live.paused ? 'var(--ink-2)' : 'var(--red)', fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}
    >
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: live.paused ? 'var(--ink-3)' : 'var(--red)' }} />
      {live.paused ? 'PAUSED' : 'REC'} <Elapsed startedAt={live.recording.started_at} />
    </Button>
  );
}
