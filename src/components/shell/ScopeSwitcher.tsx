// The control at the top of the sidebar: which world, and which campaign in it,
// you're in. One place to switch either, start a new one, or delete a world.
// Replaces the world sidebar's World selector and the breadcrumb's campaign menu.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWorld } from '../../context/WorldContext';
import { useConfirm } from '../../context/ConfirmContext';
import WorldCreationGate from '../world/WorldCreationGate';
import CampaignCreationGate from '../world/CampaignCreationGate';

export default function ScopeSwitcher({ collapsed, onExpand }: { collapsed: boolean; onExpand: () => void }) {
  const {
    worlds, activeWorld, activeWorldId, setActiveWorldId, deleteWorld,
    campaigns, activeCampaignId, activeCampaign, openCampaign, backToWorld,
  } = useWorld();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [gate, setGate] = useState<'world' | 'campaign' | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!buttonRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const toggle = () => {
    if (collapsed) { onExpand(); return; }
    if (!open && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left, width: Math.max(r.width, 240) });
    }
    setOpen(o => !o);
  };

  const pickWorld = (id: string) => {
    if (id !== activeWorldId) setActiveWorldId(id);
    backToWorld();
    setOpen(false);
  };
  const pickCampaign = (id: string) => { openCampaign(id); setOpen(false); };

  const removeWorld = async (id: string, name: string) => {
    const isLast = worlds.length <= 1;
    const ok = await confirm({
      title: 'Delete world',
      message: isLast
        ? `Delete "${name}" and all its campaigns, lore, locations, and cast? This cannot be undone. It's your only world, so you'll be returned to world creation.`
        : `Delete "${name}" and all its campaigns, lore, locations, and cast? This cannot be undone.`,
      confirmLabel: 'Delete world',
      danger: true,
    });
    if (ok) { await deleteWorld(id); setOpen(false); }
  };

  return (
    <>
      <button
        ref={buttonRef}
        className="cm-scope"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        title={collapsed ? 'Expand sidebar' : 'Switch world or campaign'}
      >
        <span className="cm-crest" aria-hidden="true">❖</span>
        {!collapsed && (
          <span className="cm-scope-text">
            <span className="cm-side-eyebrow">{activeCampaign ? 'Campaign' : 'World'}</span>
            <span className="cm-side-name">{activeCampaign?.name ?? activeWorld?.name ?? 'DM Lair'}</span>
            {activeCampaign && activeWorld && <span className="cm-scope-sub">in {activeWorld.name}</span>}
          </span>
        )}
        {!collapsed && <span className="cm-scope-caret" aria-hidden="true">▾</span>}
      </button>

      {open && createPortal(
        <div ref={menuRef} className="ws-drop" role="menu" style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}>
          <div className="ws-drop-label">Your worlds</div>
          {worlds.map(w => (
            <div key={w.id}>
              <div className={`ws-drop-item ${w.id === activeWorldId && !activeCampaignId ? 'is-active' : ''}`}>
                {/* eslint-disable-next-line no-restricted-syntax -- menu row */}
                <button role="menuitem" className="cm-scope-row" onClick={() => pickWorld(w.id)}>
                  <span className="ws-drop-item-glyph" aria-hidden="true">⊕</span>
                  <span className="ws-drop-item-body">
                    <span className="ws-drop-item-name">{w.name}</span>
                    <span className="ws-drop-item-sub">{w.campaignIds.length} campaign{w.campaignIds.length !== 1 ? 's' : ''}</span>
                  </span>
                </button>
                {/* eslint-disable-next-line no-restricted-syntax -- menu row affordance */}
                <button className="ws-drop-item-delete" onClick={() => void removeWorld(w.id, w.name)} title="Delete world" aria-label={`Delete ${w.name}`}>✕</button>
              </div>
              {w.id === activeWorldId && campaigns.map(c => (
                // eslint-disable-next-line no-restricted-syntax -- menu row
                <button key={c.id} role="menuitem" className={`cm-scope-camp ${c.id === activeCampaignId ? 'is-active' : ''}`} onClick={() => pickCampaign(c.id)}>
                  <span className={`wc-dot wc-dot-${c.status}`} aria-hidden="true" />
                  <span className="cm-scope-camp-name">{c.name}</span>
                  <span className="cm-scope-camp-meta">{c.status === 'active' ? `${c.sessions} sess` : c.status}</span>
                </button>
              ))}
              {w.id === activeWorldId && (
                // eslint-disable-next-line no-restricted-syntax -- menu row
                <button role="menuitem" className="cm-scope-camp cm-scope-new" onClick={() => { setOpen(false); setGate('campaign'); }}>
                  <span aria-hidden="true">+</span><span className="cm-scope-camp-name">New campaign</span>
                </button>
              )}
            </div>
          ))}
          <div className="ws-drop-sep" />
          <button role="menuitem" className="ws-drop-new" onClick={() => { setOpen(false); setGate('world'); }}>
            <span>+</span> Create new world
          </button>
        </div>,
        document.body,
      )}

      {gate === 'world' && createPortal(<WorldCreationGate onClose={() => setGate(null)} />, document.body)}
      {gate === 'campaign' && createPortal(<CampaignCreationGate onClose={() => setGate(null)} />, document.body)}
    </>
  );
}
