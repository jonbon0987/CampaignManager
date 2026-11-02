-- ============================================================
-- Items and loot
-- ============================================================
-- Loot was a free-text box on each session. This adds:
--
--   items           a campaign's item compendium: magic items, treasure,
--                   gear. What the players learn (description) is kept apart
--                   from what only the DM knows (dm_notes).
--   item_holdings   who has what: a PC, or the party's stash when pc_id is
--                   null; how many; whether it's attuned; and the session it
--                   was handed out in. Deleting a PC leaves their things with
--                   the party; deleting a session keeps the items held.
--
-- Both are kept by Recently deleted (migration 0042), so a delete can be
-- undone. sessions.loot_rewards stays as free text alongside.
-- ============================================================

create table if not exists public.items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  campaign_id      uuid not null references public.campaigns(id) on delete cascade,
  name             text not null default '',
  item_type        text,
  rarity           text,
  attunement       boolean not null default false,
  attunement_note  text,
  value            text,
  description      text,
  dm_notes         text,
  image_path       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.items enable row level security;
drop policy if exists "Users manage own items" on public.items;
create policy "Users manage own items" on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists items_user_id_idx on public.items(user_id);
create index if not exists items_campaign_id_idx on public.items(campaign_id);
drop trigger if exists items_updated_at on public.items;
create trigger items_updated_at before update on public.items for each row execute function public.set_updated_at();

create table if not exists public.item_holdings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  item_id      uuid not null references public.items(id) on delete cascade,
  pc_id        uuid references public.player_characters(id) on delete set null,
  quantity     integer not null default 1,
  attuned      boolean not null default false,
  session_id   uuid references public.sessions(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.item_holdings enable row level security;
drop policy if exists "Users manage own item holdings" on public.item_holdings;
create policy "Users manage own item holdings" on public.item_holdings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists item_holdings_user_id_idx on public.item_holdings(user_id);
create index if not exists item_holdings_campaign_id_idx on public.item_holdings(campaign_id);
create index if not exists item_holdings_item_id_idx on public.item_holdings(item_id);
create index if not exists item_holdings_pc_id_idx on public.item_holdings(pc_id);
create index if not exists item_holdings_session_id_idx on public.item_holdings(session_id);
drop trigger if exists item_holdings_updated_at on public.item_holdings;
create trigger item_holdings_updated_at before update on public.item_holdings for each row execute function public.set_updated_at();

-- --------------- Recently deleted ---------------

drop trigger if exists items_to_trash on public.items;
create trigger items_to_trash before delete on public.items for each row execute function public.trash_capture();
drop trigger if exists item_holdings_to_trash on public.item_holdings;
create trigger item_holdings_to_trash before delete on public.item_holdings for each row execute function public.trash_capture();

-- --------------- Field-length and range CHECK constraints ---------------
-- Mirrors src/lib/fieldLimits.ts.

alter table public.items drop constraint if exists items_name_len_chk;
alter table public.items add constraint items_name_len_chk check (char_length(name) <= 120) not valid;
alter table public.items drop constraint if exists items_item_type_len_chk;
alter table public.items add constraint items_item_type_len_chk check (char_length(item_type) <= 60) not valid;
alter table public.items drop constraint if exists items_rarity_len_chk;
alter table public.items add constraint items_rarity_len_chk check (char_length(rarity) <= 60) not valid;
alter table public.items drop constraint if exists items_attunement_note_len_chk;
alter table public.items add constraint items_attunement_note_len_chk check (char_length(attunement_note) <= 120) not valid;
alter table public.items drop constraint if exists items_value_len_chk;
alter table public.items add constraint items_value_len_chk check (char_length(value) <= 120) not valid;
alter table public.items drop constraint if exists items_description_len_chk;
alter table public.items add constraint items_description_len_chk check (char_length(description) <= 8000) not valid;
alter table public.items drop constraint if exists items_dm_notes_len_chk;
alter table public.items add constraint items_dm_notes_len_chk check (char_length(dm_notes) <= 8000) not valid;
alter table public.items drop constraint if exists items_image_path_len_chk;
alter table public.items add constraint items_image_path_len_chk check (char_length(image_path) <= 500) not valid;
alter table public.item_holdings drop constraint if exists item_holdings_note_len_chk;
alter table public.item_holdings add constraint item_holdings_note_len_chk check (char_length(note) <= 240) not valid;
alter table public.item_holdings drop constraint if exists item_holdings_quantity_range_chk;
alter table public.item_holdings add constraint item_holdings_quantity_range_chk check (quantity between 1 and 9999) not valid;
