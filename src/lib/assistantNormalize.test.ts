import { describe, it, expect } from 'vitest';
import { normalizeAssistantPayload } from './assistantNormalize';

describe('normalizeAssistantPayload', () => {
  it('drops columns that do not exist on the target table', () => {
    // The bug: the model put a PlayerCharacter field (key_npcs) on an NPC,
    // which PostgREST rejects as an unknown column.
    expect(normalizeAssistantPayload('upsertNPC', { name: 'Kutter', key_npcs: 'the party', bogus: 1 }))
      .toEqual({ name: 'Kutter' });
  });

  it('keeps real columns, including id/campaign_id/world_id', () => {
    const payload = { id: 'abc', campaign_id: 'c1', world_id: 'w1', name: 'Kutter', role: 'guide' };
    expect(normalizeAssistantPayload('upsertNPC', payload)).toEqual(payload);
  });

  it('lowercases a valid-but-miscased NPC status', () => {
    expect(normalizeAssistantPayload('upsertNPC', { name: 'Kutter', status: 'Active' }))
      .toEqual({ name: 'Kutter', status: 'active' });
  });

  it('coerces an out-of-set NPC status to the default', () => {
    expect(normalizeAssistantPayload('upsertNPC', { status: 'alive' })).toEqual({ status: 'active' });
    expect(normalizeAssistantPayload('upsertNPC', { status: null })).toEqual({ status: 'active' });
  });

  it('leaves a valid NPC status untouched', () => {
    expect(normalizeAssistantPayload('upsertNPC', { status: 'deceased' })).toEqual({ status: 'deceased' });
  });

  it('does not inject status when the field is absent (update case)', () => {
    expect(normalizeAssistantPayload('upsertNPC', { description: 'updated' }))
      .toEqual({ description: 'updated' });
  });

  it('normalizes module status and relationship_type', () => {
    expect(normalizeAssistantPayload('upsertModule', { status: 'in progress' }))
      .toEqual({ status: 'planned' });
    expect(normalizeAssistantPayload('upsertRelationship', { relationship_type: 'ENEMY' }))
      .toEqual({ relationship_type: 'neutral' });
    expect(normalizeAssistantPayload('upsertRelationship', { relationship_type: 'Ally' }))
      .toEqual({ relationship_type: 'ally' });
  });

  it('keeps free-text columns even with unconventional values', () => {
    expect(normalizeAssistantPayload('upsertLocation', { name: 'Duskward', location_type: 'megacity', status: 'flooded' }))
      .toEqual({ name: 'Duskward', location_type: 'megacity', status: 'flooded' });
    expect(normalizeAssistantPayload('upsertLore', { title: 'Prophecy', category: 'prophecy' }))
      .toEqual({ title: 'Prophecy', category: 'prophecy' });
  });

  it('keeps timeline columns and coerces event_type', () => {
    expect(normalizeAssistantPayload('upsertTimelineEvent', {
      title: 'The Sundering', year: 812, display_date: 'CR 812', event_type: 'Cataclysm', era: 'First Silence', bogus: 1,
    })).toEqual({ title: 'The Sundering', year: 812, display_date: 'CR 812', event_type: 'cataclysm', era: 'First Silence' });
    // 'campaign' is not world-writable, and junk types fall back to custom.
    expect(normalizeAssistantPayload('upsertTimelineEvent', { event_type: 'campaign' }))
      .toEqual({ event_type: 'custom' });
    expect(normalizeAssistantPayload('upsertTimelineEvent', { event_type: 'skirmish' }))
      .toEqual({ event_type: 'custom' });
  });

  it('reads a PC’s numbers off text and keeps them in range', () => {
    expect(normalizeAssistantPayload('upsertPC', { level: '5th', max_hp: '1,200', armor_class: 16.4, xp: -10, passive_insight: null, spell_save_dc: 'n/a' }))
      .toEqual({ level: 5, max_hp: 999, armor_class: 16, xp: 0, passive_insight: null });
  });

  it('keeps only a web link for a PC’s sheet', () => {
    expect(normalizeAssistantPayload('upsertPC', { sheet_url: ' https://www.dndbeyond.com/characters/1 ' }))
      .toEqual({ sheet_url: 'https://www.dndbeyond.com/characters/1' });
    expect(normalizeAssistantPayload('upsertPC', { sheet_url: 'on D&D Beyond' })).toEqual({});
    expect(normalizeAssistantPayload('upsertPC', { sheet_url: null })).toEqual({ sheet_url: null });
  });

  it('reads a session’s status, and never sets one live', () => {
    expect(normalizeAssistantPayload('upsertSession', { status: 'Upcoming', title: 'The Vault', plan: {} }))
      .toEqual({ status: 'planned', title: 'The Vault', plan: {} });
    expect(normalizeAssistantPayload('upsertSession', { status: 'played' })).toEqual({ status: 'done' });
    expect(normalizeAssistantPayload('upsertSession', { status: 'live' })).toEqual({});
  });

  it('reads an item’s type and rarity by id or name', () => {
    expect(normalizeAssistantPayload('upsertItem', { name: 'Cloak', item_type: 'Wondrous item', rarity: 'Very Rare', attunement: 'true', holders: [], bogus: 1 }))
      .toEqual({ name: 'Cloak', item_type: 'wondrous', rarity: 'very_rare', attunement: true, holders: [] });
    expect(normalizeAssistantPayload('upsertItem', { item_type: 'trinket', rarity: 'mundane' }))
      .toEqual({ item_type: 'other', rarity: null });
  });

  it('keeps the newer columns on places, threads and scenes', () => {
    expect(normalizeAssistantPayload('upsertLocation', { parent_id: 'p', read_aloud: 'Smoke.', map_pins: [] })).toEqual({ parent_id: 'p', read_aloud: 'Smoke.' });
    expect(normalizeAssistantPayload('upsertHook', { player_text: 'He wants it back.' })).toEqual({ player_text: 'He wants it back.' });
    expect(normalizeAssistantPayload('upsertScene', { read_aloud: 'Cold air.' })).toEqual({ read_aloud: 'Cold air.' });
  });

  it('drops the id from a ledger line, which is only ever added', () => {
    expect(normalizeAssistantPayload('addTreasury', { id: 'l-1', gp: 5, note: 'Tip' })).toEqual({ gp: 5, note: 'Tip' });
  });

  it('passes non-object payloads and unknown types through', () => {
    expect(normalizeAssistantPayload('deleteNPC', undefined)).toBeUndefined();
    const unknown = { anything: true };
    expect(normalizeAssistantPayload('somethingElse', unknown)).toBe(unknown);
  });
});
