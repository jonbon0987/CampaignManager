-- 0028_field_length_constraints.sql
-- ---------------------------------------------------------------------------
-- Enforce per-field length / numeric-range limits at the database layer.
--
-- WHY: the app also enforces these in src/lib/fieldLimits.ts (client inputs +
-- the db.ts write layer), but the DB is the last line of defence for any write
-- path that bypasses the app (direct API calls, SQL, future services).
--
-- GENERATED FILE — do not edit by hand. Regenerate with:
--   npm run migrate:gen-constraints
-- The source of truth is src/lib/fieldLimits.ts.
--
-- Constraints are added NOT VALID: they enforce on every INSERT/UPDATE from now
-- on, but do NOT retro-validate existing rows (legacy AI-generated content may
-- predate these limits). To validate the backlog later, run:
--   ALTER TABLE <t> VALIDATE CONSTRAINT <name>;
--
-- SAFE TO RE-RUN: every constraint is dropped-if-exists before being re-added.
-- NULLs always pass a CHECK, so nullable columns are unaffected when empty.
-- ---------------------------------------------------------------------------

-- worlds
alter table public.worlds drop constraint if exists worlds_name_len_chk;
alter table public.worlds add constraint worlds_name_len_chk check (char_length(name) <= 120) not valid;
alter table public.worlds drop constraint if exists worlds_tagline_len_chk;
alter table public.worlds add constraint worlds_tagline_len_chk check (char_length(tagline) <= 240) not valid;
alter table public.worlds drop constraint if exists worlds_era_len_chk;
alter table public.worlds add constraint worlds_era_len_chk check (char_length(era) <= 120) not valid;
alter table public.worlds drop constraint if exists worlds_calendar_len_chk;
alter table public.worlds add constraint worlds_calendar_len_chk check (char_length(calendar) <= 120) not valid;
alter table public.worlds drop constraint if exists worlds_year_range_chk;
alter table public.worlds add constraint worlds_year_range_chk check (year between -99999 and 99999) not valid;

-- campaigns
alter table public.campaigns drop constraint if exists campaigns_name_len_chk;
alter table public.campaigns add constraint campaigns_name_len_chk check (char_length(name) <= 120) not valid;
alter table public.campaigns drop constraint if exists campaigns_description_len_chk;
alter table public.campaigns add constraint campaigns_description_len_chk check (char_length(description) <= 8000) not valid;
alter table public.campaigns drop constraint if exists campaigns_title_len_chk;
alter table public.campaigns add constraint campaigns_title_len_chk check (char_length(title) <= 120) not valid;
alter table public.campaigns drop constraint if exists campaigns_plot_summary_len_chk;
alter table public.campaigns add constraint campaigns_plot_summary_len_chk check (char_length(plot_summary) <= 8000) not valid;
alter table public.campaigns drop constraint if exists campaigns_major_characters_len_chk;
alter table public.campaigns add constraint campaigns_major_characters_len_chk check (char_length(major_characters) <= 8000) not valid;
alter table public.campaigns drop constraint if exists campaigns_world_info_len_chk;
alter table public.campaigns add constraint campaigns_world_info_len_chk check (char_length(world_info) <= 8000) not valid;
alter table public.campaigns drop constraint if exists campaigns_party_len_chk;
alter table public.campaigns add constraint campaigns_party_len_chk check (char_length(party) <= 240) not valid;
alter table public.campaigns drop constraint if exists campaigns_last_played_len_chk;
alter table public.campaigns add constraint campaigns_last_played_len_chk check (char_length(last_played) <= 120) not valid;

