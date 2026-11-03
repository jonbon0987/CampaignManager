import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makePC, makeSession } from '../../test/fixtures';

const h = vi.hoisted(() => ({
  campaign: { value: null as Record<string, unknown> | null },
  closeWrapUp: vi.fn(),
  setDate: vi.fn(),
}));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/PlayContext', () => ({ usePlay: () => ({ wrapFor: 's6', closeWrapUp: h.closeWrapUp }) }));
vi.mock('../../hooks/useCampaignDate', () => ({
  useCampaignDate: () => ({ date: { year: 1492, day: 10 }, setDate: h.setDate, months: [{ name: 'Hammer', days: 30 }], suffix: 'DR' }),
}));
vi.mock('../items/ItemPlaces', () => ({ SessionLoot: () => <div>LOOT</div> }));
vi.mock('../session/LeftOpenToInbox', () => ({ LeftOpenToInbox: () => null }));

import { WrapUpDialog } from './WrapUpDialog';

const updateSession = vi.fn();
const updatePC = vi.fn();
const updateCampaign = vi.fn();

function setup(levelling: 'xp' | 'milestone' | null) {
  h.campaign.value = {
    sessions: [makeSession({ id: 's6', session_number: 6, status: 'done', play: { fights: [{ summary: 'Wolves.', xp: 900 }], scene_id: 'sc1' } })],
    pcs: [
      makePC({ id: 'a', character_name: 'Ash', is_active: true, level: 3, xp: 2_400 } as never),
      makePC({ id: 'b', character_name: 'Bree', is_active: true, level: 3, xp: 1_000 } as never),
    ],
    scenes: [{ id: 'sc1', title: 'The Drowned Portico' }],
    monsterStatblocks: [],
    selectedCampaign: { id: 'c1', levelling },
    updateSession, updatePC, updateCampaign,
  };
  return render(<WrapUpDialog />);
}

beforeEach(() => {
  [updateSession, updatePC, updateCampaign, h.closeWrapUp, h.setDate].forEach(f => f.mockReset());
  updateSession.mockResolvedValue({});
  updatePC.mockResolvedValue({});
  updateCampaign.mockResolvedValue(undefined);
});

describe('WrapUpDialog', () => {
  it('starts from the scene in play and splits the night’s XP across the party', () => {
    setup('xp');
    expect((screen.getByLabelText('1 · Where you stopped') as HTMLTextAreaElement).value).toBe('In The Drowned Portico.');
    expect((screen.getByLabelText('XP to each of the 2 PCs') as HTMLInputElement).value).toBe('450');
    expect(screen.getByText('Ash reaches level 4')).toBeTruthy();
  });

  it('saves where they stopped, the XP, a level reached, the date and how the table levels', async () => {
    setup(null);
    fireEvent.click(screen.getByRole('radio', { name: 'By XP' }));
    fireEvent.change(screen.getByLabelText('Days that passed'), { target: { value: '3' } });
    fireEvent.click(screen.getByText('Save the wrap-up'));
    await waitFor(() => expect(h.closeWrapUp).toHaveBeenCalled());

    const [, patch] = updateSession.mock.calls[0];
    expect(patch.play).toMatchObject({ stopped: 'In The Drowned Portico.', wrapped_at: expect.any(String) });
    expect(patch.world_end).toEqual({ year: 1492, day: 13 });
    expect(h.setDate).toHaveBeenCalledWith({ year: 1492, day: 13 });
    expect(updateCampaign).toHaveBeenCalledWith('c1', { levelling: 'xp' });
    expect(updatePC).toHaveBeenCalledWith('a', { xp: 2_850, level: 4 });
    expect(updatePC).toHaveBeenCalledWith('b', { xp: 1_450 });
  });

  it('levels everyone up on a milestone, and only when asked', async () => {
    setup('milestone');
    fireEvent.click(screen.getByText('Save the wrap-up'));
    await waitFor(() => expect(h.closeWrapUp).toHaveBeenCalled());
    expect(updatePC).not.toHaveBeenCalled();

    updatePC.mockClear();
    h.closeWrapUp.mockClear();
    fireEvent.click(screen.getByLabelText('Everyone gains a level'));
    fireEvent.click(screen.getByText('Save the wrap-up'));
    await waitFor(() => expect(h.closeWrapUp).toHaveBeenCalled());
    expect(updatePC).toHaveBeenCalledWith('a', { level: 4 });
    expect(updatePC).toHaveBeenCalledWith('b', { level: 4 });
  });

  it('closes without saving on Skip for now', () => {
    setup('xp');
    fireEvent.click(screen.getByText('Skip for now'));
    expect(h.closeWrapUp).toHaveBeenCalled();
    expect(updateSession).not.toHaveBeenCalled();
  });
});
