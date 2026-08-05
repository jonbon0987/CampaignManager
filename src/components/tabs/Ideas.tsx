import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import type { Tab } from '../../App';
import { SectionHeader } from '../ui/SectionHeader';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import type { Idea } from '../../lib/database.types';

// Compact relative age, e.g. "2d", "3w", "just now".
function formatAge(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const wks = Math.floor(days / 7);
  if (wks < 5) return `${wks}w`;
  return `${Math.floor(days / 30)}mo`;
}

const firstWords = (text: string, n = 8) => text.trim().split(/\s+/).slice(0, n).join(' ') || 'Untitled';

function IdeaCard({ idea, onPromoteThread, onPromoteLore, onPromoteLocation, onDismiss }: {
  idea: Idea;
  onPromoteThread: (i: Idea) => void;
  onPromoteLore: (i: Idea) => void;
  onPromoteLocation: (i: Idea) => void;
  onDismiss: (i: Idea) => void;
}) {
  const [menu, setMenu] = useState(false);
  const promoted = !!idea.promoted_hook_id;
  return (
    <div className={`cm-idea${promoted ? ' is-promoted' : ''}`}>
      <div className="cm-idea-top">
        <span className="cm-idea-glyph">✎</span>
        {idea.tag && <span className="cm-idea-tag">{idea.tag}</span>}
        <span className="cm-idea-age">{formatAge(idea.created_at)}</span>
      </div>
      <p className="cm-idea-text">{idea.text || <span style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>Empty note</span>}</p>
      {promoted ? (
        <div className="cm-idea-promoted-tag">✧ promoted to a thread</div>
      ) : (
        <div className="cm-idea-actions">
          <div className="cm-promote-wrap">
            <Button variant="secondary" size="xs" onClick={() => setMenu(m => !m)}>Promote ▾</Button>
            {menu && (
              <>
                <div className="cm-promote-scrim" onClick={() => setMenu(false)} />
                <div className="cm-promote-menu">
                  <button onClick={() => { setMenu(false); onPromoteThread(idea); }}><span style={{ color: 'var(--orange)' }}>✧</span> to a Thread</button>
                  <button onClick={() => { setMenu(false); onPromoteLore(idea); }}><span style={{ color: 'var(--gold)' }}>❦</span> to a Lore entry</button>
                  <button onClick={() => { setMenu(false); onPromoteLocation(idea); }}><span style={{ color: 'var(--moss)' }}>✦</span> to a Location</button>
                </div>
              </>
            )}
          </div>
          <Button variant="link" onClick={() => onDismiss(idea)}>Dismiss</Button>
        </div>
      )}
    </div>
  );
}

function QuickIdeaDrawer({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (text: string, tag: string) => void }) {
  const [text, setText] = useState('');
  const [tag, setTag] = useState('');
  const save = () => {
    if (!text.trim()) return;
    onAdd(text.trim(), tag.trim());
    setText(''); setTag(''); onClose();
  };
  return (
    <div className={`cm-drawer-wrap${open ? ' is-open' : ''}`} aria-hidden={!open}>
      <div className="cm-drawer-back" onClick={onClose} />
      <div className="cm-drawer" role="dialog">
        <div className="cm-drawer-head">
          <span className="cm-drawer-glyph">✎</span>
          <div>
            <div className="cm-drawer-title">Quick Idea</div>
            <div className="cm-drawer-sub">Jot it and go — it lands in the inbox.</div>
          </div>
          <IconButton onClick={onClose}>✕</IconButton>
        </div>
        <textarea
          className="cm-drawer-text"
          placeholder="A spark, a twist, a scene, a name…"
          value={text}
          onChange={e => setText(e.target.value)}
          autoFocus={open}
        />
        <input
          className="cm-drawer-tag"
          placeholder="optional tag (e.g. twist, npc, set-piece)"
          value={tag}
          onChange={e => setTag(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); }}
        />
        <div className="cm-drawer-foot">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save to inbox</Button>
        </div>
        <div className="cm-drawer-note">Promote it to a Thread or into canon whenever you're ready — never forced to categorise up front.</div>
      </div>
    </div>
  );
}

export default function Ideas({ onNavigate }: { onNavigate?: (t: Tab) => void }) {
  const {
    ideas, upsertIdea, deleteIdea, promoteIdea,
    upsertLore, upsertLocation,
  } = useCampaign();
  const confirm = useConfirm();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const inbox = ideas.filter(i => !i.promoted_hook_id);
  const promoted = ideas.filter(i => i.promoted_hook_id);

  const addIdea = async (text: string, tag: string) => {
    await upsertIdea({ text, tag: tag || null, promoted_hook_id: null });
  };

  const promoteThread = async (idea: Idea) => {
    await promoteIdea(idea, 'side_quest');
    onNavigate?.('threads');
  };

  const promoteLore = async (idea: Idea) => {
    await upsertLore({ title: firstWords(idea.text), category: null, content: idea.text, dm_only: false, world_id: null });
    await deleteIdea(idea.id);
    onNavigate?.('lore');
  };

  const promoteLocation = async (idea: Idea) => {
    await upsertLocation({
      name: firstWords(idea.text), location_type: 'landmark', region: null, parent_id: null,
      description: idea.text, dm_notes: null, history: null, population: null, status: null, world_id: null,
    });
    await deleteIdea(idea.id);
    onNavigate?.('locations');
  };

  const dismiss = async (idea: Idea) => {
    if (await confirm('Dismiss this idea?')) await deleteIdea(idea.id);
  };

  return (
    <div style={{ padding: '28px' }}>
      <SectionHeader
        title="Ideas"
        subtitle={`${inbox.length} in inbox · an idea inbox - jot down sparks, twists, and scenes for later.`}
        onAdd={() => setDrawerOpen(true)}
        addLabel="Quick Idea"
      />

      {ideas.length === 0 ? (
        <EmptyState message="No ideas yet. Jot one down now!" onAdd={() => setDrawerOpen(true)} addLabel="Quick Idea" />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {inbox.map(i => (
              <IdeaCard key={i.id} idea={i} onPromoteThread={promoteThread} onPromoteLore={promoteLore} onPromoteLocation={promoteLocation} onDismiss={dismiss} />
            ))}
          </div>

          {promoted.length > 0 && (
            <>
              <div className="cm-md-grouplabel" style={{ padding: '24px 0 8px' }}>Promoted · {promoted.length}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {promoted.map(i => (
                  <IdeaCard key={i.id} idea={i} onPromoteThread={promoteThread} onPromoteLore={promoteLore} onPromoteLocation={promoteLocation} onDismiss={dismiss} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <QuickIdeaDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onAdd={addIdea} />
    </div>
  );
}
