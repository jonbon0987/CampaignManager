// "Export campaign": packs the campaign into a .zip the DM keeps, with
// readable Markdown, campaign.json holding every field, and its pictures.
// Shown in Campaign settings, and as a dialog from the sidebar menu and ⌘K.

import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useToast } from '../../context/ToastContext';
import type { ExportProgress } from '../../lib/campaignExport';
import { Modal } from '../Modal';
import { Button } from '../ui/Button';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function progressLabel(p: ExportProgress): string {
  if (p.step === 'records') return 'Gathering records…';
  if (p.step === 'pictures') return p.total ? `Fetching pictures, ${p.done ?? 0} of ${p.total}…` : 'Fetching pictures…';
  return 'Packing…';
}

type State =
  | { kind: 'idle' }
  | { kind: 'working'; progress: ExportProgress }
  | { kind: 'done'; fileName: string; size: number; missing: number };

export function ExportCampaignPanel() {
  const { selectedCampaign } = useCampaign();
  const toast = useToast();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const working = state.kind === 'working';

  const run = async () => {
    if (!selectedCampaign || working) return;
    setState({ kind: 'working', progress: { step: 'records' } });
    try {
      // The zip code loads only when someone exports.
      const { exportCampaign, saveFile } = await import('../../lib/campaignExport');
      const out = await exportCampaign(selectedCampaign.id, progress => setState({ kind: 'working', progress }));
      saveFile(out.blob, out.fileName);
      setState({ kind: 'done', fileName: out.fileName, size: out.blob.size, missing: out.missingPictures });
    } catch (e) {
      toast(`Couldn’t export: ${errorMessage(e)}`, 'error');
      setState({ kind: 'idle' });
    }
  };

  return (
    <div className="ex">
      <p className="ex-note">
        A .zip to keep: the campaign as readable Markdown, one file per part (Party, Cast, Places, Sessions…),
        a <code>campaign.json</code> with every field of every record, and its pictures. Transcripts are included; audio isn’t.
      </p>
      <div className="ex-row">
        <Button variant="primary" size="sm" onClick={() => void run()} disabled={working || !selectedCampaign}>
          {working ? 'Exporting…' : 'Download .zip'}
        </Button>
        <span className="ex-status" role="status">
          {state.kind === 'working' && progressLabel(state.progress)}
          {state.kind === 'done' && `Saved ${state.fileName} (${sizeLabel(state.size)}).`}
        </span>
      </div>
      {state.kind === 'done' && state.missing > 0 && (
        <p className="ex-warn">{state.missing} picture{state.missing === 1 ? '' : 's'} couldn’t be fetched and {state.missing === 1 ? 'is' : 'are'} missing from it.</p>
      )}
    </div>
  );
}

export function ExportCampaignDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal isOpen onClose={onClose} title="Export campaign"
      footer={<div className="ex-foot"><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div>}>
      <ExportCampaignPanel />
    </Modal>
  );
}
