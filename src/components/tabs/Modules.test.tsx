import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { makeCampaignContext } from '../../test/contextMocks';
import { makeModule } from '../../test/fixtures';

const h = vi.hoisted(() => ({ campaign: { value: null as ReturnType<typeof makeCampaignContext> | null } }));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../ui/SlashField', () => ({
  SlashField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} />
  ),
}));
// The open-module and web views are heavy; stub them so the list view is isolated.
vi.mock('./ModuleDetail', () => ({ default: ({ module }: { module: { id: string } }) => <div>MODULE_DETAIL:{module.id}</div> }));
vi.mock('./ModuleWeb', () => ({ default: () => <div>MODULE_WEB</div> }));

import Modules from './Modules';

const cc = () => h.campaign.value!;

beforeEach(() => {
  h.campaign.value = makeCampaignContext();
});

describe('Modules (list view)', () => {
  it('shows the empty and select-a-module states', () => {
    render(<Modules viewMode="list" />);
    expect(screen.getByText('No modules yet.')).toBeTruthy();
    expect(screen.getByText('Select a module')).toBeTruthy();
  });

  it('lists modules sorted by numeric chapter', () => {
    h.campaign.value = makeCampaignContext({
      modules: [
        makeModule('m2', 'active', { chapter: '2', title: 'Second' }),
        makeModule('m1', 'planned', { chapter: '1', title: 'First' }),
      ],
    });
    render(<Modules viewMode="list" />);
    const first = screen.getByText('1. First');
    const second = screen.getByText('2. Second');
    // "1. First" should come before "2. Second" in document order
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opens the module detail when a row is clicked', () => {
    h.campaign.value = makeCampaignContext({ modules: [makeModule('m1', 'active', { chapter: '1', title: 'First' })] });
    render(<Modules viewMode="list" />);
    fireEvent.click(screen.getByText('1. First'));
    expect(screen.getByText('MODULE_DETAIL:m1')).toBeTruthy();
  });

  it('creates a module from the inline panel (title required)', () => {
    render(<Modules viewMode="list" />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }));

    const createBtn = screen.getByRole('button', { name: 'Create Module' }) as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true); // no title yet

    fireEvent.change(screen.getByPlaceholderText('e.g., The Train Heist'), { target: { value: 'The Heist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Module' }));
    expect(cc().upsertModule).toHaveBeenCalledWith(expect.objectContaining({ title: 'The Heist', played_session: null }));
  });
});
