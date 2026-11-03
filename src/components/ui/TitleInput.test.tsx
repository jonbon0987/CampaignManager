import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TitleInput } from './TitleInput';

function Harness({ onValue }: { onValue?: (v: string) => void }) {
  const [v, setV] = useState('Gorval');
  return <TitleInput value={v} aria-label="Title" onChange={e => { setV(e.target.value); onValue?.(e.target.value); }} />;
}

describe('TitleInput', () => {
  it('is a one-row textarea with the title class, so long names wrap', () => {
    render(<Harness />);
    const field = screen.getByRole('textbox', { name: 'Title' });
    expect(field.tagName).toBe('TEXTAREA');
    expect(field.getAttribute('rows')).toBe('1');
    expect(field.className).toBe('as-title');
  });

  it('turns pasted line breaks into spaces', () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: "Gorval Ironhand's\nDisappearance" } });
    expect(onValue).toHaveBeenLastCalledWith("Gorval Ironhand's Disappearance");
    expect((screen.getByRole('textbox', { name: 'Title' }) as HTMLTextAreaElement).value).toBe("Gorval Ironhand's Disappearance");
  });

  it('doesn’t add a line on Enter', () => {
    render(<Harness />);
    const field = screen.getByRole('textbox', { name: 'Title' });
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    field.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
  });
});
