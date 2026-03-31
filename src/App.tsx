import { useState } from 'react';
import { CampaignProvider, useCampaign } from './context/CampaignContext';
import Overview from './components/tabs/Overview';
import SessionNotes from './components/tabs/SessionNotes';
import PCs from './components/tabs/PCs';
import NPCs from './components/tabs/NPCs';
import LoreLocations from './components/tabs/LoreLocations';
import Modules from './components/tabs/Modules';
import HooksIdeas from './components/tabs/HooksIdeas';

type Tab = 'overview' | 'sessions' | 'pcs' | 'npcs' | 'lore' | 'modules' | 'hooks';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',  label: 'Overview' },
  { id: 'sessions',  label: 'Session Notes' },
  { id: 'pcs',       label: 'PCs' },
  { id: 'npcs',      label: 'NPCs' },
  { id: 'lore',      label: 'Lore & Locations' },
  { id: 'modules',   label: 'Modules' },
  { id: 'hooks',     label: 'Hooks & Ideas' },
];

function AppInner() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const { data } = useCampaign();

  const campaignTitle = data.overview.title || 'Campaign Manager';

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0f0e17', color: '#e8d5b0' }}>
      {/* Header */}
      <header
        className="border-b px-6 py-4"
        style={{ backgroundColor: '#0a0918', borderColor: '#3a3660' }}
      >
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <div className="text-2xl select-none">⚔️</div>
          <div>
            <h1
              className="text-xl font-bold leading-tight"
              style={{ color: '#c9a84c', fontFamily: 'Georgia, Cambria, serif' }}
            >
              {campaignTitle}
            </h1>
            <p className="text-xs" style={{ color: '#6a6490' }}>D&D Campaign Manager</p>
          </div>
        </div>
      </header>

      {/* Tab Nav */}
      <nav
        className="border-b px-6 overflow-x-auto"
        style={{ backgroundColor: '#0f0e17', borderColor: '#3a3660' }}
      >
        <div className="max-w-7xl mx-auto flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-3 text-sm whitespace-nowrap transition-colors relative"
              style={{
                color: activeTab === tab.id ? '#c9a84c' : '#9990b0',
                fontFamily: 'Georgia, Cambria, serif',
                borderBottom: activeTab === tab.id ? '2px solid #c9a84c' : '2px solid transparent',
                marginBottom: '-1px',
                backgroundColor: 'transparent',
              }}
              onMouseEnter={e => {
                if (activeTab !== tab.id) e.currentTarget.style.color = '#e8d5b0';
              }}
              onMouseLeave={e => {
                if (activeTab !== tab.id) e.currentTarget.style.color = '#9990b0';
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto">
          {activeTab === 'overview'  && <Overview />}
          {activeTab === 'sessions'  && <SessionNotes />}
          {activeTab === 'pcs'       && <PCs />}
          {activeTab === 'npcs'      && <NPCs />}
          {activeTab === 'lore'      && <LoreLocations />}
          {activeTab === 'modules'   && <Modules />}
          {activeTab === 'hooks'     && <HooksIdeas />}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <CampaignProvider>
      <AppInner />
    </CampaignProvider>
  );
}
