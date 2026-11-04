import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeCampaignContext, makeWorldContext, makeToast } from '../../test/contextMocks';

const h = vi.hoisted(() => ({ campaign: { value: null as unknown }, world: { value: null as unknown }, toast: vi.fn() }));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/WorldContext', () => ({ useWorld: () => h.world.value }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => h.toast }));
vi.mock('../ui/SlashField', () => ({
  SlashField: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) =>
    <textarea aria-label={placeholder} value={value ?? ''} onChange={e => onChange(e.target.value)} />,
}));
vi.mock('../session/DiscordBotSettings', () => ({ DiscordBotSettings: () => null }));
vi.mock('../export/ExportCampaign', () => ({ ExportCampaignPanel: () => null }));

import SettingsView from './SettingsView';

const campaign = { id: 'c1', name: 'Test', rules_edition: null, levelling: null };
const worldCampaign = (over = {}) => ({ id: 'c1', worldId: 'w1', name: 'Test', sessions: 3, party: '', lastPlayed: '', status: 'active', archived: false, ...over });

function setup(over: { archived?: boolean } = {}) {
  const updateCampaignRow = vi.fn().mockResolvedValue(undefined);
  const updateCampaign = vi.fn().mockResolvedValue(undefined);
  const setOverview = vi.fn().mockResolvedValue(undefined);
  h.campaign.value = makeCampaignContext({
    selectedCampaign: campaign, updateCampaign: updateCampaignRow, setOverview,
    overview: { title: 'Test', plotSummary: 'A heist.', majorCharacters: '', worldInfo: '', party: '' },
  });
  h.world.value = makeWorldContext({ campaigns: [worldCampaign(over)], updateCampaign });
  render(<SettingsView />);
  return { updateCampaignRow, updateCampaign, setOverview };
}

beforeEach(() => { vi.clearAllMocks(); h.toast = makeToast(); });

describe('Campaign settings', () => {
  it('renames the campaign when the DM leaves the name, keeping the old title in step', async () => {
    const { updateCampaignRow, updateCampaign } = setup();
    const name = screen.getByLabelText('Campaign name');
    fireEvent.change(name, { target: { value: 'The Sunken Crown' } });
    fireEvent.blur(name);
    await waitFor(() => expect(updateCampaignRow).toHaveBeenCalledWith('c1', { name: 'The Sunken Crown', title: 'The Sunken Crown' }));
    expect(updateCampaign).toHaveBeenCalledWith('c1', { name: 'The Sunken Crown' });
  });

  it('keeps the name when it is cleared', () => {
    const { updateCampaignRow } = setup();
    const name = screen.getByLabelText('Campaign name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: '  ' } });
    fireEvent.blur(name);
    expect(name.value).toBe('Test');
    expect(updateCampaignRow).not.toHaveBeenCalled();
  });

  it('archives beside the status, and restores an archived campaign', async () => {
    const { updateCampaign } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(updateCampaign).toHaveBeenCalledWith('c1', { archived: true }));
  });

  it('shows Restore, and no status, for an archived campaign', async () => {
    const { updateCampaign } = setup({ archived: true });
    expect(screen.queryByRole('radiogroup', { name: 'Campaign status' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(updateCampaign).toHaveBeenCalledWith('c1', { archived: false }));
  });

  it('saves the pitch and house notes as they are typed', async () => {
    const { setOverview } = setup();
    expect(screen.getByDisplayValue('A heist.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Flanking gives advantage/), { target: { value: 'No PvP.' } });
    await waitFor(() => expect(setOverview).toHaveBeenCalled(), { timeout: 2000 });
    const update = setOverview.mock.calls.at(-1)![0] as (prev: object) => object;
    expect(update({ title: 'Test', plotSummary: 'A heist.', worldInfo: '' })).toMatchObject({ plotSummary: 'A heist.', worldInfo: 'No PvP.' });
  });
});
