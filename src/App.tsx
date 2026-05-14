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
import CombatView from './components/tabs/CombatView';
import AIAssistant from './components/AIAssistant';
import { useAIChat } from './hooks/useAIChat';
import ProposalsInbox from './components/ProposalsInbox';
import StatBlockPanel from './components/StatBlockPanel';
import SearchOverlay from './components/SearchOverlay';
import DiceRoller from './components/DiceRoller';
import SessionBar from './components/SessionBar';
import { PostSessionCapture } from './components/ui/PostSessionCapture';
import SettingsView from './components/tabs/SettingsView';
import { StatBlockPanelProvider } from './context/StatBlockPanelContext';
import { NavigationProvider } from './context/NavigationContext';
import { signInWithEmail, onAuthStateChange, resetPasswordForEmail, updatePassword } from './lib/auth';
import { ConfirmProvider } from './context/ConfirmContext';
import { ToastProvider } from './context/ToastContext';
import useLocalStorage from './hooks/useLocalStorage';

// Consolidated from 10 tabs to 6 + settings (Scriptorium redesign)
// cast = PCs + NPCs + Factions, world = Locations + Lore, combat = Stat Sheets + Encounters
export type Tab = 'overview' | 'cast' | 'world' | 'modules' | 'sessions' | 'combat' | 'settings';

