import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ToastAction } from '../context/ToastContext';

const h = vi.hoisted(() => ({ toast: vi.fn(), restoreRecord: vi.fn() }));
vi.mock('../context/ToastContext', () => ({ useToast: () => h.toast }));
vi.mock('../lib/db', () => ({ Trash: { restoreRecord: h.restoreRecord } }));

import { useDeletedToast } from './useDeletedToast';
import { RESTORED_EVENT } from '../lib/trash';

function deleteAndUndo() {
  const { result } = renderHook(() => useDeletedToast());
  result.current('NPC deleted', 'npcs', 'n1');
  const action = h.toast.mock.calls[0][2] as ToastAction;
  return action;
}

describe('useDeletedToast', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('says what was deleted and offers Undo', () => {
    const action = deleteAndUndo();
    expect(h.toast).toHaveBeenCalledWith('NPC deleted', 'success', expect.objectContaining({ label: 'Undo' }));
    expect(h.restoreRecord).not.toHaveBeenCalled();
    expect(action.label).toBe('Undo');
  });

  it('Undo restores the record and tells the lists to reload', async () => {
    h.restoreRecord.mockResolvedValue(undefined);
    const heard = vi.fn();
    window.addEventListener(RESTORED_EVENT, heard);
    deleteAndUndo().onClick();
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Restored'));
    window.removeEventListener(RESTORED_EVENT, heard);
    expect(h.restoreRecord).toHaveBeenCalledWith('npcs', 'n1');
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('says why when it can’t be restored', async () => {
    h.restoreRecord.mockRejectedValue(new Error('Can’t restore it: what it belonged to has been deleted too.'));
    deleteAndUndo().onClick();
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Can’t restore it: what it belonged to has been deleted too.', 'error'));
  });
});
