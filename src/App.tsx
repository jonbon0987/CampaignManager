import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { User } from '@supabase/supabase-js';
import { CampaignProvider, useCampaign } from './context/CampaignContext';
import { WorldProvider, useWorld } from './context/WorldContext';
import Overview from './components/tabs/Overview';
import SessionNotes from './components/tabs/SessionNotes';
import Characters from './components/tabs/Characters';
import Lore from './components/tabs/Lore';
import Locations from './components/tabs/Locations';
import Threads from './components/tabs/Threads';
import Ideas from './components/tabs/Ideas';
import Modules from './components/tabs/Modules';
import CombatView from './components/tabs/CombatView';
import Workbench from './components/Workbench';
import { useAIChat } from './hooks/useAIChat';
import { useCampaignAssistantBackend, useWorldAssistantBackend } from './hooks/assistantBackend';
import StatBlockPanel from './components/StatBlockPanel';
import ShortcutsOverlay from './components/ShortcutsOverlay';
import { PostSessionCapture } from './components/ui/PostSessionCapture';
import SettingsView from './components/tabs/SettingsView';
import { StatBlockPanelProvider, useStatBlockPanel } from './context/StatBlockPanelContext';
import { NavigationProvider } from './context/NavigationContext';
import { CampaignEntityRefProvider, WorldEntityRefProvider } from './context/EntityRefContext';
import { signInWithEmail, onAuthStateChange, resetPasswordForEmail, updatePassword } from './lib/auth';
import { ConfirmProvider } from './context/ConfirmContext';
import { ToastProvider } from './context/ToastContext';
import WorldOverview from './components/world/WorldOverview';
import { WorldNPCsView, WorldLocationsView, WorldLoreView, WorldCombatView } from './components/world/WorldViews';
import WorldTimeline from './components/world/WorldTimeline';
import WorldImportDrawer from './components/world/WorldImportDrawer';
import WorldCreationGate from './components/world/WorldCreationGate';
import CampaignCreationGate from './components/world/CampaignCreationGate';
import CanvasLoading from './components/ui/CanvasLoading';
import { RecordingProvider } from './context/RecordingContext';
import { RecordingIndicator, StartRecordingModal } from './components/session/RecorderPanel';
import { PlayProvider, usePlay, type PlayTab } from './context/PlayContext';
import { PlayStrip } from './components/play/PlayStrip';
import { PlayTools } from './components/play/PlayTools';
import { StartSessionDialog } from './components/play/StartSessionDialog';
import { useEndSession } from './components/play/useEndSession';
import AppSidebar from './components/shell/AppSidebar';
import AppTopbar from './components/shell/AppTopbar';
import CommandPalette from './components/shell/CommandPalette';
import QuickNote from './components/shell/QuickNote';
import { useMigrateScratchpad } from './components/shell/useMigrateScratchpad';
import { useCampaignPaletteItems, useWorldPaletteItems } from './components/shell/paletteItems';
import { useShellChrome, shellClass } from './components/shell/useShellChrome';
import { useRouteSync, currentRoute } from './hooks/useRouteSync';
import { setRecentScope } from './lib/recent';
import type { Route } from './lib/route';
import type { WorldTab } from './types/world';

// Tabs in a campaign. Ideas is kept for old links; it now lives in Threads'
// Inbox view, and Settings opens from the sidebar's footer menu.
export type Tab = 'overview' | 'cast' | 'lore' | 'locations' | 'threads' | 'ideas' | 'modules' | 'sessions' | 'combat' | 'settings';

// View options per tab — what the topbar segment control shows
const TAB_VIEW_OPTIONS: Partial<Record<Tab, { id: string; label: string }[]>> = {
  cast:     [{ id: 'list', label: 'Cast' }, { id: 'web', label: 'Relationship Web' }],
  threads:  [{ id: 'board', label: 'Board' }, { id: 'pipeline', label: 'Pipeline' }, { id: 'inbox', label: 'Inbox' }],
  modules:  [{ id: 'list', label: 'List' }, { id: 'web', label: 'Web' }],
  sessions: [{ id: 'log', label: 'Log' }, { id: 'timeline', label: 'Timeline' }],
};

