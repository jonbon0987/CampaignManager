import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRouteSync } from './useRouteSync';
import type { Route } from '../lib/route';

const W = '9222a9fe-8819-402f-92d0-0871230e8914';
const C = '264093e6-b240-49ee-9147-292bba7b5768';
const E = '5ca1c4b6-5195-47ed-9ce5-ea4e5f8cf913';
const route: Route = { scope: 'campaign', worldId: W, campaignId: C, tab: 'combat', recordId: E };

let push: ReturnType<typeof vi.spyOn>;
let replace: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  push = vi.spyOn(window.history, 'pushState');
  replace = vi.spyOn(window.history, 'replaceState');
});
afterEach(() => vi.restoreAllMocks());

describe('useRouteSync with readable ids', () => {
  it('quietly rewrites an older full-id link into the readable form', () => {
    window.history.replaceState(null, '', `/w/${W}/c/${C}/combat/${E}`);
    replace.mockClear();
    renderHook(() => useRouteSync(route, () => {}, { world: 'Test World', campaign: 'Test', record: 'Goblin Ambush' }));
    expect(window.location.pathname).toBe('/w/test-world-9222a9fe/c/test-264093e6/combat/goblin-ambush-5ca1c4b6');
    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('opening a readable link adds no history entry', () => {
    window.history.replaceState(null, '', '/w/test-world-9222a9fe/c/test-264093e6/combat/goblin-ambush-5ca1c4b6');
    replace.mockClear();
    renderHook(() => useRouteSync(route, () => {}, { world: 'Test World', campaign: 'Test', record: 'Goblin Ambush' }));
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('a rename replaces the address rather than adding to Back', () => {
    const { rerender } = renderHook(({ name }) => useRouteSync(route, () => {}, { world: 'Test World', campaign: 'Test', record: name }), {
      initialProps: { name: 'Goblin Ambush' },
    });
    push.mockClear(); replace.mockClear();
    rerender({ name: 'Goblin Ambush at the Ford' });
    expect(window.location.pathname).toBe('/w/test-world-9222a9fe/c/test-264093e6/combat/goblin-ambush-at-the-ford-5ca1c4b6');
    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('moving to another record still adds a history entry', () => {
    const other = '0a885d60-1111-4222-8333-444455556666';
    const { rerender } = renderHook(({ r }) => useRouteSync(r, () => {}), { initialProps: { r: route } });
    push.mockClear();
    rerender({ r: { ...route, recordId: other } });
    expect(push).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/w/9222a9fe/c/264093e6/combat/0a885d60');
  });
});
