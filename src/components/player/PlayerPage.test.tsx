import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PlayerPageData } from '../../lib/database.types';

const load = vi.hoisted(() => vi.fn());
vi.mock('../../lib/db', () => ({ PlayerPages: { load } }));
vi.mock('../../hooks/useImageUrl', () => ({ useImageUrl: (p: string | null) => (p ? `https://signed/${p}` : null) }));

import PlayerPage from './PlayerPage';

const empty: PlayerPageData = {
  campaign: { name: 'Test', title: 'The Sunken Crown' },
  party: [], recaps: [], handouts: [], people: [], places: [], lore: [], threads: [], schedule: null, world_date: null, treasury: null,
};

const full: PlayerPageData = {
  ...empty,
  party: [{ id: 'p1', name: 'Test Hero', player: 'Sam', race: 'Elf', class: 'Wizard', level: 3, portrait: null }],
  recaps: [{ id: 's1', number: 4, title: null, date: '2026-10-26', summary: 'We met @[Brenna](npc:n1) at the docks.', loot: '- 40 gp' }],
  handouts: [{ id: 'h1', title: 'Ransom note', image: 'u/h1.webp' }],
  people: [{ id: 'n1', name: 'Brenna Coldwater', role: 'Harbormaster', status: 'deceased', description: 'Keeps the tide charts.', portrait: 'u/n1.webp' }],
  places: [{ id: 'l1', name: 'The Drowned Portico', type: 'landmark', region: 'Duskward', description: 'Flooded.', map: 'u/l1.webp' }],
  lore: [{ id: 'e1', title: 'The Drowned King', category: 'history', content: 'A **king** sank here.' }],
};

describe('PlayerPage', () => {
  beforeEach(() => { load.mockReset(); });

  describe('the quest log and what the DM switched on', () => {
    const extras = {
      threads: [
        { id: 't1', title: 'The Harbormaster’s Letter', text: 'He wants it **back**, and he’ll pay.', done: false },
        { id: 't2', title: 'The Missing Smith', text: null, done: true },
      ],
      schedule: { number: 7, date: '2026-11-12', time: '19:00', repeat: 'weekly', last_date: '2026-11-05', last_time: '19:00' },
      world_date: { date: { year: 1492, day: 45 }, months: [{ name: 'Hammer', days: 30 }, { name: 'Alturiak', days: 30 }], suffix: 'DR' },
      treasury: { cp: 0, sp: 5, ep: 0, gp: 120, pp: 0 },
    } as unknown as Partial<PlayerPageData>;

    it('shows leads in their own words, with resolved ones apart', async () => {
      load.mockResolvedValue({ ...full, ...extras });
      render(<PlayerPage token={'x'.repeat(32)} />);
      expect(await screen.findByRole('heading', { name: 'Quest log' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Quest log' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'The Harbormaster’s Letter' })).toBeTruthy();
      expect(screen.getByText('back').tagName).toBe('STRONG');
      expect(screen.getByText('Resolved')).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'The Missing Smith' }).closest('.is-done')).toBeTruthy();
    });

    it('shows the next session, the in-world date and the treasure when they’re on', async () => {
      load.mockResolvedValue({ ...full, ...extras });
      render(<PlayerPage token={'x'.repeat(32)} />);
      expect(await screen.findByText('Thu, Nov 12, 2026 at 7:00 PM')).toBeTruthy();
      expect(screen.getByText('15 Alturiak 1492 DR')).toBeTruthy();
      expect(screen.getByText(/120 gp, 5 sp/)).toBeTruthy();
    });

    it('works out the next session from the repeat when none is planned', async () => {
      load.mockResolvedValue({ ...full, schedule: { number: null, date: null, time: null, repeat: 'weekly', last_date: '2099-01-01', last_time: null } });
      render(<PlayerPage token={'x'.repeat(32)} />);
      expect(await screen.findByText(/^Expected .*Jan 8, 2099/)).toBeTruthy();
    });

    it('leaves all of it out when it’s off, even for a page saved before they existed', async () => {
      load.mockResolvedValue(full);
      render(<PlayerPage token={'x'.repeat(32)} />);
      await screen.findByRole('heading', { name: 'The Sunken Crown' });
      expect(screen.queryByText('Quest log')).toBeNull();
      expect(screen.queryByText('Next session')).toBeNull();
      expect(screen.queryByText('In the world')).toBeNull();
      expect(screen.queryByText('The party’s treasure')).toBeNull();
    });

    it('says nothing about treasure when the purse is empty', async () => {
      load.mockResolvedValue({ ...full, treasury: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } });
      render(<PlayerPage token={'x'.repeat(32)} />);
      await screen.findByRole('heading', { name: 'The Sunken Crown' });
      expect(screen.queryByText('The party’s treasure')).toBeNull();
    });
  });

  it('says the page is gone when the link is wrong or turned off', async () => {
    load.mockResolvedValue(null);
    render(<PlayerPage token={'x'.repeat(32)} />);
    expect(await screen.findByText('This page isn’t available')).toBeTruthy();
    expect(load).toHaveBeenCalledWith('x'.repeat(32));
  });

  it('offers to try again when the page could not load', async () => {
    load.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(empty);
    render(<PlayerPage token={'x'.repeat(32)} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'The Sunken Crown' })).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shows what was shared, with references written as names', async () => {
    load.mockResolvedValue(full);
    render(<PlayerPage token={'x'.repeat(32)} />);
    expect(await screen.findByRole('heading', { name: 'The Sunken Crown' })).toBeTruthy();
    await waitFor(() => expect(document.title).toBe('The Sunken Crown · Player page'));

    expect(screen.getByText('Level 3 Elf Wizard · played by Sam')).toBeTruthy();
    expect(screen.getByText('Session 4 · Oct 26, 2026')).toBeTruthy();
    expect(screen.getByText('We met Brenna at the docks.')).toBeTruthy();
    expect(screen.getByText('40 gp')).toBeTruthy();
    expect(screen.getByText('Harbormaster · Deceased')).toBeTruthy();
    expect(screen.getByText('landmark · Duskward')).toBeTruthy();
    expect(screen.getByText('king').tagName).toBe('STRONG');
    expect(screen.getByRole('img', { name: 'Brenna Coldwater' }).getAttribute('src')).toBe('https://signed/u/n1.webp');
    expect(screen.getAllByRole('link').map(a => a.getAttribute('href'))).toEqual(['#story', '#handouts', '#people', '#places', '#lore']);
  });

  it('opens a handout full-screen', async () => {
    load.mockResolvedValue(full);
    render(<PlayerPage token={'x'.repeat(32)} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Show Ransom note full-screen' }));
    expect(screen.getByRole('dialog', { name: 'Ransom note' })).toBeTruthy();
  });

  it('says nothing else is shared yet when only the party shows', async () => {
    load.mockResolvedValue({ ...empty, party: full.party });
    render(<PlayerPage token={'x'.repeat(32)} />);
    expect(await screen.findByText(/Nothing else has been shared yet/)).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('keeps the page out of search engines and its link out of referrers', async () => {
    load.mockResolvedValue(empty);
    const { unmount } = render(<PlayerPage token={'x'.repeat(32)} />);
    await screen.findByRole('heading', { name: 'The Sunken Crown' });
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
    expect(document.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe('no-referrer');
    unmount();
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });
});
