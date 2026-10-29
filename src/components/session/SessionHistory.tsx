// src/components/session/SessionHistory.tsx
// -----------------------------------------------------------
// An entity's Session History: a line per session it came up in, newest first,
// written by a recording's write-back. Each keeps the line said at the table,
// playable from the recording, and opens that session's chronicle.
// -----------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useToast } from '../../context/ToastContext';
import { EntitySessionEntries, SessionRecordings } from '../../lib/db';
import type { EntitySessionEntry, SessionEntryEntityType, SessionRecording } from '../../lib/database.types';
import { clockLabel } from '../../lib/recording/chronicle';
import { useRecordingPlayer } from '../../hooks/useRecordingPlayer';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ChronicleView } from './ChronicleView';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function SessionHistory({ entityType, entityId }: { entityType: SessionEntryEntityType; entityId: string }) {
  const { sessions, selectedCampaignId } = useCampaign();
  const toast = useToast();
  const { audio, playing, pause, playRecording } = useRecordingPlayer();
  const [entries, setEntries] = useState<EntitySessionEntry[] | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [chronicle, setChronicle] = useState<SessionRecording | null>(null);

  const load = useCallback(() => EntitySessionEntries.getForEntity(entityType, entityId)
    .then(setEntries)
    .catch(e => { setEntries([]); toast(errorMessage(e), 'error'); }), [entityType, entityId, toast]);

  useEffect(() => { void load(); }, [load]);

  // A canon entry can be linked into several campaigns; show this one's sessions.
  const rows = (entries ?? [])
    .filter(e => e.campaign_id === selectedCampaignId)
    .map(e => ({ e, session: sessions.find(s => s.id === e.session_id) ?? null }))
    .filter(r => r.session)
    .sort((a, b) => b.session!.session_number - a.session!.session_number || a.e.created_at.localeCompare(b.e.created_at));

  const play = (e: EntitySessionEntry) => {
    if (!e.recording_id || e.source_ms == null) return;
    if (playing && heard === e.id) { pause(); return; }
    setHeard(e.id);
    void playRecording(e.recording_id, e.source_ms).catch(err => toast(errorMessage(err), 'error'));
  };

  const openChronicle = async (recordingId: string) => {
    try {
      const r = await SessionRecordings.get(recordingId);
      if (r) setChronicle(r);
      else toast('That recording has been deleted.', 'error');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  if (entries === null) return <p className="text-sm" style={{ color: 'var(--ink-3)', margin: 0 }}>Loading…</p>;

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--ink-3)', margin: 0 }}>
          Nothing yet. When you record a session and apply its chronicle, what happened here is added session by session.
        </p>
      )}
      {rows.map(({ e, session }, i) => {
        // The newest entry from a recording stands out, as the latest word on this entry.
        const latest = i === 0 && !!e.recording_id;
        return (
          <article key={e.id} style={{ background: latest ? 'var(--paper-2)' : 'var(--paper)', border: `1px solid ${latest ? 'var(--gold-line)' : 'var(--rule)'}`, boxShadow: latest ? 'inset 2px 0 0 var(--gold)' : undefined, borderRadius: 'var(--radius-lg)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: latest ? 10 : 8 }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="cm-chip" style={{ color: 'var(--link-session)', background: 'var(--link-session-bg)', borderColor: 'var(--link-session-line)', cursor: 'default' }}>
                <span aria-hidden="true">❧</span><span>Session {session!.session_number}</span>
              </span>
              {session!.session_date && (
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                  {new Date(`${session!.session_date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
              {e.recording_id && <Badge color="gold">From recording</Badge>}
              <span style={{ flex: 1 }} />
              {e.recording_id && <Button variant="link" onClick={() => void openChronicle(e.recording_id!)}>See chronicle</Button>}
            </div>
            <p style={{ margin: 0, color: latest ? 'var(--ink)' : 'var(--ink-2)' }}>{e.text}</p>
            {e.source_quote && (
              <div className="ra" style={{ borderColor: 'var(--gold-line)' }}>
                <div className="ra-label" style={{ borderColor: 'var(--gold-line)' }}>
                  <span>Said at the table</span>
                  <span style={{ flex: 1 }} />
                  {e.recording_id && e.source_ms != null && (
                    <Button variant="ghost" size="xs" onClick={() => play(e)} title={playing && heard === e.id ? 'Pause' : 'Play from here'} style={{ padding: '0 4px', color: 'var(--gold)' }}>
                      <span className="cm-kbd" style={{ color: 'var(--gold)' }}>{playing && heard === e.id ? '❚❚' : '▶'} {clockLabel(e.source_ms)}</span>
                    </Button>
                  )}
                </div>
                <div className="ra-body" style={{ padding: '12px 16px', minHeight: 0, cursor: 'default' }}>
                  <p className="ra-text" style={{ fontSize: 16 }}>“{e.source_quote}”</p>
                </div>
              </div>
            )}
          </article>
        );
      })}
      <audio ref={audio} preload="none" hidden />
      {chronicle && <ChronicleView recording={chronicle} onClose={() => { setChronicle(null); void load(); }} />}
    </div>
  );
}
