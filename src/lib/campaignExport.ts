// Exports a campaign as a .zip the DM keeps: readable Markdown, campaign.json
// with every field of every record, and the pictures. Audio stays out.

import { zipSync, strToU8, type Zippable } from 'fflate';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { ENTITY_IMAGES_BUCKET } from './db';
import { localToday } from './sessionLifecycle';
import { exportJson, markdownFiles, picturePaths, slug, type CampaignExport, type ExportTables } from './campaignMarkdown';
import { detailsOfLink, withCampaignDetails } from './npcDetails';
import type { Campaign } from './database.types';

// Tables are read by name in a loop, which the typed client can't follow.
const db = supabase as unknown as SupabaseClient;
const PAGE = 1000;
const IN_CHUNK = 100;

/**
 * Every row whose `column` is one of `values`, a page at a time (the API
 * returns at most 1,000). Pages are ordered by `orderBy`, which must be unique.
 */
async function rowsWhere<T>(table: string, column: string, values: string[], orderBy = 'id'): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += IN_CHUNK) {
    const chunk = values.slice(i, i + IN_CHUNK);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db.from(table).select('*').in(column, chunk).order(orderBy).range(from, from + PAGE - 1);
      if (error) throw error;
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

const BY_CAMPAIGN = [
  'player_characters', 'npcs', 'factions', 'locations', 'lore_entries', 'hooks', 'ideas', 'modules', 'module_dependencies',
  'sessions', 'encounters', 'monster_statblocks', 'random_encounter_tables', 'items', 'item_holdings', 'treasury_entries', 'handouts',
  'character_relationships', 'entity_session_entries', 'session_recordings',
] as const satisfies readonly (keyof ExportTables)[];

const ids = (rows: { id: string }[]) => rows.map(r => r.id);

export type ExportStep = 'records' | 'pictures' | 'packing';
export type ExportProgress = { step: ExportStep; done?: number; total?: number };

/** Reads everything the campaign holds, and the world canon it links to. */
export async function gatherCampaign(campaignId: string, onProgress?: (p: ExportProgress) => void): Promise<CampaignExport> {
  onProgress?.({ step: 'records' });
  const [campaign] = await rowsWhere<Campaign>('campaigns', 'id', [campaignId]);
  if (!campaign) throw new Error('That campaign wasn’t found.');
  const world = campaign.world_id
    ? (await rowsWhere<CampaignExport['world'] & object>('worlds', 'id', [campaign.world_id]))[0] ?? null
    : null;

  const own = Object.fromEntries(await Promise.all(
    BY_CAMPAIGN.map(async table => [table, await rowsWhere(table, 'campaign_id', [campaignId])] as const),
  )) as Pick<ExportTables, (typeof BY_CAMPAIGN)[number]>;

  const [submodules, module_sheets] = await Promise.all([
    rowsWhere<ExportTables['submodules'][number]>('submodules', 'module_id', ids(own.modules)),
    rowsWhere<ExportTables['module_sheets'][number]>('module_sheets', 'module_id', ids(own.modules)),
  ]);
  const recordingIds = ids(own.session_recordings);
  const [scenes, transcript_segments, recording_moments] = await Promise.all([
    rowsWhere<ExportTables['scenes'][number]>('scenes', 'submodule_id', ids(submodules)),
    rowsWhere<ExportTables['transcript_segments'][number]>('transcript_segments', 'recording_id', recordingIds),
    rowsWhere<ExportTables['recording_moments'][number]>('recording_moments', 'recording_id', recordingIds),
  ]);

  // World canon linked into the campaign (it isn't the campaign's own row).
  const linked = async (linkTable: string, idColumn: string, table: string) => {
    const links = await rowsWhere<Record<string, string>>(linkTable, 'campaign_id', [campaignId], idColumn);
    return rowsWhere(table, 'id', links.map(l => l[idColumn]));
  };
  const npcLinks = async () => {
    const links = await rowsWhere<{ npc_id: string; met_by_pcs?: boolean | null; disposition?: string | null }>('campaign_npcs', 'campaign_id', [campaignId], 'npc_id');
    const rows = await rowsWhere<CampaignExport['canon']['npcs'][number]>('npcs', 'id', links.map(l => l.npc_id));
    // As this campaign sees them: the party's history is on the link.
    return withCampaignDetails(rows, new Map(links.map(l => [l.npc_id, detailsOfLink(l)])));
  };
  const [canonNpcs, canonLocations, canonLore] = await Promise.all([
    npcLinks(),
    linked('campaign_locations', 'location_id', 'locations'),
    linked('campaign_lore', 'lore_id', 'lore_entries'),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    campaign,
    world: world && { id: world.id, name: world.name, era: world.era, calendar: world.calendar, year: world.year, calendar_months: world.calendar_months },
    tables: { ...own, submodules, module_sheets, scenes, transcript_segments, recording_moments },
    canon: {
      npcs: canonNpcs as CampaignExport['canon']['npcs'],
      locations: canonLocations as CampaignExport['canon']['locations'],
      lore_entries: canonLore as CampaignExport['canon']['lore_entries'],
    },
  };
}

/** Downloads the pictures, a few at a time. A picture that fails is left out. */
async function fetchPictures(paths: Map<string, string>, onProgress?: (p: ExportProgress) => void) {
  const got = new Map<string, Uint8Array>();
  const entries = [...paths];
  let done = 0;
  onProgress?.({ step: 'pictures', done, total: entries.length });
  for (let i = 0; i < entries.length; i += 4) {
    await Promise.all(entries.slice(i, i + 4).map(async ([path, zipPath]) => {
      const { data, error } = await supabase.storage.from(ENTITY_IMAGES_BUCKET).download(path);
      if (!error && data) got.set(zipPath, new Uint8Array(await data.arrayBuffer()));
      onProgress?.({ step: 'pictures', done: ++done, total: entries.length });
    }));
  }
  return got;
}

/** The backup's file name: "the-sunless-citadel-2026-11-02.zip". */
export function exportFileName(campaign: Pick<Campaign, 'name' | 'title'>, today = localToday()): string {
  return `${slug(campaign.title || campaign.name, 'campaign')}-${today}.zip`;
}

/** Packs the export into a zip, inside one folder named for the campaign. */
export function packExport(data: CampaignExport, pictures: Map<string, Uint8Array>, missingPictures: number): Uint8Array {
  const folder = exportFileName(data.campaign, localToday(new Date(data.exportedAt))).replace(/\.zip$/, '');
  const kept = new Map([...picturePaths(data)].filter(([, zipPath]) => pictures.has(zipPath)));
  const files: Zippable = {};
  for (const [path, text] of Object.entries(markdownFiles(data, kept, missingPictures))) files[`${folder}/${path}`] = strToU8(text);
  files[`${folder}/campaign.json`] = strToU8(exportJson(data));
  // Pictures are already compressed; store them as they are.
  for (const [path, bytes] of pictures) files[`${folder}/${path}`] = [bytes, { level: 0 }];
  return zipSync(files, { level: 6 });
}

/** Builds the whole backup for a campaign: what to save, and what it holds. */
export async function exportCampaign(campaignId: string, onProgress?: (p: ExportProgress) => void) {
  const data = await gatherCampaign(campaignId, onProgress);
  const paths = picturePaths(data);
  const pictures = await fetchPictures(paths, onProgress);
  onProgress?.({ step: 'packing' });
  const zip = packExport(data, pictures, paths.size - pictures.size);
  return {
    fileName: exportFileName(data.campaign),
    blob: new Blob([zip as BlobPart], { type: 'application/zip' }),
    pictures: pictures.size,
    missingPictures: paths.size - pictures.size,
  };
}

/** Hands the browser a file to save. */
export function saveFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
