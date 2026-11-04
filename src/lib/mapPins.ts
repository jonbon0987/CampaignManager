// Pins on a place's map. Each marks a spot, as a percentage of the map so it
// stays put however the map is drawn, and names a place or just a label. Pure;
// the list is stored on the place.

export interface MapPin {
  id: string;
  x: number;
  y: number;
  place_id: string | null;
  label: string | null;
}

export const MAX_PINS = 200;

const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;

/** The pins stored on a place, leaving out anything that isn't one. */
export function pinsOf(stored: unknown): MapPin[] {
  if (!Array.isArray(stored)) return [];
  return stored.flatMap(p => {
    const o = (p ?? {}) as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.x !== 'number' || typeof o.y !== 'number') return [];
    return [{
      id: o.id, x: clamp(o.x), y: clamp(o.y),
      place_id: typeof o.place_id === 'string' ? o.place_id : null,
      label: typeof o.label === 'string' && o.label.trim() ? o.label : null,
    }];
  });
}

/** A click on the map, as a pin position: where it fell within the map's box. */
export function pointOnMap(clientX: number, clientY: number, box: { left: number; top: number; width: number; height: number }): { x: number; y: number } | null {
  if (box.width <= 0 || box.height <= 0) return null;
  return { x: clamp(((clientX - box.left) / box.width) * 100), y: clamp(((clientY - box.top) / box.height) * 100) };
}

export const movePin = (pins: MapPin[], id: string, x: number, y: number): MapPin[] =>
  pins.map(p => (p.id === id ? { ...p, x: clamp(x), y: clamp(y) } : p));

export const updatePin = (pins: MapPin[], id: string, patch: Partial<Pick<MapPin, 'place_id' | 'label'>>): MapPin[] =>
  pins.map(p => (p.id === id ? { ...p, ...patch } : p));

export const removePin = (pins: MapPin[], id: string): MapPin[] => pins.filter(p => p.id !== id);
