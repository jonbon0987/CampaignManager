export interface CampaignOverview {
  title: string;
  plotSummary: string;
  majorCharacters: string;
  worldInfo: string;
  /** Short freeform party descriptor (campaign.party) — read-only in the overview UI. */
  party: string;
}
