import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeCampaignContext } from '../../test/contextMocks';
import { ItemsContext, type ItemsValue } from '../../context/items';
import type { TreasuryEntry } from '../../lib/database.types';

const h = vi.hoisted(() => ({ campaign: { value: null as unknown }, confirm: vi.fn(), open: vi.fn() }));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => h.confirm }));
vi.mock('../../context/NavigationContext', () => ({ useOpenRecord: () => h.open }));

import { SessionCoin, TreasuryPanel } from './Treasury';

const line = (id: string, over: Partial<TreasuryEntry> = {}): TreasuryEntry => ({
  id, user_id: 'u', campaign_id: 'c', session_id: null, pc_id: null, cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, note: null, created_at: '', updated_at: '', ...over,
});

function show(ui: React.ReactNode, treasury: TreasuryEntry[] = []) {
  const value = {
    treasury,
    addTreasury: vi.fn().mockResolvedValue(undefined),
    removeTreasury: vi.fn().mockResolvedValue(undefined),
  } as unknown as ItemsValue;
  render(<ItemsContext.Provider value={value}>{ui}</ItemsContext.Provider>);
  return value;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.confirm.mockResolvedValue(true);
  h.campaign.value = makeCampaignContext({
    pcs: [{ id: 'p1', character_name: 'Kael', is_active: true }, { id: 'p2', character_name: 'Mira', is_active: true }, { id: 'p3', character_name: 'Old', is_active: false }],
    sessions: [{ id: 's6', session_number: 6, status: 'done', title: null }],
  });
});

describe('TreasuryPanel', () => {
  it('adds up the ledger, coin by coin', () => {
    show(<TreasuryPanel />, [line('a', { gp: 120, sp: 5 }), line('b', { gp: -20 })]);
    const coins = screen.getByRole('list', { name: 'What’s in the treasury' });
    expect(coins.textContent).toContain('100gp');
    expect(coins.textContent).toContain('5sp');
    expect(screen.getByText('Worth 100.5 gp in all.')).toBeTruthy();
  });

  it('adds a gain, with its note and the last session', async () => {
    const value = show(<TreasuryPanel />);
    fireEvent.change(screen.getByLabelText('How much'), { target: { value: '120 gp, 5 sp' } });
    fireEvent.change(screen.getByLabelText('What for'), { target: { value: 'the harbormaster’s bribe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(value.addTreasury).toHaveBeenCalledWith([expect.objectContaining({ gp: 120, sp: 5, note: 'the harbormaster’s bribe', session_id: 's6' })]));
    await waitFor(() => expect((screen.getByLabelText('How much') as HTMLInputElement).value).toBe(''));
  });

  it('takes coin away when it was spent', async () => {
    const value = show(<TreasuryPanel />);
    fireEvent.click(screen.getByRole('radio', { name: 'Spent' }));
    fireEvent.change(screen.getByLabelText('How much'), { target: { value: '30' } });
    fireEvent.keyDown(screen.getByLabelText('How much'), { key: 'Enter' });
    await waitFor(() => expect(value.addTreasury).toHaveBeenCalledWith([expect.objectContaining({ gp: -30 })]));
  });

  it('says so when it can’t read the amount, and keeps what was typed', () => {
    const value = show(<TreasuryPanel />);
    fireEvent.change(screen.getByLabelText('How much'), { target: { value: 'a big bag' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert').textContent).toMatch(/120 gp, 5 sp/);
    expect(value.addTreasury).not.toHaveBeenCalled();
    expect((screen.getByLabelText('How much') as HTMLInputElement).value).toBe('a big bag');
  });

  it('splits evenly among active PCs: one line each, leaving what doesn’t divide', async () => {
    const value = show(<TreasuryPanel />, [line('a', { gp: 125 })]);
    expect(screen.getByText('62 gp each to the 2 PCs, with 1 gp left over.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Split evenly' }));
    await waitFor(() => expect(value.addTreasury).toHaveBeenCalledWith([
      expect.objectContaining({ gp: -62, pc_id: 'p1', note: 'Split evenly' }),
      expect.objectContaining({ gp: -62, pc_id: 'p2', note: 'Split evenly' }),
    ]));
  });

  it('asks about the split without alarm', async () => {
    show(<TreasuryPanel />, [line('a', { gp: 125 })]);
    fireEvent.click(screen.getByRole('button', { name: 'Split evenly' }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalledWith(expect.objectContaining({
      danger: false,
      message: 'Each of the 2 PCs gets 62 gp. 1 gp stays in the treasury. This writes one line per PC in the ledger.',
    })));
  });

  it('names a lone PC rather than counting one of them', async () => {
    h.campaign.value = makeCampaignContext({ pcs: [{ id: 'p1', character_name: 'Kael', is_active: true }], sessions: [] });
    show(<TreasuryPanel />, [line('a', { gp: 125 })]);
    expect(screen.getByText('125 gp each to Kael.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Split evenly' }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Kael gets 125 gp. This writes a line in the ledger.',
    })));
  });

  it('won’t split when there’s nothing to go round, or if the DM thinks better of it', async () => {
    h.confirm.mockResolvedValue(false);
    const value = show(<TreasuryPanel />, [line('a', { gp: 1 })]);
    expect((screen.getByRole('button', { name: 'Split evenly' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Not enough to go round yet.')).toBeTruthy();
    expect(value.addTreasury).not.toHaveBeenCalled();
  });

  it('lists lines with who, what and when, and removes one', async () => {
    const value = show(<TreasuryPanel />, [line('a', { gp: -62, pc_id: 'p1', note: 'Split evenly', session_id: 's6' })]);
    expect(screen.getByText('−62 gp')).toBeTruthy();
    expect(screen.getByText(/Split evenly · to Kael/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Session 6' }));
    expect(h.open).toHaveBeenCalledWith('sessions', 's6');
    fireEvent.click(screen.getByRole('button', { name: 'Remove −62 gp' }));
    expect(value.removeTreasury).toHaveBeenCalled();
  });

  it('says what goes here when it’s empty', () => {
    show(<TreasuryPanel />);
    expect(screen.getByText(/No coin yet/)).toBeTruthy();
  });
});

describe('SessionCoin', () => {
  it('shows and adds only this session’s coin', async () => {
    const value = show(<SessionCoin sessionId="s6" />, [line('a', { gp: 40, session_id: 's6' }), line('b', { gp: 99, session_id: 's1' })]);
    expect(screen.getByText('+40 gp')).toBeTruthy();
    expect(screen.queryByText('+99 gp')).toBeNull();
    expect(screen.queryByLabelText('Session')).toBeNull();
    fireEvent.change(screen.getByLabelText('How much'), { target: { value: '5 sp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(value.addTreasury).toHaveBeenCalledWith([expect.objectContaining({ sp: 5, session_id: 's6' })]));
  });
});
