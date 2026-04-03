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
import AIAssistant from './components/AIAssistant';
import { signInWithGitHub, signInWithEmail, signUpWithEmail, onAuthStateChange } from './lib/auth';
import useLocalStorage from './hooks/useLocalStorage';

export type Tab = 'overview' | 'sessions' | 'characters' | 'lore' | 'modules' | 'creatures' | 'encounters' | 'hooks';

function AppInner({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [aiOpen, setAiOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useLocalStorage<boolean>('dnd-sidebar-open', true);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
          isMobile={isMobile}
        />

        <main className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 px-4 py-3 rounded text-sm" style={{ backgroundColor: '#3a1a1a', color: '#e05c5c', border: '1px solid #6a2a2a' }}>
              Failed to load data: {error}
            </div>
          )}
          {loading ? (
            <div className="text-center py-24" style={{ color: '#6a6490' }}>Loading campaign data…</div>
          ) : (
            <>
              {activeTab === 'overview'    && <Overview />}
              {activeTab === 'sessions'    && <SessionNotes />}
              {activeTab === 'characters'  && <Characters />}
              {activeTab === 'lore'        && <LoreLocations />}
              {activeTab === 'modules'     && <Modules />}
              {activeTab === 'creatures'   && <CreatureStatblocks />}
              {activeTab === 'encounters'  && <EncounterBuilder />}
              {activeTab === 'hooks'       && <HooksIdeas />}
            </>
          )}
        </main>
      </div>

      <AIAssistant open={aiOpen} onClose={() => setAiOpen(false)} />
    </div>
  );
}

function LoginScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleEmailSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
        setMessage('Check your email to confirm your account.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGitHub() {
    setLoading(true);
    try {
      await signInWithGitHub();
    } catch {
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
          {message && <p className="text-xs" style={{ color: '#6ab87a' }}>{message}</p>}
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 rounded text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ backgroundColor: '#c9a84c', color: '#0f0e17' }}
          >
            {loading ? '…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        </form>

        <p className="text-xs text-center" style={{ color: '#6a6490' }}>
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setMessage(''); }}
            className="underline"
            style={{ color: '#9990b0' }}
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ backgroundColor: '#3a3660' }} />
          <span className="text-xs" style={{ color: '#6a6490' }}>or</span>
          <div className="flex-1 h-px" style={{ backgroundColor: '#3a3660' }} />
        </div>

        <button
          onClick={handleGitHub}
          disabled={loading}
          className="flex items-center justify-center gap-3 px-6 py-2 rounded text-sm font-medium transition-opacity disabled:opacity-50"
          style={{ backgroundColor: '#24292e', color: '#e8d5b0', border: '1px solid #3a3660' }}
        >
          <svg height="18" viewBox="0 0 16 16" width="18" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
              0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
              -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87
              2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95
              0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21
              2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04
              2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82
              2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0
              1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Sign in with GitHub
        </button>
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
    <CampaignProvider>
      <AppInner user={user} />
    </CampaignProvider>
  );
}
