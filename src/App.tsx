import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { CampaignProvider, useCampaign } from './context/CampaignContext';
import Overview from './components/tabs/Overview';
import SessionNotes from './components/tabs/SessionNotes';
import PCs from './components/tabs/PCs';
import NPCs from './components/tabs/NPCs';
import LoreLocations from './components/tabs/LoreLocations';
import Modules from './components/tabs/Modules';
import HooksIdeas from './components/tabs/HooksIdeas';
import { signInWithGitHub, signInWithEmail, signUpWithEmail, signOut, onAuthStateChange } from './lib/auth';

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

function AppInner({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const { overview, loading, error } = useCampaign();

  const campaignTitle = overview.title || 'Campaign Manager';

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0f0e17', color: '#e8d5b0' }}>
      {/* Header */}
      <header
        className="border-b px-6 py-4"
        style={{ backgroundColor: '#0a0918', borderColor: '#3a3660' }}
      >
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <div className="text-2xl select-none">⚔️</div>
          <div className="flex-1">
            <h1
              className="text-xl font-bold leading-tight"
              style={{ color: '#c9a84c', fontFamily: 'Georgia, Cambria, serif' }}
            >
              {campaignTitle}
            </h1>
            <p className="text-xs" style={{ color: '#6a6490' }}>D&D Campaign Manager</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: '#6a6490' }}>{user.email}</span>
            <button
              onClick={signOut}
              className="text-xs px-3 py-1 rounded transition-colors"
              style={{ color: '#9990b0', border: '1px solid #3a3660' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#e8d5b0'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#9990b0'; }}
            >
              Sign out
            </button>
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
          {error && (
            <div className="mb-4 px-4 py-3 rounded text-sm" style={{ backgroundColor: '#3a1a1a', color: '#e05c5c', border: '1px solid #6a2a2a' }}>
              Failed to load data: {error}
            </div>
          )}
          {loading ? (
            <div className="text-center py-24" style={{ color: '#6a6490' }}>Loading campaign data…</div>
          ) : (
            <>
              {activeTab === 'overview'  && <Overview />}
              {activeTab === 'sessions'  && <SessionNotes />}
              {activeTab === 'pcs'       && <PCs />}
              {activeTab === 'npcs'      && <NPCs />}
              {activeTab === 'lore'      && <LoreLocations />}
              {activeTab === 'modules'   && <Modules />}
              {activeTab === 'hooks'     && <HooksIdeas />}
            </>
          )}
        </div>
      </main>
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
        {/* Email form */}
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

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ backgroundColor: '#3a3660' }} />
          <span className="text-xs" style={{ color: '#6a6490' }}>or</span>
          <div className="flex-1 h-px" style={{ backgroundColor: '#3a3660' }} />
        </div>

        {/* GitHub */}
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