const TAB_DEFAULT_VIEW: Partial<Record<Tab, string>> = {
  cast: 'list', threads: 'board', modules: 'list', sessions: 'log',
};

// The view a tab must be in to show a single record.
const LIST_VIEW: Partial<Record<Tab, string>> = {
  cast: 'list', modules: 'list', sessions: 'log',
};

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Home', cast: 'Cast', lore: 'Lore', locations: 'Locations',
  threads: 'Threads', ideas: 'Ideas', modules: 'Modules', sessions: 'Sessions',
  combat: 'Encounters', settings: 'Settings',
};

const WORLD_TAB_LABELS: Record<WorldTab, string> = {
  overview: 'Overview', lore: 'Lore', locations: 'Locations', npcs: 'Cast', combat: 'Encounters', timeline: 'Timeline',
};

/**
 * Ideas is Threads' Inbox now, and prep is a tab of each session rather than a
 * view of its own; old links to either land where they went.
 */
const normalizeTab = (tab: Tab, view?: string): { tab: Tab; view?: string } => {
  if (tab === 'ideas') return { tab: 'threads', view: 'inbox' };
  if (tab === 'sessions' && view === 'prep') return { tab };
  return { tab, view };
};

const RAIL_OVERLAY_CLASS = 'cm-rail';

