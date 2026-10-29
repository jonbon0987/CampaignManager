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

  // Docked in the shell's right-hand rail (a full-screen sheet on a phone).
  if (!open) return null;

  return (
      <aside
        className="stat-block-panel cm-rail-panel"
        aria-label={statblock ? `Stat block: ${statblock.name}` : 'Stat block'}
        style={{
          height: '100%',
          backgroundColor: 'var(--bg)',
          borderLeft: '1px solid var(--rule)',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--rule)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          backgroundColor: 'var(--bg-2)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {statblock ? (
            <>
              <div
                style={{
                  fontFamily: 'var(--display)',
                  fontWeight: 600,
                  fontSize: '1.05rem',
                  color: 'var(--gold)',
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
                    borderRadius: 'var(--radius)',
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
                      borderRadius: 'var(--radius)',
                      backgroundColor: 'var(--chip-bg)',
                      color: 'var(--cr)',
                      border: '1px solid var(--chip-line)',
                    }}
                  >
                    CR {statblock.challenge_rating}
                  </span>
                )}
                {statblock.tags && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--ink-3)', width: '100%' }}>{statblock.tags}</span>
                )}
              </div>
            </>
          ) : open ? (
            <div style={{ color: 'var(--accent)', fontSize: '0.9rem' }}>Stat sheet not found</div>
          ) : (
            <div style={{ color: 'var(--ink-3)', fontSize: '0.9rem' }}>Stat Block</div>
          )}
        </div>
        <button
          onClick={closeStatBlock}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--ink-3)',
            fontSize: '1.2rem',
            cursor: 'pointer',
            padding: '0 4px',
            lineHeight: 1,
            flexShrink: 0,
          }}
          title="Close"
          aria-label="Close stat block"
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
              <p style={{ color: 'var(--ink-3)', fontSize: '0.875rem', fontStyle: 'italic' }}>
                No content for this stat sheet yet.
              </p>
            )}
          </>
        ) : open ? (
          <p style={{ color: 'var(--accent)', fontSize: '0.875rem' }}>
            This stat sheet no longer exists. It may have been deleted.
          </p>
        ) : null}
      </div>

      {/* Footer hint */}
      {statblock && (
        <div
          style={{
            padding: '10px 20px',
            borderTop: '1px solid var(--rule-soft)',
            fontSize: '0.7rem',
            color: 'var(--ink-3)',
          }}
        >
          Edit this stat sheet under Encounters › Stat Sheets.
        </div>
      )}
      </aside>
  );
}
