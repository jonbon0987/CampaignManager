// src/hooks/useWritePlayerRecap.ts
// -----------------------------------------------------------
// Writes a session's player recap from one of its recordings (see
// api/player-recap.ts), with the campaign's names to spell by, and shows the
// new draft at once. The server saves it, so it isn't lost if the page closes.
// -----------------------------------------------------------

import { useCampaign } from '../context/CampaignContext';
import { getAIProvider } from '../lib/aiProvider';
import { recapNames } from '../lib/recording/playerRecap';
import { writePlayerRecap } from '../lib/recording/transcriptionApi';
import type { SessionRecording } from '../lib/database.types';

export function useWritePlayerRecap() {
  const { pcs, npcs, locations, factions, updateSession } = useCampaign();
  return async (recording: Pick<SessionRecording, 'id' | 'session_id'>, opts: { onlyIfEmpty?: boolean } = {}): Promise<boolean> => {
    const names = recapNames({ pcs, npcs, locations, factions });
    const result = await writePlayerRecap(recording.id, names, getAIProvider(), opts.onlyIfEmpty);
    if (result.skipped || !result.recap) return false;
    // Already saved by the server; this shows it here (and writes the same values again).
    await updateSession(recording.session_id, { player_recap: result.recap, player_recap_status: 'draft' });
    return true;
  };
}
