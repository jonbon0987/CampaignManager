// src/components/session/TranscriptModal.tsx
// -----------------------------------------------------------
// Reads a recording's transcript, and says who each voice is. A diarized
// voice ("Speaker B" on the table mic) is assigned once and every line it
// spoke follows. Lines the room picked up from Discord are hidden. Lines can be
// searched, and each one plays from its moment, on the track it was heard on.
// -----------------------------------------------------------

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useToast } from '../../context/ToastContext';
import { RecordingTracks, TranscriptSegments } from '../../lib/db';
import type { RecordingTrack, SessionRecording, TranscriptSegment } from '../../lib/database.types';
import { Modal } from '../Modal';
import { Button } from '../ui/Button';
import { useRecordingPlayer } from '../../hooks/useRecordingPlayer';
import { PlayerBar } from './PlayerBar';

const DM = 'dm';

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** `text` with each match of `q` marked. */
function highlight(text: string, q: string): ReactNode {
  if (!q) return text;
  const parts: ReactNode[] = [];
  const lower = text.toLowerCase();
  let at = 0;
  for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, at)) {
    if (i > at) parts.push(text.slice(at, i));
    parts.push(<mark key={i} className="tr-hit">{text.slice(i, i + q.length)}</mark>);
    at = i + q.length;
  }
  parts.push(text.slice(at));
  return parts;
}

interface Voice {
  key: string;
  trackId: string;
  label: string;
  trackLabel: string;
  lines: number;
  sample: string;
  value: string; // '' unknown, 'dm', or a PC id
}

