import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RailResizer } from './RailResizer';
import { RAIL_DEFAULT, RAIL_MIN } from './railWidth';

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  // jsdom has no pointer capture.
  HTMLElement.prototype.setPointerCapture = vi.fn();
});

const grip = () => screen.getByRole('separator', { name: 'Side panel width' });

describe('RailResizer', () => {
  it('says how wide the rail is, and how wide it can go', () => {
    render(<RailResizer width={400} onResize={vi.fn()} />);
    expect(grip().getAttribute('aria-valuenow')).toBe('400');
    expect(grip().getAttribute('aria-valuemin')).toBe(String(RAIL_MIN));
    expect(grip().getAttribute('aria-valuemax')).toBe('540');
  });

  it('widens as it’s dragged left, and keeps the width when let go', () => {
    const onResize = vi.fn();
    render(<RailResizer width={400} onResize={onResize} />);
    fireEvent.pointerDown(grip(), { button: 0, clientX: 1000, pointerId: 1 });
    fireEvent.pointerMove(grip(), { clientX: 900, pointerId: 1 });
    expect(onResize).toHaveBeenLastCalledWith(500, false);
    fireEvent.pointerUp(grip(), { clientX: 880, pointerId: 1 });
    expect(onResize).toHaveBeenLastCalledWith(520, true);
  });

  it('stops at its limits however far it’s dragged', () => {
    const onResize = vi.fn();
    render(<RailResizer width={400} onResize={onResize} />);
    fireEvent.pointerDown(grip(), { button: 0, clientX: 1000, pointerId: 1 });
    fireEvent.pointerUp(grip(), { clientX: 1400, pointerId: 1 });
    expect(onResize).toHaveBeenLastCalledWith(RAIL_MIN, true);
  });

  it('moves with the arrow keys, and goes back to the usual width on a double-click', () => {
    const onResize = vi.fn();
    render(<RailResizer width={400} onResize={onResize} />);
    fireEvent.keyDown(grip(), { key: 'ArrowLeft' });
    expect(onResize).toHaveBeenLastCalledWith(416, true);
    fireEvent.keyDown(grip(), { key: 'ArrowRight' });
    expect(onResize).toHaveBeenLastCalledWith(384, true);
    fireEvent.keyDown(grip(), { key: 'Home' });
    expect(onResize).toHaveBeenLastCalledWith(RAIL_MIN, true);
    fireEvent.doubleClick(grip());
    expect(onResize).toHaveBeenLastCalledWith(RAIL_DEFAULT, true);
  });

  it('ignores a right-click', () => {
    const onResize = vi.fn();
    render(<RailResizer width={400} onResize={onResize} />);
    fireEvent.pointerDown(grip(), { button: 2, clientX: 1000, pointerId: 1 });
    fireEvent.pointerMove(grip(), { clientX: 900, pointerId: 1 });
    expect(onResize).not.toHaveBeenCalled();
  });
});
