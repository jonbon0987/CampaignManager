import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { makeCampaignContext } from '../../test/contextMocks';
import { makeSession } from '../../test/fixtures';

const h = vi.hoisted(() => ({ campaign: { value: null as unknown }, toast: vi.fn() }));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/NavigationContext', () => ({ useOpenRecord: () => vi.fn() }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => h.toast }));
vi.mock('../../context/ChroniclePipelineContext', () => ({ useChroniclePipelineMaybe: () => ({ entries: [] }) }));
vi.mock('../player/PlayerPageCard', () => ({ PlayerPageCard: () => null }));
vi.mock('../calendar/CampaignDate', () => ({ CampaignDateCard: () => null }));
vi.mock('../session/PreviouslyOn', () => ({ PreviouslyOn: () => null }));

import Overview from './Overview';

function show(sessions: unknown[], repeat: string | null = null) {
  const updateSession = vi.fn().mockResolvedValue(undefined);
  const updateCampaign = vi.fn().mockResolvedValue(undefined);
  const upsertSession = vi.fn().mockResolvedValue({ id: 'new' });
  h.campaign.value = makeCampaignContext({
    sessions, updateSession, updateCampaign, upsertSession, encounters: [],
    selectedCampaign: { id: 'c1', name: 'Test', session_repeat: repeat },
  });
  render(<Overview onNavigate={vi.fn()} runMode={false} onToggleRun={vi.fn()} />);
  return { updateSession, updateCampaign, upsertSession };
}

const FUTURE = '2099-01-01'; // A Thursday

beforeEach(() => vi.clearAllMocks());

describe('scheduling the next session', () => {
  const planned = makeSession({ id: 's7', session_number: 7, status: 'planned', session_date: FUTURE, session_time: '19:00' } as never);

  it('says when it is, with the time', () => {
    show([planned]);
    expect(screen.getByText('Thu, Jan 1, 2099 at 7:00 PM')).toBeTruthy();
  });

  it('saves a new time', () => {
    const { updateSession } = show([planned]);
    fireEvent.change(screen.getByLabelText('Time of Session 7'), { target: { value: '18:30' } });
    expect(updateSession).toHaveBeenCalledWith('s7', { session_time: '18:30' });
  });

  it('saves how often the table meets, on the campaign', () => {
    const { updateCampaign } = show([planned]);
    fireEvent.change(screen.getByLabelText('How often you meet'), { target: { value: 'fortnightly' } });
    expect(updateCampaign).toHaveBeenCalledWith('c1', { session_repeat: 'fortnightly' });
    fireEvent.change(screen.getByLabelText('How often you meet'), { target: { value: '' } });
    expect(updateCampaign).toHaveBeenLastCalledWith('c1', { session_repeat: null });
  });

  it('with nothing planned, says when it’s expected, and plans it for then', () => {
    const played = makeSession({ id: 's6', session_number: 6, status: 'done', session_date: FUTURE, session_time: '19:00' } as never);
    const { upsertSession } = show([played], 'weekly');
    expect(screen.getByText('Not planned yet. Expected Thu, Jan 8, 2099 at 7:00 PM.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Plan Session 7' }));
    expect(upsertSession).toHaveBeenCalledWith(expect.objectContaining({ session_number: 7, session_date: '2099-01-08', session_time: '19:00' }));
  });

  it('with no repeat, plans it undated', () => {
    const played = makeSession({ id: 's6', session_number: 6, status: 'done', session_date: FUTURE } as never);
    const { upsertSession } = show([played]);
    expect(screen.getByText('Not planned yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Plan Session 7' }));
    expect(upsertSession).toHaveBeenCalledWith(expect.objectContaining({ session_number: 7, session_date: null }));
  });
});
