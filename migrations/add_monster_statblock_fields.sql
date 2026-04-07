-- Migration: add structured D&D 5e stat fields to monster_statblocks
-- Run this in your Supabase SQL editor.

alter table public.monster_statblocks
  add column if not exists armor_class      integer,
  add column if not exists ac_descriptor    text,       -- e.g. "natural armor", "chain mail"
  add column if not exists hit_points       integer,
  add column if not exists hit_dice         text,       -- e.g. "6d10+12"
  add column if not exists speed            text,       -- e.g. "30 ft., fly 60 ft."
  add column if not exists str              integer,
  add column if not exists dex              integer,
  add column if not exists con              integer,
  add column if not exists int              integer,
  add column if not exists wis              integer,
  add column if not exists cha              integer,
  add column if not exists saving_throws    text,       -- e.g. "Dex +4, Con +6"
  add column if not exists skills           text,       -- e.g. "Perception +5, Stealth +4"
  add column if not exists damage_immunities   text,
  add column if not exists damage_resistances  text,
  add column if not exists condition_immunities text,
  add column if not exists senses           text,       -- e.g. "darkvision 60 ft., passive Perception 15"
  add column if not exists languages        text;       -- e.g. "Common, Draconic"
