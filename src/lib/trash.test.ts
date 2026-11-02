import { describe, it, expect, vi } from 'vitest';
import { announceRestored, deletedWhen, describeDeleted, restoreErrorMessage, RESTORED_EVENT } from './trash';

describe('describeDeleted', () => {
  it('names each kind the list shows', () => {
    expect(describeDeleted({ table_name: 'npcs', data: { name: 'Brenna' } })).toEqual({ noun: 'NPC', label: 'Brenna' });
    expect(describeDeleted({ table_name: 'modules', data: { title: 'The Sunken Crown' } })).toEqual({ noun: 'Module', label: 'The Sunken Crown' });
    expect(describeDeleted({ table_name: 'player_characters', data: { character_name: 'Kael' } })?.label).toBe('Kael');
    expect(describeDeleted({ table_name: 'campaigns', data: { name: 'Test', title: 'Age of Wild Magic' } })?.label).toBe('Age of Wild Magic');
  });

  it('names an untitled session by its number', () => {
    expect(describeDeleted({ table_name: 'sessions', data: { title: null, session_number: 6 } })?.label).toBe('Session 6');
    expect(describeDeleted({ table_name: 'sessions', data: { title: 'The Heist', session_number: 6 } })?.label).toBe('The Heist');
  });

  it('shortens a long idea', () => {
    const label = describeDeleted({ table_name: 'ideas', data: { text: 'x'.repeat(100) } })!.label;
    expect(label).toHaveLength(60);
    expect(label.endsWith('…')).toBe(true);
  });

  it('calls a record with no name untitled', () => {
    expect(describeDeleted({ table_name: 'handouts', data: { title: '' } })?.label).toBe('Untitled handout');
  });

  it('leaves out what the DM didn’t delete themselves', () => {
    expect(describeDeleted({ table_name: 'transcript_segments', data: {} })).toBeNull();
    expect(describeDeleted({ table_name: 'player_shares', data: {} })).toBeNull();
    expect(describeDeleted({ table_name: 'session_recordings', data: {} })).toBeNull();
  });
});

describe('deletedWhen', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('says how long ago, in words', () => {
    expect(deletedWhen(ago(20_000), now)).toBe('just now');
    expect(deletedWhen(ago(60_000), now)).toBe('1 minute ago');
    expect(deletedWhen(ago(5 * 60_000), now)).toBe('5 minutes ago');
    expect(deletedWhen(ago(3 * 3_600_000), now)).toBe('3 hours ago');
    expect(deletedWhen(ago(30 * 3_600_000), now)).toBe('yesterday');
    expect(deletedWhen(ago(4 * 86_400_000), now)).toBe('4 days ago');
  });
});

describe('restoreErrorMessage', () => {
  it('explains a session number that is taken', () => {
    expect(restoreErrorMessage('Can’t restore it: something newer has taken its place (duplicate key value violates unique constraint "sessions_campaign_id_session_number_key").'))
      .toMatch(/newer session has its number/);
  });

  it('hides other constraint names', () => {
    expect(restoreErrorMessage('duplicate key value violates unique constraint "speaker_links_campaign_id_discord_user_id_key"'))
      .toBe('Can’t restore it: something newer has taken its place.');
  });

  it('passes other messages through', () => {
    expect(restoreErrorMessage('Can’t restore it: what it belonged to has been deleted too. Restore that first.'))
      .toBe('Can’t restore it: what it belonged to has been deleted too. Restore that first.');
  });
});

describe('announceRestored', () => {
  it('tells every loaded list to reload', () => {
    const heard = vi.fn();
    window.addEventListener(RESTORED_EVENT, heard);
    announceRestored();
    window.removeEventListener(RESTORED_EVENT, heard);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
