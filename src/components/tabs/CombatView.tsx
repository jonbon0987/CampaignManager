import { useState } from 'react';
import EncounterBuilder from './EncounterBuilder';
import CreatureStatblocks from './CreatureStatblocks';

type SubTab = 'encounters' | 'statblocks';

export default function CombatView({ onImportFromWorld }: { onImportFromWorld?: () => void }) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('encounters');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '10px 28px 0',
          borderBottom: '1px solid var(--rule)',
          flexShrink: 0,
        }}
      >
        {([
          { id: 'encounters', label: 'Encounters' },
          { id: 'statblocks', label: 'Stat Sheets' },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            style={{
              padding: '6px 14px',
              fontSize: '0.78rem',
              fontWeight: 600,
              fontFamily: 'var(--serif)',
              cursor: 'pointer',
              border: 'none',
              borderBottom: activeSubTab === tab.id ? '2px solid var(--gold)' : '2px solid transparent',
              backgroundColor: 'transparent',
              color: activeSubTab === tab.id ? 'var(--gold)' : 'var(--ink-3)',
              marginBottom: '-1px',
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeSubTab === 'encounters' && <EncounterBuilder />}
        {activeSubTab === 'statblocks' && <CreatureStatblocks onImportFromWorld={onImportFromWorld} />}
      </div>
    </div>
  );
}
