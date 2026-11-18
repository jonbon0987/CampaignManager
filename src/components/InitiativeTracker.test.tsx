import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { Encounter } from '../lib/database.types';

const h = vi.hoisted(() => ({ confirm: vi.fn(), openStatBlock: vi.fn(), closeStatBlock: vi.fn() }));
vi.mock('../context/StatBlockPanelContext', () => ({
  useStatBlockPanel: () => ({ openStatBlock: h.openStatBlock, closeStatBlock: h.closeStatBlock, activeStatBlockId: null }),
}));
vi.mock('../context/ConfirmContext', () => ({ useConfirm: () => h.confirm }));
vi.mock('./StatBlockPanel', () => ({ default: () => null }));

import { InitiativeTracker } from './InitiativeTracker';

const encounter = {
  id: 'e1', name: 'Ambush at the Ford',
  combatants: JSON.stringify([{ id: 'x', source: 'custom', statblock_id: null, name: 'Goblin', creature_type: null, challenge_rating: null, count: 1, notes: null }]),
} as unknown as Encounter;

const setup = () => {
  const onClose = vi.fn();
  render(<InitiativeTracker encounter={encounter} statblocks={[]} party={[{ name: 'Ayla', maxHp: 20, ac: 15 }]} onClose={onClose} />);
  return { onClose };
};

beforeEach(() => vi.clearAllMocks());

describe('InitiativeTracker', () => {
  it('lists the encounter and the party, with the shared HP control on each row', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Ambush at the Ford' })).toBeTruthy();
    expect(screen.getByText('Goblin')).toBeTruthy();
    expect(screen.getByText('Ayla')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Damage' })).toHaveLength(2);
  });

  it('applies damage through HpControl, and Undo takes it back', () => {
    setup();
    const amount = screen.getByLabelText('Amount for Ayla');
    fireEvent.change(amount, { target: { value: '15' } });
    fireEvent.keyDown(amount, { key: 'Enter' });
    expect(screen.getByRole('button', { name: "Set Ayla's current HP" }).textContent).toBe('5');
    expect(screen.getByText('Bloodied')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    expect(screen.getByRole('button', { name: "Set Ayla's current HP" }).textContent).toBe('20');
  });

  it('shows death saves for a downed PC', () => {
    setup();
    const amount = screen.getByLabelText('Amount for Ayla');
    fireEvent.change(amount, { target: { value: '20' } });
    fireEvent.keyDown(amount, { key: 'Enter' });
    expect(screen.getByText('Death saves')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Saves 1' }));
    expect(screen.getByRole('button', { name: 'Saves 1' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('opens the condition grid from the row, and the chip clears what it adds', () => {
    setup();
    const [first] = screen.getAllByRole('button', { name: 'Conditions' });
    fireEvent.click(first);
    const grid = screen.getByRole('group', { name: /Conditions for/ });
    fireEvent.click(within(grid).getByRole('button', { name: 'prone' }));
    const chip = screen.getByRole('button', { name: 'Clear prone' });
    fireEvent.click(chip);
    expect(screen.queryByRole('button', { name: 'Clear prone' })).toBeNull();
  });

  it('closes without asking before the fight starts', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: '✕ End' }));
    expect(h.confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
