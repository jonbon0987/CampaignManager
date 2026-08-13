import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLocalStorage from './useLocalStorage';

// The test environment's built-in localStorage is a partial stub (missing
// clear/removeItem), so install a clean in-memory Storage before each test.
// This keeps the hook's `window.localStorage` access working and hermetic.
function installMemoryStorage() {
  let store: Record<string, string> = {};
  const storage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };
  Object.defineProperty(window, 'localStorage', { value: storage, writable: true, configurable: true });
}

beforeEach(installMemoryStorage);

describe('useLocalStorage', () => {
  it('returns the initial value when nothing is stored', () => {
    const { result } = renderHook(() => useLocalStorage('k', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });

  it('reads and JSON-parses an existing stored value', () => {
    window.localStorage.setItem('k', JSON.stringify({ n: 42 }));
    const { result } = renderHook(() => useLocalStorage('k', { n: 0 }));
    expect(result.current[0]).toEqual({ n: 42 });
  });

  it('persists the new value to localStorage and updates state', () => {
    const { result } = renderHook(() => useLocalStorage<number>('count', 1));
    act(() => result.current[1](5));
    expect(result.current[0]).toBe(5);
    expect(window.localStorage.getItem('count')).toBe('5');
  });

  it('supports a functional updater based on the previous value', () => {
    const { result } = renderHook(() => useLocalStorage<number>('count', 10));
    act(() => result.current[1](prev => prev + 3));
    expect(result.current[0]).toBe(13);
    expect(window.localStorage.getItem('count')).toBe('13');
  });

  it('falls back to the initial value when stored JSON is malformed', () => {
    window.localStorage.setItem('k', '{not valid json');
    const { result } = renderHook(() => useLocalStorage('k', 'safe'));
    expect(result.current[0]).toBe('safe');
  });

  it('serializes objects and arrays correctly', () => {
    const { result } = renderHook(() => useLocalStorage<string[]>('list', []));
    act(() => result.current[1](['a', 'b']));
    expect(JSON.parse(window.localStorage.getItem('list')!)).toEqual(['a', 'b']);
  });
});