-- sessions
alter table public.sessions drop constraint if exists sessions_summary_len_chk;
alter table public.sessions add constraint sessions_summary_len_chk check (char_length(summary) <= 40000) not valid;
alter table public.sessions drop constraint if exists sessions_combats_len_chk;
alter table public.sessions add constraint sessions_combats_len_chk check (char_length(combats) <= 40000) not valid;
alter table public.sessions drop constraint if exists sessions_loot_rewards_len_chk;
alter table public.sessions add constraint sessions_loot_rewards_len_chk check (char_length(loot_rewards) <= 40000) not valid;
alter table public.sessions drop constraint if exists sessions_hooks_notes_len_chk;
alter table public.sessions add constraint sessions_hooks_notes_len_chk check (char_length(hooks_notes) <= 8000) not valid;
alter table public.sessions drop constraint if exists sessions_dm_notes_len_chk;
alter table public.sessions add constraint sessions_dm_notes_len_chk check (char_length(dm_notes) <= 40000) not valid;
alter table public.sessions drop constraint if exists sessions_session_number_range_chk;
alter table public.sessions add constraint sessions_session_number_range_chk check (session_number between 0 and 9999) not valid;

-- session_prep
alter table public.session_prep drop constraint if exists session_prep_notes_len_chk;
alter table public.session_prep add constraint session_prep_notes_len_chk check (char_length(notes) <= 40000) not valid;
alter table public.session_prep drop constraint if exists session_prep_session_number_range_chk;
alter table public.session_prep add constraint session_prep_session_number_range_chk check (session_number between 0 and 9999) not valid;

-- player_characters
alter table public.player_characters drop constraint if exists player_characters_character_name_len_chk;
alter table public.player_characters add constraint player_characters_character_name_len_chk check (char_length(character_name) <= 120) not valid;
alter table public.player_characters drop constraint if exists player_characters_player_name_len_chk;
alter table public.player_characters add constraint player_characters_player_name_len_chk check (char_length(player_name) <= 120) not valid;
alter table public.player_characters drop constraint if exists player_characters_race_len_chk;
alter table public.player_characters add constraint player_characters_race_len_chk check (char_length(race) <= 120) not valid;
alter table public.player_characters drop constraint if exists player_characters_class_len_chk;
alter table public.player_characters add constraint player_characters_class_len_chk check (char_length(class) <= 120) not valid;
alter table public.player_characters drop constraint if exists player_characters_background_len_chk;
alter table public.player_characters add constraint player_characters_background_len_chk check (char_length(background) <= 8000) not valid;
alter table public.player_characters drop constraint if exists player_characters_story_hooks_len_chk;
alter table public.player_characters add constraint player_characters_story_hooks_len_chk check (char_length(story_hooks) <= 8000) not valid;
alter table public.player_characters drop constraint if exists player_characters_key_npcs_len_chk;
alter table public.player_characters add constraint player_characters_key_npcs_len_chk check (char_length(key_npcs) <= 8000) not valid;
alter table public.player_characters drop constraint if exists player_characters_dm_notes_len_chk;
alter table public.player_characters add constraint player_characters_dm_notes_len_chk check (char_length(dm_notes) <= 8000) not valid;

-- npcs
alter table public.npcs drop constraint if exists npcs_name_len_chk;
alter table public.npcs add constraint npcs_name_len_chk check (char_length(name) <= 120) not valid;
alter table public.npcs drop constraint if exists npcs_role_len_chk;
alter table public.npcs add constraint npcs_role_len_chk check (char_length(role) <= 120) not valid;
alter table public.npcs drop constraint if exists npcs_affiliation_len_chk;
alter table public.npcs add constraint npcs_affiliation_len_chk check (char_length(affiliation) <= 120) not valid;
alter table public.npcs drop constraint if exists npcs_description_len_chk;
alter table public.npcs add constraint npcs_description_len_chk check (char_length(description) <= 8000) not valid;
alter table public.npcs drop constraint if exists npcs_hooks_motivations_len_chk;
alter table public.npcs add constraint npcs_hooks_motivations_len_chk check (char_length(hooks_motivations) <= 8000) not valid;
alter table public.npcs drop constraint if exists npcs_dm_notes_len_chk;
alter table public.npcs add constraint npcs_dm_notes_len_chk check (char_length(dm_notes) <= 8000) not valid;
alter table public.npcs drop constraint if exists npcs_location_len_chk;
alter table public.npcs add constraint npcs_location_len_chk check (char_length(location) <= 120) not valid;
alter table public.npcs drop constraint if exists npcs_first_session_range_chk;
alter table public.npcs add constraint npcs_first_session_range_chk check (first_session between 0 and 9999) not valid;

