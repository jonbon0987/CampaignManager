import { describe, it, expect } from 'vitest';
import { botStatus } from './useDiscordBot';
import type { DiscordBotPresence } from '../lib/database.types';

const NOW = Date.parse('2026-11-09T20:00:00Z');
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();
const presence = (over: Partial<DiscordBotPresence> = {}): DiscordBotPresence => ({
  id: 'p', user_id: 'u', bot_tag: 'Lair#1', heartbeat_at: ago(600), guilds: [], created_at: ago(9999), updated_at: ago(5), ...over,
});

describe('botStatus', () => {
  it('is checking until the first report is in', () => {
    expect(botStatus(null, false, NOW)).toEqual({ status: 'checking', running: false, online: false });
  });

  it('is not running with no report, a stale one, or one from a helper that quit', () => {
    expect(botStatus(null, true, NOW).status).toBe('not-running');
    expect(botStatus(presence({ discord_status: 'online', helper_at: ago(120) }), true, NOW).status).toBe('not-running');
    expect(botStatus(presence({ discord_status: 'offline', helper_at: null }), true, NOW).status).toBe('not-running');
  });

  it('tells a running helper that’s signed out from one that’s online', () => {
    expect(botStatus(presence({ discord_status: 'offline', helper_at: ago(5) }), true, NOW)).toEqual({ status: 'offline', running: true, online: false });
    expect(botStatus(presence({ discord_status: 'online', helper_at: ago(5), heartbeat_at: ago(5) }), true, NOW)).toEqual({ status: 'online', running: true, online: true });
    expect(botStatus(presence({ discord_status: 'error', helper_at: ago(5) }), true, NOW).status).toBe('error');
  });

  it('reads a bot from before the helper by its heartbeat alone', () => {
    expect(botStatus(presence({ heartbeat_at: ago(10) }), true, NOW)).toEqual({ status: 'online', running: true, online: true });
    expect(botStatus(presence({ heartbeat_at: ago(120) }), true, NOW)).toEqual({ status: 'not-running', running: false, online: false });
  });
});
