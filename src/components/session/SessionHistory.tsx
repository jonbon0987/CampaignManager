// src/components/session/SessionHistory.tsx
// -----------------------------------------------------------
// An entity's Session History: a line per session it came up in, newest first,
// written by a recording's write-back. Each keeps the line said at the table,
// playable from the recording, and opens that session's chronicle.
// -----------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { Play } from 'lucide-react';
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
  const { audio, playRecording } = useRecordingPlayer();
  const [entries, setEntries] = useState<EntitySessionEntry[] | null>(null);
  const [heard, setHeard] = useState(false);
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
    setHeard(true);
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
      {rows.map(({ e, session }) => (
        <article key={e.id} style={{ background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--radius-lg)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden="true" style={{ color: 'var(--gold)' }}>❧</span>
            <span style={{ fontWeight: 500, color: 'var(--ink)' }}>Session {session!.session_number}</span>
            {session!.session_date && (
              <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                {new Date(`${session!.session_date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
            {e.recording_id && <Badge color="gold">From recording</Badge>}
            <span style={{ flex: 1 }} />
            {e.recording_id && <Button variant="link" onClick={() => void openChronicle(e.recording_id!)}>See chronicle</Button>}
          </div>
          <p className="text-sm" style={{ margin: 0, color: 'var(--ink)' }}>{e.text}</p>
          {e.source_quote && (
            <div className="flex items-start gap-2" style={{ paddingTop: 6, borderTop: '1px solid var(--rule-soft)' }}>
              {e.recording_id && e.source_ms != null && (
                <Button variant="ghost" size="xs" onClick={() => play(e)} title="Play from here" style={{ padding: '0 4px', flexShrink: 0 }}>
                  <Play size={10} /> <span className="cm-kbd" style={{ color: 'var(--ink-3)' }}>{clockLabel(e.source_ms)}</span>
                </Button>
              )}
              <span className="text-sm" style={{ fontStyle: 'italic', color: 'var(--ink-2)' }}>“{e.source_quote}”</span>
            </div>
          )}
        </article>
      ))}
      <audio ref={audio} controls preload="none" style={{ width: '100%', height: 32, display: heard ? 'block' : 'none' }} />
      {chronicle && <ChronicleView recording={chronicle} onClose={() => { setChronicle(null); void load(); }} />}
    </div>
  );
}