-- locations
alter table public.locations drop constraint if exists locations_name_len_chk;
alter table public.locations add constraint locations_name_len_chk check (char_length(name) <= 120) not valid;
alter table public.locations drop constraint if exists locations_region_len_chk;
alter table public.locations add constraint locations_region_len_chk check (char_length(region) <= 120) not valid;
alter table public.locations drop constraint if exists locations_location_type_len_chk;
alter table public.locations add constraint locations_location_type_len_chk check (char_length(location_type) <= 60) not valid;
alter table public.locations drop constraint if exists locations_population_len_chk;
alter table public.locations add constraint locations_population_len_chk check (char_length(population) <= 120) not valid;
alter table public.locations drop constraint if exists locations_status_len_chk;
alter table public.locations add constraint locations_status_len_chk check (char_length(status) <= 60) not valid;
alter table public.locations drop constraint if exists locations_history_len_chk;
alter table public.locations add constraint locations_history_len_chk check (char_length(history) <= 8000) not valid;
alter table public.locations drop constraint if exists locations_description_len_chk;
alter table public.locations add constraint locations_description_len_chk check (char_length(description) <= 8000) not valid;
alter table public.locations drop constraint if exists locations_dm_notes_len_chk;
alter table public.locations add constraint locations_dm_notes_len_chk check (char_length(dm_notes) <= 8000) not valid;

-- factions
alter table public.factions drop constraint if exists factions_name_len_chk;
alter table public.factions add constraint factions_name_len_chk check (char_length(name) <= 120) not valid;
alter table public.factions drop constraint if exists factions_faction_type_len_chk;
alter table public.factions add constraint factions_faction_type_len_chk check (char_length(faction_type) <= 60) not valid;
alter table public.factions drop constraint if exists factions_overview_len_chk;
alter table public.factions add constraint factions_overview_len_chk check (char_length(overview) <= 8000) not valid;
alter table public.factions drop constraint if exists factions_key_figures_len_chk;
alter table public.factions add constraint factions_key_figures_len_chk check (char_length(key_figures) <= 8000) not valid;
alter table public.factions drop constraint if exists factions_agenda_len_chk;
alter table public.factions add constraint factions_agenda_len_chk check (char_length(agenda) <= 8000) not valid;
alter table public.factions drop constraint if exists factions_dm_notes_len_chk;
alter table public.factions add constraint factions_dm_notes_len_chk check (char_length(dm_notes) <= 8000) not valid;

-- hooks
alter table public.hooks drop constraint if exists hooks_title_len_chk;
alter table public.hooks add constraint hooks_title_len_chk check (char_length(title) <= 120) not valid;
alter table public.hooks drop constraint if exists hooks_category_len_chk;
alter table public.hooks add constraint hooks_category_len_chk check (char_length(category) <= 60) not valid;
alter table public.hooks drop constraint if exists hooks_description_len_chk;
alter table public.hooks add constraint hooks_description_len_chk check (char_length(description) <= 8000) not valid;
alter table public.hooks drop constraint if exists hooks_state_len_chk;
alter table public.hooks add constraint hooks_state_len_chk check (char_length(state) <= 60) not valid;
alter table public.hooks drop constraint if exists hooks_dm_only_notes_len_chk;
alter table public.hooks add constraint hooks_dm_only_notes_len_chk check (char_length(dm_only_notes) <= 8000) not valid;
alter table public.hooks drop constraint if exists hooks_last_updated_session_range_chk;
alter table public.hooks add constraint hooks_last_updated_session_range_chk check (last_updated_session between 0 and 9999) not valid;

