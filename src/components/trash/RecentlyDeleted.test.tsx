import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { makeWorldContext } from '../../test/contextMocks';
import type { DeletedItem } from '../../lib/database.types';

const h = vi.hoisted(() => ({
  world: { value: null as unknown },
  toast: vi.fn(),
  confirm: vi.fn(),
  list: vi.fn(),
  restore: vi.fn(),
  purge: vi.fn(),
}));
vi.mock('../../context/WorldContext', () => ({ useWorld: () => h.world.value }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => h.toast }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => h.confirm }));
vi.mock('../../lib/db', () => ({ Trash: { list: h.list, restore: h.restore, purge: h.purge } }));

import { RecentlyDeleted } from './RecentlyDeleted';
import { RESTORED_EVENT } from '../../lib/trash';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const item = (batch: number, table_name: string, data: DeletedItem['data'], deleted_at: string, extra = 0): DeletedItem =>
  ({ batch, table_name, record_id: `r${batch}`, data, extra, deleted_at });

const npc = item(1, 'npcs', { name: 'Brenna', campaign_id: 'c1' }, minutesAgo(5));
const module = item(2, 'modules', { title: 'The Sunken Crown', campaign_id: 'c1' }, minutesAgo(1), 12);
const internal = item(3, 'transcript_segments', { text: 'hello' }, minutesAgo(0));

describe('RecentlyDeleted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.world.value = makeWorldContext({ worlds: [{ id: 'w1', name: 'Test World' }], campaigns: [{ id: 'c1', name: 'Test' }] });
    h.purge.mockResolvedValue(undefined);
    h.list.mockResolvedValue([npc, internal, module]);
    h.restore.mockResolvedValue(undefined);
    h.confirm.mockResolvedValue(true);
  });

  it('forgets what’s past 30 days, then lists the rest newest first', async () => {
    render(<RecentlyDeleted onClose={vi.fn()} />);
    const rows = await screen.findAllByRole('listitem');
    expect(h.purge).toHaveBeenCalledWith();
    expect(rows.map(r => r.querySelector('.rd-name')?.textContent)).toEqual(['ModuleThe Sunken Crown', 'NPCBrenna']);
    expect(within(rows[0]).getByText('Test · deleted 1 minute ago · 12 more records with it')).toBeTruthy();
    expect(within(rows[1]).getByText('Test · deleted 5 minutes ago')).toBeTruthy();
  });

  it('restores a delete and tells the lists to reload', async () => {
    const heard = vi.fn();
    window.addEventListener(RESTORED_EVENT, heard);
    render(<RecentlyDeleted onClose={vi.fn()} />);
    const row = (await screen.findAllByRole('listitem'))[1];
    fireEvent.click(within(row).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Restored “Brenna”'));
    window.removeEventListener(RESTORED_EVENT, heard);
    expect(h.restore).toHaveBeenCalledWith(1);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Brenna')).toBeNull();
  });

  it('keeps the row and says why when it can’t be restored', async () => {
    h.restore.mockRejectedValue(new Error('Can’t restore it: a newer session has its number.'));
    render(<RecentlyDeleted onClose={vi.fn()} />);
    const row = (await screen.findAllByRole('listitem'))[0];
    fireEvent.click(within(row).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Can’t restore it: a newer session has its number.', 'error'));
    expect(screen.getByText('The Sunken Crown')).toBeTruthy();
  });

  it('deletes for good only once the DM confirms', async () => {
    render(<RecentlyDeleted onClose={vi.fn()} />);
    const row = (await screen.findAllByRole('listitem'))[0];
    h.confirm.mockResolvedValueOnce(false);
    fireEvent.click(within(row).getByRole('button', { name: 'Delete for good' }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1));
    expect(h.purge).toHaveBeenCalledTimes(1); // only the 30-day sweep

    fireEvent.click(within(row).getByRole('button', { name: 'Delete for good' }));
    await waitFor(() => expect(h.purge).toHaveBeenCalledWith(2));
    await waitFor(() => expect(screen.queryByText('The Sunken Crown')).toBeNull());
  });

  it('says when nothing was deleted', async () => {
    h.list.mockResolvedValue([internal]);
    render(<RecentlyDeleted onClose={vi.fn()} />);
    expect(await screen.findByText('Nothing deleted in the last 30 days.')).toBeTruthy();
  });

  it('closes on Esc and from its button', async () => {
    const onClose = vi.fn();
    render(<RecentlyDeleted onClose={onClose} />);
    await screen.findAllByRole('listitem');
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
