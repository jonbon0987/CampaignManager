import { useEffect, useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { inputStyle } from '../FormField';
import { Button } from './Button';
import { lastPlayed, liveSession, localToday, nextPlanned, nextSessionNumber } from '../../lib/sessionLifecycle';

interface PostSessionCaptureProps {
  onClose: () => void;
}

const MOODS = ['quiet', 'tense', 'triumphant', 'tragic', 'chaotic', 'neutral'];

export function PostSessionCapture({ onClose }: PostSessionCaptureProps) {
  const { sessions, upsertSession, upsertIdea } = useCampaign();

  // The session just played: the live one, else one played today, else the
  // next planned one, else a new number.
  const today = localToday();
  const recent = lastPlayed(sessions);
  const target = liveSession(sessions) ?? (recent?.session_date === today ? recent : null) ?? nextPlanned(sessions);
  const nextNumber = target?.session_number ?? nextSessionNumber(sessions);

  const [form, setForm] = useState({
    sessionNum: nextNumber,
    date: today,
    summary: '',
    mood: 'neutral',
    newNames: '',
  });

  const [saving, setSaving] = useState(false);

  // Esc closes, like every other dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = async () => {
    if (!form.summary.trim()) return;
    setSaving(true);
    try {
      // Add to the session if it already exists (a recorded one, say) rather
      // than creating a second session with the same number.
      const existing = sessions.find(s => s.session_number === form.sessionNum);
      const join = (prev: string | null | undefined, next: string) =>
        prev?.trim() ? `${prev.trim()}\n\n${next}` : next;
      const moodLine = form.mood !== 'neutral' ? `Mood: ${form.mood}` : null;
      await upsertSession({
        ...(existing ? { id: existing.id } : {}),
        session_number: form.sessionNum,
        session_date: existing?.session_date ?? form.date,
        summary: join(existing?.summary, form.summary.trim()),
        combats: existing?.combats ?? null,
        loot_rewards: existing?.loot_rewards ?? null,
        hooks_notes: existing?.hooks_notes ?? null,
        dm_notes: moodLine ? join(existing?.dm_notes, moodLine) : existing?.dm_notes ?? null,
        status: 'done',
      });
      // Improvised names go to the Ideas inbox, one each, to flesh out later.
      const names = form.newNames.split(/[,;\n]/).map(n => n.trim()).filter(Boolean);
      for (const name of names) {
        await upsertIdea({ text: `${name} (came up in Session ${form.sessionNum})`, tag: 'new name', promoted_hook_id: null });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="psc-back" onClick={onClose}>
      <div className="psc" onClick={e => e.stopPropagation()}>
        <div className="psc-head">
          <div>
            <div className="cm-md-eyebrow">After the session</div>
            <h2 className="cm-md-title">Quick Capture</h2>
            <div className="psc-sub">
              What happened tonight? Jot down the essentials while they're fresh.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink-3)',
              fontSize: '18px',
              cursor: 'pointer',
            }}
          >
            &#x2715;
          </button>
        </div>

        <div className="psc-body">
          <div className="psc-row psc-row-inline">
            <div className="psc-field">
              <label className="psc-label">Session #</label>
              <input
                type="number"
                value={form.sessionNum}
                onChange={e => setForm(f => ({ ...f, sessionNum: +e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div className="psc-field">
              <label className="psc-label">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div className="psc-field">
              <label className="psc-label">Mood</label>
              <div className="psc-moods">
                {MOODS.map(m => (
                  <button
                    key={m}
                    className={`psc-mood ${form.mood === m ? 'is-active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, mood: m }))}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="psc-field psc-field-wide">
            <label className="psc-label">What happened?</label>
            <textarea
              value={form.summary}
              onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
              rows={4}
              placeholder="A quick summary of tonight's events..."
              className="cm-textarea"
            />
          </div>

          <div className="psc-field psc-field-wide">
            <label className="psc-label">New names mentioned</label>
            <input
              type="text"
              value={form.newNames}
              onChange={e => setForm(f => ({ ...f, newNames: e.target.value }))}
              placeholder="NPCs, places, or items that came up improvised..."
              style={inputStyle}
            />
            <span className="text-xs" style={{ color: 'var(--ink-3)' }}>Separate them with commas. Each one lands in Ideas to flesh out later.</span>
          </div>
        </div>

        <div className="psc-foot">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.summary.trim()}>
            {saving ? 'Saving…' : 'Save to session'}
          </Button>
        </div>
      </div>
    </div>
  );
}
