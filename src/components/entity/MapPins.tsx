// A place's map with pins on it. Click a pin to open the place it marks. In
// "Place pins", a click on the map drops a pin, a pin can be dragged, and its
// place, label or removal are a click away.

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import { SearchableSelect } from '../ui/SearchableSelect';
import { MAX_PINS, movePin, pointOnMap, removePin, updatePin, type MapPin } from '../../lib/mapPins';
import { limitFor } from '../../lib/fieldLimits';

export interface PinPlace { id: string; label: string; detail?: string }

const NUDGE: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

export function MapPins({ url, pins, onChange, places, disabled, onOpenPlace, onViewFull }: {
  url: string | null;
  pins: MapPin[];
  onChange: (pins: MapPin[]) => void;
  /** Places a pin can mark. */
  places: PinPlace[];
  disabled?: boolean;
  onOpenPlace?: (id: string) => void;
  onViewFull: () => void;
}) {
  const map = useRef<HTMLDivElement>(null);
  const [placing, setPlacing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // While a pin is dragged it's drawn here, and saved once when it's let go.
  const [dragged, setDragged] = useState<{ id: string; x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  const editing = placing && !disabled;
  const nameOf = (p: MapPin) => (p.place_id ? places.find(o => o.id === p.place_id)?.label ?? 'A deleted place' : p.label) || 'Unnamed pin';
  const selected = editing ? pins.find(p => p.id === selectedId) ?? null : null;
  const at = (e: { clientX: number; clientY: number }) => (map.current ? pointOnMap(e.clientX, e.clientY, map.current.getBoundingClientRect()) : null);

  const addPin = (x: number, y: number) => {
    if (pins.length >= MAX_PINS) return;
    const pin: MapPin = { id: crypto.randomUUID(), x, y, place_id: null, label: null };
    onChange([...pins, pin]);
    setSelectedId(pin.id);
  };

  const dropOnMap = (e: React.MouseEvent) => {
    // A drag let go over the map isn't a click on it.
    if (moved.current) { moved.current = false; return; }
    if (!editing || (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('mp-img'))) return;
    const point = at(e);
    if (point) addPin(point.x, point.y);
  };

  const grab = (p: MapPin) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!editing) return;
    start.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragged({ id: p.id, x: p.x, y: p.y });
  };
  const drag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragged || !start.current) return;
    if (Math.abs(e.clientX - start.current.x) + Math.abs(e.clientY - start.current.y) < 4) return;
    moved.current = true;
    const point = at(e);
    if (point) setDragged({ id: dragged.id, ...point });
  };
  const letGo = () => {
    if (dragged && moved.current) onChange(movePin(pins, dragged.id, dragged.x, dragged.y));
    setDragged(null);
    start.current = null;
  };

  const clickPin = (p: MapPin) => {
    if (moved.current) { moved.current = false; return; }
    if (editing) setSelectedId(p.id);
    else if (p.place_id && onOpenPlace && places.some(o => o.id === p.place_id)) onOpenPlace(p.place_id);
  };

  const nudge = (p: MapPin) => (e: React.KeyboardEvent) => {
    const step = NUDGE[e.key];
    if (!editing || !step) return;
    e.preventDefault();
    onChange(movePin(pins, p.id, p.x + step[0], p.y + step[1]));
  };

  return (
    <div className="mp">
      <div className="mp-bar">
        {!disabled && (
          <Button size="xs" variant="secondary" aria-pressed={placing} onClick={() => { setPlacing(v => !v); setSelectedId(null); }}>
            {placing ? 'Done placing' : 'Place pins'}
          </Button>
        )}
        {editing && <Button size="xs" variant="ghost" onClick={() => addPin(50, 50)} disabled={pins.length >= MAX_PINS}>+ Pin in the middle</Button>}
        <span className="as-hint mp-hint">
          {editing ? 'Click the map to drop a pin. Drag one to move it, or use the arrow keys.'
            : pins.length ? 'Click a pin to open the place it marks.' : ''}
        </span>
        <Button size="xs" variant="ghost" onClick={onViewFull} disabled={!url}>View full size</Button>
      </div>

      <div ref={map} className={`mp-map${editing ? ' is-placing' : ''}`} onClick={dropOnMap}>
        {url ? <img className="mp-img" src={url} alt="Map" draggable={false} /> : <span className="img-slot-note mp-loading">Loading…</span>}
        {url && pins.map(p => {
          const pos = dragged?.id === p.id ? dragged : p;
          const name = nameOf(p);
          return (
            <button key={p.id} type="button" className={`mp-pin${selectedId === p.id && editing ? ' is-selected' : ''}`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }} aria-label={editing ? `Edit the pin: ${name}` : p.place_id ? `Open ${name}` : name}
              onPointerDown={grab(p)} onPointerMove={drag} onPointerUp={letGo} onPointerCancel={letGo}
              onClick={e => { e.stopPropagation(); clickPin(p); }} onKeyDown={nudge(p)}>
              <span className="mp-pin-mark" aria-hidden>✦</span>
              <span className="mp-pin-name" aria-hidden>{name}</span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mp-edit" role="group" aria-label="This pin">
          <div className="mp-edit-field">
            <span className="as-ll">Marks</span>
            <SearchableSelect value={selected.place_id} onChange={id => onChange(updatePin(pins, selected.id, { place_id: id }))} options={places}
              placeholder="Pick a place…" searchPlaceholder="Search places…" />
          </div>
          {!selected.place_id && (
            <div className="mp-edit-field">
              <label className="as-ll" htmlFor={`pin-label-${selected.id}`}>Or a label</label>
              <input id={`pin-label-${selected.id}`} className="as-input" value={selected.label ?? ''} placeholder="The old well"
                maxLength={limitFor('locations', 'name')} onChange={e => onChange(updatePin(pins, selected.id, { label: e.target.value || null }))} />
            </div>
          )}
          <Button size="xs" variant="ghost" onClick={() => { onChange(removePin(pins, selected.id)); setSelectedId(null); }}>
            <X size={12} /> Remove pin
          </Button>
        </div>
      )}
    </div>
  );
}