-- ideas
alter table public.ideas drop constraint if exists ideas_text_len_chk;
alter table public.ideas add constraint ideas_text_len_chk check (char_length(text) <= 8000) not valid;
alter table public.ideas drop constraint if exists ideas_tag_len_chk;
alter table public.ideas add constraint ideas_tag_len_chk check (char_length(tag) <= 60) not valid;

-- lore_entries
alter table public.lore_entries drop constraint if exists lore_entries_title_len_chk;
alter table public.lore_entries add constraint lore_entries_title_len_chk check (char_length(title) <= 120) not valid;
alter table public.lore_entries drop constraint if exists lore_entries_category_len_chk;
alter table public.lore_entries add constraint lore_entries_category_len_chk check (char_length(category) <= 60) not valid;
alter table public.lore_entries drop constraint if exists lore_entries_content_len_chk;
alter table public.lore_entries add constraint lore_entries_content_len_chk check (char_length(content) <= 40000) not valid;

-- timeline_events
alter table public.timeline_events drop constraint if exists timeline_events_title_len_chk;
alter table public.timeline_events add constraint timeline_events_title_len_chk check (char_length(title) <= 120) not valid;
alter table public.timeline_events drop constraint if exists timeline_events_description_len_chk;
alter table public.timeline_events add constraint timeline_events_description_len_chk check (char_length(description) <= 8000) not valid;
alter table public.timeline_events drop constraint if exists timeline_events_display_date_len_chk;
alter table public.timeline_events add constraint timeline_events_display_date_len_chk check (char_length(display_date) <= 120) not valid;
alter table public.timeline_events drop constraint if exists timeline_events_event_type_len_chk;
alter table public.timeline_events add constraint timeline_events_event_type_len_chk check (char_length(event_type) <= 60) not valid;
alter table public.timeline_events drop constraint if exists timeline_events_era_len_chk;
alter table public.timeline_events add constraint timeline_events_era_len_chk check (char_length(era) <= 120) not valid;
alter table public.timeline_events drop constraint if exists timeline_events_year_range_chk;
alter table public.timeline_events add constraint timeline_events_year_range_chk check (year between -99999 and 99999) not valid;

-- modules
alter table public.modules drop constraint if exists modules_chapter_len_chk;
alter table public.modules add constraint modules_chapter_len_chk check (char_length(chapter) <= 60) not valid;
alter table public.modules drop constraint if exists modules_title_len_chk;
alter table public.modules add constraint modules_title_len_chk check (char_length(title) <= 120) not valid;
alter table public.modules drop constraint if exists modules_synopsis_len_chk;
alter table public.modules add constraint modules_synopsis_len_chk check (char_length(synopsis) <= 8000) not valid;
alter table public.modules drop constraint if exists modules_encounters_len_chk;
alter table public.modules add constraint modules_encounters_len_chk check (char_length(encounters) <= 40000) not valid;
alter table public.modules drop constraint if exists modules_rewards_len_chk;
alter table public.modules add constraint modules_rewards_len_chk check (char_length(rewards) <= 40000) not valid;
alter table public.modules drop constraint if exists modules_dm_notes_len_chk;
alter table public.modules add constraint modules_dm_notes_len_chk check (char_length(dm_notes) <= 40000) not valid;
alter table public.modules drop constraint if exists modules_played_session_range_chk;
alter table public.modules add constraint modules_played_session_range_chk check (played_session between 0 and 9999) not valid;

-- character_relationships
alter table public.character_relationships drop constraint if exists character_relationships_label_len_chk;
alter table public.character_relationships add constraint character_relationships_label_len_chk check (char_length(label) <= 240) not valid;