function AppInner({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [aiOpen, setAiOpen] = useLocalStorage<boolean>('dnd-ai-open', true);
  const [sidebarOpen, setSidebarOpen] = useLocalStorage<boolean>('dnd-sidebar-open', true);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [diceOpen, setDiceOpen] = useState(false);
  const [sessionBarOpen, setSessionBarOpen] = useState(false);
  const [runMode, setRunMode] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const { loading, error, pcs } = useCampaign();
  const chat = useAIChat();
  const pcNames = pcs.map(p => p.character_name).filter(Boolean);

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

  // Get the display label for topbar breadcrumb
  const TAB_LABELS: Record<Tab, string> = {
    overview: 'Overview', cast: 'Cast', world: 'World',
    modules: 'Modules', sessions: 'Sessions', combat: 'Combat',
    settings: 'Settings',
  };


  // Shell class based on AI rail state and sidebar
  const shellClass = [
    'cm-shell',
    runMode ? 'cm-run' : '',
    !isMobile && aiOpen ? 'has-rail' : '',
    !isMobile && !aiOpen ? 'has-strip' : '',
    !isMobile && !sidebarOpen ? 'side-collapsed' : '',
  ].filter(Boolean).join(' ');

  return (
    <NavigationProvider setActiveTab={setActiveTab}>
      <div className={shellClass}>
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isOpen={showSidebar}
          onToggle={() => setSidebarOpen(prev => !prev)}
          onToggleRun={() => {
            const next = !runMode;
            setRunMode(next);
            if (next) setSessionBarOpen(true);
          }}
          runMode={runMode}
          isMobile={isMobile}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        {/* Main column */}
        <div className="cm-main">
          <Topbar
            user={user}
            activeTab={activeTab}
            tabLabel={TAB_LABELS[activeTab]}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
            onToggleDice={() => setSessionBarOpen(prev => !prev)}
            onOpenAI={() => setAiOpen(true)}
            onOpenInbox={() => setInboxOpen(true)}
            onOpenCapture={() => setCaptureOpen(true)}
            onToggleRun={() => {
              const next = !runMode;
              setRunMode(next);
              if (next) setSessionBarOpen(true);
            }}
            runMode={runMode}
            isMobile={isMobile}
            proposalCount={chat.pendingProposalCount}
          />

          <div className="cm-canvas">
            {error && (
              <div style={{ margin: '16px 28px', padding: '12px 16px', borderRadius: '6px', fontSize: '14px', backgroundColor: 'var(--redBg, #3a1a1a)', color: '#e05c5c', border: '1px solid #6a2a2a' }}>
                Failed to load data: {error}
              </div>
            )}
            {loading ? (
              <div style={{ textAlign: 'center', paddingTop: '96px', color: 'var(--ink-3)' }}>Loading campaign data…</div>
            ) : (
              <>
                {activeTab === 'overview'  && <Overview onNavigate={setActiveTab} />}
                {activeTab === 'cast'      && <Characters />}
                {activeTab === 'world'     && <LoreLocations />}
                {activeTab === 'modules'   && <Modules />}
                {activeTab === 'sessions'  && <SessionNotes />}
                {activeTab === 'combat'    && <CombatView />}
                {activeTab === 'settings'  && <SettingsView />}
              </>
            )}
          </div>
        </div>

        {/* AI Rail — docked right panel or collapsed strip */}
        {!isMobile && (
          aiOpen ? (
            <AIAssistant open={aiOpen} onClose={() => setAiOpen(false)} chat={chat} onOpenInbox={() => setInboxOpen(true)} />
          ) : (
            <div
              className="cm-rail-strip"
              onClick={() => setAiOpen(true)}
              title="Open Campaign Assistant"
            >
              <span style={{ color: 'var(--gold)', fontSize: '16px', marginBottom: '8px' }}>✦</span>
              <span className="cm-rail-strip-glyph">Assistant</span>
            </div>
          )
        )}

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
        <SessionBar
          open={sessionBarOpen}
          onClose={() => setSessionBarOpen(false)}
          runMode={runMode}
          onToggleRun={() => {
            const next = !runMode;
            setRunMode(next);
            if (!next) setSessionBarOpen(false);
          }}
          onNavigate={setActiveTab}
          pcNames={pcNames}
        />
        {captureOpen && (
          <PostSessionCapture onClose={() => setCaptureOpen(false)} />
        )}
        {inboxOpen && (
          <ProposalsInbox chat={chat} onClose={() => setInboxOpen(false)} />
        )}
      </div>
    </NavigationProvider>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'forgot' | 'forgot-sent'>('signin');

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

  async function handleForgotSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await resetPasswordForEmail(email);
      setMode('forgot-sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = { backgroundColor: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--rule)' };
  const linkStyle = { color: 'var(--gold)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline' };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-8"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}
    >
      <div className="text-center">
        <div className="text-5xl mb-4 select-none">⚔️</div>
        <h1
          className="text-3xl font-bold mb-2"
          style={{ color: 'var(--gold)', fontFamily: 'var(--display)' }}
        >
          Campaign Manager
        </h1>
        <p className="text-sm" style={{ color: 'var(--ink-3)' }}>D&D Campaign Manager</p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-4" style={{ padding: '0 1rem' }}>
        {mode === 'signin' && (
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="px-4 py-2 rounded text-sm outline-none"
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="px-4 py-2 rounded text-sm outline-none"
              style={inputStyle}
            />
            {error && <p className="text-xs" style={{ color: '#e05c5c' }}>{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 rounded text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ backgroundColor: 'var(--gold)', color: 'var(--bg)' }}
            >
              {loading ? '…' : 'Sign in'}
            </button>
            <div className="text-center">
              <button type="button" style={linkStyle} onClick={() => { setError(''); setMode('forgot'); }}>
                Forgot password?
              </button>
            </div>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgotSubmit} className="flex flex-col gap-3">
            <p className="text-xs text-center" style={{ color: '#a09080' }}>
              Enter your email and we'll send you a reset link.
            </p>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="px-4 py-2 rounded text-sm outline-none"
              style={inputStyle}
            />
            {error && <p className="text-xs" style={{ color: '#e05c5c' }}>{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 rounded text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ backgroundColor: '#c9a84c', color: '#0f0e17' }}
            >
              {loading ? '…' : 'Send reset link'}
            </button>
            <div className="text-center">
              <button type="button" style={linkStyle} onClick={() => { setError(''); setMode('signin'); }}>
                Back to sign in
              </button>
            </div>
          </form>
        )}

        {mode === 'forgot-sent' && (
          <div className="flex flex-col gap-3 text-center">
            <p className="text-sm" style={{ color: '#e8d5b0' }}>
              Check your email — a reset link is on its way.
            </p>
            <button type="button" style={linkStyle} onClick={() => { setError(''); setMode('signin'); }}>
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SetNewPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await updatePassword(password);
      setDone(true);
      setTimeout(onDone, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = { backgroundColor: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--rule)' };

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
          Set New Password
        </h1>
      </div>
      <div className="w-full max-w-sm flex flex-col gap-4" style={{ padding: '0 1rem' }}>
        {done ? (
          <p className="text-sm text-center" style={{ color: '#7db87d' }}>Password updated! Signing you in…</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="px-4 py-2 rounded text-sm outline-none"
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className="px-4 py-2 rounded text-sm outline-none"
              style={inputStyle}
            />
            {error && <p className="text-xs" style={{ color: '#e05c5c' }}>{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 rounded text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ backgroundColor: '#c9a84c', color: '#0f0e17' }}
            >
              {loading ? '…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((u, event) => {
      setUser(u);
      setLoading(false);
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
      }
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg)', color: 'var(--ink-3)' }}
      >
        Loading…
      </div>
    );
  }

  if (passwordRecovery && user) {
    return <SetNewPasswordScreen onDone={() => setPasswordRecovery(false)} />;
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
