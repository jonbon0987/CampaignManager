import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SaveStatusIndicator } from './SaveStatusIndicator';
import type { SaveStatus } from '../../hooks/useAutoSave';

describe('SaveStatusIndicator', () => {
  it('renders nothing when idle', () => {
    const { container } = render(<SaveStatusIndicator status="idle" />);
    expect(container.firstChild).toBeNull();
  });

  it.each([
    ['saved', 'Saved'],
    ['saving', 'Saving...'],
    ['unsaved', 'Unsaved changes'],
    ['error', 'Save failed'],
  ] as [SaveStatus, string][])('shows the "%s" label', (status, label) => {
    render(<SaveStatusIndicator status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('shows a Retry button on error and calls onRetry when clicked', () => {
    const onRetry = vi.fn();
    render(<SaveStatusIndicator status="error" onRetry={onRetry} />);
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits Retry on error when no handler is provided', () => {
    render(<SaveStatusIndicator status="error" />);
    expect(screen.queryByText('Retry')).toBeNull();
  });

  it('omits Retry for non-error statuses even with a handler', () => {
    render(<SaveStatusIndicator status="saved" onRetry={() => {}} />);
    expect(screen.queryByText('Retry')).toBeNull();
  });
});
