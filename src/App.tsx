import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { CampaignProvider, useCampaign } from './context/CampaignContext';
import { WorldProvider, useWorld } from './context/WorldContext';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Overview from './components/tabs/Overview';
import SessionNotes from './components/tabs/SessionNotes';
import Characters from './components/tabs/Characters';
import LoreLocations from './components/tabs/LoreLocations';
import Modules from './components/tabs/Modules';
import CombatView from './components/tabs/CombatView';
import Workbench from './components/Workbench';
import { useAIChat } from './hooks/useAIChat';
import { useCampaignAssistantBackend, useWorldAssistantBackend } from './hooks/assistantBackend';
import StatBlockPanel from './components/StatBlockPanel';
import SearchOverlay from './components/SearchOverlay';
import DiceRoller from './components/DiceRoller';
import Scratchpad from './components/Scratchpad';
import ShortcutsOverlay from './components/ShortcutsOverlay';
import SessionBar from './components/SessionBar';
import { PostSessionCapture } from './components/ui/PostSessionCapture';
import SettingsView from './components/tabs/SettingsView';
import { StatBlockPanelProvider } from './context/StatBlockPanelContext';
import { NavigationProvider } from './context/NavigationContext';
import { CampaignEntityRefProvider, WorldEntityRefProvider } from './context/EntityRefContext';
import { signInWithEmail, onAuthStateChange, resetPasswordForEmail, updatePassword } from './lib/auth';
import { ConfirmProvider } from './context/ConfirmContext';
import { ToastProvider } from './context/ToastContext';
import useLocalStorage from './hooks/useLocalStorage';
import WorldSidebar from './components/world/WorldSidebar';
import WorldTopbar from './components/world/WorldTopbar';
import WorldOverview from './components/world/WorldOverview';
import { WorldNPCsView, WorldLocationsView, WorldLoreView, WorldCombatView } from './components/world/WorldViews';
import WorldTimeline from './components/world/WorldTimeline';
import WorldImportDrawer from './components/world/WorldImportDrawer';

// Consolidated from 10 tabs to 6 + settings (Scriptorium redesign)
// cast = PCs + NPCs + Factions, world = Locations + Lore, combat = Stat Sheets + Encounters
export type Tab = 'overview' | 'cast' | 'world' | 'modules' | 'sessions' | 'combat' | 'settings';

// View options per tab — what the topbar segment control shows
const TAB_VIEW_OPTIONS: Partial<Record<Tab, { id: string; label: string }[]>> = {
  cast:     [{ id: 'list', label: 'Cast' }, { id: 'web', label: 'Relationship Web' }],
  modules:  [{ id: 'list', label: 'List' }, { id: 'web', label: 'Dependencies' }],
  sessions: [{ id: 'log', label: 'Log' }, { id: 'timeline', label: 'Timeline' }, { id: 'prep', label: 'Prep' }, { id: 'hooks', label: 'Hooks' }],
};

const TAB_DEFAULT_VIEW: Partial<Record<Tab, string>> = {
  cast: 'list', modules: 'list', sessions: 'log',
};

