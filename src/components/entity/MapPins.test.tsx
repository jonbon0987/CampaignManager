import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapPins } from './MapPins';
import type { MapPin } from '../../lib/mapPins';

const places = [{ id: 'p1', label: 'The Old Well' }, { id: 'p2', label: 'Harbor' }];
const pin = (over: Partial<MapPin> = {}): MapPin => ({ id: 'a', x: 25, y: 50, place_id: 'p1', label: null, ...over });

function show(pins: MapPin[] = [], over = {}) {
  const onChange = vi.fn();
  const onOpenPlace = vi.fn();
  const onViewFull = vi.fn();
  render(<MapPins url="map.png" pins={pins} onChange={onChange} places={places} onOpenPlace={onOpenPlace} onViewFull={onViewFull} {...over} />);
  const map = document.querySelector('.mp-map') as HTMLElement;
  map.getBoundingClientRect = () => ({ left: 100, top: 100, width: 200, height: 100 }) as DOMRect;
  return { onChange, onOpenPlace, onViewFull, map };
}

describe('MapPins', () => {
  it('draws pins where they belong, and a click opens the place', () => {
    const { onOpenPlace } = show([pin()]);
    const button = screen.getByRole('button', { name: 'Open The Old Well' });
    expect(button.style.left).toBe('25%');
    expect(button.style.top).toBe('50%');
    fireEvent.click(button);
    expect(onOpenPlace).toHaveBeenCalledWith('p1');
  });

  it('a pin with only a label, or a deleted place, opens nothing', () => {
    const { onOpenPlace } = show([pin({ place_id: null, label: 'The old well' }), pin({ id: 'b', place_id: 'gone' })]);
    fireEvent.click(screen.getByRole('button', { name: 'The old well' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open A deleted place' }));
    expect(onOpenPlace).not.toHaveBeenCalled();
  });

  it('a click on the map does nothing until you’re placing pins', () => {
    const { onChange, map } = show();
    fireEvent.click(map, { clientX: 150, clientY: 150 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('drops a pin where the map was clicked, then lets you name it', () => {
    const { onChange, map } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Place pins' }));
    fireEvent.click(map, { clientX: 150, clientY: 125 });
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ x: 25, y: 25, place_id: null, label: null })]);
  });

  it('in placing, a pin selects instead of opening, and can be labelled or removed', () => {
    const { onChange, onOpenPlace } = show([pin({ place_id: null })]);
    fireEvent.click(screen.getByRole('button', { name: 'Place pins' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit the pin: Unnamed pin' }));
    expect(onOpenPlace).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Or a label'), { target: { value: 'The well' } });
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'a', label: 'The well' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove pin' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('drags a pin, saving once when it’s let go, without opening or adding anything', () => {
    const { onChange, onOpenPlace } = show([pin()]);
    fireEvent.click(screen.getByRole('button', { name: 'Place pins' }));
    const button = screen.getByRole('button', { name: 'Edit the pin: The Old Well' });
    fireEvent.pointerDown(button, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(button, { clientX: 200, clientY: 120, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(button, { clientX: 200, clientY: 120, pointerId: 1 });
    fireEvent.click(button);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'a', x: 50, y: 20 })]);
    expect(onOpenPlace).not.toHaveBeenCalled();
  });

  it('moves a pin with the arrow keys, and adds one without a mouse', () => {
    const { onChange } = show([pin()]);
    fireEvent.click(screen.getByRole('button', { name: 'Place pins' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit the pin: The Old Well' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ x: 26, y: 50 })]);
    fireEvent.click(screen.getByRole('button', { name: '+ Pin in the middle' }));
    expect(onChange).toHaveBeenLastCalledWith([pin(), expect.objectContaining({ x: 50, y: 50 })]);
  });

  it('only opens places on a locked map', () => {
    const { onOpenPlace } = show([pin()], { disabled: true });
    expect(screen.queryByRole('button', { name: 'Place pins' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open The Old Well' }));
    expect(onOpenPlace).toHaveBeenCalledWith('p1');
  });
});
