import { useState } from 'react';
import type { RefObject } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { Modal } from '../Modal';
import type { MonsterStatblock } from '../../lib/database.types';

const creatureTypeColors: Record<string, { bg: string; text: string; border: string }> = {
  beast:        { bg: '#1a2a1a', text: '#6ab87a', border: '#2a5a2a' },
  undead:       { bg: '#2a1a3a', text: '#9060c0', border: '#5a2a7a' },
  humanoid:     { bg: '#1a2a3a', text: '#70a0e0', border: '#2a4a7a' },
  dragon:       { bg: '#3a1a1a', text: '#e07040', border: '#7a3a2a' },
  fiend:        { bg: '#3a1010', text: '#e04040', border: '#7a2020' },
  celestial:    { bg: '#2a2a1a', text: '#d0c060', border: '#6a6020' },
  construct:    { bg: '#2a2a2a', text: '#a0a0a0', border: '#505050' },
  elemental:    { bg: '#1a3a3a', text: '#60c0c0', border: '#2a6a6a' },
  fey:          { bg: '#2a1a3a', text: '#c060d0', border: '#6a2a7a' },
  giant:        { bg: '#3a2a1a', text: '#c09060', border: '#7a5a2a' },
  monstrosity:  { bg: '#3a1a1a', text: '#e07070', border: '#7a2a2a' },
  ooze:         { bg: '#1a2a1a', text: '#60c070', border: '#2a5a2a' },
  plant:        { bg: '#1a2a1a', text: '#50b050', border: '#2a5a2a' },
  aberration:   { bg: '#1a1a3a', text: '#7070e0', border: '#2a2a7a' },
  other:        { bg: '#1a1a1a', text: '#808080', border: '#404040' },
};

const getTypeStyle = (t: string | null) =>
  creatureTypeColors[t ?? 'other'] ?? creatureTypeColors['other'];

interface CreatureLinkToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onInsert: (markup: string) => void;
}

export function CreatureLinkToolbar({ textareaRef, onInsert }: CreatureLinkToolbarProps) {
  const { monsterStatblocks } = useCampaign();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = monsterStatblocks.filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      (m.creature_type?.toLowerCase().includes(q) ?? false) ||
      (m.challenge_rating?.toLowerCase().includes(q) ?? false) ||
      (m.tags?.toLowerCase().includes(q) ?? false)
    );
  });

  function handlePick(m: MonsterStatblock) {
    // Store the cursor position before the modal caused blur
    const markup = `[[creature:${m.id}:${m.name}]]`;
    onInsert(markup);
    setPickerOpen(false);
    setSearch('');
    // Re-focus the textarea after inserting
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '0.72rem',
          padding: '3px 10px',
          borderRadius: '4px',
          backgroundColor: '#2a1a3a',
          color: '#c060d0',
          border: '1px solid #5a2a7a',
          cursor: 'pointer',
          fontFamily: 'inherit',
          marginTop: '4px',
        }}
      >
        ⚔ Link Creature
      </button>

      <Modal
        isOpen={pickerOpen}
        onClose={() => { setPickerOpen(false); setSearch(''); }}
        title="Link a Creature"
      >
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Search by name, type, or CR..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              backgroundColor: '#1a1830',
              color: '#e8d5b0',
              border: '1px solid #3a3660',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '0.875rem',
              outline: 'none',
            }}
          />

          {monsterStatblocks.length === 0 ? (
            <p style={{ color: '#6a6490', fontSize: '0.875rem', fontStyle: 'italic' }}>
              No creatures yet. Add some in the Creature Stat Sheets tab.
            </p>
          ) : filtered.length === 0 ? (
            <p style={{ color: '#6a6490', fontSize: '0.875rem', fontStyle: 'italic' }}>
              No creatures match your search.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '360px', overflowY: 'auto' }}>
              {filtered.map(m => {
                const ts = getTypeStyle(m.creature_type);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handlePick(m)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: '#1a1828',
                      border: '1px solid #3a3660',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#22203a')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#1a1828')}
                  >
                    <span
                      style={{
                        fontSize: '0.65rem',
                        padding: '1px 7px',
                        borderRadius: '4px',
                        border: `1px solid ${ts.border}`,
                        backgroundColor: ts.bg,
                        color: ts.text,
                        textTransform: 'capitalize',
                        flexShrink: 0,
                      }}
                    >
                      {m.creature_type ?? 'other'}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: '#e8d5b0',
                        fontFamily: 'Georgia, serif',
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {m.name}
                    </span>
                    {m.challenge_rating && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          padding: '1px 7px',
                          borderRadius: '4px',
                          backgroundColor: '#2a1a1a',
                          color: '#c08060',
                          border: '1px solid #5a3a2a',
                          flexShrink: 0,
                        }}
                      >
                        CR {m.challenge_rating}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
