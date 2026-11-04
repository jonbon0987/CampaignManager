import { describe, it, expect } from 'vitest';
import { movePin, pinsOf, pointOnMap, removePin, updatePin, type MapPin } from './mapPins';

const pin = (over: Partial<MapPin> = {}): MapPin => ({ id: 'a', x: 10, y: 20, place_id: null, label: null, ...over });

describe('map pins', () => {
  it('reads stored pins, leaving out anything that isn’t one', () => {
    expect(pinsOf(null)).toEqual([]);
    expect(pinsOf('nope')).toEqual([]);
    expect(pinsOf([{ id: 'a', x: 150, y: -4, place_id: 'p1', label: '  ' }, { id: 'b' }, null, { x: 1, y: 2 }]))
      .toEqual([{ id: 'a', x: 100, y: 0, place_id: 'p1', label: null }]);
  });

  it('turns a click into a percentage of the map', () => {
    expect(pointOnMap(150, 100, { left: 100, top: 50, width: 200, height: 100 })).toEqual({ x: 25, y: 50 });
    expect(pointOnMap(999, 0, { left: 0, top: 10, width: 100, height: 100 })).toEqual({ x: 100, y: 0 });
  });

  it('has no point on a map that isn’t drawn yet', () => {
    expect(pointOnMap(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
  });

  it('moves, names and removes one pin', () => {
    const pins = [pin(), pin({ id: 'b' })];
    expect(movePin(pins, 'b', 50.123, 120)[1]).toMatchObject({ x: 50.12, y: 100 });
    expect(movePin(pins, 'b', 50, 50)[0]).toEqual(pins[0]);
    expect(updatePin(pins, 'a', { place_id: 'p1' })[0].place_id).toBe('p1');
    expect(removePin(pins, 'a').map(p => p.id)).toEqual(['b']);
  });
});
