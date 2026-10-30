import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharCounter } from './CharCounter';

describe('CharCounter', () => {
  it('renders nothing when no limit is given', () => {
    const { container } = render(<CharCounter value="hello" />);
    expect(container.firstChild).toBeNull();
  });

  it('stays hidden until the field is nearly full', () => {
    const { container } = render(<CharCounter value={'x'.repeat(79)} limit={100} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows "count / limit" once the field is nearly full', () => {
    render(<CharCounter value={'x'.repeat(85)} limit={100} />);
    expect(screen.getByText('85 / 100')).toBeTruthy();
  });

  it('is not "over" at exactly the limit', () => {
    render(<CharCounter value={'x'.repeat(100)} limit={100} />);
    expect(screen.getByText('100 / 100')).toBeTruthy();
  });

  it('formats large counts/limits with locale separators', () => {
    render(<CharCounter value={'x'.repeat(7234)} limit={8000} />);
    const expected = `${(7234).toLocaleString()} / ${(8000).toLocaleString()}`;
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it('flips to "N over limit" in red once exceeded', () => {
    render(<CharCounter value={'x'.repeat(150)} limit={100} />);
    const el = screen.getByText('50 over limit') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.style.color).toBe('var(--red)');
  });

  it('uses the muted color while under the limit', () => {
    render(<CharCounter value={'x'.repeat(90)} limit={100} />);
    expect((screen.getByText('90 / 100') as HTMLElement).style.color).toBe('var(--ink-3)');
  });

  it('appends a custom className to its own', () => {
    const { container } = render(<CharCounter value="abcdefghi" limit={10} className="mine" />);
    const cls = (container.firstChild as HTMLElement).className;
    expect(cls).toContain('cm-char-counter');
    expect(cls).toContain('mine');
  });
});
