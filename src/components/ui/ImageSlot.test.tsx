import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn(), confirm: vi.fn() }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => h.confirm }));
vi.mock('../../lib/db', () => ({ EntityImages: { remove: h.remove } }));
vi.mock('../../lib/images', () => ({ IMAGE_ACCEPT: 'image/png', uploadImage: h.upload }));
vi.mock('../../hooks/useImageUrl', () => ({ useImageUrl: (p: string | null) => (p ? `https://signed/${p}` : null) }));

import { ImageSlot } from './ImageSlot';

const file = new File(['x'], 'face.png', { type: 'image/png' });
const pick = () => fireEvent.change(screen.getByLabelText('Upload a portrait'), { target: { files: [file] } });

describe('ImageSlot', () => {
  beforeEach(() => {
    h.upload.mockReset().mockResolvedValue('u/new.webp');
    h.remove.mockReset().mockResolvedValue(undefined);
    h.confirm.mockReset().mockResolvedValue(true);
  });

  it('uploads a picked picture and sets its path', async () => {
    const onChange = vi.fn();
    render(<ImageSlot path={null} onChange={onChange} label="Portrait" />);
    expect(screen.getByRole('button', { name: '+ Portrait' })).toBeTruthy();
    pick();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('u/new.webp'));
    expect(h.upload).toHaveBeenCalledWith(file);
    expect(h.remove).not.toHaveBeenCalled();
  });

  it('replacing a picture removes the old one from storage', async () => {
    const onChange = vi.fn();
    render(<ImageSlot path="u/old.webp" onChange={onChange} label="Portrait" />);
    pick();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('u/new.webp'));
    expect(h.remove).toHaveBeenCalledWith(['u/old.webp']);
  });

  it('removing a picture asks first, then clears the path and deletes the file', async () => {
    const onChange = vi.fn();
    render(<ImageSlot path="u/old.webp" onChange={onChange} label="Portrait" />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
    expect(h.confirm).toHaveBeenCalledWith(expect.stringMatching(/Remove the portrait\?/));
    expect(h.remove).toHaveBeenCalledWith(['u/old.webp']);
  });

  it('keeps the picture when the removal is cancelled', async () => {
    h.confirm.mockResolvedValue(false);
    const onChange = vi.fn();
    render(<ImageSlot path="u/old.webp" onChange={onChange} label="Portrait" />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
  });

  it('says why an upload failed and keeps the picture it had', async () => {
    h.upload.mockRejectedValue(new Error('That isn’t an image the app can keep.'));
    const onChange = vi.fn();
    render(<ImageSlot path="u/old.webp" onChange={onChange} label="Portrait" />);
    pick();
    expect((await screen.findByRole('alert')).textContent).toMatch(/isn’t an image/);
    expect(onChange).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
  });

  it('a locked record shows its picture but offers no changes', () => {
    const { rerender } = render(<ImageSlot path="u/old.webp" onChange={vi.fn()} label="Portrait" disabled />);
    expect(screen.queryByRole('button', { name: 'Replace' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    rerender(<ImageSlot path={null} onChange={vi.fn()} label="Portrait" disabled />);
    expect((screen.getByRole('button', { name: '+ Portrait' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('clicking the picture shows it full-screen until Esc', () => {
    render(<ImageSlot path="u/map.webp" onChange={vi.fn()} label="Map" shape="wide" />);
    fireEvent.click(screen.getByRole('button', { name: 'View the map' }));
    const box = screen.getByRole('dialog', { name: 'Map' });
    expect(box.querySelector('img')?.getAttribute('src')).toBe('https://signed/u/map.webp');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
