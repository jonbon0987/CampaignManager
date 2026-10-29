// bot/src/config.ts
// -----------------------------------------------------------
// The bot reads the same .env.local as the app (one level up), so its keys sit
// next to the others. It needs:
//   DISCORD_BOT_TOKEN          — from the Discord Developer Portal (Bot → Token)
//   SUPABASE_SERVICE_ROLE_KEY  — Supabase → Project Settings → API keys
//   DM_LAIR_USER_ID            — your DM Lair user id (Settings → Discord shows it)
// and the Supabase URL the app already uses (VITE_SUPABASE_URL).
// -----------------------------------------------------------

import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
for (const file of ['.env.local', '.env']) loadEnv({ path: join(root, file), quiet: true });

export interface BotConfig {
  discordToken: string;
  supabaseUrl: string;
  serviceKey: string;
  ownerId: string;
}

export function loadConfig(): BotConfig {
  const env = process.env;
  const missing: string[] = [];
  const need = (name: string, value: string | undefined) => {
    if (!value) missing.push(name);
    return value ?? '';
  };
  const cfg: BotConfig = {
    discordToken: need('DISCORD_BOT_TOKEN', env.DISCORD_BOT_TOKEN),
    supabaseUrl: need('VITE_SUPABASE_URL', env.SUPABASE_URL ?? env.VITE_SUPABASE_URL),
    serviceKey: need('SUPABASE_SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY),
    ownerId: need('DM_LAIR_USER_ID', env.DM_LAIR_USER_ID),
  };
  if (missing.length) {
    throw new Error(`Missing ${missing.join(', ')} in .env.local. See bot/README.md for where each one comes from.`);
  }
  if (!/^[0-9a-f-]{36}$/i.test(cfg.ownerId)) throw new Error('DM_LAIR_USER_ID should be your DM Lair user id (a UUID).');
  return cfg;
}
