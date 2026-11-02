import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { makeCampaignContext, makeWorldContext, makeToast } from '../../test/contextMocks';
import { makeSession } from '../../test/fixtures';
import { PRESETS, fromMonthDay } from '../../lib/calendar';

const h = vi.hoisted(() => ({
  campaign: { value: null as unknown },
  world: { value: null as unknown },
  toast: vi.fn(),
}));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/WorldContext', () => ({ useWorld: () => h.world.value }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => h.toast }));

import { WorldDateControls } from './WorldDateControls';
import { CampaignDateCard, PlayDate } from './CampaignDate';
import { SessionWorldDates } from './SessionWorldDates';

const harptos = PRESETS.find(p => p.id === 'harptos')!.months;
const at = (month: string, day: number, year = 1492) => fromMonthDay(year, harptos.findIndex(m => m.name === month), day, harptos);
const mirtul14 = at('Mirtul', 14);

const updateCampaign = vi.fn();
const updateSession = vi.fn();
const createTimelineEvent = vi.fn();
const upsertTimelineEvent = vi.fn();

function setup({ worldDate = mirtul14 as object | null, timeline = [] as { id: string }[] } = {}) {
  h.campaign.value = makeCampaignContext({
    selectedCampaign: { id: 'c1', title: 'Shadows over Phandalin', name: 'shadows', world_date: worldDate },
    updateCampaign,
    updateSession,
  });
  h.world.value = makeWorldContext({
    activeWorld: { id: 'w1', name: 'Faerûn', calendar: 'DR', era: 'Era of Upheaval', year: 1490, tagline: '', calendarMonths: harptos },
    timeline,
    createTimelineEvent,
    upsertTimelineEvent,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.toast = makeToast();
  updateCampaign.mockResolvedValue(undefined);
  updateSession.mockResolvedValue(undefined);
  createTimelineEvent.mockResolvedValue('ev1');
  upsertTimelineEvent.mockResolvedValue(undefined);
  setup();
});

describe('WorldDateControls', () => {
  it('moves the date on by a day, a week and a month', () => {
    const onChange = vi.fn();
    render(<WorldDateControls date={mirtul14} months={harptos} suffix="DR" defaultYear={1} onChange={onChange} />);
    expect(screen.getByText('14 Mirtul 1492 DR')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '+1 day' }));
    fireEvent.click(screen.getByRole('button', { name: '+7 days' }));
    fireEvent.click(screen.getByRole('button', { name: '+1 month' }));
    expect(onChange.mock.calls.map(c => c[0])).toEqual([at('Mirtul', 15), at('Mirtul', 21), at('Kythorn', 14)]);
  });

  it('sets a date from a day, month and year', () => {
    const onChange = vi.fn();
    render(<WorldDateControls date={mirtul14} months={harptos} suffix="DR" defaultYear={1} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set date…' }));
    expect((screen.getByLabelText('Day') as HTMLInputElement).value).toBe('14');
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: String(harptos.findIndex(m => m.name === 'Kythorn')) } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '1493' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    expect(onChange).toHaveBeenCalledWith(at('Kythorn', 2, 1493));
    expect(screen.getByRole('button', { name: '+1 day' })).toBeTruthy();
  });

  it('asks for no day on a festival, and cancels back to the date', () => {
    const onChange = vi.fn();
    render(<WorldDateControls date={mirtul14} months={harptos} suffix="DR" defaultYear={1} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set date…' }));
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: String(harptos.findIndex(m => m.name === 'Greengrass')) } });
    expect(screen.queryByLabelText('Day')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('14 Mirtul 1492 DR')).toBeTruthy();
  });

  it('starts a first date in the world’s year, with nothing to cancel back to', () => {
    const onChange = vi.fn();
    render(<WorldDateControls date={null} months={harptos} suffix="DR" defaultYear={1490} onChange={onChange} />);
    expect((screen.getByLabelText('Year') as HTMLInputElement).value).toBe('1490');
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    expect(onChange).toHaveBeenCalledWith({ year: 1490, day: 1 });
  });
});

