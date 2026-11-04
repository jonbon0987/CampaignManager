import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeWorldContext } from '../../test/contextMocks';
import type { WorldTimelineEvent } from '../../types/world';

const h = vi.hoisted(() => ({ world: { value: null as unknown } }));
vi.mock('../../context/WorldContext', () => ({ useWorld: () => h.world.value }));
vi.mock('../ui/SlashField', () => ({
  SlashField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) =>
    <textarea aria-label="Description" value={value ?? ''} onChange={e => onChange(e.target.value)} />,
}));
vi.mock('../ui/MarkdownContent', () => ({ MarkdownContent: ({ text }: { text: string }) => <p>{text}</p> }));

import WorldTimeline from './WorldTimeline';

const months = [{ name: 'Hammer', days: 30 }, { name: 'Midwinter', days: 1 }, { name: 'Alturiak', days: 30 }];
const event = (over: Partial<WorldTimelineEvent> = {}): WorldTimelineEvent => ({
  id: 'e1', worldId: 'w1', title: 'The Fall of Myth Drannor', year: 714, date: 'Midsummer', desc: '', type: 'custom', era: 'Old', order: 0, day: null, ...over,
});

function setup(timeline: WorldTimelineEvent[] = []) {
  const createTimelineEvent = vi.fn().mockResolvedValue('new');
  const upsertTimelineEvent = vi.fn().mockResolvedValue(undefined);
  h.world.value = makeWorldContext({
    activeWorld: { id: 'w1', name: 'Faerûn', calendar: 'DR', tagline: '', era: '', year: 1490, calendarMonths: months },
    timeline, createTimelineEvent, upsertTimelineEvent,
    timelineTypeConfig: { custom: { glyph: '✦', color: 'var(--ink)' } },
  });
  render(<WorldTimeline />);
  return { createTimelineEvent, upsertTimelineEvent };
}

beforeEach(() => vi.clearAllMocks());

describe('Timeline event dates', () => {
  it('dates a new event in the world’s calendar, or by its year alone', async () => {
    const { createTimelineEvent } = setup();
    fireEvent.click(screen.getByRole('button', { name: '+ Add event' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. The Battle of Ashfield'), { target: { value: 'The Crowning' } });
    fireEvent.change(screen.getByLabelText('Year (DR)'), { target: { value: '1492' } });
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
    // Alturiak 14 is day 31 (Hammer) + 1 (Midwinter) + 14.
    expect(createTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'The Crowning', year: 1492, day: 45, date: '14 Alturiak 1492 DR' }));
  });

  it('takes no day for a festival, and reads a year-only event as its year', () => {
    const { createTimelineEvent } = setup();
    fireEvent.click(screen.getByRole('button', { name: '+ Add event' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. The Battle of Ashfield'), { target: { value: 'A feast' } });
    fireEvent.change(screen.getByLabelText('Year (DR)'), { target: { value: '1490' } });
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '1' } });
    expect(screen.queryByLabelText('Day')).toBeNull();
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
    expect(createTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({ year: 1490, day: null, date: '1490 DR' }));
  });

  it('keeps an older event’s free-text date until the DM sets a month or drops it', async () => {
    const { upsertTimelineEvent } = setup([event()]);
    fireEvent.click(screen.getByText('The Fall of Myth Drannor'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByText(/Shown as “Midsummer”/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(upsertTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1', day: 3, date: '3 Hammer 714 DR' })));
  });
});
