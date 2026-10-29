// src/hooks/useWriteChronicle.ts
// -----------------------------------------------------------
// Writes a recording's chronicle with the open campaign as context: all of
// it, or only the parts that couldn't be written last time.
// -----------------------------------------------------------

import { useCampaign } from '../context/CampaignContext';
import { formatCampaignContext } from '../lib/campaignContext';
import { getAIProvider } from '../lib/aiProvider';
import { writeChronicle, type ChronicleSettings } from '../lib/recording/transcriptionApi';
import type { SessionRecording } from '../lib/database.types';

export function useWriteChronicle() {
  const campaign = useCampaign();
  return (recording: SessionRecording, settings: ChronicleSettings, missingOnly = false) => {
    const context = formatCampaignContext({
      sessions: campaign.sessions, pcs: campaign.pcs, npcs: campaign.npcs, locations: campaign.locations,
      factions: campaign.factions, hooks: campaign.hooks, lore: campaign.lore, modules: campaign.modules,
      overviewTitle: campaign.overview.title, overviewPlot: campaign.overview.plotSummary,
    });
    return writeChronicle(recording.id, context, settings, getAIProvider(), missingOnly);
  };
}

/** The chronicle options a recording was last written with. */
export function savedChronicleSettings(recording: SessionRecording): ChronicleSettings {
  const saved = recording.settings;
  return { depth: saved.depth ?? 'thorough', dropTableTalk: saved.dropTableTalk ?? true, asidesToDmNotes: saved.asidesToDmNotes ?? true };
}
