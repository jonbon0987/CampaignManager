import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlayerSharesContext, type PlayerSharesValue } from '../../context/playerShares';
import { ShareToggle } from './ShareToggle';

function shares(on: string[] = []): PlayerSharesValue {
  return {
    campaignId: 'c1', page: null, loaded: true,
    isShared: (kind, id) => on.includes(`${kind}:${id}`),
    setShared: vi.fn().mockResolvedValue(undefined),
    sharedIds: () => [], issueLink: vi.fn(), setEnabled: vi.fn(),
  };
}

const inCampaign = (value: PlayerSharesValue, ui: React.ReactNode) =>
  render(<PlayerSharesContext.Provider value={value}>{ui}</PlayerSharesContext.Provider>);

describe('ShareToggle', () => {
  it('shows nothing outside a campaign', () => {
    const { container } = render(<ShareToggle kind="npc" id="n1" />);
    expect(container.innerHTML).toBe('');
  });

  it('starts hidden, and switching it on shares the item', () => {
    const value = shares();
    inCampaign(value, <ShareToggle kind="npc" id="n1" />);
    const button = screen.getByRole('button', { name: 'Hidden from players' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(value.setShared).toHaveBeenCalledWith('npc', 'n1', true);
  });

  it('when shared, says so and switches off', () => {
    const value = shares(['location:l1']);
    inCampaign(value, <ShareToggle kind="location" id="l1" />);
    const button = screen.getByRole('button', { name: 'Players can see' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(value.setShared).toHaveBeenCalledWith('location', 'l1', false);
  });

  it('names what is shared when it is part of the record', () => {
    const { rerender } = inCampaign(shares(), <ShareToggle kind="session" id="s1" what="the recap" />);
    expect(screen.getByRole('button', { name: 'Recap hidden from players' })).toBeTruthy();
    rerender(
      <PlayerSharesContext.Provider value={shares(['session:s1'])}>
        <ShareToggle kind="session" id="s1" what="the recap" />
      </PlayerSharesContext.Provider>,
    );
    expect(screen.getByRole('button', { name: 'Players can see the recap' })).toBeTruthy();
  });

  it('can be just an eye, still labelled for screen readers', () => {
    inCampaign(shares(), <ShareToggle kind="handout" id="h1" what="ransom note" compact />);
    const button = screen.getByRole('button', { name: 'Ransom note hidden from players' });
    expect(button.textContent).toBe('');
  });

  it('stays off and says why when the item cannot be shared', () => {
    const value = shares(['lore:e1']);
    inCampaign(value, <ShareToggle kind="lore" id="e1" unavailable="Marked DM only, so it stays off the player page." />);
    const button = screen.getByRole('button', { name: 'Hidden from players' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toMatch(/DM only/);
  });
});
