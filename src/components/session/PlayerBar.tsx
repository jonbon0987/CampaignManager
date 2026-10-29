// src/components/session/PlayerBar.tsx
// -----------------------------------------------------------
// A recording's player as one row: play or pause, how far along the session
// it is, and the time. The audio element it drives (useRecordingPlayer's) is
// hidden.
// -----------------------------------------------------------

import type { RefObject } from 'react';
import { Pause, Play } from 'lucide-react';
import { clockLabel } from '../../lib/recording/chronicle';
import { Button } from '../ui/Button';

export function PlayerBar({ audio, playing, positionMs, loading, onPause, atMs, totalMs, onPlay, label = 'Play recording' }: {
  audio: RefObject<HTMLAudioElement | null>;
  playing: boolean;
  positionMs: number | null;
  loading: boolean;
  onPause: () => void;
  /** The moment Play starts from, shown until playback moves on. */
  atMs: number | null;
  totalMs: number | null;
  onPlay: () => void;
  label?: string;
}) {
  const shown = playing ? positionMs ?? atMs ?? 0 : atMs ?? positionMs ?? 0;
  const pct = totalMs ? Math.min(100, Math.max(0, (shown / totalMs) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <Button
        aria-label={playing ? 'Pause' : label}
        onClick={() => (playing ? onPause() : onPlay())}
        disabled={loading}
        style={{ width: 30, height: 30, padding: 0, flex: '0 0 auto', borderColor: 'var(--gold-line)', color: 'var(--gold)' }}
      >
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </Button>
      <div aria-hidden="true" style={{ flex: 1, height: 4, borderRadius: 999, background: 'var(--paper-3)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--gold)', borderRadius: 999 }} />
      </div>
      <span className="cm-kbd" style={{ color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
        {atMs != null || positionMs != null ? `${clockLabel(shown)} / ` : ''}{totalMs ? clockLabel(totalMs) : ''}
      </span>
      <audio ref={audio} preload="none" hidden />
    </div>
  );
}
