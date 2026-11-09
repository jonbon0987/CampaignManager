import { describe, it, expect } from 'vitest';
import { plan, readControl, type HelperState } from './helper.js';

const tavern = { guildId: 'g1', channelId: 'c1', channelName: 'Tavern' };
const dungeon = { guildId: 'g1', channelId: 'c2', channelName: 'Dungeon' };
const idle: HelperState = { signedIn: false, activeRecordings: 0, capturing: 0, seat: null };

describe('plan', () => {
  it('signs in when the DM asks, and not before', () => {
    expect(plan({ online: false, voice: null }, idle)).toMatchObject({ signIn: false, signOut: false });
    expect(plan({ online: true, voice: null }, idle)).toMatchObject({ signIn: true });
  });

  it('signs in for a recording that wants Discord, even if the DM signed it out', () => {
    expect(plan({ online: false, voice: null }, { ...idle, activeRecordings: 1 })).toMatchObject({ signIn: true, detail: 'Signing in for a recording.' });
  });

  it('signs out when asked, leaving its voice channel first', () => {
    expect(plan({ online: false, voice: null }, { ...idle, signedIn: true, seat: tavern })).toEqual({ signIn: false, signOut: true, seat: null, detail: null });
    expect(plan({ online: false, voice: null }, { ...idle, signedIn: true })).toMatchObject({ signOut: true, seat: undefined });
  });

  it('never signs out mid-recording', () => {
    const p = plan({ online: false, voice: null }, { ...idle, signedIn: true, capturing: 1 });
    expect(p).toMatchObject({ signOut: false, detail: 'Staying signed in until the recording is done.' });
  });

  it('joins the channel the DM picked, moves when they pick another, and leaves when they clear it', () => {
    const on = { ...idle, signedIn: true };
    expect(plan({ online: true, voice: tavern }, on).seat).toEqual(tavern);
    expect(plan({ online: true, voice: tavern }, { ...on, seat: tavern }).seat).toBeUndefined();
    expect(plan({ online: true, voice: dungeon }, { ...on, seat: tavern }).seat).toEqual(dungeon);
    expect(plan({ online: true, voice: null }, { ...on, seat: tavern }).seat).toBeNull();
  });

  it('gives the voice connection to a recording, and takes its seat back after', () => {
    const on = { ...idle, signedIn: true, seat: tavern };
    expect(plan({ online: true, voice: tavern }, { ...on, capturing: 1 }).seat).toBeNull();
    expect(plan({ online: true, voice: tavern }, { ...on, seat: null, capturing: 1 }).seat).toBeUndefined();
    expect(plan({ online: true, voice: tavern }, { ...on, seat: null }).seat).toEqual(tavern);
  });
});

describe('readControl', () => {
  it('reads what the app wrote', () => {
    expect(readControl({ online: true, voice: tavern, updated_at: 't1' })).toEqual({ online: true, voice: tavern, updatedAt: 't1' });
  });

  it('reads nothing asked from a missing or malformed row', () => {
    expect(readControl(null)).toEqual({ online: false, voice: null, updatedAt: null });
    expect(readControl({ online: 'yes', voice: { guildId: 1 } })).toEqual({ online: false, voice: null, updatedAt: null });
    expect(readControl({ online: true, voice: { guildId: 'g', channelId: 'c' } }).voice).toEqual({ guildId: 'g', channelId: 'c', channelName: 'voice' });
  });
});
