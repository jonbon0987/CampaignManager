import { Button } from './Button';

interface VoiceData {
  accent?: string | null;
  patterns?: string | null;
  phrase?: string | null;
  tics?: string | null;
}

interface VoiceCardProps {
  voice: VoiceData;
  npcName?: string;
  onGenerate?: () => void;
}

export function VoiceCard({ voice, npcName, onGenerate }: VoiceCardProps) {
  const v = voice || {};
  const hasVoice = v.accent || v.patterns || v.phrase || v.tics;

  if (!hasVoice) {
    return (
      <div className="vc-empty">
        <div className="vc-empty-glyph">&#x1f3ad;</div>
        <div className="vc-empty-title">No voice notes yet</div>
        <div className="vc-empty-sub">
          Add accent, speech patterns, a signature phrase, and personality tics
          to help you perform this character at the table.
        </div>
        {onGenerate && (
          <button className="cm-pill" onClick={onGenerate}>
            &#x2726; Generate voice notes
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="vc">
      {v.accent && (
        <div className="vc-field">
          <div className="vc-label">Accent &amp; Delivery</div>
          <div className="vc-value">{v.accent}</div>
        </div>
      )}
      {v.patterns && (
        <div className="vc-field">
          <div className="vc-label">Speech Patterns</div>
          <div className="vc-value">{v.patterns}</div>
        </div>
      )}
      {v.phrase && (
        <div className="vc-field vc-phrase">
          <div className="vc-label">Signature Phrase</div>
          <div className="vc-quote">{v.phrase}</div>
        </div>
      )}
      {v.tics && (
        <div className="vc-field">
          <div className="vc-label">Personality Tics</div>
          <div className="vc-value">{v.tics}</div>
        </div>
      )}
      {onGenerate && (
        <button className="vc-regen" onClick={onGenerate}>
          &#x2726; Suggest alternatives
        </button>
      )}
    </div>
  );
}
