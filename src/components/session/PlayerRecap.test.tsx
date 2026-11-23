import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeSession } from '../../test/fixtures';
import type { PlayerRecapStatus } from '../../lib/database.types';

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  confirm: vi.fn(),
  getBySession: vi.fn(),
  saveFile: vi.fn(),
  writeRecap: vi.fn(),
  recapFor: vi.fn(),
  entryFor: vi.fn(),
  shares: { value: null as Record<string, unknown> | null },
  discord: { on: false },
}));
vi.mock('../../context/ToastContext', () => ({ useToast: () => h.toast }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => h.confirm }));
vi.mock('../../context/RecordingContext', () => ({ useRecording: () => ({ version: 0 }) }));
vi.mock('../../context/playerShares', () => ({ usePlayerShares: () => h.shares.value }));
vi.mock('../../context/ChroniclePipelineContext', () => ({
  useChroniclePipelineMaybe: () => ({ entryFor: h.entryFor, recapFor: h.recapFor, writeRecap: h.writeRecap }),
}));
vi.mock('../../lib/db', () => ({ SessionRecordings: { getBySession: h.getBySession } }));
vi.mock('../../lib/saveFile', () => ({ saveFile: h.saveFile }));
vi.mock('../../lib/features', () => ({ get PLAYER_RECAP_DISCORD() { return h.discord.on; } }));
vi.mock('../ui/SlashField', () => ({
  SlashField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Player recap text" value={value} onChange={e => onChange(e.target.value)} />
  ),
}));
vi.mock('./PostRecapModal', () => ({ PostRecapModal: ({ title, text }: { title: string; text: string }) => <div role="dialog" aria-label={title}>{text}</div> }));

import { PlayerRecap } from './PlayerRecap';

const session = makeSession({ id: 's4', session_number: 4, title: 'The Drowned Bell' });
const RECAP = '### At the ford\n\n- The party reached the ford.\n  > “You will not take me alive” — Brenna';
const transcribed = { id: 'r1', session_id: 's4', status: 'applied' };

function show(value: string | null, status: PlayerRecapStatus | null = value ? 'draft' : null) {
  const onChange = vi.fn();
  const onStatus = vi.fn();
  render(<PlayerRecap session={session} value={value} status={status} onChange={onChange} onStatus={onStatus} />);
  return { onChange, onStatus };
}

beforeEach(() => {
  Object.values(h).forEach(v => { if (typeof v === 'function') v.mockReset(); });
  h.getBySession.mockResolvedValue([transcribed]);
  h.writeRecap.mockResolvedValue(undefined);
  h.shares.value = { page: { enabled: true } };
  h.discord.on = false;
});

describe('PlayerRecap', () => {
  it('offers to write one from a transcribed recording', async () => {
    show(null);
    fireEvent.click(await screen.findByRole('button', { name: 'Write it from the recording' }));
    await waitFor(() => expect(h.writeRecap).toHaveBeenCalledWith(transcribed));
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it('explains it without a button when nothing has been transcribed', async () => {
    h.getBySession.mockResolvedValue([{ id: 'r1', session_id: 's4', status: 'processing' }]);
    show(null);
    expect(screen.getByText(/stays a draft until you publish it/)).toBeTruthy();
    await waitFor(() => expect(h.getBySession).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Write it from the recording' })).toBeNull();
  });

  it('says when it’s being written, and why it failed', () => {
    h.recapFor.mockReturnValue({ writing: true, error: null });
    const { unmount } = render(<PlayerRecap session={session} value={null} status={null} onChange={vi.fn()} onStatus={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toMatch(/Writing the player recap/);
    unmount();
    h.recapFor.mockReturnValue({ writing: false, error: 'Gemini is busy.' });
    show(null);
    expect(screen.getByRole('alert').textContent).toMatch(/Gemini is busy/);
  });

  it('makes a rewrite plain: a banner, the old one faded and locked, and no second rewrite', () => {
    h.recapFor.mockReturnValue({ writing: true, error: null });
    const { container } = render(<PlayerRecap session={session} value={RECAP} status="draft" onChange={vi.fn()} onStatus={vi.fn()} />);
    expect(screen.getByText('Rewriting…')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/Rewriting the player recap from the recording… A minute or two\. The new one replaces this/);
    const body = container.querySelector('.prc-body') as HTMLElement;
    expect(body.className).toContain('is-busy');
    expect(body.getAttribute('aria-busy')).toBe('true');
    for (const name of ['Publish to the player page', 'Edit', 'Copy text']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Write it again from the recording' })).toBeNull();
  });

  it('shows a draft for the DM to read, and publishes it', () => {
    const { onStatus } = show(RECAP);
    expect(screen.getByText('Draft · only you can see it')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'At the ford' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Publish to the player page' }));
    expect(onStatus).toHaveBeenCalledWith('published');
  });

  it('takes a published one off the player page', () => {
    const { onStatus } = show(RECAP, 'published');
    expect(screen.getByText('On the player page')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    expect(onStatus).toHaveBeenCalledWith('draft');
  });

  it('can’t publish before there’s a player page', () => {
    h.shares.value = { page: null };
    show(RECAP);
    expect((screen.getByRole('button', { name: 'Publish to the player page' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Make the player page on the Overview to publish it there.')).toBeTruthy();
  });

  it('edits the text', () => {
    const { onChange } = show(RECAP);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Player recap text'), { target: { value: '### Changed' } });
    expect(onChange).toHaveBeenCalledWith('### Changed');
    expect(screen.getByRole('button', { name: 'Done editing' })).toBeTruthy();
  });

  it('copies it as plain text under its heading', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    show(RECAP);
    fireEvent.click(screen.getByRole('button', { name: 'Copy text' }));
    expect(writeText).toHaveBeenCalledWith('Session 4 · The Drowned Bell\n\nAT THE FORD\n\n• The party reached the ford.\n    “You will not take me alive” — Brenna');
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Copied', 'success'));
  });

  it('downloads it as Markdown', async () => {
    show(RECAP);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download as Markdown' }));
    const [blob, name] = h.saveFile.mock.calls[0] as [Blob, string];
    expect(name).toBe('session-4-the-drowned-bell-recap.md');
    expect(await blob.text()).toBe(`# Session 4 · The Drowned Bell\n\n${RECAP}\n`);
  });

  it('opens a page to print or save as a PDF', () => {
    show(RECAP);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Print or save as PDF' }));
    const sheet = screen.getByRole('dialog', { name: 'Player recap' });
    expect(sheet.querySelector('h1')?.textContent).toBe('The Drowned Bell');
    expect(sheet.textContent).toContain('At the ford');
  });

  it('asks before writing it again over the one there', async () => {
    h.confirm.mockResolvedValue(true);
    show(RECAP);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Write it again from the recording' }));
    await waitFor(() => expect(h.writeRecap).toHaveBeenCalledWith(transcribed));
    expect(h.confirm).toHaveBeenCalledTimes(1);
  });

  it('has no Discord post until that’s turned on', async () => {
    show(RECAP);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Write it again from the recording' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Post to Discord' })).toBeNull();
  });

  it('posts it to Discord when turned on', async () => {
    h.discord.on = true;
    show(RECAP);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Post to Discord' }));
    const dialog = screen.getByRole('dialog', { name: 'Post the player recap to Discord' });
    expect(dialog.textContent).toMatch(/^\*\*Session 4 · The Drowned Bell\*\*/);
  });
});
