import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { makeCampaignContext, makeWorldContext } from '../../test/contextMocks';
import { makeModule, makeScene, makeSubmodule } from '../../test/fixtures';

const h = vi.hoisted(() => ({ campaign: { value: null as unknown }, world: { value: null as unknown } }));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/WorldContext', () => ({ useWorld: () => h.world.value }));
vi.mock('../../context/items', () => ({ useItems: () => null }));
vi.mock('../../hooks/useSessionLifecycle', () => ({ usePlanNextSession: () => vi.fn() }));

import { useCampaignPaletteItems, useWorldPaletteItems } from './paletteItems';

describe('the campaign palette', () => {
  it('finds parts, scenes and random tables, with where they live as detail', () => {
    h.campaign.value = makeCampaignContext({
      modules: [makeModule('m1', 'active', { title: 'The Sunken Crown' })],
      submodules: [makeSubmodule('p1', { module_id: 'm1', title: 'The Drowned Portico' })],
      scenes: [makeScene('s1', { submodule_id: 'p1', title: 'The Toll Gate' })],
      randomEncounterTables: [{ id: 't1', name: 'Sewer encounters', kind: 'encounter', subtitle: null, description: null }],
      encounters: [],
    });
    const openRecord = vi.fn();
    const handlers = { openRecord, openView: vi.fn(), runMode: false, toggleRun: vi.fn(), openSessionTools: vi.fn(), openNote: vi.fn(), openShortcuts: vi.fn(), openExport: vi.fn(), backToWorld: vi.fn() };
    const { result } = renderHook(() => useCampaignPaletteItems(handlers));
    const find = (label: string) => result.current.find(i => i.label === label)!;

    expect(find('The Drowned Portico')).toMatchObject({ group: 'Parts', detail: 'The Sunken Crown' });
    expect(find('The Toll Gate')).toMatchObject({ group: 'Scenes', detail: 'The Drowned Portico · The Sunken Crown' });
    find('The Toll Gate').run();
    expect(openRecord).toHaveBeenLastCalledWith('modules', 'm1', 'submodule:p1');
    find('Sewer encounters').run();
    expect(openRecord).toHaveBeenLastCalledWith('combat', 't1', 'random');
  });
});

describe('the world palette', () => {
  it('finds the world’s stat sheets, encounters and tables, opening each on its view', () => {
    h.world.value = makeWorldContext({
      bestiary: [{ id: 'b1', name: 'Kraken', cr: '23', type: 'monstrosity' }],
      encounters: [{ id: 'e1', name: 'Ambush at the Ford', difficulty: 'hard' }],
      worldRandomEncounterTables: [{ id: 't1', name: 'Road rumours', kind: 'custom' }],
    });
    const openCombat = vi.fn();
    const { result } = renderHook(() => useWorldPaletteItems({ openShortcuts: vi.fn(), openNewCampaign: vi.fn(), openCombat }));
    const find = (label: string) => result.current.find(i => i.label === label)!;
    expect(find('Kraken')).toMatchObject({ group: 'Stat sheets', detail: 'monstrosity · CR 23' });
    find('Kraken').run();
    expect(openCombat).toHaveBeenLastCalledWith('bestiary', 'b1');
    find('Ambush at the Ford').run();
    expect(openCombat).toHaveBeenLastCalledWith('encounter', 'e1');
    find('Road rumours').run();
    expect(openCombat).toHaveBeenLastCalledWith('random', 't1');
  });
});
