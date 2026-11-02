import { describe, it, expect } from 'vitest';
import { describeShared, newPageToken, playerPageToken, playerPageUrl } from './playerPage';

describe('newPageToken', () => {
  it('is 32 URL-safe characters, different every time', () => {
    const tokens = new Set(Array.from({ length: 50 }, newPageToken));
    expect(tokens.size).toBe(50);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('round-trips through the player page address', () => {
    const t = newPageToken();
    expect(playerPageToken(new URL(playerPageUrl(t, 'https://dm.example')).pathname)).toBe(t);
  });
});

describe('playerPageToken', () => {
  const token = 'dC75WAhZdIu6mkwYOmwSHacvobRYnFw_';

  it('reads the token from /p/<token>', () => {
    expect(playerPageToken(`/p/${token}`)).toBe(token);
    expect(playerPageToken(`/p/${token}/`)).toBe(token);
  });

  it('is null for the DM app and for anything that is not a full token', () => {
    expect(playerPageToken('/')).toBeNull();
    expect(playerPageToken('/w/abc/c/def')).toBeNull();
    expect(playerPageToken('/p/short')).toBeNull();
    expect(playerPageToken(`/p/${token}/extra`)).toBeNull();
    expect(playerPageToken(`/p/${token.slice(0, -1)}!`)).toBeNull();
  });
});

describe('describeShared', () => {
  it('names each kind with a count, singular or plural, in a fixed order', () => {
    expect(describeShared({ lore: 2, session: 1, npc: 3 })).toBe('1 recap · 3 people · 2 lore entries');
    expect(describeShared({ handout: 1, location: 2 })).toBe('1 handout · 2 places');
  });

  it('is empty when nothing is shared', () => {
    expect(describeShared({})).toBe('');
    expect(describeShared({ npc: 0 })).toBe('');
  });
});
