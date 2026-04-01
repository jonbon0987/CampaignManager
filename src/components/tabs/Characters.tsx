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

  return (
    <div className="flex flex-col">
      {/* Sub-tab bar */}
      <div
        className="flex gap-1 border-b mb-4"
        style={{ borderColor: '#3a3660' }}
      >
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className="px-4 py-2 text-sm whitespace-nowrap transition-colors relative"
            style={{
              color: activeSubTab === tab.id ? '#c9a84c' : '#9990b0',
              fontFamily: 'Georgia, Cambria, serif',
              borderBottom: activeSubTab === tab.id ? '2px solid #c9a84c' : '2px solid transparent',
              marginBottom: '-1px',
              backgroundColor: 'transparent',
            }}
            onMouseEnter={e => {
              if (activeSubTab !== tab.id) e.currentTarget.style.color = '#e8d5b0';
            }}
            onMouseLeave={e => {
              if (activeSubTab !== tab.id) e.currentTarget.style.color = '#9990b0';
            }}
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
