import { useState } from 'react';

interface ReadAloudBlockProps {
  text: string;
  onChange?: (newText: string) => void;
}

export function ReadAloudBlock({ text, onChange }: ReadAloudBlockProps) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(text || '');

  return (
    <div className="ra">
      <div className="ra-label">
        <span className="ra-icon">&#x1f4dc;</span> Read Aloud
      </div>
      {editing ? (
        <div className="ra-edit">
          <textarea
            value={val}
            onChange={e => setVal(e.target.value)}
            rows={4}
            placeholder="Text to read aloud to your players..."
          />
          <div className="ra-edit-actions">
            <button onClick={() => { onChange?.(val); setEditing(false); }}>Save</button>
            <button className="ra-cancel" onClick={() => { setVal(text); setEditing(false); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="ra-body" onClick={() => setEditing(true)}>
          <p className="ra-text">{val || 'Click to add read-aloud text...'}</p>
        </div>
      )}
    </div>
  );
}
