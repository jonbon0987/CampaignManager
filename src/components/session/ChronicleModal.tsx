// src/components/session/ChronicleModal.tsx
// -----------------------------------------------------------
// Options for writing a session's chronicle from its transcript, then the
// call that writes it. Nothing in the campaign changes here: the result is a
// set of proposed changes the DM reviews.
// -----------------------------------------------------------

import { useEffect, useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { TranscriptSegments } from '../../lib/db';
import type { SessionRecording } from '../../lib/database.types';
import { formatCampaignContext } from '../../lib/campaignContext';
import { getAIProvider } from '../../lib/aiProvider';
import { writeChronicle, type ChronicleSettings } from '../../lib/recording/transcriptionApi';
import { Modal } from '../Modal';
import { Button } from '../ui/Button';

const DEPTHS: { id: ChronicleSettings['depth']; label: string; hint: string }[] = [
  { id: 'brief', label: 'Brief', hint: 'A paragraph, and only what mattered.' },
  { id: 'standard', label: 'Standard', hint: 'A few paragraphs, every named person and place.' },
  { id: 'thorough', label: 'Thorough', hint: 'Scene by scene, including minor details.' },
];

export function ChronicleModal({ recording, rewrite, onClose, onOpenTranscript, onWritten }: {
  recording: SessionRecording;
  rewrite: boolean;
  onClose: () => void;
  onOpenTranscript: () => void;
  onWritten: (result: { status: SessionRecording['status']; status_detail: string }) => void;
}) {
  const campaign = useCampaign();
  const saved = recording.settings;
  const [settings, setSettings] = useState<ChronicleSettings>({
    depth: saved.depth ?? 'thorough',
    dropTableTalk: saved.dropTableTalk ?? true,
    asidesToDmNotes: saved.asidesToDmNotes ?? true,
  });
  const [unassigned, setUnassigned] = useState<number | null>(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voices nobody has been assigned to: the chronicle can still guess who they
  // are, but it's better when the DM has said.
  useEffect(() => {
    let cancelled = false;
    TranscriptSegments.getByRecording(recording.id).then(segs => {
      if (cancelled) return;
      const voices = new Set(segs.filter(s => !s.dropped_as_echo && !s.is_dm && !s.pc_id).map(s => `${s.track_id}|${s.speaker_label}`));
      setUnassigned(voices.size);
    }).catch(() => setUnassigned(null));
    return () => { cancelled = true; };
  }, [recording.id]);

  const write = async () => {
    setWriting(true);
    setError(null);
    try {
      const context = formatCampaignContext({
        sessions: campaign.sessions, pcs: campaign.pcs, npcs: campaign.npcs, locations: campaign.locations,
        factions: campaign.factions, hooks: campaign.hooks, lore: campaign.lore, modules: campaign.modules,
        overviewTitle: campaign.overview.title, overviewPlot: campaign.overview.plotSummary,
      });
      const result = await writeChronicle(recording.id, context, settings, getAIProvider());
      onWritten(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWriting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={() => { if (!writing) onClose(); }}
      title={rewrite ? 'Rewrite the Chronicle' : 'Write the Chronicle'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={writing}>Cancel</Button>
          <Button variant="primary" onClick={() => void write()} disabled={writing}>
            {writing ? 'Writing… about a minute' : rewrite ? 'Rewrite' : 'Write the chronicle'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-sm" style={{ color: 'var(--ink-2)', margin: 0 }}>
          The transcript is read for a recap, what each character did, the NPCs you met, places, lore, threads and loot.
          Each becomes a proposed change you can edit, accept or skip. Nothing in the campaign changes until you apply.
        </p>

        <div className="flex flex-col gap-2">
          <span className="as-ll">How much detail</span>
          <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="How much detail">
            {DEPTHS.map(d => (
              <Button
                key={d.id}
                size="sm"
                role="radio"
                aria-checked={settings.depth === d.id}
                variant={settings.depth === d.id ? 'primary' : 'secondary'}
                onClick={() => setSettings(s => ({ ...s, depth: d.id }))}
              >
                {d.label}
              </Button>
            ))}
          </div>
          <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{DEPTHS.find(d => d.id === settings.depth)?.hint}</span>
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
            <input type="checkbox" checked={settings.dropTableTalk} onChange={e => setSettings(s => ({ ...s, dropTableTalk: e.target.checked }))} />
            Leave out table talk that isn’t in character (rules lookups, snacks, scheduling)
          </label>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
            <input type="checkbox" checked={settings.asidesToDmNotes} onChange={e => setSettings(s => ({ ...s, asidesToDmNotes: e.target.checked }))} />
            Put anything I said as an aside in DM notes only
          </label>
        </div>

        {unassigned !== null && unassigned > 0 && (
          <div role="status" className="text-sm flex items-center gap-3 flex-wrap" style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn-line)', borderRadius: 'var(--radius)', padding: '10px 12px', color: 'var(--ink)' }}>
            <span style={{ flex: '1 1 240px' }}>
              {unassigned} voice{unassigned === 1 ? ' hasn’t' : 's haven’t'} been matched to a player. The chronicle will guess from context, but it’s more accurate if you say who’s who.
            </span>
            <Button size="xs" onClick={onOpenTranscript} disabled={writing}>Match voices</Button>
          </div>
        )}

        {rewrite && (
          <p className="text-xs" style={{ color: 'var(--ink-3)', margin: 0 }}>
            Rewriting replaces the current proposals, including any edits you made to them. Changes you already applied stay applied.
          </p>
        )}

        {error && <p role="alert" className="text-sm" style={{ color: 'var(--red)', margin: 0 }}>{error}</p>}
      </div>
    </Modal>
  );
}
