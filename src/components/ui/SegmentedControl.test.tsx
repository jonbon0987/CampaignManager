import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SegmentedControl, TogglePill } from './SegmentedControl';
import type { SegmentOption } from './SegmentedControl';

const STATES: SegmentOption<string>[] = [
  { value: 'seed', label: 'Seed' },
  { value: 'active', label: 'Active' },
  { value: 'cold', label: 'Cold', disabled: true },
  { value: 'resolved', label: 'Resolved' },
];

function Harness({ initial = 'seed', onChange = vi.fn() }: { initial?: string | null; onChange?: (v: string) => void }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <SegmentedControl aria-label="State" options={STATES} value={value}
      onChange={v => { setValue(v); onChange(v); }} />
  );
}

const radio = (name: string) => screen.getByRole('radio', { name });

describe('SegmentedControl', () => {
  it('is a radio group named by its label, with the chosen option checked', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'State' })).toBeTruthy();
    expect(radio('Seed').getAttribute('aria-checked')).toBe('true');
    expect(radio('Active').getAttribute('aria-checked')).toBe('false');
  });

  it('chooses an option on click, and ignores a click on the chosen one', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(radio('Seed'));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(radio('Active'));
    expect(onChange).toHaveBeenCalledWith('active');
    expect(radio('Active').getAttribute('aria-checked')).toBe('true');
  });

  it('is one Tab stop: the chosen option, or the first enabled one when none is chosen', () => {
    const { unmount } = render(<Harness initial="active" />);
    expect(radio('Active').tabIndex).toBe(0);
    expect(radio('Seed').tabIndex).toBe(-1);
    unmount();
    render(<Harness initial={null} />);
    expect(radio('Seed').tabIndex).toBe(0);
  });

  it('moves the choice with the arrow keys, skipping disabled options and wrapping', () => {
    const onChange = vi.fn();
    render(<Harness initial="active" onChange={onChange} />);
    const group = screen.getByRole('radiogroup');

    fireEvent.keyDown(group, { key: 'ArrowRight' });       // Cold is disabled
    expect(onChange).toHaveBeenLastCalledWith('resolved');
    expect(document.activeElement).toBe(radio('Resolved'));

    fireEvent.keyDown(group, { key: 'ArrowRight' });       // wraps
    expect(onChange).toHaveBeenLastCalledWith('seed');

    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('resolved');
  });

  it('does nothing when the whole control is disabled', () => {
    const onChange = vi.fn();
    render(<SegmentedControl aria-label="Mode" options={STATES} value="seed" onChange={onChange} disabled />);
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    fireEvent.click(radio('Active'));
    expect(onChange).not.toHaveBeenCalled();
    expect((radio('Active') as HTMLButtonElement).disabled).toBe(true);
  });

  it('works with number and boolean values', () => {
    const onSize = vi.fn();
    const { unmount } = render(
      <SegmentedControl aria-label="Clock size" value={4} onChange={onSize}
        options={[4, 6, 8].map(n => ({ value: n, label: `${n} segments` }))} />,
    );
    fireEvent.click(radio('6 segments'));
    expect(onSize).toHaveBeenCalledWith(6);
    unmount();

    const onSpent = vi.fn();
    render(
      <SegmentedControl aria-label="Gained or spent" value={false} onChange={onSpent}
        options={[{ value: false, label: 'Gained' }, { value: true, label: 'Spent' }]} />,
    );
    fireEvent.click(radio('Spent'));
    expect(onSpent).toHaveBeenCalledWith(true);
  });

  it('tints an option that is not chosen with its own colour', () => {
    render(
      <SegmentedControl aria-label="Kind" value="main" onChange={vi.fn()}
        options={[{ value: 'main', label: 'Main', color: 'red' }, { value: 'side', label: 'Side', color: 'blue' }]} />,
    );
    expect(radio('Main').style.color).toBe('');
    expect(radio('Side').style.color).toBe('blue');
  });

  it('can be named by a visible heading instead of a label', () => {
    render(
      <>
        <span id="xp-label">Experience</span>
        <SegmentedControl aria-labelledby="xp-label" value="xp" onChange={vi.fn()}
          options={[{ value: 'xp', label: 'By XP' }, { value: 'milestone', label: 'By milestone' }]} />
      </>,
    );
    expect(screen.getByRole('radiogroup', { name: 'Experience' })).toBeTruthy();
  });
});

describe('TogglePill', () => {
  it('is a pressed / not pressed button that reports the flipped value', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TogglePill pressed={false} onChange={onChange}>DM only</TogglePill>);
    const pill = screen.getByRole('button', { name: 'DM only' });
    expect(pill.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(pill);
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(<TogglePill pressed onChange={onChange}>DM only</TogglePill>);
    expect(pill.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(pill);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });
});
