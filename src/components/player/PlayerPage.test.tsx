import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PlayerPageData } from '../../lib/database.types';

const load = vi.hoisted(() => vi.fn());
vi.mock('../../lib/db', () => ({ PlayerPages: { load } }));
vi.mock('../../hooks/useImageUrl', () => ({ useImageUrl: (p: string | null) => (p ? `https://signed/${p}` : null) }));

import PlayerPage from './PlayerPage';

const empty: PlayerPageData = {
  campaign: { name: 'Test', title: 'The Sunken Crown' },
  party: [], recaps: [], handouts: [], people: [], places: [], lore: [],
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
