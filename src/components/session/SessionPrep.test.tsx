import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { makeCampaignContext } from '../../test/contextMocks';
import { makeHook, makeNPC, makeSession } from '../../test/fixtures';
import type { Encounter, SessionPlan } from '../../lib/database.types';

const h = vi.hoisted(() => ({
  campaign: { value: null as Record<string, unknown> | null },
  open: vi.fn(),
}));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/NavigationContext', () => ({ useOpenRecord: () => h.open }));
vi.mock('../ui/SlashField', () => ({
  SlashField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Prep notes" value={value ?? ''} onChange={e => onChange(e.target.value)} />
  ),
}));

import { SessionPrep } from './SessionPrep';

const encounter = (id: string, name: string, status: Encounter['status'] = 'ready') =>
  ({ id, name, status, difficulty: 'hard' }) as unknown as Encounter;

const played = makeSession({ id: 's5', session_number: 5, status: 'done', title: 'The Docks', summary: 'Met **Brenna** at the docks.', hooks_notes: 'Who sent the letter?' });
const next = makeSession({ id: 's6', session_number: 6, status: 'planned' });

function renderPrep(plan: SessionPlan = {}, prepNotes: string | null = null) {
  const onPlan = vi.fn();
  const onPrepNotes = vi.fn();
  const onOpenSession = vi.fn();
  render(
    <SessionPrep session={next} sessions={[played, next]} plan={plan} prepNotes={prepNotes}
      onPlan={onPlan} onPrepNotes={onPrepNotes} onOpenSession={onOpenSession} />,
  );
  return { onPlan, onPrepNotes, onOpenSession };
}

beforeEach(() => {
  h.open.mockReset();
  h.campaign.value = makeCampaignContext({
    hooks: [
      makeHook({ id: 'h1', title: 'The Grey Hand’s Message', description: 'Sable Thorne wants the letter back.', state: 'active' }),
      makeHook({ id: 'h2', title: 'An old debt', state: 'resolved', is_active: false }),
    ],
    npcs: [makeNPC({ id: 'n1', name: 'Sable Thorne', role: 'Spymaster' }), makeNPC({ id: 'n2', name: 'Brenna Coldwater' })],
    encounters: [encounter('e1', 'Ambush at the Pier'), encounter('e2', 'Old fight', 'completed')],
  });
});

describe('SessionPrep', () => {
  it('recaps the previous played session, with what was left open', () => {
    const { onOpenSession } = renderPrep();
    expect(screen.getByText('Met Brenna at the docks.')).toBeTruthy();
    expect(screen.getByText('Who sent the letter?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Session 5 · The Docks' }));
    expect(onOpenSession).toHaveBeenCalledWith('s5');
  });

  it('adds a thread to the plan, offering only threads still open', () => {
    const { onPlan } = renderPrep({ encounter_ids: ['e1'] });
    fireEvent.click(screen.getByRole('button', { name: /Add a thread/ }));
    expect(screen.queryByText('An old debt')).toBeNull();
    fireEvent.click(screen.getByText('The Grey Hand’s Message'));
    expect(onPlan).toHaveBeenCalledWith({ encounter_ids: ['e1'], hook_ids: ['h1'] });
  });

  it('removes a picked encounter and opens one in Encounters', () => {
    const { onPlan } = renderPrep({ encounter_ids: ['e1'] });
    fireEvent.click(screen.getByRole('button', { name: 'Ambush at the Pier' }));
    expect(h.open).toHaveBeenCalledWith('combat', 'e1', 'encounter');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ambush at the Pier' }));
    expect(onPlan).toHaveBeenCalledWith({ encounter_ids: [] });
  });

  it('suggests NPCs named in the picked threads', () => {
    const { onPlan } = renderPrep({ hook_ids: ['h1'] });
    fireEvent.click(screen.getByRole('button', { name: /Sable Thorne/ }));
    expect(onPlan).toHaveBeenCalledWith({ hook_ids: ['h1'], npc_ids: ['n1'] });
    expect(screen.queryByRole('button', { name: /Brenna Coldwater/ })).toBeNull();
  });

  it('shows how much of the prep is ready', () => {
    renderPrep({ hook_ids: ['h1'] }, 'Bring the map');
    expect(screen.getByText('2 of 5 ready')).toBeTruthy();
  });

  it('saves prep notes as typed, clearing to null', () => {
    const { onPrepNotes } = renderPrep({}, 'Old');
    fireEvent.change(screen.getByLabelText('Prep notes'), { target: { value: '' } });
    expect(onPrepNotes).toHaveBeenCalledWith(null);
  });
});
