import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { makeCampaignContext } from '../../test/contextMocks';

const h = vi.hoisted(() => ({ campaign: { value: null as unknown }, play: { value: null as unknown } }));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/PlayContext', () => ({ usePlay: () => h.play.value }));
vi.mock('../../context/RecordingContext', () => ({ useRecording: () => ({ live: null }) }));
vi.mock('../session/RecorderPanel', () => ({ RecorderPanel: () => null }));
vi.mock('./PlayInitiative', () => ({ PlayInitiative: () => <div>initiative tool</div> }));
vi.mock('./PlayImprov', () => ({ PlayImprov: () => null }));
vi.mock('./PlayScene', () => ({ PlayScene: () => null }));

import { PlayTools } from './PlayTools';

function show(tab: string, rules: unknown = []) {
  const setTab = vi.fn();
  h.play.value = { live: { id: 's1' }, tab, setTab, play: { rolls: [], notes: [] }, logRoll: vi.fn(), addNote: vi.fn(), removeNote: vi.fn() };
  h.campaign.value = makeCampaignContext({ selectedCampaign: { id: 'c1', name: 'Test', house_rules: rules } });
  render(<PlayTools />);
  return setTab;
}
const tabNames = () => screen.getAllByRole('tab').map(t => t.textContent?.replace(/^\S+\s/, ''));

beforeEach(() => vi.clearAllMocks());

describe('PlayTools', () => {
  it('puts dice and initiative first', () => {
    show('dice');
    expect(tabNames()).toEqual(['Dice', 'Initiative', 'Scene', 'Notes', 'Improv', 'Record']);
  });

  it('has no Rules tab until the table has some', () => {
    show('dice', [{ id: 'r1', topic: 'Table', title: ' ', text: '' }]);
    expect(tabNames()).not.toContain('Rules');
  });

  it('shows the house rules in a tab of their own', () => {
    const setTab = show('rules', [{ id: 'r1', topic: 'Combat', title: 'Flanking', text: 'Advantage.' }]);
    expect(tabNames()).toEqual(['Dice', 'Initiative', 'Scene', 'Notes', 'Improv', 'Rules', 'Record']);
    expect(screen.getByRole('tab', { name: /Rules/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Flanking')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Dice/ }));
    expect(setTab).toHaveBeenCalledWith('dice');
  });

  it('falls back to the first tab if the rules it was on have gone', () => {
    show('rules', []);
    expect(screen.getByRole('tab', { name: /Dice/ }).getAttribute('aria-selected')).toBe('true');
  });
});
