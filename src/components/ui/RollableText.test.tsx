import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({ play: null as null | { live: object | null; logRoll: ReturnType<typeof vi.fn> } }));
vi.mock('../../context/PlayContext', () => ({ usePlayMaybe: () => h.play }));

import { RollableText } from './RollableText';

const logRoll = vi.fn();
beforeEach(() => { logRoll.mockReset(); });

describe('RollableText', () => {
  it('rolls an attack into the session’s dice log, named for the creature', () => {
    h.play = { live: { id: 's1' }, logRoll };
    render(<RollableText text="Bite: +5 to hit. Hit: 7 (2d4 + 2) piercing." source="Wolf" />);
    fireEvent.click(screen.getByRole('button', { name: '+5 to hit' }));
    const [r, label] = logRoll.mock.calls[0];
    expect(label).toBe('Wolf · +5 to hit');
    expect(r.expr).toBe('1d20+5');
    expect(r.total).toBeGreaterThanOrEqual(6);
    expect(screen.getByText(new RegExp(`→ ${r.total}`))).toBeTruthy();
  });

  it('rolls with advantage on shift, and doubles damage dice on shift', () => {
    h.play = { live: { id: 's1' }, logRoll };
    render(<RollableText text="+5 to hit, 7 (2d4 + 2)" source="Wolf" />);
    fireEvent.click(screen.getByRole('button', { name: '+5 to hit' }), { shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: '7 (2d4 + 2)' }), { shiftKey: true });
    expect(logRoll.mock.calls[0][0].expr).toBe('1d20+5 adv');
    expect(logRoll.mock.calls[1][0]).toMatchObject({ expr: '4d4+2 crit' });
    expect(logRoll.mock.calls[1][1]).toBe('Wolf · damage');
  });

  it('still rolls outside a live session, without logging', () => {
    h.play = { live: null, logRoll };
    render(<RollableText text="Wis +3" checks source="Wolf" />);
    fireEvent.click(screen.getByRole('button', { name: 'Wis +3' }));
    expect(logRoll).not.toHaveBeenCalled();
    expect(screen.getByText(/→ \d+/)).toBeTruthy();
  });
});