function AppInner({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [viewModes, setViewModes] = useState<Record<string, string>>({ cast: 'list', modules: 'list', sessions: 'log' });
  const [aiOpen, setAiOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useLocalStorage<boolean>('dnd-sidebar-open', true);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [diceOpen, setDiceOpen] = useState(false);
  const [sessionBarOpen, setSessionBarOpen] = useState(false);
  const [runMode, setRunMode] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [scratchOpen, setScratchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importType, setImportType] = useState('all');

  const activeViewMode = viewModes[activeTab] ?? TAB_DEFAULT_VIEW[activeTab] ?? 'list';
  const setViewMode = (v: string) => setViewModes(prev => ({ ...prev, [activeTab]: v }));
  const { loading, error, pcs } = useCampaign();
  const chat = useAIChat(useCampaignAssistantBackend());
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

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable;

      // ⌘K → Assistant Workbench
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setAiOpen(prev => !prev);
        return;
      }

      // ⌘/ → search
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
        return;
      }

      // ⌘. → scratchpad
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        setScratchOpen(prev => !prev);
        return;
      }

      // ? → shortcuts overlay (only when not typing)
      if (e.key === '?' && !isInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShortcutsOpen(prev => !prev);
        return;
      }

      // Esc → close overlays
      if (e.key === 'Escape') {
        setShortcutsOpen(false);
        setAiOpen(false);
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


  // The Workbench is a modal, so the shell no longer reserves a rail column.
  const shellClass = [
    'cm-shell',
    runMode ? 'cm-run' : '',
    !isMobile && !sidebarOpen ? 'side-collapsed' : '',
  ].filter(Boolean).join(' ');

  return (
    <NavigationProvider setActiveTab={setActiveTab}>
      <CampaignEntityRefProvider>
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
          onOpenAI={() => setAiOpen(true)}
          onOpenDice={() => setDiceOpen(true)}
          proposalCount={chat.pendingProposalCount}
          runMode={runMode}
          isMobile={isMobile}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        {/* Main column */}
        <div className="cm-main">
          <Topbar
            tabLabel={TAB_LABELS[activeTab]}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
            onToggleDice={() => setSessionBarOpen(prev => !prev)}
            onOpenCapture={() => setCaptureOpen(true)}
            onToggleScratch={() => setScratchOpen(prev => !prev)}
            onToggleShortcuts={() => setShortcutsOpen(prev => !prev)}
            scratchOpen={scratchOpen}
            isMobile={isMobile}
            viewMode={activeViewMode}
            setViewMode={setViewMode}
            viewOptions={TAB_VIEW_OPTIONS[activeTab]}
          />

          <div className="cm-canvas">
            {error && (
              <div style={{ margin: '16px 28px', padding: '12px 16px', borderRadius: 'var(--radius)', fontSize: '14px', backgroundColor: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red-line)' }}>
                Failed to load data: {error}
              </div>
            )}
            {loading ? (
              <div style={{ textAlign: 'center', paddingTop: '96px', color: 'var(--ink-3)' }}>Loading campaign data…</div>
            ) : (
              <>
                {activeTab === 'overview'  && <Overview onNavigate={setActiveTab} />}
                {activeTab === 'cast'      && <Characters viewMode={viewModes.cast ?? 'list'} setViewMode={(v) => setViewModes(p => ({ ...p, cast: v }))} onImportFromWorld={() => { setImportType('npc'); setImportOpen(true); }} />}
                {activeTab === 'world'     && <LoreLocations onImportFromWorld={(type) => { setImportType(type); setImportOpen(true); }} />}
                {activeTab === 'modules'   && <Modules viewMode={viewModes.modules ?? 'list'} setViewMode={(v) => setViewModes(p => ({ ...p, modules: v }))} />}
                {activeTab === 'sessions'  && <SessionNotes viewMode={viewModes.sessions ?? 'log'} setViewMode={(v) => setViewModes(p => ({ ...p, sessions: v }))} />}
                {activeTab === 'combat'    && <CombatView onImportFromWorld={() => { setImportType('bestiary'); setImportOpen(true); }} />}
                {activeTab === 'settings'  && <SettingsView />}
              </>
            )}
          </div>
        </div>

        <Workbench open={aiOpen} onClose={() => setAiOpen(false)} chat={chat} />

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
        <Scratchpad open={scratchOpen} onClose={() => setScratchOpen(false)} />
        <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        <WorldImportDrawer
          open={importOpen}
          onClose={() => setImportOpen(false)}
          entityType={importType}
          onImport={() => setImportOpen(false)}
        />
      </div>
      </CampaignEntityRefProvider>
    </NavigationProvider>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'forgot' | 'forgot-sent'>('signin');

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('auto-login')) return;
    const e2eEmail = import.meta.env.VITE_E2E_USER_EMAIL as string | undefined;
    const e2ePassword = import.meta.env.VITE_E2E_USER_PASSWORD as string | undefined;
    if (!e2eEmail || !e2ePassword) {
      setError('auto-login: VITE_E2E_USER_EMAIL and VITE_E2E_USER_PASSWORD must be set in .env.local');
      return;
    }
    setLoading(true);
    signInWithEmail(e2eEmail, e2ePassword)
      .catch((err) => setError(err instanceof Error ? err.message : 'Auto-login failed.'))
      .finally(() => setLoading(false));
  }, []);

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
        <div className="text-5xl mb-4 select-none" style={{ color: 'var(--gold)' }}>❖</div>
        <h1
          className="text-3xl font-bold mb-2"
          style={{ color: 'var(--gold)', fontFamily: 'var(--display)' }}
        >
          DM Lair
        </h1>
        <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Where every campaign comes to life</p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-4" style={{ padding: '0 1rem' }}>
        {mode === 'signin' && (
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3" data-testid="login-form">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="px-4 py-2 rounded text-sm outline-none"
              style={inputStyle}
              data-testid="login-email"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="px-4 py-2 rounded text-sm outline-none"
              style={inputStyle}
              data-testid="login-password"
            />
            {error && <p className="text-xs" data-testid="login-error" style={{ color: 'var(--red)' }}>{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 rounded text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ backgroundColor: 'var(--gold)', color: 'var(--bg)' }}
              data-testid="login-submit"
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
            {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 rounded text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ backgroundColor: 'var(--gold)', color: 'var(--bg)' }}
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
      style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}
    >
      <div className="text-center">
        <div className="text-5xl mb-4 select-none" style={{ color: 'var(--gold)' }}>❖</div>
        <h1
          className="text-3xl font-bold mb-2"
          style={{ color: 'var(--gold)', fontFamily: 'var(--display)' }}
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
            {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 rounded text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ backgroundColor: 'var(--gold)', color: 'var(--bg)' }}
            >
              {loading ? '…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function WorldContent() {
  const { worldTab } = useWorld();
  switch (worldTab) {
    case 'overview': return <WorldOverview />;
    case 'npcs': return <WorldNPCsView />;
    case 'locations': return <WorldLocationsView />;
    case 'lore': return <WorldLoreView />;
    case 'combat': return <WorldCombatView />;
    case 'timeline': return <WorldTimeline />;
    default: return <WorldOverview />;
  }
}

