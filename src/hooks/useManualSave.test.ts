import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useManualSave } from './useManualSave';

type Props = { data: unknown; onSave: (d: unknown) => Promise<void>; resetKey?: unknown };
const setup = (initialProps: Props) =>
  renderHook((p: Props) => useManualSave(p), { initialProps });

describe('useManualSave', () => {
  it('starts clean and idle; nothing is written', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = setup({ data: { v: 1 }, onSave });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.status).toBe('idle');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('becomes dirty / unsaved when data diverges from the baseline', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = setup({ data: { v: 1 }, onSave });
    rerender({ data: { v: 2 }, onSave });
    expect(result.current.isDirty).toBe(true);
    expect(result.current.status).toBe('unsaved');
  });

  it('save() persists, clears dirty, and reports "saved"', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = setup({ data: { v: 1 }, onSave });
    rerender({ data: { v: 2 }, onSave });

    await act(async () => { await result.current.save(); });
    expect(onSave).toHaveBeenCalledWith({ v: 2 });
    expect(result.current.status).toBe('saved');
    expect(result.current.isDirty).toBe(false);
  });

  it('goes dirty again after a further edit post-save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = setup({ data: { v: 1 }, onSave });
    rerender({ data: { v: 2 }, onSave });
    await act(async () => { await result.current.save(); });

    rerender({ data: { v: 3 }, onSave });
    expect(result.current.isDirty).toBe(true);
    expect(result.current.status).toBe('unsaved');
  });

  it('re-baselines to the current data when resetKey changes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = setup({ data: { v: 1 }, onSave, resetKey: 'a' });
    rerender({ data: { v: 2 }, onSave, resetKey: 'a' });
    await act(async () => { await result.current.save(); }); // baseline → v2 (phase 'saved')

    rerender({ data: { v: 3 }, onSave, resetKey: 'a' }); // edit → dirty
    expect(result.current.isDirty).toBe(true);

    // Switching records (resetKey changes): the current data becomes the clean
    // baseline, so the pending edit no longer counts as dirty.
    rerender({ data: { v: 3 }, onSave, resetKey: 'b' });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.status).toBe('idle');
  });

  it('surfaces a save failure as status "error" with the message', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('nope'));
    const { result, rerender } = setup({ data: { v: 1 }, onSave });
    rerender({ data: { v: 2 }, onSave });
    await act(async () => { await result.current.save(); });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('nope');
  });

  it('a failed save leaves the data dirty (baseline not advanced)', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('nope'));
    const { result, rerender } = setup({ data: { v: 1 }, onSave });
    rerender({ data: { v: 2 }, onSave });
    await act(async () => { await result.current.save(); });
    expect(result.current.isDirty).toBe(true);
  });
});
