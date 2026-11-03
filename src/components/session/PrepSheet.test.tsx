import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { makeCampaignContext, makeWorldContext, makeToast } from '../../test/contextMocks';
import { makeHook, makeNPC, makePC, makeSession } from '../../test/fixtures';
import { PRESETS } from '../../lib/calendar';

const h = vi.hoisted(() => ({ campaign: { value: null as unknown }, world: { value: null as unknown } }));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/WorldContext', () => ({ useWorld: () => h.world.value }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => makeToast() }));

import { PrepSheet } from './PrepSheet';

const harptos = PRESETS.find(p => p.id === 'harptos')!.months;
const played = makeSession({ id: 's5', session_number: 5, status: 'done', title: 'The Docks', summary: 'Met **Brenna** at the docks.', hooks_notes: '- Who sent the letter?\n- Where is Gorval?' });
const next = makeSession({ id: 's6', session_number: 6, status: 'planned', session_date: '2026-11-07' });
const plan = { scene_ids: ['sc1'], hook_ids: ['h1'], encounter_ids: ['e1'], npc_ids: ['n1'] };

function show(over: { plan?: object; prepNotes?: string | null; worldDate?: object | null } = {}) {
  h.campaign.value = makeCampaignContext({
    selectedCampaign: { id: 'c1', name: 'shadows', title: 'Shadows over Phandalin', world_date: over.worldDate === undefined ? { year: 1492, day: 136 } : over.worldDate },
    updateCampaign: vi.fn(),
    pcs: [
      makePC({ id: 'p1', character_name: 'Kael', race: 'Elf', class: 'Wizard', level: 5, armor_class: 13, max_hp: 27, is_active: true } as never),
      makePC({ id: 'p2', character_name: 'Gone', is_active: false } as never),
      makePC({ id: 'p3', character_name: 'Pip', level: 2, is_active: true } as never),
    ],
    hooks: [makeHook({ id: 'h1', title: 'The Grey Hand’s Message', description: 'Sable wants the letter back.', state: 'active' })],
    npcs: [makeNPC({ id: 'n1', name: 'Sable Thorne', role: 'Spymaster', hooks_motivations: 'Owes the Tidewardens.' })],
    encounters: [{ id: 'e1', name: 'Ambush at the Pier', difficulty: 'hard', environment: 'Docks',
      combatants: JSON.stringify([{ id: 'x', source: 'saved', statblock_id: 'm1', name: 'Thug', count: 3, notes: null }]) }],
    monsterStatblocks: [{ id: 'm1', name: 'Bandit', armor_class: 12, hit_points: 11 }],
    modules: [{ id: 'mo1', title: 'Phandelver' }],
    submodules: [{ id: 'sm1', module_id: 'mo1', title: 'The Docks' }],
    scenes: [{ id: 'sc1', submodule_id: 'sm1', title: 'The Pier at Night', summary: 'Fog over the water.', read_aloud: 'Lanterns sway; the water is black.' }],
  });
  h.world.value = makeWorldContext({
    activeWorld: { id: 'w1', name: 'Faerûn', calendar: 'DR', era: '', year: 1492, tagline: '', calendarMonths: harptos },
  });
  const onClose = vi.fn();
  render(<PrepSheet session={next} sessions={[played, next]} plan={over.plan ?? plan} prepNotes={over.prepNotes ?? null} onClose={onClose} />);
  return { onClose, sheet: screen.getByRole('dialog', { name: 'Prep sheet' }) };
}

beforeEach(() => vi.clearAllMocks());

describe('PrepSheet', () => {
  it('heads the sheet with the session, its date and where the campaign stands in the world', () => {
    const { sheet } = show();
    expect(within(sheet).getByRole('heading', { level: 1, name: 'Session 6' })).toBeTruthy();
    expect(within(sheet).getByText('Shadows over Phandalin · Prep sheet')).toBeTruthy();
    expect(within(sheet).getByText('Nov 7, 2026 · In the world: 14 Mirtul 1492 DR')).toBeTruthy();
  });

  it('lists the active party with their numbers', () => {
    const { sheet } = show();
    const party = within(sheet).getByText('Kael').closest('li')!;
    expect(party.textContent).toBe('Kael Elf Wizard 5 · AC 13 · HP 27');
    expect(within(sheet).getByText('Pip').closest('li')!.textContent).toBe('Pip level 2');
    expect(within(sheet).queryByText('Gone')).toBeNull();
  });

  it('recaps last time and what it left open', () => {
    const { sheet } = show();
    expect(within(sheet).getByText('Last time · Session 5 · The Docks')).toBeTruthy();
    expect(within(sheet).getByText('Met Brenna at the docks.')).toBeTruthy();
    expect(within(sheet).getByText('Where is Gorval?')).toBeTruthy();
  });

  it('gives the agenda with where each scene sits and its read-aloud in full', () => {
    const { sheet } = show();
    expect(within(sheet).getByText('The Pier at Night')).toBeTruthy();
    expect(within(sheet).getByText('· Phandelver › The Docks')).toBeTruthy();
    expect(within(sheet).getByText('Lanterns sway; the water is black.').tagName).toBe('BLOCKQUOTE');
  });

  it('puts the threads, encounters with the creatures’ numbers, and NPCs at hand', () => {
    const { sheet } = show();
    expect(within(sheet).getByText('The Grey Hand’s Message').closest('li')!.textContent).toContain('(active) Sable wants the letter back.');
    expect(within(sheet).getByText('3 × Bandit (AC 12, HP 11)')).toBeTruthy();
    expect(within(sheet).getByText('Sable Thorne').closest('li')!.textContent).toBe('Sable Thorne · Spymaster Owes the Tidewardens.');
  });

  it('shows prep notes with mentions as plain names', () => {
    const { sheet } = show({ prepNotes: 'Remember @[Sable](npc:n1) lies.' });
    expect(within(sheet).getByText('Remember Sable lies.')).toBeTruthy();
  });

  it('says when nothing is planned yet', () => {
    const { sheet } = show({ plan: {}, worldDate: null });
    expect(within(sheet).getByText(/Nothing planned yet/)).toBeTruthy();
    expect(within(sheet).getByText('Nov 7, 2026')).toBeTruthy();
  });

  it('prints, and closes on Close or Escape', () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    const { onClose } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
