import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeCampaignContext, makeToast } from '../../test/contextMocks';

const h = vi.hoisted(() => ({
  campaign: { value: null as unknown },
  toast: vi.fn(),
  exportCampaign: vi.fn(),
  saveFile: vi.fn(),
}));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => h.toast }));
vi.mock('../../lib/campaignExport', () => ({ exportCampaign: h.exportCampaign, saveFile: h.saveFile }));

import { ExportCampaignDialog, ExportCampaignPanel } from './ExportCampaign';

beforeEach(() => {
  vi.clearAllMocks();
  h.toast = makeToast();
  h.campaign.value = makeCampaignContext({ selectedCampaign: { id: 'c1', name: 'shadows' } });
});

describe('ExportCampaignPanel', () => {
  it('shows each step, then saves the zip and says how big it is', async () => {
    let finish!: () => void;
    const blob = new Blob(['x'.repeat(2048)]);
    h.exportCampaign.mockImplementation(async (_id: string, progress: (p: object) => void) => {
      progress({ step: 'pictures', done: 1, total: 3 });
      await new Promise<void>(r => { finish = r; });
      return { fileName: 'shadows-2026-11-02.zip', blob, pictures: 3, missingPictures: 0 };
    });
    render(<ExportCampaignPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Download .zip' }));
    expect(await screen.findByText('Fetching pictures, 1 of 3…')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Exporting…' }) as HTMLButtonElement).disabled).toBe(true);
    finish();
    expect(await screen.findByText('Saved shadows-2026-11-02.zip (2 KB).')).toBeTruthy();
    expect(h.exportCampaign).toHaveBeenCalledWith('c1', expect.any(Function));
    expect(h.saveFile).toHaveBeenCalledWith(blob, 'shadows-2026-11-02.zip');
  });

  it('says when pictures are missing from it', async () => {
    h.exportCampaign.mockResolvedValue({ fileName: 'a.zip', blob: new Blob(['x']), pictures: 1, missingPictures: 2 });
    render(<ExportCampaignPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Download .zip' }));
    expect(await screen.findByText('2 pictures couldn’t be fetched and are missing from it.')).toBeTruthy();
  });

  it('says so when the export fails, and lets the DM try again', async () => {
    h.exportCampaign.mockRejectedValue(new Error('offline'));
    render(<ExportCampaignPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Download .zip' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Couldn’t export: offline', 'error'));
    expect(h.saveFile).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Download .zip' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('ExportCampaignDialog', () => {
  it('opens with the panel and closes', () => {
    const onClose = vi.fn();
    render(<ExportCampaignDialog onClose={onClose} />);
    expect(screen.getByText('Export campaign')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download .zip' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
