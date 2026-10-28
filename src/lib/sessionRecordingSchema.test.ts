import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEXT_LIMITS } from './fieldLimits';

// 0032 hand-writes its CHECK constraints (0028 is generated but already
// applied), so guard against them drifting from fieldLimits.ts.
const sql = readFileSync(join(__dirname, '../../migrations/0032_session_recordings.sql'), 'utf8');

const RECORDING_TABLES = [
  'session_recordings', 'recording_tracks', 'recording_chunks', 'transcript_segments',
  'recording_moments', 'speaker_links', 'chronicle_proposals', 'chronicle_applied',
  'entity_session_entries',
];

describe('migration 0032 field constraints', () => {
  const cases: [string, string, number][] = [['npcs', 'disposition', TEXT_LIMITS.npcs.disposition]];
  for (const table of RECORDING_TABLES) {
    for (const [col, max] of Object.entries(TEXT_LIMITS[table] ?? {})) cases.push([table, col, max]);
  }

  it.each(cases)('%s.%s is capped at the fieldLimits value', (table, col, max) => {
    const re = new RegExp(`alter table public\\.${table} add constraint ${table}_${col}_len_chk\\s+check \\(char_length\\(${col}\\) <= ${max}\\)`);
    expect(sql).toMatch(re);
  });

  it('every recording table has fieldLimits entries', () => {
    for (const table of RECORDING_TABLES) expect(TEXT_LIMITS[table], table).toBeDefined();
  });

  it('every new table gets the owner-only RLS policy', () => {
    for (const table of [...RECORDING_TABLES, 'player_consents']) expect(sql).toContain(`'${table}'`);
    expect(sql).toMatch(/using \(auth\.uid\(\) = user_id\) with check \(auth\.uid\(\) = user_id\)/);
  });
});
