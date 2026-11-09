# DM Lair Discord bot

Records the players who join your game over Discord, each on their own track, so the session chronicle knows who said what. The table microphone in the app records the room; this bot records the voice channel. Lines the table mic heard from the Discord speakers are removed as echo when the session is transcribed.

The bot runs in the background on your Mac, started at login, and you sign it in and out of Discord from the app. It never talks to the app directly; both read and write the same Supabase rows, so the app's buttons would work just the same with the bot running anywhere else.

## Set up (once)

1. **Create the bot.** At <https://discord.com/developers/applications>, choose **New Application**, open **Bot**, and choose **Reset Token** to copy the token. No privileged intents are needed.
2. **Invite it to your server.** Open this link with your application's id (General Information → Application ID) in place of `APP_ID`:

   ```
   https://discord.com/oauth2/authorize?client_id=APP_ID&scope=bot&permissions=1051648
   ```

   That grants View Channels, Send Messages and Connect, and nothing else.
3. **Find your service role key** in Supabase: Project Settings → API keys → `service_role`. It can read and write everything in your database, so keep it in `.env.local` only (git ignores that file) and never commit it.
4. **Add three lines to `.env.local`** in the project folder. DM Lair's Settings → Discord shows them with your user id filled in.

   ```
   DISCORD_BOT_TOKEN=…
   SUPABASE_SERVICE_ROLE_KEY=…
   DM_LAIR_USER_ID=…
   ```

5. **Install it** from the project folder:

   ```bash
   npm --prefix bot install
   npm run bot:install
   ```

   That starts it now and whenever you log in. It waits signed out of Discord until you sign it in, and Settings → Discord shows **Signed out** within a few seconds.

   Not on a Mac, or would rather not? `npm run bot` runs the same thing in a terminal for as long as it's open.

### Looking after it

- `npm run bot:status` says whether it's running, and where its log is (`~/Library/Logs/DM Lair/discord-bot.log`).
- `npm run bot:restart` after you pull new code, so it runs the new version.
- `npm run bot:uninstall` stops it and takes it out of login.

## At the table

- In Settings → Discord, **Sign in** brings the bot online in your server, and **Sign out** takes it offline. Once it's online you can pick a voice channel and **Join**: it sits there muted and deafened, recording nothing, until you **Leave**.
- You don't have to sign it in to record: a recording that uses Discord signs it in by itself, and it stays signed in until that recording is done.
- In Sessions, **Record this session** now has a **Players on Discord** section. Pick the voice channel and say who each person plays; that's remembered for the campaign.
- Tick **Agreed to recording** for Discord players too. The bot only records people linked to a character whose player has agreed, or linked as the DM. Anyone else in the channel is never recorded.
- The bot posts a notice in the channel when recording starts and stops. **Pause** in the app pauses the bot too.
- **End & save** waits for the bot to upload the Discord audio before transcription starts.
- From a session's **Chronicle**, **Post to Discord** sends the player recap to a text channel. You can edit it first; DM notes are never included.

## If something goes wrong

- **The bot drops out of the channel.** It rejoins by itself; the gap is noted on the recording.
- **The bot stops mid-session** (a restart, `bot:uninstall`, or Ctrl-C on `npm run bot`). It uploads what it has first. Start it again and it rejoins; the session's audio is joined from both runs at the end.
- **The bot wasn't running when you ended the session.** Start it; it finishes the Discord tracks from what was uploaded. Then press **Transcribe** on the recording.
- **"Couldn't sign in to Discord."** Usually the token: reset it in the Developer Portal, update `.env.local`, then `npm run bot:restart`. Settings → Discord shows the reason.
- **"Already running."** The login helper is up, so a second copy steps aside. Use the app, or `npm run bot:uninstall` if you'd rather run it by hand.
- **"Missing … in .env.local"**: see step 4.

## How it works

`src/trackWriter.ts` turns each player's Opus packets into one continuous Ogg Opus stream, cut into chunks. Short pauses are kept as silence; long ones (over 8 seconds) are left out, and each chunk records where on the session clock it belongs, so hours of quiet are never stored or transcribed. Chunks upload as they close, then join into `full.ogg` at the end. These are the same `recording_tracks` and `recording_chunks` rows the table mic uses (see `migrations/0032_session_recordings.sql` and `0033_discord_bot.sql`).
