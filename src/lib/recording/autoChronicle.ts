// Whether a campaign's new recordings write their chronicle on their own once
// transcribed. On unless the DM turns it off; remembered in this browser.
// Each recording takes the setting when it starts (settings.autoChronicle),
// so turning it off later doesn't stop one already under way.

export const autoChronicleKey = (campaignId: string | null) => `dnd-auto-chronicle:${campaignId ?? ''}`;

export function autoChroniclePref(campaignId: string | null): boolean {
  try {
    const v = window.localStorage.getItem(autoChronicleKey(campaignId));
    return v === null ? true : JSON.parse(v) !== false;
  } catch {
    return true;
  }
}
