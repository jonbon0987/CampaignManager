export type Origin = 'imported' | 'local';

interface OriginBandProps {
  origin: Origin;
  /** Noun used in the copy, e.g. "lore entry" or "place". */
  noun: string;
  onOpenInCanon: () => void;
  onPublish: () => void;
  onDetach: () => void;
  /**
   * A canon entry opens locked, so an edit can't change every campaign by
   * accident; "Edit canon" unlocks it for as long as it's open.
   */
  locked?: boolean;
  onUnlock?: () => void;
}

/** Gold (canon) / orange (table-local) provenance banner shown atop an entry detail. */
export function OriginBand({ origin, noun, onOpenInCanon, onPublish, onDetach, locked, onUnlock }: OriginBandProps) {
  if (origin === 'imported') {
    return (
      <div className="cm-originband is-canon">
        <span className="cm-originband-glyph">✦</span>
        <div className="cm-originband-body">
          <div className="cm-originband-kicker">{locked ? 'World canon · locked' : 'Imported from world canon'}</div>
          <div className="cm-originband-text">
            {locked
              ? `Shared by every campaign in this world that uses it. Edit the canon ${noun} to change it everywhere, or detach a copy to change it only here.`
              : `Shared across every table in this world. Edits here update the canon ${noun}.`}
          </div>
          <div className="cm-originband-actions">
            {locked && onUnlock && <button className="cm-publishbtn" onClick={onUnlock}>Edit canon</button>}
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
