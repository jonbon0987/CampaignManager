import { useCampaign } from '../context/CampaignContext';
import { useStatBlockPanel } from '../context/StatBlockPanelContext';
import { StatBlockBody, isStatBlockEmpty } from './tabs/CreatureStatblocks';
import { getTypeStyle } from '../lib/theme';

export default function StatBlockPanel() {
  const { activeStatBlockId, closeStatBlock } = useStatBlockPanel();
  const { monsterStatblocks } = useCampaign();

  const open = activeStatBlockId !== null;
  const statblock = activeStatBlockId
    ? (monsterStatblocks.find(m => m.id === activeStatBlockId) ?? null)
    : null;

  const ts = getTypeStyle(statblock?.creature_type ?? null);

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 sm:hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 997 }}
          onClick={closeStatBlock}
        />
      )}
      <div
        className="stat-block-panel"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          backgroundColor: '#0a0918',
          borderLeft: '1px solid #3a3660',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 998,
          boxShadow: open ? '-8px 0 32px rgba(0,0,0,0.6)' : 'none',
          // Mobile: full width, slide from right via transform
          // Desktop: fixed 440px, slide via right offset
          width: 'min(440px, 100vw)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s ease',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
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
                  <span style={{ fontSize: '0.7rem', color: '#6a6490', width: '100%' }}>{statblock.tags}</span>
                )}
              </div>
            </>
          ) : open ? (
            <div style={{ color: '#e05c5c', fontSize: '0.9rem' }}>Stat sheet not found</div>
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
            <StatBlockBody m={statblock} />
            {isStatBlockEmpty(statblock) && (
              <p style={{ color: '#6a6490', fontSize: '0.875rem', fontStyle: 'italic' }}>
                No content for this stat sheet yet.
              </p>
            )}
          </>
        ) : open ? (
          <p style={{ color: '#e05c5c', fontSize: '0.875rem' }}>
            This stat sheet no longer exists. It may have been deleted.
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
          Edit this stat sheet in the Stat Sheets tab.
        </div>
      )}
    </div>
    </>
  );
}