export function TranscriptModal({ recording, onClose }: { recording: SessionRecording; onClose: () => void }) {
  const { pcs } = useCampaign();
  const toast = useToast();
  const [segments, setSegments] = useState<TranscriptSegment[] | null>(null);
  const [tracks, setTracks] = useState<RecordingTrack[]>([]);
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState<TranscriptSegment | null>(null);
  const { audio, playing, positionMs, loading, pause, playTrack, playRecording } = useRecordingPlayer();
  // Closing the transcript stops what it was playing.
  useEffect(() => pause, [pause]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([TranscriptSegments.getByRecording(recording.id), RecordingTracks.getByRecording(recording.id)])
      .then(([segs, trks]) => { if (!cancelled) { setSegments(segs); setTracks(trks); } })
      .catch(e => toast(e instanceof Error ? e.message : String(e), 'error'));
    return () => { cancelled = true; };
  }, [recording.id, toast]);

  const pcName = useMemo(() => new Map(pcs.map(p => [p.id, p.character_name])), [pcs]);
  const visible = useMemo(() => (segments ?? []).filter(s => !s.dropped_as_echo), [segments]);
  const echoes = (segments?.length ?? 0) - visible.length;

  const voices = useMemo<Voice[]>(() => {
    const byKey = new Map<string, Voice>();
    for (const s of visible) {
      if (!s.speaker_label) continue;
      const key = `${s.track_id}|${s.speaker_label}`;
      const v = byKey.get(key);
      if (v) { v.lines++; continue; }
      const track = tracks.find(t => t.id === s.track_id);
      byKey.set(key, {
        key, trackId: s.track_id, label: s.speaker_label, lines: 1, sample: s.text,
        trackLabel: track?.source === 'upload' ? 'Upload' : track?.source === 'discord' ? 'Discord' : 'Table',
        value: s.is_dm ? DM : s.pc_id ?? '',
      });
    }
    return [...byKey.values()].sort((a, b) => b.lines - a.lines);
  }, [visible, tracks]);

  const speakerName = (s: TranscriptSegment) => (s.is_dm ? 'DM' : s.pc_id ? pcName.get(s.pc_id) ?? 'Player' : s.speaker_label ?? 'Unknown');
  const q = query.trim().toLowerCase();
  const shown = q ? visible.filter(s => s.text.toLowerCase().includes(q) || speakerName(s).toLowerCase().includes(q)) : visible;

  // A line plays on the track it was heard on (a Discord player's own track,
  // say), else whichever track covers that moment.
  const play = (s: TranscriptSegment) => {
    setFrom(s);
    const track = tracks.find(t => t.id === s.track_id);
    (track ? playTrack(track, s.start_ms) : playRecording(recording.id, s.start_ms))
      .catch(e => toast(e instanceof Error ? e.message : String(e), 'error'));
  };
  const isPlaying = (s: TranscriptSegment) => playing && positionMs != null && positionMs >= s.start_ms - 1000 && positionMs < s.end_ms;

  const assign = async (voice: Voice, value: string) => {
    const who = { pc_id: value && value !== DM ? value : null, is_dm: value === DM };
    try {
      await TranscriptSegments.assignSpeaker(voice.trackId, voice.label, who);
      setSegments(prev => prev?.map(s => (s.track_id === voice.trackId && s.speaker_label === voice.label ? { ...s, ...who } : s)) ?? prev);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Transcript" size="wide" footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {segments === null ? (
        <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Loading transcript…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-3)' }}>No speech was found in this recording.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {voices.length > 0 && (
            <section>
              <div className="cm-section-head" style={{ marginBottom: 8 }}>
                <span className="cm-section-title">Who’s speaking</span>
                <div className="cm-section-rule" />
              </div>
              <ul className="flex flex-col" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {voices.map(v => (
                  <li key={v.key} className="flex items-center gap-3 flex-wrap" style={{ padding: '8px 0', borderBottom: '1px solid var(--rule-soft)' }}>
                    <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                      <div className="text-sm" style={{ color: 'var(--ink)', fontWeight: 500 }}>
                        {v.label} <span className="text-xs" style={{ color: 'var(--ink-3)', fontWeight: 400 }}>· {v.trackLabel} · {v.lines} lines</span>
                      </div>
                      <div className="text-xs" style={{ color: 'var(--ink-3)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{v.sample}”</div>
                    </div>
                    <select
                      className="as-select"
                      style={{ width: 'auto', minWidth: 170 }}
                      aria-label={`Who is ${v.label}`}
                      value={v.value}
                      onChange={e => void assign(v, e.target.value)}
                    >
                      <option value="">Not sure yet</option>
                      <option value={DM}>You (the DM)</option>
                      {pcs.filter(p => p.is_active).map(p => (
                        <option key={p.id} value={p.id}>{p.character_name}{p.player_name ? ` · ${p.player_name}` : ''}</option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="tr">
            <div className="cm-section-head">
              <span className="cm-section-title">
                {q ? `${shown.length} of ${visible.length} lines` : `${visible.length} lines`}{echoes > 0 ? ` · ${echoes} Discord echoes hidden` : ''}
              </span>
              <div className="cm-section-rule" />
            </div>
            <div className="tr-tools">
              <input className="as-input tr-search" type="search" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search what was said, or who said it…" aria-label="Search the transcript" />
              <div className="tr-player">
                <PlayerBar audio={audio} playing={playing} positionMs={positionMs} loading={loading} onPause={pause}
                  atMs={from?.start_ms ?? null} totalMs={recording.duration_ms}
                  onPlay={() => play(from ?? shown[0] ?? visible[0])} label="Play from the chosen line" />
              </div>
            </div>
            {shown.length === 0 ? (
              <p className="as-empty-note">Nothing said matches “{query.trim()}”.</p>
            ) : (
              <ol className="tr-lines">
                {shown.map(s => (
                  <li key={s.id} className={`tr-line${isPlaying(s) ? ' is-playing' : ''}${from?.id === s.id ? ' is-from' : ''}`}>
                    <Button size="xs" className="tr-at" onClick={() => play(s)} aria-label={`Play from ${clock(s.start_ms)}`} title="Play from here">
                      ▶ {clock(s.start_ms)}
                    </Button>
                    <span className={`tr-who${s.is_dm ? ' is-dm' : ''}`}>{highlight(speakerName(s), q)}</span>
                    <span className="tr-text">{highlight(s.text, q)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
