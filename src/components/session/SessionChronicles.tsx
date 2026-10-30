// The chronicle part of a session's Recap: one block per recording whose
// write-back is applied (almost always one). Reloads as recordings move along.

import { useEffect, useState } from 'react';
import { useRecording } from '../../context/RecordingContext';
import { useChroniclePipelineMaybe } from '../../context/ChroniclePipelineContext';
import { SessionRecordings } from '../../lib/db';
import type { SessionRecording } from '../../lib/database.types';
import { RecapChronicle } from './RecapChronicle';

export function SessionChronicles({ sessionId }: { sessionId: string }) {
  const { version } = useRecording();
  const { entries, refresh } = useChroniclePipelineMaybe();
  const [applied, setApplied] = useState<SessionRecording[]>([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    SessionRecordings.getBySession(sessionId)
      .then(rows => { if (!cancelled) setApplied(rows.filter(r => r.status === 'applied')); })
      .catch(() => {});
    return () => { cancelled = true; };
  // A review applied or undone moves a recording in or out of here.
  }, [sessionId, version, entries, reload]);

  return (
    <>
      {applied.map(r => (
        <RecapChronicle key={r.id} recording={r} onChanged={() => { setReload(n => n + 1); refresh(); }} />
      ))}
    </>
  );
}
