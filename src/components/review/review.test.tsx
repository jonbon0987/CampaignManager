import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChangeCard, type ChangeView } from './ChangeCard';
import { ReviewTally } from './ReviewTally';

const view = (over: Partial<ChangeView> = {}): ChangeView => ({
  glyph: '❦', color: 'var(--link-npc)', kindLabel: 'NPC', name: 'Brenna Coldwater', tone: 'update',
  changes: [{ label: 'Status', before: 'active', after: 'deceased' }], ...over,
});

describe('ChangeCard', () => {
  it('shows what the change does, field by field', () => {
    render(<ChangeCard view={view({ body: { label: 'Adds to description', text: 'Drowned at the docks.' }, history: 'Found at the docks.' })} state="pending" />);
    expect(screen.getByText('Brenna Coldwater')).toBeTruthy();
    expect(screen.getByText('Update')).toBeTruthy();
    expect(screen.getByText('active').className).toContain('rv-before');
    expect(screen.getByText('deceased').className).toContain('rv-after');
    expect(screen.getByText('Drowned at the docks.')).toBeTruthy();
    expect(screen.getByText('Found at the docks.')).toBeTruthy();
  });

  it('collapses in the narrow rail, and opens from its head', () => {
    const onToggleOpen = vi.fn();
    render(<ChangeCard view={view()} state="accepted" open={false} onToggleOpen={onToggleOpen} />);
    expect(screen.queryByText('deceased')).toBeNull();
    fireEvent.click(screen.getByText('Brenna Coldwater'));
    expect(onToggleOpen).toHaveBeenCalled();
  });

  it('keeps clicks on its controls from selecting the card', () => {
    const onSelect = vi.fn();
    const onAccept = vi.fn();
    render(<ChangeCard view={view()} state="pending" onSelect={onSelect} actions={<button onClick={onAccept}>Accept</button>} />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onAccept).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('says when a change was applied, edited, or is a delete', () => {
    const { rerender } = render(<ChangeCard view={view()} state="applied" edited />);
    expect(screen.getByText('✓ Applied')).toBeTruthy();
    expect(screen.getByText('✎ Edited')).toBeTruthy();
    rerender(<ChangeCard view={view({ tone: 'delete', changes: [] })} state="accepted" />);
    expect(screen.getByText('This record will be deleted.')).toBeTruthy();
  });

  it('replaces its body with what the caller passes, such as an edit form', () => {
    render(<ChangeCard view={view()} state="pending"><p>Editing…</p></ChangeCard>);
    expect(screen.getByText('Editing…')).toBeTruthy();
    expect(screen.queryByText('deceased')).toBeNull();
  });
});

describe('ReviewTally', () => {
  it('says what will be written and what is still to decide', () => {
    const { container } = render(<ReviewTally items={[
      { state: 'accepted', tone: 'new' }, { state: 'accepted', tone: 'update' }, { state: 'pending', tone: 'note' },
      { state: 'skipped', tone: 'update' }, { state: 'applied', tone: 'new' },
    ]} />);
    expect(container.textContent).toBe('2 to apply (1 new, 1 update) · 1 to review · 1 skipped · 1 applied');
  });

  it('flags deletes', () => {
    const { container } = render(<ReviewTally items={[{ state: 'accepted', tone: 'delete' }]} />);
    expect(container.textContent).toBe('1 to apply (1 delete)');
    expect(container.querySelector('.is-delete')).toBeTruthy();
  });
});
