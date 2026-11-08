import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeCampaignContext } from '../../test/contextMocks';
import { PlayerSharesContext, type PlayerSharesValue } from '../../context/playerShares';
import type { PlayerPageLink, ShareKind } from '../../lib/database.types';

const h = vi.hoisted(() => ({ campaign: { value: null as unknown }, toast: vi.fn(), confirm: vi.fn() }));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => h.toast }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => h.confirm }));

import { PlayerPageCard } from './PlayerPageCard';

const TOKEN = 'dC75WAhZdIu6mkwYOmwSHacvobRYnFw_';
const page = (enabled = true): PlayerPageLink => ({ campaign_id: 'c1', user_id: 'u', token: TOKEN, enabled, created_at: '', updated_at: '' });

function shares(p: PlayerPageLink | null, ids: Partial<Record<ShareKind, string[]>> = {}): PlayerSharesValue {
  return {
    campaignId: 'c1', page: p, loaded: true,
    isShared: () => false, setShared: vi.fn(),
    sharedIds: kind => ids[kind] ?? [],
    issueLink: vi.fn().mockResolvedValue(undefined),
    setEnabled: vi.fn().mockResolvedValue(undefined),
    setPart: vi.fn().mockResolvedValue(undefined),
  };
}

const show = (value: PlayerSharesValue) =>
  render(<PlayerSharesContext.Provider value={value}><PlayerPageCard /></PlayerSharesContext.Provider>);

describe('PlayerPageCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.campaign.value = makeCampaignContext({
      sessions: [{ id: 's1' }], npcs: [{ id: 'n1' }, { id: 'n2' }], locations: [{ id: 'l1' }],
      lore: [{ id: 'e1', dm_only: false }, { id: 'e2', dm_only: true }],
    });
  });

  it('switches the next session, in-world date and treasure on and off, all off to start', () => {
    const value = shares({ ...page(), show_treasury: true });
    show(value);
    expect(screen.getByRole('button', { name: 'Next session' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Treasure' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'In-world date' }));
    expect(value.setPart).toHaveBeenCalledWith('show_world_date', true);
    fireEvent.click(screen.getByRole('button', { name: 'Treasure' }));
    expect(value.setPart).toHaveBeenCalledWith('show_treasury', false);
    fireEvent.click(screen.getByRole('button', { name: 'House rules' }));
    expect(value.setPart).toHaveBeenCalledWith('show_house_rules', true);
  });

  it('counts the leads it shows', () => {
    h.campaign.value = makeCampaignContext({ hooks: [{ id: 't1' }], sessions: [], npcs: [], locations: [], lore: [] });
    show(shares(page(), { thread: ['t1', 'gone'] }));
    expect(screen.getByText(/1 lead\./)).toBeTruthy();
  });

  it('shows nothing outside a campaign', () => {
    const { container } = render(<PlayerPageCard />);
    expect(container.innerHTML).toBe('');
  });

  it('offers to make the page when there is none', () => {
    const value = shares(null);
    show(value);
    fireEvent.click(screen.getByRole('button', { name: 'Make a player page' }));
    expect(value.issueLink).toHaveBeenCalled();
  });

  it('gives the link to copy, and counts only shared items still in the campaign', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    show(shares(page(), { session: ['s1', 'gone'], npc: ['n1', 'n2'], lore: ['e1', 'e2'], handout: ['h1'] }));
    const link = screen.getByRole('textbox', { name: 'Player page link' }) as HTMLInputElement;
    expect(link.value).toBe(`${window.location.origin}/p/${TOKEN}`);
    expect(screen.getByText('Showing the party, and 1 recap · 1 handout · 2 people · 1 lore entry.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Link copied', 'success'));
    expect(writeText).toHaveBeenCalledWith(link.value);
  });

  it('turns the page off, and back on', () => {
    const on = shares(page(true));
    const { unmount } = show(on);
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(on.setEnabled).toHaveBeenCalledWith(false);
    unmount();

    const off = shares(page(false));
    show(off);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText(/Turned off/)).toBeTruthy();
    expect(screen.getByText(/When it’s on, it shows the party/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(off.setEnabled).toHaveBeenCalledWith(true);
  });

  it('replaces the link only once the DM confirms', async () => {
    const value = shares(page());
    show(value);
    h.confirm.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'New link' }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1));
    expect(value.issueLink).not.toHaveBeenCalled();

    h.confirm.mockResolvedValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'New link' }));
    await waitFor(() => expect(value.issueLink).toHaveBeenCalled());
  });
});
