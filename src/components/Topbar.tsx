import { Menu } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import CampaignSelector from './CampaignSelector';
import { signOut } from '../lib/auth';

interface TopbarProps {
  user: User;
  onOpenMobileMenu: () => void;
  isMobile: boolean;
}

export default function Topbar({ user, onOpenMobileMenu, isMobile }: TopbarProps) {
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

      {/* Campaign selector — constrained, not flex-1 */}
      <div className="min-w-0" style={{ maxWidth: '300px' }}>
        <CampaignSelector />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right cluster */}
      <div className="flex items-center gap-3 shrink-0">
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
