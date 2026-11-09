// bot/src/service.ts
// -----------------------------------------------------------
// Runs the bot as a login helper on a Mac, so it's always there for the app to
// sign in and out, and nobody has to start it by hand:
//
//   npm run bot:install     start it now, and at every login
//   npm run bot:status      is it running, and where's its log
//   npm run bot:restart     after pulling new code
//   npm run bot:uninstall   stop it and take it out of login
//
// It's a launchd agent for this user (~/Library/LaunchAgents). Elsewhere, run
// `npm run bot` in a terminal instead.
// -----------------------------------------------------------

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';

export const LABEL = 'com.dmlair.discord-bot';

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The launchd agent: runs the bot from its folder, restarts it if it crashes, and logs to one file. */
export function plistFor(o: { node: string; tsx: string; botDir: string; logFile: string }): string {
  const path = [dirname(o.node), '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(o.node)}</string>
    <string>${xml(o.tsx)}</string>
    <string>src/index.ts</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(o.botDir)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>ProcessType</key><string>Background</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(path)}</string></dict>
  <key>StandardOutPath</key><string>${xml(o.logFile)}</string>
  <key>StandardErrorPath</key><string>${xml(o.logFile)}</string>
</dict>
</plist>
`;
}

function main(command: string | undefined) {
  if (process.platform !== 'darwin') {
    console.log('The login helper is for macOS. On this computer, run `npm run bot` in a terminal while you play.');
    process.exit(1);
  }
  const botDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const plist = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
  const logFile = join(homedir(), 'Library', 'Logs', 'DM Lair', 'discord-bot.log');
  const service = `gui/${userInfo().uid}/${LABEL}`;
  const launchctl = (...args: string[]) => execFileSync('launchctl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const stop = () => { try { launchctl('bootout', service); } catch { /* wasn't loaded */ } };

  switch (command) {
    case 'install': {
      try {
        loadConfig();
      } catch (e) {
        console.error(e instanceof Error ? e.message : String(e));
        process.exit(1);
      }
      const tsx = join(botDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
      if (!existsSync(tsx)) {
        console.error('The bot’s packages aren’t installed yet. Run `npm --prefix bot install`, then this again.');
        process.exit(1);
      }
      mkdirSync(dirname(plist), { recursive: true });
      mkdirSync(dirname(logFile), { recursive: true });
      writeFileSync(plist, plistFor({ node: process.execPath, tsx, botDir, logFile }));
      stop();
      launchctl('bootstrap', `gui/${userInfo().uid}`, plist);
      console.log('Installed. The bot is running now and starts whenever you log in.');
      console.log('Sign it in from DM Lair: Settings → Discord.');
      console.log(`Its log: ${logFile}`);
      break;
    }
    case 'uninstall':
      stop();
      rmSync(plist, { force: true });
      console.log('Removed. The bot is stopped and won’t start at login.');
      break;
    case 'restart':
      try {
        launchctl('kickstart', '-k', service);
        console.log('Restarted.');
      } catch {
        console.log('The login helper isn’t installed. Run `npm run bot:install`.');
        process.exit(1);
      }
      break;
    case 'status': {
      let out = '';
      try { out = launchctl('print', service); } catch { /* not loaded */ }
      if (!out) {
        console.log(existsSync(plist) ? 'Installed, but not loaded. Run `npm run bot:install` again.' : 'Not installed. Run `npm run bot:install`.');
        break;
      }
      const pid = /\bpid = (\d+)/.exec(out)?.[1];
      console.log(pid ? `Running (process ${pid}).` : 'Installed, not running right now; launchd will try again shortly.');
      console.log(`Its log: ${logFile}`);
      break;
    }
    default:
      console.log('Use: install, uninstall, restart or status.');
      process.exit(1);
  }
}

// Run as a script, not when imported by the tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv[2]);
