export type Origin = 'imported' | 'local';

interface OriginBandProps {
  origin: Origin;
  /** Noun used in the copy, e.g. "lore entry" or "place". */
  noun: string;
  onOpenInCanon: () => void;
  onPublish: () => void;
  onDetach: () => void;
}

/** Gold (canon) / orange (table-local) provenance banner shown atop an entry detail. */
export function OriginBand({ origin, noun, onOpenInCanon, onPublish, onDetach }: OriginBandProps) {
  if (origin === 'imported') {
    return (
      <div className="cm-originband is-canon">
        <span className="cm-originband-glyph">✦</span>
        <div className="cm-originband-body">
          <div className="cm-originband-kicker">Imported from world canon</div>
          <div className="cm-originband-text">
            Shared across every table in this world. Edits here update the canon {noun}.
          </div>
          <div className="cm-originband-actions">
            <button className="cm-linklike" onClick={onOpenInCanon}>Open in canon ↗</button>
            <button className="cm-ghost-sm" onClick={onDetach}>Detach copy</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="cm-originband is-local">
      <span className="cm-originband-glyph">◈</span>
      <div className="cm-originband-body">
        <div className="cm-originband-kicker">Created for this table</div>
        <div className="cm-originband-text">
          Lives only on this table's copy. Publish it up if it should become shared canon.
        </div>
        <div className="cm-originband-actions">
          <button className="cm-publishbtn" onClick={onPublish}>Publish to canon ↑</button>
        </div>
      </div>
    </div>
  );
}
