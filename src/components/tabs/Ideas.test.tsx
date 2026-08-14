import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Idea } from '../../lib/database.types';
import { makeCampaignContext, makeConfirm } from '../../test/contextMocks';

// Hold the context values the mocked hooks return; configured per test.
const h = vi.hoisted(() => ({
  campaign: { value: null as ReturnType<typeof makeCampaignContext> | null },
  confirm: { value: null as ReturnType<typeof makeConfirm> | null },
}));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => h.confirm.value }));

import Ideas from './Ideas';

let n = 0;
const makeIdea = (over: Partial<Idea> = {}): Idea => ({
  id: `i${++n}`, text: 'a spark', tag: null, promoted_hook_id: null,
  created_at: new Date().toISOString(), updated_at: '', campaign_id: 'c', user_id: 'u',
  ...over,
} as Idea);

const cc = () => h.campaign.value!;

beforeEach(() => {
  n = 0;
  h.campaign.value = makeCampaignContext();
  h.confirm.value = makeConfirm(true);
});

describe('Ideas', () => {
  it('shows the empty state when there are no ideas', () => {
    render(<Ideas />);
    expect(screen.getByText('No ideas yet. Jot one down now!')).toBeTruthy();
    expect(screen.getByText(/0 in inbox/)).toBeTruthy();
  });

  it('splits ideas into inbox and a promoted section', () => {
    h.campaign.value = makeCampaignContext({
      ideas: [
        makeIdea({ text: 'inbox one' }),
        makeIdea({ text: 'already promoted', promoted_hook_id: 'hook-9' }),
      ],
    });
    render(<Ideas />);
    expect(screen.getByText(/1 in inbox/)).toBeTruthy();
    expect(screen.getByText('inbox one')).toBeTruthy();
    expect(screen.getByText('already promoted')).toBeTruthy();
    expect(screen.getByText(/Promoted · 1/)).toBeTruthy();
  });

  it('saves a trimmed quick idea via upsertIdea', () => {
    render(<Ideas />);
    fireEvent.change(screen.getByPlaceholderText('A spark, a twist, a scene, a name…'), { target: { value: '  new spark  ' } });
    fireEvent.change(screen.getByPlaceholderText('optional tag (e.g. twist, npc, set-piece)'), { target: { value: 'twist' } });
    fireEvent.click(screen.getByText('Save to inbox'));
    expect(cc().upsertIdea).toHaveBeenCalledWith({ text: 'new spark', tag: 'twist', promoted_hook_id: null });
  });

  it('does not save when the idea text is blank', () => {
    render(<Ideas />);
    fireEvent.change(screen.getByPlaceholderText('A spark, a twist, a scene, a name…'), { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Save to inbox'));
    expect(cc().upsertIdea).not.toHaveBeenCalled();
  });

  it('dismisses an idea after the user confirms', async () => {
    h.campaign.value = makeCampaignContext({ ideas: [makeIdea({ id: 'i1' })] });
    render(<Ideas />);
    fireEvent.click(screen.getByText('Dismiss'));
    await waitFor(() => expect(cc().deleteIdea).toHaveBeenCalledWith('i1'));
  });

  it('does not dismiss when the user cancels the confirm', async () => {
    h.confirm.value = makeConfirm(false);
    h.campaign.value = makeCampaignContext({ ideas: [makeIdea({ id: 'i1' })] });
    render(<Ideas />);
    fireEvent.click(screen.getByText('Dismiss'));
    await waitFor(() => expect(h.confirm.value).toHaveBeenCalled());
    expect(cc().deleteIdea).not.toHaveBeenCalled();
  });

  it('promotes an idea to a thread and navigates', async () => {
    const onNavigate = vi.fn();
    const idea = makeIdea({ id: 'i1' });
    h.campaign.value = makeCampaignContext({ ideas: [idea] });
    render(<Ideas onNavigate={onNavigate} />);

    fireEvent.click(screen.getByText('Promote ▾'));
    fireEvent.click(screen.getByRole('button', { name: /to a Thread/ }));
    await waitFor(() => expect(cc().promoteIdea).toHaveBeenCalledWith(idea, 'side_quest'));
    expect(onNavigate).toHaveBeenCalledWith('threads');
  });
});
