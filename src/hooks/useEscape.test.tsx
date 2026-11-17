import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useEscape } from './useEscape';

function Probe({ active, onEscape }: { active: boolean; onEscape: () => void }) {
  useEscape(active, onEscape);
  return (
    <input aria-label="field" onKeyDown={e => { if (e.key === 'Escape' && e.currentTarget.value) e.preventDefault(); }} />
  );
}

describe('useEscape', () => {
  it('calls back on Escape while active, and not when inactive', () => {
    const onEscape = vi.fn();
    const { rerender, getByLabelText } = render(<Probe active onEscape={onEscape} />);
    fireEvent.keyDown(getByLabelText('field'), { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
    rerender(<Probe active={false} onEscape={onEscape} />);
    fireEvent.keyDown(getByLabelText('field'), { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('leaves an Escape that a control inside already handled', () => {
    const onEscape = vi.fn();
    const { getByLabelText } = render(<Probe active onEscape={onEscape} />);
    const field = getByLabelText('field') as HTMLInputElement;
    field.value = 'open menu';
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onEscape).not.toHaveBeenCalled();
  });
});
