/**
 * Migration runner
 * -----------------------------------------------------------
 * Applies the ordered SQL files in ./migrations to a Postgres
 * (Supabase) database, tracking what has run in a
 * `schema_migrations` table so each file runs exactly once.
 *
 * Why this exists: migrations used to be hand-pasted into the
 * Supabase SQL editor, with no record of what had run. That
 * makes standing up a second environment (or onboarding a new
 * Supabase project) error-prone. This gives you one command:
 *
 *   npm run migrate            # apply all pending migrations
 *   npm run migrate -- --dry-run   # show what would run, change nothing
 *   npm run migrate -- --status    # list applied vs pending
 *
 * Connection: set SUPABASE_DB_URL to your project's Postgres
 * connection string (Supabase dashboard -> Project Settings ->
 * Database -> Connection string -> URI). Use the direct/session
 * connection, not the pooled transaction port, since migrations
 * run in transactions.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { config as loadEnv } from 'dotenv';

// Load .env first, then .env.local (Vite's convention). .env.local wins for
// any overlapping keys, matching how the app itself resolves env vars.
loadEnv();
loadEnv({ path: '.env.local', override: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

interface AppliedRow {
  name: string;
  checksum: string;
}

function loadMigrations(): MigrationFile[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort() // NNNN_ prefixes sort chronologically
    .map((name) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      return { name, sql, checksum };
    });
}

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT PRIMARY KEY,
      checksum    TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getApplied(client: Client): Promise<Map<string, string>> {
  const { rows } = await client.query<AppliedRow>(
    'SELECT name, checksum FROM schema_migrations ORDER BY name;'
  );
  return new Map(rows.map((r) => [r.name, r.checksum]));
}

function warnOnDrift(all: MigrationFile[], applied: Map<string, string>): void {
  for (const m of all) {
    const prev = applied.get(m.name);
    if (prev !== undefined && prev !== m.checksum) {
      console.warn(
        `⚠️  ${m.name} was modified after it was applied ` +
          `(checksum changed). The runner will NOT re-run it. ` +
          `Add a new migration instead of editing an applied one.`
      );
    }
  }
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const statusOnly = args.has('--status');

  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error(
      'Missing SUPABASE_DB_URL. Set it to your Supabase Postgres ' +
        'connection string (Project Settings -> Database -> Connection string -> URI).'
    );
    process.exit(1);
  }

  const all = loadMigrations();
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await getApplied(client);
    warnOnDrift(all, applied);

    const pending = all.filter((m) => !applied.has(m.name));

    if (statusOnly) {
      console.log(`Applied (${applied.size}):`);
      for (const m of all) if (applied.has(m.name)) console.log(`  ✓ ${m.name}`);
      console.log(`Pending (${pending.length}):`);
      for (const m of pending) console.log(`  • ${m.name}`);
      return;
    }

    if (pending.length === 0) {
      console.log('✓ Database is up to date — no pending migrations.');
      return;
    }

    console.log(`${pending.length} pending migration(s):`);
    for (const m of pending) console.log(`  • ${m.name}`);

    if (dryRun) {
      console.log('\n--dry-run: no changes made.');
      return;
    }

    for (const m of pending) {
      process.stdout.write(`Applying ${m.name} ... `);
      try {
        await client.query('BEGIN');
        await client.query(m.sql);
        await client.query(
          'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2);',
          [m.name, m.checksum]
        );
        await client.query('COMMIT');
        console.log('done');
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('FAILED');
        throw err;
      }
    }

    console.log(`\n✓ Applied ${pending.length} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\nMigration run failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
