import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AppTopbar, { type Crumb } from './AppTopbar';

function show(crumbs: Crumb[], isMobile: boolean) {
  render(
    <AppTopbar crumbs={crumbs} isMobile={isMobile} onOpenMobileMenu={vi.fn()} onOpenPalette={vi.fn()}
      onToggleAssistant={vi.fn()} assistantOpen={false} />,
  );
}

describe('AppTopbar breadcrumb', () => {
  const backToWorld = vi.fn();
  const trail: Crumb[] = [{ label: 'Faerûn', onClick: backToWorld }, { label: 'Test' }, { label: 'Home' }];

  it('shows the whole trail on a wide screen, with a way back held in reserve for when the bar narrows', () => {
    show(trail, false);
    expect(screen.getByRole('button', { name: 'Faerûn' })).toBeTruthy();
    expect(screen.getByText('Test')).toBeTruthy();
    expect(screen.getByText('Home')).toBeTruthy();
    // CSS shows it only when the bar is narrow; it's there to show.
    const back = screen.getByRole('button', { name: 'Back to Faerûn' });
    expect(back.className).toContain('cm-top-back');
    fireEvent.click(back);
    expect(backToWorld).toHaveBeenCalled();
  });

  it('shows only the page name on a phone, with a way back to the nearest place above it', () => {
    show(trail, true);
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.queryByText('Test')).toBeNull();
    expect(screen.queryByText('Faerûn')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Faerûn' }));
    expect(backToWorld).toHaveBeenCalled();
  });

  it('offers no way back when there’s nowhere to go', () => {
    show([{ label: 'Faerûn' }, { label: 'Lore' }], true);
    expect(screen.getByText('Lore')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Back to/ })).toBeNull();
  });
});
