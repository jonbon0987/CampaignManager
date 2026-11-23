-- ============================================================
-- Where the Discord bot posts, per campaign
-- ============================================================
-- One text channel the bot posts in for a campaign: the "recording started /
-- stopped" notices, and the default for posting recaps (the post dialog starts
-- on it, and can still send one post elsewhere).
--
--   campaigns.discord_post_channel  { guildId, channelId, channelName }, or
--                                   null: notices go to the voice channel's
--                                   own chat and the post dialog asks.
--
-- The app copies it onto each recording as it starts (settings.discordPosts),
-- so the bot reads it from the recording it's already watching.
-- ============================================================

alter table public.campaigns add column if not exists discord_post_channel jsonb;

alter table public.campaigns drop constraint if exists campaigns_discord_post_channel_chk;
alter table public.campaigns add constraint campaigns_discord_post_channel_chk
  check (discord_post_channel is null or (
    jsonb_typeof(discord_post_channel) = 'object'
    and jsonb_typeof(discord_post_channel->'guildId') = 'string'
    and jsonb_typeof(discord_post_channel->'channelId') = 'string'
    and octet_length(discord_post_channel::text) <= 1000
  )) not valid;