function WorldShell() {
  const [importOpen, setImportOpen] = useState(false);
  const [importType, setImportType] = useState('all');
  const [scratchOpen, setScratchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [diceOpen, setDiceOpen] = useState(false);
  const chat = useAIChat(useWorldAssistantBackend());

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable;
      // ⌘K → World Assistant
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setAiOpen(prev => !prev);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        setScratchOpen(prev => !prev);
        return;
      }
      if (e.key === '?' && !isInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShortcutsOpen(prev => !prev);
        return;
      }
      if (e.key === 'Escape') {
        setShortcutsOpen(false);
        setAiOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <WorldEntityRefProvider>
    <div className="cm-shell">
      <WorldSidebar onOpenAI={() => setAiOpen(true)} onOpenDice={() => setDiceOpen(true)} />
      <div className="cm-main">
        <WorldTopbar
          onToggleScratch={() => setScratchOpen(prev => !prev)}
          onToggleShortcuts={() => setShortcutsOpen(prev => !prev)}
          scratchOpen={scratchOpen}
        />
        <div className="cm-canvas">
          <WorldContent />
        </div>
      </div>
      <Workbench open={aiOpen} onClose={() => setAiOpen(false)} chat={chat} />
      <DiceRoller open={diceOpen} onClose={() => setDiceOpen(false)} />
      <WorldImportDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityType={importType}
        onImport={() => setImportOpen(false)}
      />
      <Scratchpad open={scratchOpen} onClose={() => setScratchOpen(false)} />
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
    </WorldEntityRefProvider>
  );
}

function WorldRoot({ user }: { user: User }) {
  const { activeCampaignId } = useWorld();

  if (activeCampaignId) {
    return (
      <CampaignProvider>
        <StatBlockPanelProvider>
          <AppInner user={user} />
        </StatBlockPanelProvider>
      </CampaignProvider>
    );
  }

  return <WorldShell />;
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
        <WorldProvider>
          <WorldRoot user={user} />
        </WorldProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
