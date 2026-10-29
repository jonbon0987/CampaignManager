// Recently viewed records, kept per campaign in this browser so the sidebar's
// Recent list survives a reload and doesn't mix campaigns.

import type { Tab } from '../App';

export interface RecentEntry {
  kind: string;
  id: string;
  label: string;
  tab: Tab;
}

interface Stored extends RecentEntry { campaignId: string }

const KEY = 'dnd-recent';
const PER_CAMPAIGN = 6;
const TOTAL = 60;

// The campaign the shell has open. pushRecent is called from deep inside
// tabs, so the shell sets this rather than every caller passing it.
let scope: string | null = null;

export function setRecentScope(campaignId: string | null) {
  scope = campaignId;
}

function readAll(): Stored[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function pushRecent(entry: RecentEntry) {
  if (!scope) return;
  const campaignId = scope;
  const rest = readAll().filter(r => !(r.campaignId === campaignId && r.kind === entry.kind && r.id === entry.id));
  const next = [{ ...entry, campaignId }, ...rest].slice(0, TOTAL);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full or blocked: Recent is a convenience */ }
  window.dispatchEvent(new CustomEvent('recent-changed'));
}

export function getRecents(campaignId: string | null): RecentEntry[] {
  if (!campaignId) return [];
  return readAll().filter(r => r.campaignId === campaignId).slice(0, PER_CAMPAIGN);
}
