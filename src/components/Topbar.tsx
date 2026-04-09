import { Menu, Search, Dice5 } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import CampaignSelector from './CampaignSelector';
import { signOut } from '../lib/auth';

interface TopbarProps {
  user: User;
  onOpenMobileMenu: () => void;
  onOpenSearch: () => void;
  onToggleDice: () => void;
  isMobile: boolean;
}

export default function Topbar({ user, onOpenMobileMenu, onOpenSearch, onToggleDice, isMobile }: TopbarProps) {
  return (
    <header
      className="flex items-center gap-3 px-4 border-b shrink-0"
      style={{ height: '56px', backgroundColor: '#0a0918', borderColor: '#3a3660' }}
    >
      {/* Mobile hamburger */}
      {isMobile && (
        <button
          onClick={onOpenMobileMenu}
          className="shrink-0 p-1.5 rounded transition-colors text-muted hover:text-parchment border-none bg-transparent"
          aria-label="Open menu"
        >
          <Menu size={20} strokeWidth={1.5} />
        </button>
      )}

      {/* Campaign selector — grows to fill space, constrained on desktop */}
      <div className="flex-1 min-w-0" style={{ maxWidth: '300px' }}>
        <CampaignSelector />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right cluster */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onToggleDice}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-colors border border-border bg-transparent"
          style={{ color: '#6a6490' }}
          title="Dice Roller"
        >
          <Dice5 size={14} strokeWidth={1.5} />
          <span className="hidden sm:inline">Dice</span>
        </button>
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors border border-border bg-transparent"
          style={{ color: '#6a6490' }}
          title="Search (⌘K)"
        >
          <Search size={14} strokeWidth={1.5} />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden sm:inline text-xs" style={{
            padding: '0 4px',
            borderRadius: '3px',
            border: '1px solid #3a3660',
            backgroundColor: '#0f0e17',
            fontSize: '10px',
            color: '#4a4470',
          }}>⌘K</kbd>
        </button>
        <span className="text-xs hidden sm:block" style={{ color: '#6a6490' }}>
          {user.email}
        </span>
        <button
          onClick={signOut}
          className="text-xs px-3 py-1.5 rounded transition-colors text-muted hover:text-parchment border border-border bg-transparent"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