function AppInner() {
  const world = useWorld();
  // Where the URL says to start (a deep link or a refresh).
  const [initial] = useState(() => {
    const r = currentRoute();
    return r?.scope === 'campaign' ? { ...normalizeTab(r.tab, r.view), recordId: r.recordId } : null;
  });
  const [activeTab, setActiveTabState] = useState<Tab>(initial?.tab ?? 'overview');
  const [viewModes, setViewModes] = useState<Record<string, string>>(() => ({
    cast: 'list', threads: 'board', modules: 'list', sessions: 'log',
    ...(initial?.view ? { [initial.tab]: initial.view } : {}),
  }));
  const chrome = useShellChrome({ hasNote: true });
  const [captureOpen, setCaptureOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importType, setImportType] = useState('all');
  // A record the user asked to open (search, Recent, a link). The destination
  // tab reads its id, selects that record, then clears the target.
  const [openTarget, setOpenTarget] = useState<{ tab: Tab; id: string; kind?: string } | null>(
    initial?.recordId ? { tab: initial.tab, id: initial.recordId } : null,
  );
  // The record the active tab reports showing, for the URL.
  const [shownRecord, setShownRecord] = useState<{ tab: Tab; id: string } | null>(
    initial?.recordId ? { tab: initial.tab, id: initial.recordId } : null,
  );

  const setActiveTab = useCallback((tab: Tab) => {
    const n = normalizeTab(tab);
    setActiveTabState(n.tab);
    if (n.view) setViewModes(prev => ({ ...prev, [n.tab]: n.view! }));
  }, []);

  const openRecord = useCallback((tab: Tab, id: string, kind?: string) => {
    setActiveTabState(tab);
    // Records only show in each tab's list view, not its web or timeline.
    const listView = LIST_VIEW[tab];
    if (listView) setViewModes(prev => ({ ...prev, [tab]: listView }));
    setOpenTarget({ tab, id, kind });
  }, []);
  const clearOpenTarget = useCallback(() => setOpenTarget(null), []);
  const openView = useCallback((tab: Tab, view?: string) => {
    setActiveTabState(tab);
    if (view) setViewModes(prev => ({ ...prev, [tab]: view }));
  }, []);

  const reportRecord = useCallback((tab: Tab, id: string | null) => {
    setShownRecord(prev => {
      if (id) return prev?.tab === tab && prev.id === id ? prev : { tab, id };
      return prev?.tab === tab ? null : prev;
    });
  }, []);

  const activeViewMode = viewModes[activeTab] ?? TAB_DEFAULT_VIEW[activeTab] ?? 'list';
  const setViewMode = (v: string) => setViewModes(prev => ({ ...prev, [activeTab]: v }));
  const openIdFor = (tab: Tab) => (openTarget?.tab === tab ? openTarget.id : null);
  const { loading, error, selectedCampaign, selectedCampaignId } = useCampaign();
  const { activeStatBlockId, closeStatBlock } = useStatBlockPanel();
  const chat = useAIChat(useCampaignAssistantBackend());
  const play = usePlay();
  // A session is in play while one is live; it survives a reload because the
  // status lives on the session.
  const runMode = !!play.live;

  useMigrateScratchpad();
  useEffect(() => { setRecentScope(selectedCampaignId); }, [selectedCampaignId]);

  // Keep the URL on this campaign, tab, record and view, and follow Back.
  const route: Route | null = world.activeWorldId && world.activeCampaignId ? {
    scope: 'campaign',
    worldId: world.activeWorldId,
    campaignId: world.activeCampaignId,
    tab: activeTab,
    recordId: shownRecord?.tab === activeTab ? shownRecord.id : undefined,
    view: activeViewMode !== (TAB_DEFAULT_VIEW[activeTab] ?? 'list') ? activeViewMode : undefined,
  } : null;
  useRouteSync(route, r => {
    if (r.worldId !== world.activeWorldId) world.setActiveWorldId(r.worldId);
    if (r.scope === 'world') {
      world.setWorldTab(r.tab);
      if (r.recordId) world.setSelected(r.tab, r.recordId);
      return;
    }
    if (r.campaignId !== world.activeCampaignId) world.openCampaign(r.campaignId);
    const n = normalizeTab(r.tab, r.view);
    setActiveTabState(n.tab);
    setViewModes(prev => ({ ...prev, [n.tab]: n.view ?? TAB_DEFAULT_VIEW[n.tab] ?? 'list' }));
    setShownRecord(r.recordId ? { tab: n.tab, id: r.recordId } : null);
    if (r.recordId) setOpenTarget({ tab: n.tab, id: r.recordId });
  });

  // Start session asks which session and whether to record; End checks, then
  // opens the session on its recap.
  const endSession = useEndSession(openRecord);
  const { openStart } = play;
  const toggleRun = useCallback(() => {
    if (runMode) void endSession();
    else openStart();
  }, [runMode, endSession, openStart]);

  // Brings a table tool into the rail, in front of the assistant or a stat sheet.
  const { setTab: setPlayTab } = play;
  const showTool = useCallback((tab: PlayTab) => {
    setPlayTab(tab);
    chrome.setAssistantOpen(false);
    closeStatBlock();
  // chrome's setters are stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPlayTab, closeStatBlock]);

  const paletteHandlers = useMemo(() => ({
    openRecord,
    openView,
    runMode,
    toggleRun,
    openSessionTools: () => showTool('initiative'),
    openNote: chrome.openNote,
    openCapture: () => setCaptureOpen(true),
    openShortcuts: chrome.toggleShortcuts,
    backToWorld: world.backToWorld,
  // chrome's openers are stable callbacks or plain setters
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [openRecord, openView, runMode, toggleRun, showTool, world.backToWorld]);
  const paletteItems = useCampaignPaletteItems(paletteHandlers);

  // One docked rail: a stat block when one is open, else the assistant, else
  // the table tools while a session is in play.
  const rail = activeStatBlockId
    ? <StatBlockPanel />
    : chrome.assistantOpen ? <Workbench open onClose={() => chrome.setAssistantOpen(false)} chat={chat} />
    : runMode ? <PlayTools /> : null;

  return (
    <NavigationProvider setActiveTab={setActiveTab} openRecord={openRecord} reportRecord={reportRecord}>
      <CampaignEntityRefProvider>
      <div className={shellClass({ collapsed: chrome.sidebarCollapsed, rail: !!rail, isMobile: chrome.isMobile, extra: runMode ? 'cm-run' : '' })}>
        <AppSidebar
          scope="campaign"
          activeId={activeTab}
          onNavigate={id => setActiveTab(id as Tab)}
          collapsed={chrome.sidebarCollapsed}
          onToggleCollapsed={chrome.toggleSidebar}
          isMobile={chrome.isMobile}
          mobileOpen={chrome.mobileMenuOpen}
          onCloseMobile={chrome.closeMobileMenu}
          onOpenShortcuts={chrome.toggleShortcuts}
          campaignId={selectedCampaignId}
          onOpenRecent={openRecord}
          runMode={runMode}
          onToggleRun={toggleRun}
        />

        {/* Main column */}
        <div className="cm-main">
          <AppTopbar
            crumbs={[
              { label: world.activeWorld?.name ?? 'World', onClick: world.backToWorld },
              { label: selectedCampaign?.name ?? 'Campaign' },
              { label: TAB_LABELS[activeTab] },
            ]}
            isMobile={chrome.isMobile}
            onOpenMobileMenu={chrome.openMobileMenu}
            viewMode={activeViewMode}
            setViewMode={setViewMode}
            viewOptions={TAB_VIEW_OPTIONS[activeTab]}
            status={<RecordingIndicator onOpen={sessionId => (sessionId === play.live?.id ? showTool('record') : openRecord('sessions', sessionId))} />}
            onOpenPalette={chrome.openPalette}
            onToggleNote={chrome.toggleNote}
            noteOpen={chrome.noteOpen}
            onToggleAssistant={chrome.toggleAssistant}
            assistantOpen={chrome.assistantOpen}
          />

          <PlayStrip onShowTool={showTool} />

          <div className="cm-canvas">
            {error && (
              <div style={{ margin: '16px 28px', padding: '12px 16px', borderRadius: 'var(--radius)', fontSize: '14px', backgroundColor: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red-line)' }}>
                Failed to load data: {error}
              </div>
            )}
            {loading ? (
              <CanvasLoading label="Loading campaign data…" />
            ) : (
              <>
                {activeTab === 'overview'  && <Overview onNavigate={setActiveTab} runMode={runMode} onToggleRun={toggleRun} />}
                {activeTab === 'cast'      && <Characters viewMode={viewModes.cast ?? 'list'} setViewMode={(v) => setViewModes(p => ({ ...p, cast: v }))} onImportFromWorld={() => { setImportType('npc'); setImportOpen(true); }} openId={openIdFor('cast')} onOpenConsumed={clearOpenTarget} />}
                {activeTab === 'lore'      && <Lore openId={openIdFor('lore')} onOpenConsumed={clearOpenTarget} onImportFromWorld={() => { setImportType('lore'); setImportOpen(true); }} />}
                {activeTab === 'locations' && <Locations openId={openIdFor('locations')} onOpenConsumed={clearOpenTarget} onImportFromWorld={() => { setImportType('location'); setImportOpen(true); }} />}
                {activeTab === 'threads'   && (activeViewMode === 'inbox'
                  ? <Ideas onNavigate={tab => { if (tab === 'threads') setViewModes(p => ({ ...p, threads: 'board' })); setActiveTab(tab); }} />
                  : <Threads viewMode={activeViewMode} onNavigate={setActiveTab} openId={openIdFor('threads')} onOpenConsumed={clearOpenTarget} />)}
                {activeTab === 'modules'   && <Modules viewMode={viewModes.modules ?? 'list'} setViewMode={(v) => setViewModes(p => ({ ...p, modules: v }))} openId={openIdFor('modules')} openSubmoduleId={openTarget?.tab === 'modules' && openTarget.kind?.startsWith('submodule:') ? openTarget.kind.slice('submodule:'.length) : null} onOpenConsumed={clearOpenTarget} />}
                {activeTab === 'sessions'  && <SessionNotes viewMode={viewModes.sessions ?? 'log'} setViewMode={(v) => setViewModes(p => ({ ...p, sessions: v }))} openId={openIdFor('sessions')} onOpenConsumed={clearOpenTarget} />}
                {activeTab === 'combat'    && <CombatView onImportFromWorld={(type) => { setImportType(type); setImportOpen(true); }} openTarget={openTarget?.tab === 'combat' ? openTarget : null} onOpenConsumed={clearOpenTarget} />}
                {activeTab === 'settings'  && <SettingsView />}
              </>
            )}
          </div>
          <QuickNote open={chrome.noteOpen} onClose={chrome.closeNote} onOpenInbox={() => openView('threads', 'inbox')}
            onSessionNote={runMode ? play.addNote : undefined} sessionNumber={play.live?.session_number} />
        </div>

        {rail && <div className={RAIL_OVERLAY_CLASS}>{rail}</div>}

        <CommandPalette
          open={chrome.paletteOpen}
          onClose={chrome.closePalette}
          items={paletteItems}
          onAsk={q => { chrome.setAssistantOpen(true); void chat.sendMessage(q); }}
          onRolled={runMode ? play.logRoll : undefined}
          placeholder="Search the campaign, jump to a tab, create, roll 2d6, or ask…"
        />
        {play.startOpen && <StartSessionDialog />}
        {play.recordFor && <StartRecordingModal session={play.recordFor} onClose={() => { play.clearRecordFor(); showTool('record'); }} />}
        {captureOpen && (
          <PostSessionCapture onClose={() => setCaptureOpen(false)} />
        )}
        <ShortcutsOverlay open={chrome.shortcutsOpen} onClose={chrome.closeShortcuts} />
        <WorldImportDrawer
          open={importOpen}
          onClose={() => setImportOpen(false)}
          entityType={importType}
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
            <p className="text-xs text-center" style={{ color: 'var(--ink-2)' }}>
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
            <p className="text-sm" style={{ color: 'var(--ink)' }}>
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
          <p className="text-sm text-center" style={{ color: 'var(--success)' }}>Password updated! Signing you in…</p>
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
  const { worldTab, entitiesLoading, activeWorldId } = useWorld();

  // Hold the view behind a loader while this world's entities are still fetching,
  // so tabs render with real data rather than briefly showing empty/stale state.
  if (activeWorldId && entitiesLoading) {
    return <CanvasLoading label="Loading world…" />;
  }

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
  const world = useWorld();
  const chrome = useShellChrome({ hasNote: false });
  const chat = useAIChat(useWorldAssistantBackend());
  const [newCampaignOpen, setNewCampaignOpen] = useState(false);

  // Keep the URL on this world, tab and record, and follow Back.
  const recordId = world.selected[world.worldTab];
  const route: Route | null = world.activeWorldId
    ? { scope: 'world', worldId: world.activeWorldId, tab: world.worldTab, recordId: world.worldTab === 'overview' || world.worldTab === 'timeline' ? undefined : recordId }
    : null;
  useRouteSync(route, r => {
    if (r.worldId !== world.activeWorldId) world.setActiveWorldId(r.worldId);
    if (r.scope === 'campaign') { world.openCampaign(r.campaignId); return; }
    world.setWorldTab(r.tab);
    if (r.recordId) world.setSelected(r.tab, r.recordId);
  });

  const paletteHandlers = useMemo(() => ({
    openShortcuts: chrome.toggleShortcuts,
    openNewCampaign: () => setNewCampaignOpen(true),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);
  const paletteItems = useWorldPaletteItems(paletteHandlers);

  const rail = chrome.assistantOpen
    ? <Workbench open onClose={() => chrome.setAssistantOpen(false)} chat={chat} />
    : null;

  return (
    <WorldEntityRefProvider>
    <div className={shellClass({ collapsed: chrome.sidebarCollapsed, rail: !!rail, isMobile: chrome.isMobile })}>
      <AppSidebar
        scope="world"
        activeId={world.worldTab}
        onNavigate={id => world.setWorldTab(id as WorldTab)}
        collapsed={chrome.sidebarCollapsed}
        onToggleCollapsed={chrome.toggleSidebar}
        isMobile={chrome.isMobile}
        mobileOpen={chrome.mobileMenuOpen}
        onCloseMobile={chrome.closeMobileMenu}
        onOpenShortcuts={chrome.toggleShortcuts}
      />
      <div className="cm-main">
        <AppTopbar
          crumbs={[{ label: world.activeWorld?.name ?? 'World' }, { label: WORLD_TAB_LABELS[world.worldTab] }]}
          isMobile={chrome.isMobile}
          onOpenMobileMenu={chrome.openMobileMenu}
          onOpenPalette={chrome.openPalette}
          onToggleAssistant={chrome.toggleAssistant}
          assistantOpen={chrome.assistantOpen}
        />
        <div className="cm-canvas">
          <WorldContent />
        </div>
      </div>
      {rail && <div className={RAIL_OVERLAY_CLASS}>{rail}</div>}
      <CommandPalette
        open={chrome.paletteOpen}
        onClose={chrome.closePalette}
        items={paletteItems}
        onAsk={q => { chrome.setAssistantOpen(true); void chat.sendMessage(q); }}
        placeholder="Search the world, jump to a tab, create, roll 2d6, or ask…"
      />
      <ShortcutsOverlay open={chrome.shortcutsOpen} onClose={chrome.closeShortcuts} scope="world" />
      {newCampaignOpen && createPortal(<CampaignCreationGate onClose={() => setNewCampaignOpen(false)} />, document.body)}
    </div>
    </WorldEntityRefProvider>
  );
}

function WorldRoot({ user }: { user: User }) {
  const world = useWorld();
  const { worlds, loading, activeCampaignId, activeWorldId } = world;
  // Apply the URL (a deep link or a refresh) once the worlds have loaded, before
  // either shell starts writing its own route back to it.
  const [routed, setRouted] = useState(false);
  useEffect(() => {
    if (loading || routed) return;
    const r = currentRoute();
    const target = r ? worlds.find(w => w.id === r.worldId) : null;
    if (r && target) {
      if (r.worldId !== activeWorldId) world.setActiveWorldId(r.worldId);
      if (r.scope === 'campaign' && target.campaignIds.includes(r.campaignId)) {
        world.openCampaign(r.campaignId);
      } else if (r.scope === 'world') {
        world.setWorldTab(r.tab);
        if (r.recordId) world.setSelected(r.tab, r.recordId);
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRouted(true);
  }, [loading, routed, worlds, activeWorldId, world]);

  // Don't flash the gate while worlds are still loading from Supabase.
  if (loading || !routed) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg)', color: 'var(--ink-3)' }}
      >
        Loading…
      </div>
    );
  }

  // Zero worlds → block the whole app until the user creates their first one.
  // createWorld() flips worlds 0 → 1, so this re-renders and falls through to
  // WorldShell, landing the user on the new (now-existing) World Overview.
  if (worlds.length === 0) {
    return <WorldCreationGate user={user} />;
  }

  if (activeCampaignId) {
    return (
      <CampaignProvider campaignId={activeCampaignId} worldId={activeWorldId || undefined}>
        <StatBlockPanelProvider>
          <RecordingProvider userId={user.id}>
            <PlayProvider>
              <AppInner />
            </PlayProvider>
          </RecordingProvider>
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
