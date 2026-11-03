// Read-aloud text: the boxed passage the DM reads to the players. Edited in
// place on a scene or a place (it saves with the page around it), and shown
// large in Play so it can be read straight off the screen.

/** The editable box, on a scene or a place. */
export function ReadAloudField({ value, onChange, maxLength, disabled }: {
  value: string;
  onChange: (text: string) => void;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <div className="ra">
      <div className="ra-label"><span aria-hidden>📜</span> Read aloud</div>
      <textarea className="ra-input" value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        rows={3} maxLength={maxLength} aria-label="Read aloud"
        placeholder="What the players see and hear as they arrive. Shown large in Play, so you can read it straight off the screen." />
    </div>
  );
}

/** The passage to read, as Play shows it. */
export function ReadAloud({ text, large, label = 'Read aloud' }: { text: string; large?: boolean; label?: string }) {
  return (
    <div className={`ra${large ? ' is-large' : ''}`}>
      <div className="ra-label"><span aria-hidden>📜</span> {label}</div>
      <p className="ra-text">{text}</p>
    </div>
  );
}
