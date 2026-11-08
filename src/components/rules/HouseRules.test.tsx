import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { makeCampaignContext } from '../../test/contextMocks';
import type { HouseRule } from '../../lib/houseRules';

const h = vi.hoisted(() => ({ campaign: { value: null as unknown }, toast: vi.fn() }));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => h.toast }));

import { HouseRulesEditor, HouseRulesList } from './HouseRules';

const rule = (over: Partial<HouseRule> = {}): HouseRule => ({ id: 'r1', topic: 'Combat', title: 'Flanking', text: 'Advantage.', ...over });

function show(rules: unknown = []) {
  const updateCampaign = vi.fn().mockResolvedValue(undefined);
  h.campaign.value = makeCampaignContext({ selectedCampaign: { id: 'c1', name: 'Test', house_rules: rules }, updateCampaign });
  render(<HouseRulesEditor />);
  return updateCampaign;
}
const saved = (update: ReturnType<typeof vi.fn>) => update.mock.calls.at(-1)![1].house_rules as HouseRule[];

beforeEach(() => vi.clearAllMocks());

describe('HouseRulesEditor', () => {
  it('starts empty, saying what to do', () => {
    show();
    expect(screen.getByText(/No house rules yet/)).toBeTruthy();
  });

  it('adds a common rule, keeps its topic, and stops offering it', async () => {
    const update = show();
    fireEvent.click(screen.getByRole('button', { name: '+ Flanking' }));
    expect((screen.getByLabelText('Rule name') as HTMLInputElement).value).toBe('Flanking');
    expect((screen.getByLabelText('What Flanking says') as HTMLTextAreaElement).value).toMatch(/opposite sides/);
    expect(screen.queryByRole('button', { name: '+ Flanking' })).toBeNull();
    await waitFor(() => expect(update).toHaveBeenCalled(), { timeout: 2000 });
    expect(saved(update)).toEqual([expect.objectContaining({ title: 'Flanking', topic: 'Combat' })]);
  });

  it('writes a new one, and saves it with its topic and changed wording', async () => {
    const update = show();
    fireEvent.click(screen.getByRole('button', { name: '+ Write your own' }));
    fireEvent.change(screen.getByLabelText('Rule name'), { target: { value: 'Rule of cool' } });
    fireEvent.change(screen.getByLabelText('What Rule of cool says'), { target: { value: 'Advantage if it’s awesome.' } });
    fireEvent.change(screen.getByLabelText('Topic of Rule of cool'), { target: { value: 'Combat' } });
    await waitFor(() => expect(update).toHaveBeenCalled(), { timeout: 2000 });
    expect(saved(update)[0]).toMatchObject({ title: 'Rule of cool', text: 'Advantage if it’s awesome.', topic: 'Combat' });
  });

  it('removes a rule and can bring it back where it was', async () => {
    const update = show([rule(), rule({ id: 'r2', title: 'Big crits' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Flanking' }));
    expect(screen.queryByDisplayValue('Flanking')).toBeNull();
    const [message, type, action] = h.toast.mock.calls[0];
    expect(message).toBe('House rule removed');
    expect(type).toBe('success');
    await waitFor(() => expect(update).toHaveBeenCalled(), { timeout: 2000 });
    expect(saved(update).map(r => r.id)).toEqual(['r2']);
    action.onClick();
    await waitFor(() => expect(screen.getByDisplayValue('Flanking')).toBeTruthy());
    expect((screen.getAllByLabelText('Rule name') as HTMLInputElement[]).map(i => i.value)).toEqual(['Flanking', 'Big crits']);
  });

  it('offers no undo for a blank rule', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: '+ Write your own' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove this rule' }));
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('groups the common rules by topic', () => {
    show();
    expect(within(screen.getByRole('group', { name: 'Common rules: Table' })).getByRole('button', { name: '+ No PvP' })).toBeTruthy();
  });
});

describe('HouseRulesList', () => {
  it('shows the rules under their topics', () => {
    render(<HouseRulesList rules={[rule({ topic: 'Table', title: 'No PvP', text: 'Ask first.' }), rule()]} />);
    expect(within(screen.getByRole('region', { name: 'Combat' })).getByText('Flanking')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Table' })).getByText('Ask first.')).toBeTruthy();
    expect(screen.getAllByRole('region').map(r => r.getAttribute('aria-label'))).toEqual(['Combat', 'Table']);
  });
});