describe('the campaign’s date', () => {
  it('shows each step at once and saves them in order', async () => {
    let finishFirst!: () => void;
    updateCampaign.mockImplementationOnce(() => new Promise<void>(r => { finishFirst = r; }));
    render(<CampaignDateCard />);
    fireEvent.click(screen.getByRole('button', { name: '+1 day' }));
    fireEvent.click(screen.getByRole('button', { name: '+1 day' }));
    expect(screen.getByText('16 Mirtul 1492 DR')).toBeTruthy();
    await waitFor(() => expect(updateCampaign).toHaveBeenCalledTimes(1));
    expect(updateCampaign).toHaveBeenCalledWith('c1', { world_date: at('Mirtul', 15) });
    await act(async () => { finishFirst(); });
    await waitFor(() => expect(updateCampaign).toHaveBeenCalledTimes(2));
    expect(updateCampaign).toHaveBeenLastCalledWith('c1', { world_date: at('Mirtul', 16) });
  });

  it('says so when a save fails', async () => {
    updateCampaign.mockRejectedValueOnce(new Error('offline'));
    render(<CampaignDateCard />);
    fireEvent.click(screen.getByRole('button', { name: '+1 day' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('offline', 'error'));
  });

  it('asks for a first date when the campaign has none', () => {
    setup({ worldDate: null });
    render(<CampaignDateCard />);
    expect(screen.getByText(/Set where the campaign stands/)).toBeTruthy();
    expect(screen.getByLabelText('Year')).toBeTruthy();
  });

  it('opens from the Play strip and closes on Escape', () => {
    render(<PlayDate />);
    fireEvent.click(screen.getByRole('button', { name: /14 Mirtul 1492 DR/ }));
    expect(screen.getByRole('dialog', { name: 'In-world date' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('a session’s in-world dates', () => {
  const played = (over = {}) => makeSession({
    id: 's6', session_number: 6, title: 'The Sunless Citadel', summary: 'The party found **the** dragon.',
    world_start: mirtul14, world_end: at('Mirtul', 16), ...over,
  } as never);

  it('offers an undated session the campaign’s date', () => {
    render(<SessionWorldDates session={makeSession({ id: 's6' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Date it 14 Mirtul 1492 DR' }));
    expect(updateSession).toHaveBeenCalledWith('s6', { world_start: mirtul14, world_end: mirtul14 });
  });

  it('shows nothing when neither has a date', () => {
    setup({ worldDate: null });
    const { container } = render(<SessionWorldDates session={makeSession({ id: 's6' })} />);
    expect(container.textContent).toBe('');
  });

  it('shows the span and the days that passed', () => {
    render(<SessionWorldDates session={played()} />);
    expect(screen.getByText('14–16 Mirtul 1492 DR · 2 days')).toBeTruthy();
  });

  it('posts the session to the world timeline as a campaign event', async () => {
    render(<SessionWorldDates session={played()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to the world timeline' }));
    await waitFor(() => expect(updateSession).toHaveBeenCalledWith('s6', { timeline_event_id: 'ev1' }));
    expect(createTimelineEvent).toHaveBeenCalledWith({
      title: 'Shadows over Phandalin: Session 6 · The Sunless Citadel',
      desc: 'The party found the dragon.',
      year: 1492,
      date: '14–16 Mirtul 1492 DR',
      type: 'campaign',
      era: 'Era of Upheaval',
      order: mirtul14.day,
    });
    expect(h.toast).toHaveBeenCalledWith('Added to the world timeline');
  });

  it('updates the event it posted before', async () => {
    setup({ timeline: [{ id: 'ev1' }] });
    render(<SessionWorldDates session={played({ timeline_event_id: 'ev1' })} />);
    expect(screen.getByText('On the world timeline')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Update timeline' }));
    await waitFor(() => expect(upsertTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'ev1', date: '14–16 Mirtul 1492 DR' })));
    expect(createTimelineEvent).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith('Timeline event updated');
  });

  it('posts afresh when its event was deleted from the timeline', () => {
    render(<SessionWorldDates session={played({ timeline_event_id: 'gone' })} />);
    expect(screen.queryByText('On the world timeline')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add to the world timeline' })).toBeTruthy();
  });

  it('says so when posting fails', async () => {
    createTimelineEvent.mockRejectedValueOnce(new Error('no world'));
    render(<SessionWorldDates session={played()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to the world timeline' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('no world', 'error'));
    expect(updateSession).not.toHaveBeenCalled();
  });
});
