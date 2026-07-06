# Database migrations

Ordered, append-only SQL migrations for the Supabase/Postgres database.

## How it works

Files are named `NNNN_description.sql` and run in lexical order (which is
chronological). The runner (`scripts/migrate.ts`) records each applied file in a
`schema_migrations` table, so every migration runs exactly once per database.

## Commands

```bash
npm run migrate              # apply all pending migrations
npm run migrate -- --status  # show applied vs pending
npm run migrate -- --dry-run # show what would run, change nothing
```

## Setup

Set `SUPABASE_DB_URL` to your project's Postgres connection string:
Supabase dashboard → Project Settings → Database → Connection string → **URI**.
Use the direct/session connection (port 5432), not the pooled transaction port —
migrations run inside transactions.

```bash
# .env or .env.local
SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
```

## Standing up a new environment

Point `SUPABASE_DB_URL` at the fresh project and run `npm run migrate`. All 24
migrations apply in order from an empty database.

## Rules

- **Never edit a migration after it has been applied.** The runner checksums each
  file and warns if an applied one changes, but it will not re-run it. To change
  the schema, add a new `NNNN_*.sql` file.
- Migrations should be idempotent where practical (`CREATE TABLE IF NOT EXISTS`,
  `ADD COLUMN IF NOT EXISTS`, etc.).
- Each file runs in its own transaction and rolls back on error.