-- submodules
alter table public.submodules drop constraint if exists submodules_title_len_chk;
alter table public.submodules add constraint submodules_title_len_chk check (char_length(title) <= 120) not valid;
alter table public.submodules drop constraint if exists submodules_submodule_type_len_chk;
alter table public.submodules add constraint submodules_submodule_type_len_chk check (char_length(submodule_type) <= 60) not valid;
alter table public.submodules drop constraint if exists submodules_summary_len_chk;
alter table public.submodules add constraint submodules_summary_len_chk check (char_length(summary) <= 8000) not valid;
alter table public.submodules drop constraint if exists submodules_content_len_chk;
alter table public.submodules add constraint submodules_content_len_chk check (char_length(content) <= 40000) not valid;
alter table public.submodules drop constraint if exists submodules_dm_notes_len_chk;
alter table public.submodules add constraint submodules_dm_notes_len_chk check (char_length(dm_notes) <= 40000) not valid;

-- scenes
alter table public.scenes drop constraint if exists scenes_title_len_chk;
alter table public.scenes add constraint scenes_title_len_chk check (char_length(title) <= 120) not valid;
alter table public.scenes drop constraint if exists scenes_scene_type_len_chk;
alter table public.scenes add constraint scenes_scene_type_len_chk check (char_length(scene_type) <= 60) not valid;
alter table public.scenes drop constraint if exists scenes_summary_len_chk;
alter table public.scenes add constraint scenes_summary_len_chk check (char_length(summary) <= 8000) not valid;
alter table public.scenes drop constraint if exists scenes_content_len_chk;
alter table public.scenes add constraint scenes_content_len_chk check (char_length(content) <= 40000) not valid;
alter table public.scenes drop constraint if exists scenes_dm_notes_len_chk;
alter table public.scenes add constraint scenes_dm_notes_len_chk check (char_length(dm_notes) <= 40000) not valid;

-- module_sheets
alter table public.module_sheets drop constraint if exists module_sheets_title_len_chk;
alter table public.module_sheets add constraint module_sheets_title_len_chk check (char_length(title) <= 120) not valid;
alter table public.module_sheets drop constraint if exists module_sheets_sheet_type_len_chk;
alter table public.module_sheets add constraint module_sheets_sheet_type_len_chk check (char_length(sheet_type) <= 60) not valid;
alter table public.module_sheets drop constraint if exists module_sheets_content_len_chk;
alter table public.module_sheets add constraint module_sheets_content_len_chk check (char_length(content) <= 40000) not valid;
alter table public.module_sheets drop constraint if exists module_sheets_dm_notes_len_chk;
alter table public.module_sheets add constraint module_sheets_dm_notes_len_chk check (char_length(dm_notes) <= 40000) not valid;

