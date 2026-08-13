/**
 * Field-constraint migration generator
 * -----------------------------------------------------------
 * Regenerates migrations/0028_field_length_constraints.sql from the single
 * source of truth in src/lib/fieldLimits.ts, so the database CHECK constraints
 * can never silently drift from the limits enforced by the app.
 *
 *   npm run migrate:gen-constraints            # (re)write the .sql file
 *   npm run migrate:gen-constraints -- --check # verify it's up to date (CI)
 *
 * WHY: the limits live in TypeScript (client inputs + the db.ts write layer
 * read them). This script projects the same TEXT_LIMITS / NUMBER_RANGES into
 * SQL so the DB stays the authoritative last line of defence. If you change a
 * limit in fieldLimits.ts, re-run this — do NOT hand-edit the migration.
 *
 * SAFETY: the migration is NEVER edited after it has been applied to a real DB
 * (see migrations/README.md). This regenerates in place; the runner checksums
 * files, so if 0028 has already been applied and a limit changes, add a NEW
 * migration for the delta instead of regenerating this one.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEXT_LIMITS, NUMBER_RANGES } from '../src/lib/fieldLimits.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, '..', 'migrations', '0028_field_length_constraints.sql');

function buildSql(): string {
  const lines: string[] = [];
  lines.push('-- 0028_field_length_constraints.sql');
  lines.push('-- ---------------------------------------------------------------------------');
  lines.push('-- Enforce per-field length / numeric-range limits at the database layer.');
  lines.push('--');
  lines.push('-- WHY: the app also enforces these in src/lib/fieldLimits.ts (client inputs +');
  lines.push('-- the db.ts write layer), but the DB is the last line of defence for any write');
  lines.push('-- path that bypasses the app (direct API calls, SQL, future services).');
  lines.push('--');
  lines.push('-- GENERATED FILE — do not edit by hand. Regenerate with:');
  lines.push('--   npm run migrate:gen-constraints');
  lines.push('-- The source of truth is src/lib/fieldLimits.ts.');
  lines.push('--');
  lines.push('-- Constraints are added NOT VALID: they enforce on every INSERT/UPDATE from now');
  lines.push('-- on, but do NOT retro-validate existing rows (legacy AI-generated content may');
  lines.push('-- predate these limits). To validate the backlog later, run:');
  lines.push('--   ALTER TABLE <t> VALIDATE CONSTRAINT <name>;');
  lines.push('--');
  lines.push('-- SAFE TO RE-RUN: every constraint is dropped-if-exists before being re-added.');
  lines.push('-- NULLs always pass a CHECK, so nullable columns are unaffected when empty.');
  lines.push('-- ---------------------------------------------------------------------------');
  lines.push('');

  const emitText = (table: string, cols: Record<string, number>) => {
    for (const [col, max] of Object.entries(cols)) {
      const name = `${table}_${col}_len_chk`;
      lines.push(`alter table public.${table} drop constraint if exists ${name};`);
      lines.push(`alter table public.${table} add constraint ${name} check (char_length(${col}) <= ${max}) not valid;`);
    }
  };
  const emitRanges = (table: string, ranges: Record<string, [number, number]>) => {
    for (const [col, [min, mx]] of Object.entries(ranges)) {
      const name = `${table}_${col}_range_chk`;
      lines.push(`alter table public.${table} drop constraint if exists ${name};`);
      lines.push(`alter table public.${table} add constraint ${name} check (${col} between ${min} and ${mx}) not valid;`);
    }
  };

  // Tables with text limits (plus any numeric ranges on the same table).
  for (const [table, cols] of Object.entries(TEXT_LIMITS)) {
    lines.push(`-- ${table}`);
    emitText(table, cols);
    const ranges = NUMBER_RANGES[table];
    if (ranges) emitRanges(table, ranges);
    lines.push('');
  }

  // Tables that only have numeric ranges (none currently, but future-proof).
  for (const [table, ranges] of Object.entries(NUMBER_RANGES)) {
    if (TEXT_LIMITS[table]) continue;
    lines.push(`-- ${table}`);
    emitRanges(table, ranges);
    lines.push('');
  }

  // Trailing newline for a clean POSIX file.
  return lines.join('\n').replace(/\n*$/, '\n');
}

const sql = buildSql();
const check = process.argv.includes('--check');

if (check) {
  let current = '';
  try {
    current = readFileSync(OUT_FILE, 'utf8');
  } catch {
    console.error(`✗ ${OUT_FILE} does not exist. Run: npm run migrate:gen-constraints`);
    process.exit(1);
  }
  if (current !== sql) {
    console.error('✗ 0028_field_length_constraints.sql is out of date with src/lib/fieldLimits.ts.');
    console.error('  Run: npm run migrate:gen-constraints');
    process.exit(1);
  }
  console.log('✓ Field-constraint migration is in sync with fieldLimits.ts.');
} else {
  writeFileSync(OUT_FILE, sql);
  const count = (sql.match(/add constraint/g) ?? []).length;
  console.log(`✓ Wrote ${count} constraints to migrations/0028_field_length_constraints.sql`);
}
