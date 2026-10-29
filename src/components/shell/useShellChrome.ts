// State and keys the shell shares across world and campaign: the sidebar, the
// phone drawer, the ⌘K palette, the quick note, the shortcuts sheet and the
// docked assistant rail.

import { useCallback, useEffect, useState } from 'react';
import useLocalStorage from '../../hooks/useLocalStorage';

const PHONE = '(max-width: 767px)';

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

export function useShellChrome({ hasNote }: { hasNote: boolean }) {
  const [sidebarOpen, setSidebarOpen] = useLocalStorage<boolean>('dnd-sidebar-open', true);
  const [assistantOpen, setAssistantOpen] = useLocalStorage<boolean>('dnd-assistant-open', false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(PHONE).matches);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const onChange = (e: MediaQueryListEvent) => { setIsMobile(e.matches); if (e.matches) setMobileMenuOpen(false); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      // ⌘K, and ⌘/ from before, open the palette.
      if (mod && (e.key === 'k' || e.key === '/')) { e.preventDefault(); setPaletteOpen(o => !o); return; }
      if (mod && e.key === 'j') { e.preventDefault(); setAssistantOpen(o => !o); return; }
      if (mod && e.key === '.' && hasNote) { e.preventDefault(); setNoteOpen(o => !o); return; }
      if (mod && e.key === '\\') { e.preventDefault(); setSidebarOpen(o => !o); return; }
      if (e.key === '?' && !mod && !isTyping(e.target)) { e.preventDefault(); setShortcutsOpen(o => !o); return; }
      if (e.key === 'Escape') setShortcutsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasNote, setAssistantOpen, setSidebarOpen]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const closeNote = useCallback(() => setNoteOpen(false), []);

  return {
    isMobile,
    sidebarCollapsed: !sidebarOpen,
    toggleSidebar: () => setSidebarOpen(o => !o),
    mobileMenuOpen, openMobileMenu: () => setMobileMenuOpen(true), closeMobileMenu: () => setMobileMenuOpen(false),
    paletteOpen, openPalette, closePalette,
    noteOpen, toggleNote: () => setNoteOpen(o => !o), openNote: () => setNoteOpen(true), closeNote,
    shortcutsOpen, toggleShortcuts: () => setShortcutsOpen(o => !o), closeShortcuts: () => setShortcutsOpen(false),
    assistantOpen, setAssistantOpen, toggleAssistant: () => setAssistantOpen(o => !o),
  };
}

/** The shell's grid classes: a collapsed sidebar and an open rail change the columns. */
export function shellClass(o: { collapsed: boolean; rail: boolean; isMobile: boolean; extra?: string }) {
  return ['cm-shell', !o.isMobile && o.collapsed ? 'side-collapsed' : '', o.rail ? 'has-rail' : '', o.extra ?? '']
    .filter(Boolean).join(' ');
}
