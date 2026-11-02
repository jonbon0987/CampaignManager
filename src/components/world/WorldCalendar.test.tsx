import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeWorldContext, makeConfirm, makeToast } from '../../test/contextMocks';
import { DEFAULT_MONTHS, PRESETS } from '../../lib/calendar';

const h = vi.hoisted(() => ({
  world: { value: null as unknown },
  confirm: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('../../context/WorldContext', () => ({ useWorld: () => h.world.value }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => h.confirm }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => h.toast }));

import { WorldCalendar } from './WorldCalendar';

const updateWorld = vi.fn();
const months = [{ name: 'Hammer', days: 30 }, { name: 'Midwinter', days: 1 }, { name: 'Alturiak', days: 30 }];

function setup(calendar = 'Year (Y)') {
  h.world.value = makeWorldContext({
    activeWorld: { id: 'w1', name: 'Faerûn', calendar, era: '', year: 1490, tagline: '', calendarMonths: months },
    updateWorld,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.confirm = makeConfirm();
  h.toast = makeToast();
  updateWorld.mockResolvedValue(undefined);
  setup();
});

describe('WorldCalendar', () => {
  it('lists the months, marking one-day months as festivals', () => {
    render(<WorldCalendar />);
    expect(screen.getByText('3 months · 61 days a year')).toBeTruthy();
    expect(screen.getAllByText('festival')).toHaveLength(1);
    expect((screen.getByLabelText('Month 2 name') as HTMLInputElement).value).toBe('Midwinter');
  });

  it('saves a renamed or resized month when the DM leaves it', () => {
    render(<WorldCalendar />);
    fireEvent.change(screen.getByLabelText('Month 1 name'), { target: { value: 'Deepwinter' } });
    fireEvent.blur(screen.getByLabelText('Month 1 name'));
    expect(updateWorld).toHaveBeenLastCalledWith('w1', { calendarMonths: [{ name: 'Deepwinter', days: 30 }, months[1], months[2]] });
    fireEvent.change(screen.getByLabelText('Days in Alturiak'), { target: { value: '28' } });
    fireEvent.blur(screen.getByLabelText('Days in Alturiak'));
    expect(updateWorld).toHaveBeenLastCalledWith('w1', { calendarMonths: [months[0], months[1], { name: 'Alturiak', days: 28 }] });
  });

  it('keeps a month’s name and days when they are left blank, without saving', () => {
    render(<WorldCalendar />);
    fireEvent.change(screen.getByLabelText('Month 1 name'), { target: { value: '  ' } });
    fireEvent.blur(screen.getByLabelText('Month 1 name'));
    fireEvent.change(screen.getByLabelText('Days in Hammer'), { target: { value: '' } });
    fireEvent.blur(screen.getByLabelText('Days in Hammer'));
    expect(updateWorld).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Month 1 name') as HTMLInputElement).value).toBe('Hammer');
  });

  it('adds and removes months', () => {
    render(<WorldCalendar />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add month' }));
    expect(updateWorld).toHaveBeenLastCalledWith('w1', { calendarMonths: [...months, { name: 'Month 4', days: 30 }] });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Midwinter' }));
    expect(updateWorld).toHaveBeenLastCalledWith('w1', { calendarMonths: [months[0], months[2]] });
  });

  it('replaces the months with a preset once the DM confirms', async () => {
    render(<WorldCalendar />);
    fireEvent.change(screen.getByLabelText('Start from a preset'), { target: { value: 'twelve' } });
    await waitFor(() => expect(updateWorld).toHaveBeenCalledWith('w1', { calendarMonths: DEFAULT_MONTHS }));
    expect(h.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: `Use ${PRESETS[0].label}?` }));
  });

  it('leaves the months be when the DM cancels a preset', async () => {
    h.confirm = makeConfirm(false);
    render(<WorldCalendar />);
    fireEvent.change(screen.getByLabelText('Start from a preset'), { target: { value: 'harptos' } });
    await waitFor(() => expect(h.confirm).toHaveBeenCalled());
    expect(updateWorld).not.toHaveBeenCalled();
  });

  it('saves what years are counted as, starting blank for a new world', () => {
    render(<WorldCalendar />);
    const suffix = screen.getByLabelText('Years are counted as') as HTMLInputElement;
    expect(suffix.value).toBe('');
    fireEvent.change(suffix, { target: { value: ' DR ' } });
    fireEvent.blur(suffix);
    expect(updateWorld).toHaveBeenCalledWith('w1', { calendar: 'DR' });
  });

  it('says so when a save fails', async () => {
    updateWorld.mockRejectedValueOnce(new Error('offline'));
    render(<WorldCalendar />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add month' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('offline', 'error'));
  });
});
