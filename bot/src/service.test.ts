import { describe, it, expect } from 'vitest';
import { LABEL, plistFor } from './service.js';

describe('plistFor', () => {
  const plist = plistFor({ node: '/opt/node/bin/node', tsx: '/x/bot/node_modules/tsx/dist/cli.mjs', botDir: '/Users/dm/My & Co/bot', logFile: '/Users/dm/Library/Logs/DM Lair/discord-bot.log' });

  it('runs the bot from its folder with the same node that installed it', () => {
    expect(plist).toContain(`<string>${LABEL}</string>`);
    expect(plist).toContain('<string>/opt/node/bin/node</string>');
    expect(plist).toContain('<string>src/index.ts</string>');
    expect(plist).toContain('/opt/node/bin:/usr/local/bin');
  });

  it('starts at login and comes back from a crash, but not from a deliberate stop', () => {
    expect(plist).toContain('<key>RunAtLoad</key><true/>');
    expect(plist).toContain('<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>');
  });

  it('escapes paths for XML', () => {
    expect(plist).toContain('<string>/Users/dm/My &amp; Co/bot</string>');
    expect(plist).not.toContain('My & Co');
  });
});
