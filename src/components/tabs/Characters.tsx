import { useState } from 'react';
import PCs from './PCs';
import NPCs from './NPCs';
import CharacterWeb from './CharacterWeb';

type SubTab = 'pcs' | 'npcs' | 'web';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'pcs', label: 'Player Characters' },
  { id: 'npcs', label: 'NPCs' },
  { id: 'web', label: 'Character Web' },
];

export default function Characters() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('pcs');

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    border: 'none',
    backgroundColor: active ? '#2a2840' : 'transparent',
    color: active ? '#c9a84c' : '#9990b0',
    transition: 'all 0.15s',
    fontFamily: 'Georgia, Cambria, serif',
  });

  return (
    <div className="flex flex-col">
      {/* Pill-style sub-tab bar */}
      <div className="flex gap-1 p-1 rounded-lg mb-5 self-start" style={{ backgroundColor: '#12111e' }}>
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            style={pillStyle(activeSubTab === tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      <div>
        {activeSubTab === 'pcs' && <PCs />}
        {activeSubTab === 'npcs' && <NPCs />}
        {activeSubTab === 'web' && <CharacterWeb />}
      </div>
    </div>
  );
}
