import {
  LayoutDashboard,
  ScrollText,
  Lightbulb,
  BookOpen,
  Users,
  Map,
  Skull,
  Swords,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Menu,
} from 'lucide-react';
import type { Tab } from '../App';

interface NavItem {
  id: Tab;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Campaign',
    items: [
      { id: 'overview',   label: 'Overview',        icon: LayoutDashboard },
      { id: 'sessions',   label: 'Session Notes',   icon: ScrollText },
      { id: 'hooks',      label: 'Hooks & Ideas',   icon: Lightbulb },
      { id: 'modules',    label: 'Modules',         icon: BookOpen },
    ],
  },
  {
    label: 'World',
    items: [
      { id: 'characters', label: 'Characters',      icon: Users },
      { id: 'lore',       label: 'Lore & Locations',icon: Map },
    ],
  },
  {
    label: 'Combat',
    items: [
      { id: 'creatures',  label: 'Creature Sheets', icon: Skull },
      { id: 'encounters', label: 'Encounters',      icon: Swords },
    ],
  },
];

interface SidebarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  isOpen: boolean;
  onToggle: () => void;
  onOpenAI: () => void;
  isMobile: boolean;
  onCloseMobile: () => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  isOpen,
  onToggle,
  onOpenAI,
  isMobile,
  onCloseMobile,
}: SidebarProps) {
  const handleNavClick = (tab: Tab) => {
    setActiveTab(tab);
    if (isMobile) onCloseMobile();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className="flex flex-col shrink-0 border-r overflow-hidden transition-all duration-200"
        style={{
          width: isOpen ? '240px' : '56px',
          backgroundColor: '#0a0918',
          borderColor: '#3a3660',
          // Mobile: fixed overlay; Desktop: inline
          ...(isMobile ? {
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            zIndex: 50,
            transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
            width: '240px',
          } : {}),
        }}
      >
        {/* Logo area */}
        <div
          className="flex items-center gap-3 px-3 border-b shrink-0"
          style={{ height: '56px', borderColor: '#3a3660' }}
        >
          <div className="shrink-0 flex items-center justify-center" style={{ width: '32px' }}>
            <span className="text-xl select-none">⚔️</span>
          </div>
          {isOpen && (
            <span
              className="text-sm font-bold truncate"
              style={{ color: '#c9a84c', fontFamily: 'Georgia, Cambria, serif' }}
            >
              Campaign Manager
            </span>
          )}
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-3">
          {NAV_GROUPS.map(group => (
            <div key={group.label} className="mb-4">
              {isOpen && (
                <div
                  className="px-3 mb-1"
                  style={{
                    color: '#6a6490',
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}
                >
                  {group.label}
                </div>
              )}
              {!isOpen && <div className="mb-1" style={{ height: '4px' }} />}
              {group.items.map(item => {
                const isActive = activeTab === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors relative ${!isActive ? 'hover:text-parchment' : ''}`}
                    style={{
                      color: isActive ? '#c9a84c' : '#9990b0',
                      backgroundColor: isActive ? '#22203a' : 'transparent',
                      borderLeft: isActive ? '2px solid #c9a84c' : '2px solid transparent',
                      fontFamily: 'Georgia, Cambria, serif',
                      justifyContent: isOpen ? 'flex-start' : 'center',
                    }}
                    title={!isOpen ? item.label : undefined}
                  >
                    <Icon size={16} strokeWidth={1.5} />
                    {isOpen && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom controls */}
        <div className="shrink-0 border-t py-2" style={{ borderColor: '#3a3660' }}>
          {/* AI Assistant button */}
          <button
            onClick={onOpenAI}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-surface-high"
            style={{
              color: '#c9a84c',
              backgroundColor: 'transparent',
              fontFamily: 'Georgia, Cambria, serif',
              justifyContent: isOpen ? 'flex-start' : 'center',
            }}
            title={!isOpen ? 'AI Assistant' : undefined}
          >
            <Sparkles size={16} strokeWidth={1.5} />
            {isOpen && <span>AI Assistant</span>}
          </button>

          {/* Collapse toggle (desktop only) */}
          {!isMobile && (
            <button
              onClick={onToggle}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:text-muted"
              style={{
                color: '#6a6490',
                backgroundColor: 'transparent',
                justifyContent: isOpen ? 'flex-start' : 'center',
              }}
              title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {isOpen ? <ChevronLeft size={16} strokeWidth={1.5} /> : <ChevronRight size={16} strokeWidth={1.5} />}
              {isOpen && <span className="text-xs">Collapse</span>}
            </button>
          )}

          {/* Mobile close button */}
          {isMobile && (
            <button
              onClick={onCloseMobile}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors"
              style={{ color: '#6a6490', backgroundColor: 'transparent', justifyContent: 'flex-start' }}
            >
              <Menu size={16} strokeWidth={1.5} />
              <span className="text-xs">Close menu</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
