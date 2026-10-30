// src/components/session/SessionUpdateBand.tsx
// -----------------------------------------------------------
// The band at the top of an entry a recording last wrote to: which session,
// what it changed, and that session's recap a click away.
// -----------------------------------------------------------

import { useEffect, useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { ChronicleAppliedLog, ChronicleProposals, EntitySessionEntries } from '../../lib/db';
import type { SessionEntryEntityType } from '../../lib/database.types';
import { buildChronicle, changeCount, whatChanged } from '../../lib/recording/chronicleView';
import { Button } from '../ui/Button';
import { useOpenRecord } from '../../context/NavigationContext';

interface Update { sessionId: string; sessionNumber: number; count: number; what: string }

export function SessionUpdateBand({ entityType, entityId }: { entityType: SessionEntryEntityType; entityId: string }) {
  const { sessions, selectedCampaignId } = useCampaign();
  const [update, setUpdate] = useState<Update | null>(null);
  const openRecord = useOpenRecord();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The newest session a recording wrote this entry into, in this campaign.
      const entries = await EntitySessionEntries.getForEntity(entityType, entityId);
      const latest = entries
        .filter(e => e.recording_id && e.campaign_id === selectedCampaignId)
        .map(e => ({ e, n: sessions.find(s => s.id === e.session_id)?.session_number ?? -1 }))
        .filter(r => r.n >= 0)
        .sort((a, b) => b.n - a.n)[0];
      if (!latest) { if (!cancelled) setUpdate(null); return; }
      const recordingId = latest.e.recording_id!;
      const [proposals, log] = await Promise.all([ChronicleProposals.getByRecording(recordingId), ChronicleAppliedLog.getByRecording(recordingId)]);
      const item = buildChronicle(proposals, log).byKind[entityType].find(i => i.entityId === entityId);
      if (cancelled) return;
      setUpdate({
        sessionId: latest.e.session_id,
        sessionNumber: latest.n,
        count: item ? changeCount(item) : 1,
        what: item ? whatChanged(item).toLowerCase().replace(/ · /g, ', ') : 'session history',
      });
    })().catch(() => { if (!cancelled) setUpdate(null); });
    return () => { cancelled = true; };
  }, [entityType, entityId, selectedCampaignId, sessions]);

  if (!update) return null;

  // The chronicle is part of the session's Recap.
  const openChronicle = () => openRecord('sessions', update.sessionId);

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 14px', alignItems: 'center', padding: '11px 14px', margin: '0 0 16px', borderRadius: 'var(--radius-lg)', background: 'var(--gold-dim)', border: '1px solid var(--gold-line)' }}>
        <span aria-hidden="true" style={{ color: 'var(--gold)' }}>❧</span>
        <span style={{ flex: '1 1 300px', fontSize: 14, color: 'var(--ink)' }}>
          <span style={{ color: 'var(--gold-2)', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', marginRight: 8 }}>
            Updated from Session {update.sessionNumber}
          </span>
          {update.count} change{update.count === 1 ? '' : 's'} from the recording — {update.what}.
        </span>
        <Button variant="link" onClick={openChronicle}>See chronicle</Button>
      </div>
    </>
  );
}
