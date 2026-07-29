import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useWorld } from '../../context/WorldContext';
import { useConfirm } from '../../context/ConfirmContext';
import { signOut } from '../../lib/auth';
import useLocalStorage from '../../hooks/useLocalStorage';
import type { WorldTab } from '../../types/world';

interface WorldNavItem {
  id: WorldTab;
  label: string;
  glyph: string;
}

const WORLD_TABS: WorldNavItem[] = [
  { id: 'overview',  label: 'Overview',   glyph: '❖' },
  { id: 'lore',      label: 'Lore',       glyph: '❦' },
  { id: 'locations', label: 'Locations',  glyph: '✦' },
  { id: 'npcs',      label: 'NPCs',       glyph: '◇' },
  { id: 'combat',    label: 'Combat',     glyph: '⚔' },
  { id: 'timeline',  label: 'Timeline',   glyph: '⏤' },
];

// ── World Selector dropdown ─────────────────────────────────────────────────

function WorldSelector() {
  const { worlds, activeWorldId, setActiveWorldId, createWorld, deleteWorld } = useWorld();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTagline, setNewTagline] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const active = worlds.find(w => w.id === activeWorldId);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        dropRef.current && !dropRef.current.contains(target)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 6, left: r.left, width: Math.max(r.width, 220) });
    }
    setOpen(o => !o);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createWorld(newName.trim(), newTagline.trim());
    setNewName(''); setNewTagline(''); setCreating(false); setOpen(false);
  };

  const handleDeleteWorld = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Delete world',
      message: `Delete "${name}" and all its campaigns? This cannot be undone.`,
      danger: true,
    });
    if (ok) { await deleteWorld(id); setOpen(false); }
  };

  const cancelCreate = () => { setCreating(false); setNewName(''); setNewTagline(''); };

  return (
    <>
      <button ref={buttonRef} className="ws-selector" onClick={handleToggle}>
        <span className="ws-selector-glyph">⊕</span>
        <span className="ws-selector-name">{active?.name || 'Select World'}</span>
        <span className="ws-selector-caret">▾</span>
      </button>
      {open && createPortal(
        <div ref={dropRef} className="ws-drop"
          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width }}>
          <div className="ws-drop-label">Your Worlds</div>
          {worlds.map(w => (
            <div key={w.id} role="button" tabIndex={0}
              className={`ws-drop-item ${w.id === activeWorldId ? 'is-active' : ''}`}
              onClick={() => { setActiveWorldId(w.id); setOpen(false); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setActiveWorldId(w.id); setOpen(false); } }}
            >
              <span className="ws-drop-item-glyph">⊕</span>
              <div className="ws-drop-item-body">
                <div className="ws-drop-item-name">{w.name}</div>
                <div className="ws-drop-item-sub">
                  {w.campaignIds.length} campaign{w.campaignIds.length !== 1 ? 's' : ''}
                </div>
              </div>
              {worlds.length > 1 && (
                <button className="ws-drop-item-delete"
                  onClick={e => handleDeleteWorld(e, w.id, w.name)} title="Delete world">✕</button>
              )}
            </div>
          ))}
          <div className="ws-drop-sep" />
          {!creating ? (
            <button className="ws-drop-new" onClick={() => setCreating(true)}>
              <span>+</span> Create new world
            </button>
          ) : (
            <div className="ws-create-form">
              <input autoFocus className="ws-create-input" value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') cancelCreate(); }}
                placeholder="World name…" />
              <input className="ws-create-input ws-create-tagline" value={newTagline}
                onChange={e => setNewTagline(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') cancelCreate(); }}
                placeholder="A brief tagline…" />
              <div className="ws-create-actions">
                <button className="ws-create-cancel" onClick={cancelCreate}>Cancel</button>
                <button className="ws-create-submit" onClick={handleCreate} disabled={!newName.trim()}>Create</button>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

// ── Campaign flyout (shown when sidebar is collapsed) ───────────────────────

interface CampaignFlyoutProps {
  campaigns: WorldCampaign[];
  activeCampaignId: string | null;
  openCampaign: (id: string) => void;
}

function CampaignFlyout({ campaigns, activeCampaignId, openCampaign }: CampaignFlyoutProps) {
  const [show, setShow] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const handleEnter = () => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.top, left: r.right + 6 });
    }
    setShow(true);
  };

  return (
    <div ref={triggerRef} className="w-coll-camps"
      onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)}>
      <div className="w-coll-camps-label">❧</div>
      {campaigns.map(c => (
        <button key={c.id}
          className={`w-coll-camp-dot ${activeCampaignId === c.id ? 'is-active' : ''}`}
          onClick={() => openCampaign(c.id)}
          title={c.name}
        >
          <span className={`w-camp-status-dot w-camp-status-dot-${c.status}`} />
        </button>
      ))}
      {campaigns.length === 0 && (
        <span className="w-coll-camps-empty">·</span>
      )}

      {show && createPortal(
        <div ref={flyoutRef} className="w-camp-flyout"
          style={{ position: 'fixed', top: pos.top, left: pos.left }}
          onMouseEnter={() => setShow(true)}
          onMouseLeave={() => setShow(false)}
        >
          <div className="w-camp-flyout-label">Campaigns</div>
          {campaigns.length === 0 && (
            <div className="w-camp-flyout-empty">No campaigns yet</div>
          )}
          {campaigns.map(c => (
            <button key={c.id}
              className={`w-camp-flyout-item ${activeCampaignId === c.id ? 'is-active' : ''}`}
              onClick={() => { openCampaign(c.id); setShow(false); }}
            >
              <span className="w-camp-flyout-glyph">❧</span>
              <div className="w-camp-flyout-body">
                <div className="w-camp-flyout-name">{c.name}</div>
                {c.party && <div className="w-camp-flyout-meta">{c.party}</div>}
              </div>
              <span className={`w-camp-status w-camp-status-${c.status}`}>{c.status}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Main sidebar ────────────────────────────────────────────────────────────

export default function WorldSidebar({ onOpenAI, onOpenDice }: { onOpenAI?: () => void; onOpenDice?: () => void }) {
  const {
    activeWorld, campaigns, worldTab, setWorldTab, loading,
    activeCampaignId, openCampaign, createCampaign, deleteCampaign,
    npcs, factions, locations, lore, bestiary, encounters, timeline,
  } = useWorld();
  const confirm = useConfirm();

  const [collapsed, setCollapsed] = useLocalStorage('world-side-collapsed', false);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [newCampName, setNewCampName] = useState('');

  // Toggle w-side-collapsed on the parent .cm-shell so the grid column resizes
  useEffect(() => {
    const shell = document.querySelector('.cm-shell');
    if (shell) shell.classList.toggle('w-side-collapsed', collapsed);
    return () => { shell?.classList.remove('w-side-collapsed'); };
  }, [collapsed]);

  const submitNewCampaign = async () => {
    if (!newCampName.trim()) return;
    await createCampaign(newCampName.trim());
    setNewCampName(''); setCreatingCampaign(false);
  };
  const handleDeleteCampaign = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Delete campaign',
      message: `Delete "${name}"? This cannot be undone.`,
      danger: true,
    });
    if (ok) await deleteCampaign(id);
  };

  const counts: Partial<Record<WorldTab, number>> = {
    timeline: timeline.length,
    npcs: npcs.length + factions.length,
    locations: locations.length,
    lore: lore.length,
    combat: bestiary.length + encounters.length,
  };

  // ── Collapsed view ────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <aside className="w-side is-collapsed">
        {/* Expand button */}
        <button className="w-coll-head" onClick={() => setCollapsed(false)} title="Expand sidebar">
          <span className="w-coll-glyph">⊕</span>
        </button>

        {/* Nav glyphs */}
        <nav className="w-coll-nav">
          {WORLD_TABS.map(t => (
            <button key={t.id}
              className={`w-coll-item ${worldTab === t.id && !activeCampaignId ? 'is-active' : ''}`}
              onClick={() => setWorldTab(t.id)}
              title={t.label}
            >
              {t.glyph}
            </button>
          ))}

          {(onOpenAI || onOpenDice) && <div className="w-coll-sep" />}
          {onOpenAI && (
            <button className="w-coll-item cm-nav-assist" onClick={onOpenAI} title="World Assistant (⌘K)">
              <span className="cm-nav-glyph" style={{ width: 'auto', flex: 'none' }}>✦</span>
            </button>
          )}
          {onOpenDice && (
            <button className="w-coll-item" onClick={onOpenDice} title="Dice roller">⚄</button>
          )}
        </nav>

        <div className="w-coll-sep" />

        {/* Campaign flyout */}
        <CampaignFlyout
          campaigns={campaigns}
          activeCampaignId={activeCampaignId}
          openCampaign={openCampaign}
        />
      </aside>
    );
  }

  // ── Expanded view ─────────────────────────────────────────────────────────
  return (
    <aside className="w-side">
      <div className="w-side-head">
        <div className="w-side-scope">
          <span className="w-side-scope-dot" />
          <span>World</span>
        </div>
        <button className="w-side-collapse-btn" onClick={() => setCollapsed(true)} title="Collapse sidebar">
          ‹
        </button>
      </div>
      <div className="w-side-head-selector">
        <WorldSelector />
      </div>

      <div className="w-side-scroll">
        {loading && <div className="w-nav-loading">Loading worlds…</div>}
        <nav className="w-nav">
          <div className="w-nav-section">World</div>
          {WORLD_TABS.map(t => (
            <button key={t.id}
              className={`w-nav-item ${worldTab === t.id && !activeCampaignId ? 'is-active' : ''}`}
              onClick={() => setWorldTab(t.id)}
            >
              <span className="w-nav-glyph">{t.glyph}</span>
              <span className="cm-nav-label">{t.label}</span>
              {counts[t.id] != null && <span className="w-nav-count">{counts[t.id]}</span>}
            </button>
          ))}
          {(onOpenAI || onOpenDice) && (
            <>
              <div className="w-nav-section" style={{ marginTop: 8 }}>Tools</div>
              {onOpenAI && (
                <button className="w-nav-item cm-nav-assist" onClick={onOpenAI} title="World Assistant (⌘K)">
                  <span className="w-nav-glyph">✦</span>
                  <span className="cm-nav-label">Assistant</span>
                  {!collapsed && <span className="cm-nav-kbd">⌘K</span>}
                </button>
              )}
              {onOpenDice && (
                <button className="w-nav-item" onClick={onOpenDice} title="Dice roller">
                  <span className="w-nav-glyph">⚄</span>
                  <span className="cm-nav-label">Dice</span>
                </button>
              )}
            </>
          )}
          <div className="w-nav-section" style={{ marginTop: 8 }}>Campaigns</div>
        </nav>

        <div className="w-camp-list">
          {campaigns.map(c => (
            <div key={c.id} role="button" tabIndex={0}
              className={`w-camp-card ${activeCampaignId === c.id ? 'is-active' : ''}`}
              onClick={() => openCampaign(c.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') openCampaign(c.id); }}
            >
              <span className="w-camp-glyph">❧</span>
              <div className="w-camp-body">
                <div className="w-camp-name">{c.name}</div>
                <div className="w-camp-meta">{c.party} · {c.sessions} sessions</div>
              </div>
              <span className={`w-camp-status w-camp-status-${c.status}`}>{c.status}</span>
              <div className="w-camp-actions">
                <button className="w-camp-delete"
                  onClick={e => handleDeleteCampaign(e, c.id, c.name)}
                  title="Delete campaign">✕</button>
              </div>
            </div>
          ))}
          {creatingCampaign ? (
            <div className="w-camp-new-form">
              <input autoFocus className="w-camp-name-input" value={newCampName}
                onChange={e => setNewCampName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') submitNewCampaign();
                  if (e.key === 'Escape') { setCreatingCampaign(false); setNewCampName(''); }
                }}
                placeholder="Campaign name…" />
              <div className="ws-create-actions">
                <button className="ws-create-cancel" onClick={() => { setCreatingCampaign(false); setNewCampName(''); }}>Cancel</button>
                <button className="ws-create-submit" onClick={submitNewCampaign} disabled={!newCampName.trim()}>Create</button>
              </div>
            </div>
          ) : (
            <button className="w-camp-card"
              style={{ justifyContent: 'center', color: 'var(--ink-3)', borderStyle: 'dashed' }}
              onClick={() => setCreatingCampaign(true)}
            >
              <span style={{ color: 'var(--gold)' }}>+</span>
              <span style={{ fontFamily: 'var(--serif)', fontSize: 13 }}>New campaign</span>
            </button>
          )}
        </div>
      </div>

      <div className="cm-side-foot">
        <div className="cm-side-meta">
          <div>{activeWorld?.name ?? '—'}</div>
        </div>
        <button className="cm-logout-btn" onClick={async () => {
          const ok = await confirm({ title: 'Log out', message: 'Log out of DM Lair?' });
          if (ok) signOut();
        }}>
          <span className="cm-logout-glyph">⎋</span>
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}
