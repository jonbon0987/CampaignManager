// The toast after a delete: "NPC deleted · Undo". Undo restores the record with
// everything its delete took along, then tells every loaded list to reload.

import { useCallback } from 'react';
import { useToast } from '../context/ToastContext';
import { Trash } from '../lib/db';
import { announceRestored } from '../lib/trash';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useDeletedToast() {
  const toast = useToast();
  return useCallback((message: string, table: string, id: string) => {
    toast(message, 'success', {
      label: 'Undo',
      onClick: () => {
        Trash.restoreRecord(table, id)
          .then(() => { announceRestored(); toast('Restored'); })
          .catch(e => toast(errorMessage(e), 'error'));
      },
    });
  }, [toast]);
}