-- monster_statblocks
alter table public.monster_statblocks drop constraint if exists monster_statblocks_name_len_chk;
alter table public.monster_statblocks add constraint monster_statblocks_name_len_chk check (char_length(name) <= 120) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_creature_type_len_chk;
alter table public.monster_statblocks add constraint monster_statblocks_creature_type_len_chk check (char_length(creature_type) <= 60) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_challenge_rating_len_chk;
alter table public.monster_statblocks add constraint monster_statblocks_challenge_rating_len_chk check (char_length(challenge_rating) <= 120) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_ac_descriptor_len_chk;
alter table public.monster_statblocks add constraint monster_statblocks_ac_descriptor_len_chk check (char_length(ac_descriptor) <= 120) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_hit_dice_len_chk;
alter table public.monster_statblocks add constraint monster_statblocks_hit_dice_len_chk check (char_length(hit_dice) <= 120) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_speed_len_chk;
alter table public.monster_statblocks add constraint monster_statblocks_speed_len_chk check (char_length(speed) <= 120) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_saving_throws_len_chk;
alter table public.monster_statblocks add constraint monster_statblocks_saving_throws_len_chk check (char_length(saving_throws) <= 500) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_skills_len_chk;
alter table public.monster_statblocks add constraint monster_statblocks_skills_len_chk check (char_length(skills) <= 500) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_damage_immunities_len_chk;
alter table public.monster_statblocks add constraint monster_statblocks_damage_immunities_len_chk check (char_length(damage_immunities) <= 500) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_damage_resistances_len_chk;
alter table public.monster_statblocks add constraint monster_statblocks_damage_resistances_len_chk check (char_length(damage_resistances) <= 500) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_condition_immunities_len_chk;
alter table public.monster_statblocks add constraint monster_statblocks_condition_immunities_len_chk check (char_length(condition_immunities) <= 500) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_senses_len_chk;
alter table public.monster_statblocks add constraint monster_statblocks_senses_len_chk check (char_length(senses) <= 500) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_languages_len_chk;
alter table public.monster_statblocks add constraint monster_statblocks_languages_len_chk check (char_length(languages) <= 500) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_content_len_chk;
alter table public.monster_statblocks add constraint monster_statblocks_content_len_chk check (char_length(content) <= 40000) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_dm_notes_len_chk;
alter table public.monster_statblocks add constraint monster_statblocks_dm_notes_len_chk check (char_length(dm_notes) <= 8000) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_tags_len_chk;
alter table public.monster_statblocks add constraint monster_statblocks_tags_len_chk check (char_length(tags) <= 500) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_armor_class_range_chk;
alter table public.monster_statblocks add constraint monster_statblocks_armor_class_range_chk check (armor_class between 0 and 99) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_hit_points_range_chk;
alter table public.monster_statblocks add constraint monster_statblocks_hit_points_range_chk check (hit_points between 0 and 99999) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_str_range_chk;
alter table public.monster_statblocks add constraint monster_statblocks_str_range_chk check (str between 1 and 99) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_dex_range_chk;
alter table public.monster_statblocks add constraint monster_statblocks_dex_range_chk check (dex between 1 and 99) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_con_range_chk;
alter table public.monster_statblocks add constraint monster_statblocks_con_range_chk check (con between 1 and 99) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_int_range_chk;
alter table public.monster_statblocks add constraint monster_statblocks_int_range_chk check (int between 1 and 99) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_wis_range_chk;
alter table public.monster_statblocks add constraint monster_statblocks_wis_range_chk check (wis between 1 and 99) not valid;
alter table public.monster_statblocks drop constraint if exists monster_statblocks_cha_range_chk;
alter table public.monster_statblocks add constraint monster_statblocks_cha_range_chk check (cha between 1 and 99) not valid;

-- encounters
alter table public.encounters drop constraint if exists encounters_name_len_chk;
alter table public.encounters add constraint encounters_name_len_chk check (char_length(name) <= 120) not valid;
alter table public.encounters drop constraint if exists encounters_description_len_chk;
alter table public.encounters add constraint encounters_description_len_chk check (char_length(description) <= 8000) not valid;
alter table public.encounters drop constraint if exists encounters_environment_len_chk;
alter table public.encounters add constraint encounters_environment_len_chk check (char_length(environment) <= 60) not valid;
alter table public.encounters drop constraint if exists encounters_difficulty_len_chk;
alter table public.encounters add constraint encounters_difficulty_len_chk check (char_length(difficulty) <= 60) not valid;
alter table public.encounters drop constraint if exists encounters_dm_notes_len_chk;
alter table public.encounters add constraint encounters_dm_notes_len_chk check (char_length(dm_notes) <= 8000) not valid;
alter table public.encounters drop constraint if exists encounters_party_size_range_chk;
alter table public.encounters add constraint encounters_party_size_range_chk check (party_size between 1 and 99) not valid;
alter table public.encounters drop constraint if exists encounters_party_level_range_chk;
alter table public.encounters add constraint encounters_party_level_range_chk check (party_level between 1 and 99) not valid;

-- module_dependencies
alter table public.module_dependencies drop constraint if exists module_dependencies_label_len_chk;
alter table public.module_dependencies add constraint module_dependencies_label_len_chk check (char_length(label) <= 240) not valid;

-- submodule_dependencies
alter table public.submodule_dependencies drop constraint if exists submodule_dependencies_label_len_chk;
alter table public.submodule_dependencies add constraint submodule_dependencies_label_len_chk check (char_length(label) <= 240) not valid;
