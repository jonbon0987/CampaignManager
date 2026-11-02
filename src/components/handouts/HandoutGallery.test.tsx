import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../lib/images', () => ({ IMAGE_ACCEPT: 'image/png' }));
vi.mock('../../hooks/useImageUrl', () => ({ useImageUrl: (p: string | null) => (p ? `https://signed/${p}` : null) }));

import { HandoutGallery } from './HandoutGallery';
import type { Handout } from '../../lib/database.types';

const handout = (id: string, title: string): Handout => ({
  id, user_id: 'u', campaign_id: 'c1', scene_id: 's1', title, image_path: `u/${id}.webp`, sort_order: 0,
  created_at: '', updated_at: '',
});
const letter = handout('h1', 'The ransom letter');
const map = handout('h2', '');

describe('HandoutGallery', () => {
  it('says it is loading until the handouts arrive', () => {
    render(<HandoutGallery handouts={null} />);
    expect(screen.getByText('Loading handouts…')).toBeTruthy();
  });

  it('shows the empty note only when asked to', () => {
    const { rerender } = render(<HandoutGallery handouts={[]} empty="No handouts yet." />);
    expect(screen.getByText('No handouts yet.')).toBeTruthy();
    rerender(<HandoutGallery handouts={[]} />);
    expect(screen.queryByText('No handouts yet.')).toBeNull();
  });

  it('read-only, shows titles as text with nothing to change', () => {
    render(<HandoutGallery handouts={[letter, map]} />);
    expect(screen.getByText('The ransom letter')).toBeTruthy();
    expect(screen.getByText('Untitled handout')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
    expect(screen.queryByRole('button', { name: '+ Add handout' })).toBeNull();
  });

  it('clicking a handout shows it full-screen to the table', () => {
    render(<HandoutGallery handouts={[letter]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show The ransom letter' }));
    const box = screen.getByRole('dialog', { name: 'The ransom letter' });
    expect(box.querySelector('img')?.getAttribute('src')).toBe('https://signed/u/h1.webp');
    fireEvent.click(box);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renames a handout when its title loses focus, trimmed', () => {
    const onRename = vi.fn();
    render(<HandoutGallery handouts={[letter]} onRename={onRename} />);
    const title = screen.getByRole('textbox', { name: 'Handout title' });
    fireEvent.change(title, { target: { value: '  The forged letter ' } });
    fireEvent.blur(title);
    expect(onRename).toHaveBeenCalledWith(letter, 'The forged letter');
  });

  it('removes a handout', () => {
    const onRemove = vi.fn();
    render(<HandoutGallery handouts={[letter]} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove The ransom letter' }));
    expect(onRemove).toHaveBeenCalledWith(letter);
  });

  it('adds every file picked at once', () => {
    const onAdd = vi.fn();
    render(<HandoutGallery handouts={[]} onAdd={onAdd} />);
    const files = [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' })];
    fireEvent.change(screen.getByLabelText('Upload handouts'), { target: { files } });
    expect(onAdd).toHaveBeenCalledWith(files);
  });

  it('holds the add button while uploading', () => {
    render(<HandoutGallery handouts={[]} onAdd={vi.fn()} adding />);
    expect((screen.getByRole('button', { name: 'Uploading…' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
