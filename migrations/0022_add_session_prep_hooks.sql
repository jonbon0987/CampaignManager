-- Add dangled_hook_ids array to session_prep
-- Stores IDs of hooks the DM plans to dangle during this session.

alter table public.session_prep
  add column if not exists dangled_hook_ids uuid[] not null default '{}';
