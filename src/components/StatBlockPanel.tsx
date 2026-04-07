import { useCampaign } from '../context/CampaignContext';
import { useStatBlockPanel } from '../context/StatBlockPanelContext';

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

export default function StatBlockPanel() {
  const { activeStatBlockId, closeStatBlock } = useStatBlockPanel();
  const { monsterStatblocks } = useCampaign();

  const open = activeStatBlockId !== null;
  const statblock = activeStatBlockId
    ? (monsterStatblocks.find(m => m.id === activeStatBlockId) ?? null)
    : null;

  const ts = statblock ? getTypeStyle(statblock.creature_type) : getTypeStyle(null);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: open ? 0 : '-440px',
        width: '440px',
        height: '100vh',
        backgroundColor: '#0a0918',
        borderLeft: '1px solid #3a3660',
        display: 'flex',
        flexDirection: 'column',
        transition: 'right 0.3s ease',
        zIndex: 998,
        boxShadow: open ? '-8px 0 32px rgba(0,0,0,0.6)' : 'none',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #3a3660',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          backgroundColor: '#0f0e17',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {statblock ? (
            <>
              <div
                style={{
                  fontFamily: 'Georgia, serif',
                  fontWeight: 600,
                  fontSize: '1.05rem',
                  color: '#c9a84c',
                  lineHeight: '1.3',
                  marginBottom: '6px',
                }}
              >
                {statblock.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '1px 8px',
                    borderRadius: '4px',
                    border: `1px solid ${ts.border}`,
                    backgroundColor: ts.bg,
                    color: ts.text,
                    textTransform: 'capitalize',
                  }}
                >
                  {statblock.creature_type ?? 'other'}
                </span>
                {statblock.challenge_rating && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '1px 8px',
                      borderRadius: '4px',
                      backgroundColor: '#2a1a1a',
                      color: '#c08060',
                      border: '1px solid #5a3a2a',
                    }}
                  >
                    CR {statblock.challenge_rating}
                  </span>
                )}
                {statblock.tags && (
                  <span style={{ fontSize: '0.7rem', color: '#6a6490' }}>{statblock.tags}</span>
                )}
              </div>
            </>
          ) : open ? (
            <div style={{ color: '#e05c5c', fontSize: '0.9rem' }}>Creature not found</div>
          ) : (
            <div style={{ color: '#6a6490', fontSize: '0.9rem' }}>Stat Block</div>
          )}
        </div>
        <button
          onClick={closeStatBlock}
          style={{
            background: 'none',
            border: 'none',
            color: '#6a6490',
            fontSize: '1.2rem',
            cursor: 'pointer',
            padding: '0 4px',
            lineHeight: 1,
            flexShrink: 0,
          }}
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {statblock ? (
          <>
            {statblock.content && (
              <div>
                <div
                  style={{
                    color: '#c9a84c',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: '0.4rem',
                  }}
                >
                  Stat Block
                </div>
                <pre
                  style={{
                    color: '#e8d5b0',
                    lineHeight: '1.7',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    backgroundColor: '#0f0e17',
                    border: '1px solid #3a3660',
                    borderRadius: '6px',
                    padding: '12px',
                    whiteSpace: 'pre-wrap',
                    margin: 0,
                  }}
                >
                  {statblock.content}
                </pre>
              </div>
            )}
            {statblock.dm_notes && (
              <div>
                <div
                  style={{
                    color: '#c9a84c',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: '0.4rem',
                  }}
                >
                  DM Notes
                </div>
                <p
                  style={{
                    color: '#9990b0',
                    fontSize: '0.875rem',
                    lineHeight: '1.6',
                    fontStyle: 'italic',
                    margin: 0,
                  }}
                >
                  {statblock.dm_notes}
                </p>
              </div>
            )}
            {!statblock.content && !statblock.dm_notes && (
              <p style={{ color: '#6a6490', fontSize: '0.875rem', fontStyle: 'italic' }}>
                No content for this creature yet.
              </p>
            )}
          </>
        ) : open ? (
          <p style={{ color: '#e05c5c', fontSize: '0.875rem' }}>
            This creature no longer exists. It may have been deleted.
          </p>
        ) : null}
      </div>

      {/* Footer hint */}
      {statblock && (
        <div
          style={{
            padding: '10px 20px',
            borderTop: '1px solid #2a2640',
            fontSize: '0.7rem',
            color: '#4a4470',
          }}
        >
          Edit this creature in the Creature Stat Sheets tab.
        </div>
      )}
    </div>
  );
}
