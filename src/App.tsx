import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { CampaignProvider, useCampaign } from './context/CampaignContext';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Overview from './components/tabs/Overview';
import SessionNotes from './components/tabs/SessionNotes';
import Characters from './components/tabs/Characters';
import LoreLocations from './components/tabs/LoreLocations';
import Modules from './components/tabs/Modules';
import HooksIdeas from './components/tabs/HooksIdeas';
import CreatureStatblocks from './components/tabs/CreatureStatblocks';
import EncounterBuilder from './components/tabs/EncounterBuilder';
import Factions from './components/tabs/Factions';
import AIAssistant from './components/AIAssistant';
import StatBlockPanel from './components/StatBlockPanel';
import SearchOverlay from './components/SearchOverlay';
import DiceRoller from './components/DiceRoller';
import { StatBlockPanelProvider } from './context/StatBlockPanelContext';
import { signInWithEmail, onAuthStateChange } from './lib/auth';
import { ConfirmProvider } from './context/ConfirmContext';
import { ToastProvider } from './context/ToastContext';
import useLocalStorage from './hooks/useLocalStorage';

export type Tab = 'overview' | 'sessions' | 'characters' | 'lore' | 'modules' | 'creatures' | 'encounters' | 'hooks' | 'factions';

function AppInner({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [aiOpen, setAiOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useLocalStorage<boolean>('dnd-sidebar-open', true);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [diceOpen, setDiceOpen] = useState(false);
  const { loading, error } = useCampaign();

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      if (e.matches) setMobileMenuOpen(false);
    };
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Cmd+K / Ctrl+K to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const showSidebar = isMobile ? mobileMenuOpen : sidebarOpen;

  return (
    <div className="h-screen flex flex-row overflow-hidden" style={{ backgroundColor: '#0f0e17', color: '#e8d5b0' }}>
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpen={showSidebar}
        onToggle={() => setSidebarOpen(prev => !prev)}
        onOpenAI={() => setAiOpen(true)}
        isMobile={isMobile}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar
          user={user}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          onToggleDice={() => setDiceOpen(prev => !prev)}
          isMobile={isMobile}
        />

        <main className="flex-1 overflow-y-auto px-3 py-4 sm:p-6">
          <div className="mx-auto w-full" style={{ maxWidth: '900px' }}>
            {error && (
              <div className="mb-4 px-4 py-3 rounded text-sm" style={{ backgroundColor: '#3a1a1a', color: '#e05c5c', border: '1px solid #6a2a2a' }}>
                Failed to load data: {error}
              </div>
            )}
            {loading ? (
              <div className="text-center py-24" style={{ color: '#6a6490' }}>Loading campaign data…</div>
            ) : (
              <>
                {activeTab === 'overview'    && <Overview onNavigate={setActiveTab} />}
                {activeTab === 'sessions'    && <SessionNotes />}
                {activeTab === 'characters'  && <Characters />}
                {activeTab === 'lore'        && <LoreLocations />}
                {activeTab === 'modules'     && <Modules />}
                {activeTab === 'creatures'   && <CreatureStatblocks />}
                {activeTab === 'encounters'  && <EncounterBuilder />}
                {activeTab === 'hooks'       && <HooksIdeas />}
                {activeTab === 'factions'    && <Factions />}
              </>
            )}
          </div>
        </main>
      </div>

      <AIAssistant open={aiOpen} onClose={() => setAiOpen(false)} />
      <StatBlockPanel />
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={setActiveTab}
      />
      <DiceRoller
        open={diceOpen}
        onClose={() => setDiceOpen(false)}
      />
    </div>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleEmailSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-8"
      style={{ backgroundColor: '#0f0e17', color: '#e8d5b0' }}
    >
      <div className="text-center">
        <div className="text-5xl mb-4 select-none">⚔️</div>
        <h1
          className="text-3xl font-bold mb-2"
          style={{ color: '#c9a84c', fontFamily: 'Georgia, Cambria, serif' }}
        >
          Campaign Manager
        </h1>
        <p className="text-sm" style={{ color: '#6a6490' }}>D&D Campaign Manager</p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-4" style={{ padding: '0 1rem' }}>
        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="px-4 py-2 rounded text-sm outline-none"
            style={{ backgroundColor: '#1a1830', color: '#e8d5b0', border: '1px solid #3a3660' }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="px-4 py-2 rounded text-sm outline-none"
            style={{ backgroundColor: '#1a1830', color: '#e8d5b0', border: '1px solid #3a3660' }}
          />
          {error && <p className="text-xs" style={{ color: '#e05c5c' }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 rounded text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ backgroundColor: '#c9a84c', color: '#0f0e17' }}
          >
            {loading ? '…' : 'Sign in'}
          </button>
        </form>

      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: '#0f0e17', color: '#6a6490' }}
      >
        Loading…
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  return (
    <ToastProvider>
      <ConfirmProvider>
        <CampaignProvider>
          <StatBlockPanelProvider>
            <AppInner user={user} />
          </StatBlockPanelProvider>
        </CampaignProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
